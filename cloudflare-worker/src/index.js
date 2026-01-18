/**
 * Cloudflare Worker: /api/voice-chat
 *
 * Expects multipart/form-data with field "audio" (Blob).
 * Uses:
 *  - ElevenLabs STT to transcribe
 *  - OpenAI Responses API (gpt-4.1-nano) to generate a reply
 *  - ElevenLabs TTS to synthesize reply
 *
 * Set env vars in Cloudflare:
 *  - OPENAI_API_KEY
 *  - ELEVEN_API_KEY
 *  - ELEVEN_VOICE_ID
 * Optional:
 *  - ALLOW_ORIGIN (e.g., https://amirgoli.com)
 *  - SYSTEM_PROMPT (override default)
 */

const DEFAULT_SYSTEM_PROMPT =
  "You are Amir Goli's website assistant. Be concise, helpful, and friendly. If you do not know something, ask a short clarifying question.";

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allow = env.ALLOW_ORIGIN || origin || "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
  };
}

function jsonResponse(obj, request, env, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(request, env),
    },
  });
}

async function elevenStt(audioFile, env) {
  const url = "https://api.elevenlabs.io/v1/speech-to-text";

  const form = new FormData();
  form.append("file", audioFile, audioFile.name || "audio.webm");
  // If your account/model needs extra fields, add them here.
  // form.append("model_id", "scribe_v2");

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": env.ELEVEN_API_KEY,
    },
    body: form,
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`ElevenLabs STT failed (${r.status}): ${t}`);
  }

  const data = await r.json();
  // ElevenLabs returns a JSON body; "text" is typical.
  const text = data.text || data.transcript || "";
  return text;
}

async function openaiReply(userText, env) {
  const url = "https://api.openai.com/v1/responses";
  const system = (env.SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT).trim();

  const body = {
    model: "gpt-4.1-nano",
    input: [
      { role: "system", content: system },
      { role: "user", content: userText },
    ],
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`OpenAI failed (${r.status}): ${t}`);
  }

  const data = await r.json();

  // Extract first output_text.
  let outText = "";
  const output = data.output || [];
  for (const item of output) {
    const content = item.content || [];
    for (const part of content) {
      if (part.type === "output_text" && part.text) {
        outText = part.text;
        break;
      }
    }
    if (outText) break;
  }

  // Fallback for older shapes
  if (!outText && typeof data.output_text === "string") outText = data.output_text;

  return outText || "";
}

async function elevenTts(text, env) {
  const voiceId = env.ELEVEN_VOICE_ID;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/convert`;

  const body = {
    text,
    model_id: "eleven_multilingual_v2",
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": env.ELEVEN_API_KEY,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`ElevenLabs TTS failed (${r.status}): ${t}`);
  }

  const buf = await r.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);

  return { audio_base64: b64, mime: "audio/mpeg" };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, request, env, 405);
    }

    try {
      const ct = request.headers.get("Content-Type") || "";

      let userText = "";

      if (ct.includes("multipart/form-data")) {
        const form = await request.formData();
        const audio = form.get("audio");
        if (!audio) return jsonResponse({ error: "Missing audio field" }, request, env, 400);
        userText = await elevenStt(audio, env);
      } else if (ct.includes("application/json")) {
        const body = await request.json();
        userText = (body && body.text) ? String(body.text) : "";
      } else {
        return jsonResponse({ error: "Unsupported Content-Type" }, request, env, 415);
      }

      userText = userText.trim();
      if (!userText) return jsonResponse({ error: "Empty transcript" }, request, env, 400);

      const assistantText = await openaiReply(userText, env);
      const tts = await elevenTts(assistantText || "", env);

      return jsonResponse(
        {
          user_text: userText,
          assistant_text: assistantText,
          tts_audio_base64: tts.audio_base64,
          tts_mime: tts.mime,
        },
        request,
        env,
        200,
      );
    } catch (e) {
      return jsonResponse({ error: String(e.message || e) }, request, env, 500);
    }
  },
};

// Voice + avatar swap (idle <-> talk) for a simple 1-turn dialog.
// Frontend calls a server endpoint so API keys stay off the client.

const API_URL = window.AVATAR_API_URL || "/api/voice-chat";

// Persist chat context per user (browser) so it survives page navigation.
const HISTORY_KEY = "amirgoli_voice_avatar_history_v1";
const MAX_HISTORY_MESSAGES = 12; // 6 turns (user+assistant)

const elHold = document.getElementById("holdToTalk");
const elStatus = document.getElementById("voiceStatus");
const elChat = document.getElementById("voiceChat");
const mvIdle = document.getElementById("avatarIdle");
const mvTalk = document.getElementById("avatarTalk");

if (!elHold || !elStatus || !elChat || !mvIdle || !mvTalk) {
  // Widget not present on this page.
  // (Do nothing so this JS can be included site-wide.)
  console.warn("voice-avatar.js: widget elements not found");
} else {
  let stream = null;
  let recorder = null;
  let chunks = [];
  let isDown = false;
  let busy = false;
  let awaitingPermission = false;

  const loadHistory = () => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .slice(-MAX_HISTORY_MESSAGES);
    } catch {
      return [];
    }
  };

  const saveHistory = (hist) => {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(-MAX_HISTORY_MESSAGES))); } catch {}
  };

  let history = loadHistory();

  const setStatus = (t) => { elStatus.textContent = t; };

  const setAvatarSpeaking = (speaking) => {
    if (speaking) {
      mvTalk.classList.remove("voice-hidden");
      mvIdle.classList.add("voice-hidden");
    } else {
      mvTalk.classList.add("voice-hidden");
      mvIdle.classList.remove("voice-hidden");
    }
  };

  const renderDialog = () => {
    const escapeHtml = (s) => (s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));

    if (!history.length) {
      elChat.innerHTML = `<div class="voice-hint">Hold to talk. Your chat will persist across pages on this device.</div>`;
      return;
    }

    elChat.innerHTML = history.map((m) => {
      const isUser = m.role === "user";
      return `
        <div class="voice-msg ${isUser ? "user" : "assistant"}">
          <div class="voice-role">${isUser ? "You" : "AI"}</div>
          <div>${escapeHtml(m.content)}</div>
        </div>
      `;
    }).join("");
    elChat.scrollTop = elChat.scrollHeight;
  };

  const mimeType = (() => {
    const cands = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
    ];
    if (!window.MediaRecorder) return null;
    for (const t of cands) {
      try {
        if (MediaRecorder.isTypeSupported(t)) return t;
      } catch {}
    }
    return null;
  })();

  async function ensureStream() {
    if (stream) return stream;
    awaitingPermission = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return stream;
    } finally {
      awaitingPermission = false;
    }
  }

  function getPageContext() {
    try {
      const title = document.title || "";
      const desc = (document.querySelector('meta[name="description"]') || {}).content || "";
      const url = window.location && window.location.href ? window.location.href : "";

      const main = document.querySelector("main");
      let bodyText = "";
      if (main) {
        const clone = main.cloneNode(true);
        // Remove the widget itself so we don't feed the model its own UI copy.
        const w = clone.querySelector("#talk") || clone.querySelector(".voice-widget");
        if (w) {
          // If #talk exists, remove the whole section. Otherwise remove only the widget.
          if (w.id === "talk") w.remove();
          else w.remove();
        }
        bodyText = (clone.innerText || "").replace(/\s+/g, " ").trim();
      }

      let ctx = `Page title: ${title}\nPage URL: ${url}`;
      if (desc) ctx += `\nDescription: ${desc}`;
      if (bodyText) ctx += `\n\nPage content: ${bodyText}`;

      // Keep context bounded so we do not blow token limits.
      const MAX = 4500;
      if (ctx.length > MAX) ctx = ctx.slice(0, MAX) + "…";
      return ctx;
    } catch {
      return "";
    }
  }

  let stopping = false;

  function startRecording() {
    if (busy || stopping) return;
    chunks = [];

    // Capture the recorder instance so onstop never reads a nulled global.
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder = rec;

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };

    rec.onstop = () => {
      // Use the captured recorder's mimeType.
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      chunks = [];
      recorder = null;
      stopping = false;

      handleRecordedBlob(blob).catch((err) => {
        console.error(err);
        setStatus("Error. Check console.");
        elHold.disabled = false;
        elHold.classList.remove("is-recording");
        busy = false;
      });
    };

    rec.start(120);
    elHold.classList.add("is-recording");
    setStatus("Recording...");
  }

  function stopRecording() {
    if (!recorder || stopping) return;
    stopping = true;
    try { recorder.stop(); } catch {
      stopping = false;
      recorder = null;
    }
    elHold.classList.remove("is-recording");
    setStatus("Processing...");
  }

  async function handleRecordedBlob(blob) {
    if (busy) return;
    busy = true;
    elHold.disabled = true;

    if (!blob || blob.size < 1000) {
      setStatus("Too short. Hold longer.");
      elHold.disabled = false;
      busy = false;
      return;
    }

    const fd = new FormData();
    fd.append("audio", blob, "speech.webm");
    // Send recent context to the server so the assistant can remember.
    fd.append("history", JSON.stringify(history.slice(-MAX_HISTORY_MESSAGES)));
    // Also send page text so the assistant can answer about the current page.
    const pageContext = getPageContext();
    if (pageContext) fd.append("page_context", pageContext);

    const res = await fetch(API_URL, {
      method: "POST",
      body: fd,
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`API error ${res.status}: ${t}`);
    }

    const data = await res.json();

    const userText = (data.user_text || "").trim();
    const assistantText = (data.assistant_text || "").trim();
    if (userText) history.push({ role: "user", content: userText });
    if (assistantText) history.push({ role: "assistant", content: assistantText });
    history = history.slice(-MAX_HISTORY_MESSAGES);
    saveHistory(history);
    renderDialog();

    // Play audio (base64 mp3 from worker) and swap models while it plays.
    if (data.audio_base64 && data.audio_mime) {
      const bin = atob(data.audio_base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const audioBlob = new Blob([bytes], { type: data.audio_mime });
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);

      audio.addEventListener("play", () => setAvatarSpeaking(true));
      audio.addEventListener("ended", () => {
        setAvatarSpeaking(false);
        URL.revokeObjectURL(url);
      });
      audio.addEventListener("error", () => {
        setAvatarSpeaking(false);
        URL.revokeObjectURL(url);
      });

      setStatus("Playing...");
      try {
        await audio.play();
      } catch {
        // Autoplay blocked: user can click again.
        setAvatarSpeaking(false);
        setStatus("Tap to allow audio.");
      }
    } else {
      setStatus("Done");
    }

    elHold.disabled = false;
    busy = false;
    if (data.note) {
      // Optional helper info from server
      setStatus(data.note);
    } else if (!data.audio_base64) {
      setStatus("Done");
    } else {
      // Will switch to Ready when audio ends, but keep state.
      setTimeout(() => {
        if (!busy) setStatus("Ready");
      }, 1000);
    }
  }

  async function onPointerDown(e) {
    if (busy) return;
    if (isDown) return;
    isDown = true;

    try {
      setStatus("Mic permission...");
      await ensureStream();

      // First-time permission prompts often cause the user to release the button
      // to click "Allow". If they released while the prompt was open, do not
      // start recording automatically. Ask them to hold again.
      if (!isDown) {
        setStatus("Mic ready. Hold to talk.");
        return;
      }

      startRecording();
    } catch (err) {
      console.error(err);
      setStatus("Microphone blocked");
      isDown = false;
    }
  }

  function onPointerUp() {
    if (!isDown) return;
    isDown = false;
    stopRecording();
  }

  // Mouse / touch
  elHold.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  // Initial UI
  setAvatarSpeaking(false);
  setStatus("Ready");
  renderDialog();
}

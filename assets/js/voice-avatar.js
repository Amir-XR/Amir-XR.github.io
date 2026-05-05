// Voice + avatar widget for amirgoli.com.
//
// Architecture: simple HTTP pipeline (no WebRTC, no Realtime API).
//   Hold mic       → MediaRecorder starts capturing
//   Release mic    → stop, POST audio to /api/voice-chat,
//                    receive { user_text, assistant_text, audio_base64 },
//                    play audio + render chat
//   Tap stop while AI plays → cancel playback + new turn allowed
//
// Why this design: after extensive iteration, the OpenAI Realtime + WebRTC
// path was unreliable across browsers (Firefox in particular). This boring
// HTTP pipeline trades ~3s of extra latency for full reliability.

const VOICE_AVATAR_VERSION = "2026-04-30-http-ash";
console.info(
  "%c[voice-avatar] %cv" + VOICE_AVATAR_VERSION + " — HTTP pipeline, OpenAI Ash TTS",
  "color:#c5a3d6;font-weight:700",
  "color:inherit;font-weight:normal"
);

const API_URL = window.AVATAR_API_URL || "/api/voice-chat";
const TTS_URL = window.AVATAR_TTS_URL || "/api/voice-tts";

// localStorage key for chat history that persists across pages.
const HISTORY_KEY = "amirgoli_voice_chat_v2";
const MAX_HISTORY_MESSAGES = 12;  // 6 turns of user+assistant

const elHold = document.getElementById("holdToTalk");
const elStatus = document.getElementById("voiceStatus");
const elChat = document.getElementById("voiceChat");
const mvIdle = document.getElementById("avatarIdle");
const mvTalk = document.getElementById("avatarTalk");

if (!elHold || !elStatus || !elChat || !mvIdle) {
  console.warn("voice-avatar.js: widget elements not found");
} else {
  // ============================================================
  // ----------  CHAT HISTORY (persisted in localStorage) --------
  // ============================================================
  let history = [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) history = parsed.slice(-MAX_HISTORY_MESSAGES);
    }
  } catch {}

  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY_MESSAGES)));
    } catch {}
  }

  // ============================================================
  // ----------  ARIA / chat-render helpers  --------------------
  // ============================================================
  elChat.setAttribute("aria-live", "polite");
  elChat.setAttribute("aria-atomic", "false");
  elStatus.setAttribute("role", "status");

  const setStatus = (t) => { elStatus.textContent = t; };

  const escapeHtml = (s) => (s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

  // Convert URLs and markdown link syntax in assistant transcripts to
  // clickable anchors. Handles three patterns:
  //   1. Markdown:    [label](url)
  //   2. Bare URL:    https://...   amirgoli.com/...   /path.html
  // Also strips other markdown markers (bold/italic stars, backticks) so
  // the chat panel doesn't show raw markdown formatting.
  const URL_RE = /https?:\/\/[^\s<>"]+|(?:www\.)?amirgoli\.com[\/\w\-\.\?#&=%]*|\/[a-z][\w\-\/\.\?#&=]*\.html/gi;
  function linkify(text) {
    if (!text) return "";
    // Pass 1: extract markdown links into placeholders so the URL inside
    // them isn't double-rendered by the URL_RE pass.
    const mdLinks = [];
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
      const i = mdLinks.length;
      mdLinks.push({ label, url });
      return `\x00MD${i}\x00`;
    });
    // Pass 2: strip residual non-link markdown so it doesn't clutter the chat.
    text = text.replace(/\*\*([^*]+)\*\*/g, "$1")
               .replace(/\*([^*]+)\*/g, "$1")
               .replace(/`([^`]+)`/g, "$1");
    // Pass 3: escape + linkify bare URLs as before.
    let out = "";
    let lastIdx = 0;
    for (const m of text.matchAll(URL_RE)) {
      let url = m[0];
      const matchStart = m.index;
      let trailing = "";
      while (url.length > 1 && /[.,;:!?\)]$/.test(url)) {
        trailing = url.slice(-1) + trailing;
        url = url.slice(0, -1);
      }
      if (!url) continue;
      out += escapeHtml(text.slice(lastIdx, matchStart));
      let href = url;
      if (!/^https?:\/\//i.test(href) && !/^\//.test(href)) href = "https://" + href;
      out += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`;
      out += escapeHtml(trailing);
      lastIdx = matchStart + url.length + trailing.length;
    }
    out += escapeHtml(text.slice(lastIdx));
    // Pass 4: replace markdown placeholders with proper anchors.
    out = out.replace(/\x00MD(\d+)\x00/g, (_, i) => {
      const link = mdLinks[+i];
      if (!link) return "";
      return `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${escapeHtml(link.label)}</a>`;
    });
    return out;
  }

  function renderDialog() {
    if (!history.length) {
      elChat.innerHTML = `
        <div class="voice-hint">
          <div class="voice-hint-title">Talk with Amir's AI assistant</div>
          <div class="voice-hint-sub">Hold the mic and try one of these:</div>
          <ul class="voice-hint-list">
            <li>“What is your research about?”</li>
            <li>“Which publications focus on VR learning?”</li>
            <li>“Tell me about the StandardScout project.”</li>
          </ul>
        </div>`;
      return;
    }
    elChat.innerHTML = history.map((m) => {
      const isUser = m.role === "user";
      const text = m.content && m.content.trim() ? m.content : (isUser ? "(empty)" : "...");
      const body = isUser ? escapeHtml(text) : linkify(text);
      return `
        <div class="voice-msg ${isUser ? "user" : "assistant"}">
          <div class="voice-role">${isUser ? "You" : "Assistant"}</div>
          <div>${body}</div>
        </div>
      `;
    }).join("");
    elChat.scrollTop = elChat.scrollHeight;
  }

  // ============================================================
  // ----------  AVATAR (poses + crossfade + head bob) ----------
  // ============================================================
  const AVATAR_BASE = (() => {
    const src = mvIdle.getAttribute("src") || "assets/avatar/model_Idle.glb";
    const i = src.lastIndexOf("/");
    return i >= 0 ? src.slice(0, i + 1) : "assets/avatar/";
  })();

  let posesData = null;
  let currentPose = null;

  // Single-viewer pose system: change mvIdle.src to swap poses. The legacy
  // mvTalk viewer has been removed from new pages; old cached pages may still
  // have it, so hide it defensively if it exists.
  mvIdle.classList.remove("voice-hidden");
  mvIdle.style.opacity = "1";
  if (mvTalk) {
    mvTalk.classList.add("voice-hidden");
    mvTalk.style.display = "none";
  }

  function setGesture(name) {
    if (!posesData || !posesData.poses) {
      console.warn(`[avatar] setGesture(${name}) skipped — posesData not loaded`);
      return false;
    }
    const pose = posesData.poses[name];
    if (!pose || !pose.file) {
      console.warn(`[avatar] setGesture(${name}) skipped — no such pose in manifest`);
      return false;
    }
    if (currentPose === name) {
      console.log(`[avatar] setGesture(${name}) — already on this pose, no-op`);
      return true;
    }
    const newSrc = AVATAR_BASE + pose.file;
    console.log(`[avatar] setGesture(${name}) -> ${pose.file}`);
    currentPose = name;

    // Camera angle: rotate the avatar -23deg only on the idle (resting) pose.
    // For talking / gesture poses, keep the camera centered (0deg) so the
    // animation reads cleanly.
    const isIdle = name === "idle" || name === (posesData?.default || "idle");
    const theta = isIdle ? "-23deg" : "0deg";
    mvIdle.setAttribute("camera-orbit",     `${theta} 75deg 2.05m`);
    mvIdle.setAttribute("min-camera-orbit", `${theta} 75deg 1.9m`);
    mvIdle.setAttribute("max-camera-orbit", `${theta} 75deg 2.2m`);

    mvIdle.src = newSrc;
    // Force-play the new clip after it loads. model-viewer's autoplay can
    // occasionally land on the last frame after a dynamic src change.
    const kick = () => { try { mvIdle.play({ repetitions: Infinity }); } catch { try { mvIdle.play(); } catch {} } };
    mvIdle.addEventListener("load", kick, { once: true });
    setTimeout(kick, 60);
    return true;
  }

  // Loop watchdog: model-viewer sometimes drops looping after a src change,
  // so if the clip is at the end and we haven't reset recently, rewind it.
  let lastLoopResetAt = 0;
  (function loopWatchdog() {
    try {
      const d = mvIdle.duration;
      const t = mvIdle.currentTime;
      const now = performance.now();
      if (d > 0.1 && t >= d - 0.05 && now - lastLoopResetAt > 100) {
        mvIdle.currentTime = 0;
        try { mvIdle.play(); } catch {}
        lastLoopResetAt = now;
      }
    } catch {}
    requestAnimationFrame(loopWatchdog);
  })();

  (async function initPoses() {
    try {
      const r = await fetch(AVATAR_BASE + "poses.json", { cache: "no-store" });
      if (!r.ok) return;
      posesData = await r.json();
      const def = posesData.default || "idle";
      const file = posesData.poses?.[def]?.file;
      if (file) {
        try {
          mvIdle.src = AVATAR_BASE + file;
          mvIdle.addEventListener("load", () => { try { mvIdle.play(); } catch {} }, { once: true });
        } catch {}
        currentPose = def;
      }
    } catch (e) {
      console.warn("poses.json failed:", e);
    }
  })();

  // Head bob — driven by the playing audio's amplitude.
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const avatarWrap = mvIdle.parentElement;
  if (avatarWrap) avatarWrap.style.willChange = "transform";

  // ============================================================
  // ----------  AUDIO PLAYBACK + amplitude analysis  ------------
  // ============================================================
  // iOS detection (covers iPhone, iPod, classic iPad UA, AND modern iPad
  // running iPadOS that pretends to be Macintosh). Every browser on iOS —
  // Safari, Chrome, Firefox, Edge — uses WebKit underneath, so all of them
  // share the same audio quirks.
  const isIOS = (() => {
    const ua = navigator.userAgent || "";
    return /iP(hone|ad|od)/.test(ua) ||
      (ua.includes("Mac") && navigator.maxTouchPoints > 1);
  })();

  const remoteAudio = (() => {
    const a = document.createElement("audio");
    a.autoplay = false;  // we explicitly play after src is set
    a.setAttribute("playsinline", "");
    a.playsInline = true;
    a.controls = false;
    a.preload = "auto";
    a.style.display = "none";
    document.body.appendChild(a);
    return a;
  })();

  let audioCtx = null;
  let analyserNode = null;
  let analyserBuf = null;
  let smoothedRms = 0;

  // Create the AudioContext (for unlock + non-iOS analyser). On iOS we
  // deliberately stop here — we do NOT route remoteAudio through WebAudio,
  // because Safari/WKWebView has long-standing bugs in
  // `createMediaElementSource()`: changing the audio's `src` after the
  // source node is created (which our streaming TTS pipeline does on every
  // turn) results in silence, even though the context is running. Native
  // <audio> playback works fine on iOS, so we let it play directly.
  function ensureAudioContext() {
    if (audioCtx) return;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      audioCtx = new Ctor();
    } catch (e) {
      console.warn("AudioContext create failed:", e);
    }
  }

  function ensureAudioAnalyser() {
    if (analyserNode || isIOS) return;  // skip routing on iOS
    ensureAudioContext();
    if (!audioCtx) return;
    try {
      const source = audioCtx.createMediaElementSource(remoteAudio);
      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 512;
      analyserNode.smoothingTimeConstant = 0.5;
      source.connect(analyserNode);
      analyserNode.connect(audioCtx.destination);  // also route to speakers
      analyserBuf = new Float32Array(analyserNode.fftSize);
      requestAnimationFrame(amplitudeTick);
    } catch (e) {
      console.warn("audio analyser setup failed:", e);
    }
  }

  // iOS unlock: must run synchronously inside a user gesture, before any
  // await. The recorder workflow has many `await`s before the first audio
  // plays, so without this `audio.play()` is later blocked as a non-
  // user-initiated playback request, and any AudioContext we'd create is
  // born suspended and never resumes. Two unlocks are needed:
  //   1. AudioContext.resume() inside gesture
  //   2. <audio>.play() inside gesture (with a tiny silent WAV) — this
  //      registers user activation on the element so future src-changes
  //      + play() calls work without a gesture for the rest of the session.
  let audioUnlocked = false;
  // ~600 byte silent WAV (header-only, zero-length data). Universally
  // supported and decodes instantly. Using WAV (not MP3) avoids any
  // codec-init delay that might cause iOS to drop the gesture link.
  const SILENT_WAV =
    "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
  function unlockAudioOnGesture() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    try {
      ensureAudioContext();
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});  // synchronous call = gesture-bound
      }
      // Play a 1-sample silent buffer through the AudioContext so iOS
      // marks it as user-activated.
      if (audioCtx) {
        const buf = audioCtx.createBuffer(1, 1, 22050);
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        src.connect(audioCtx.destination);
        src.start(0);
      }
      // Unlock the <audio> element itself: play silent WAV, immediately
      // pause + clear src. iOS will then permit src-change + play() in
      // sendToWorker (which happens long after this gesture).
      const prev = remoteAudio.getAttribute("src") || "";
      remoteAudio.muted = true;
      remoteAudio.src = SILENT_WAV;
      const p = remoteAudio.play();
      const restore = () => {
        try { remoteAudio.pause(); } catch {}
        remoteAudio.muted = false;
        if (prev) remoteAudio.src = prev;
        else { remoteAudio.removeAttribute("src"); try { remoteAudio.load(); } catch {} }
      };
      if (p && typeof p.then === "function") {
        p.then(() => setTimeout(restore, 30)).catch(() => { remoteAudio.muted = false; });
      } else {
        setTimeout(restore, 30);
      }
    } catch (e) {
      console.warn("[audio-unlock] failed:", e);
    }
  }

  function amplitudeTick() {
    if (!analyserNode) return;
    analyserNode.getFloatTimeDomainData(analyserBuf);
    let sum = 0;
    for (let i = 0; i < analyserBuf.length; i++) sum += analyserBuf[i] * analyserBuf[i];
    const rms = Math.sqrt(sum / analyserBuf.length);

    // Head bob — driven by amplitude. Pose is driven by audio events (below).
    if (avatarWrap && !reduceMotion) {
      smoothedRms = smoothedRms * 0.85 + rms * 0.15;
      const intensity = Math.min(smoothedRms / 0.012, 2);
      const bob = -(intensity * 5);
      const sway = Math.sin(performance.now() * 0.0035) * intensity * 1.2;
      avatarWrap.style.transform = `translateY(${bob.toFixed(2)}px) rotate(${sway.toFixed(2)}deg)`;
    }

    requestAnimationFrame(amplitudeTick);
  }

  // iOS head-bob fallback: since we don't route through WebAudio on iOS,
  // there's no real-time amplitude. Instead we drive a sinusoidal bob/sway
  // off `performance.now()` whenever the audio element is playing.
  if (isIOS) {
    (function iosBobTick() {
      if (avatarWrap && !reduceMotion) {
        if (!remoteAudio.paused) {
          const t = performance.now() * 0.005;
          const bob = -Math.abs(Math.sin(t)) * 4;
          const sway = Math.sin(t * 0.6) * 1.3;
          avatarWrap.style.transform = `translateY(${bob.toFixed(2)}px) rotate(${sway.toFixed(2)}deg)`;
        } else if (avatarWrap.style.transform) {
          avatarWrap.style.transform = "";
        }
      }
      requestAnimationFrame(iosBobTick);
    })();
  }

  // Pose + status are driven by the audio element's events.
  remoteAudio.addEventListener("play", () => {
    setGesture("talk");
    setStatus("Speaking...");
    if (interruptBtn) interruptBtn.disabled = false;
  });
  remoteAudio.addEventListener("playing", () => {
    setGesture("talk");
    setStatus("Speaking...");
  });
  remoteAudio.addEventListener("pause", () => {
    setGesture("idle");
    if (remoteAudio.ended || remoteAudio.currentTime === 0) setStatus("Hold to talk");
    if (interruptBtn) interruptBtn.disabled = true;
  });
  remoteAudio.addEventListener("ended", () => {
    setGesture("idle");
    setStatus("Hold to talk");
    if (interruptBtn) interruptBtn.disabled = true;
  });
  remoteAudio.addEventListener("error", () => {
    setGesture("idle");
    setStatus("Audio error. Hold to talk.");
    if (interruptBtn) interruptBtn.disabled = true;
    console.error("[avatar] audio error", remoteAudio.error);
  });

  // ============================================================
  // ----------  PAGE CONTEXT (sent on every request)  ----------
  // ============================================================
  function getPageContext() {
    try {
      const title = document.title || "";
      const desc = (document.querySelector('meta[name="description"]') || {}).content || "";
      const url = (window.location && window.location.href) || "";
      const main = document.querySelector("main");
      let bodyText = "";
      if (main) {
        const clone = main.cloneNode(true);
        const w = clone.querySelector("#talk") || clone.querySelector(".voice-widget");
        if (w) w.remove();
        bodyText = (clone.innerText || "").replace(/\s+/g, " ").trim();
      }
      let ctx = `Page title: ${title}\nPage URL: ${url}`;
      if (desc) ctx += `\nDescription: ${desc}`;
      if (bodyText) ctx += `\n\nPage content: ${bodyText}`;
      const MAX = 4500;
      if (ctx.length > MAX) ctx = ctx.slice(0, MAX) + "…";
      return ctx;
    } catch {
      return "";
    }
  }

  // ============================================================
  // ----------  CLEAR-CHAT BUTTON + STOP BUTTON  ---------------
  // ============================================================
  let interruptBtn = null;
  (function injectControls() {
    const controls = document.querySelector(".voice-controls") || elHold.parentElement?.parentElement;
    if (!controls) return;

    // Stop button
    const stop = document.createElement("button");
    stop.type = "button";
    stop.className = "voice-interrupt";
    stop.disabled = true;
    stop.setAttribute("aria-label", "Stop the AI's current response");
    stop.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" fill="currentColor"/></svg><span>Stop</span>`;
    const status = controls.querySelector("#voiceStatus");
    if (status) controls.insertBefore(stop, status); else controls.appendChild(stop);
    interruptBtn = stop;

    stop.addEventListener("click", () => {
      try { remoteAudio.pause(); remoteAudio.currentTime = 0; } catch {}
      stop.disabled = true;
      setStatus("Hold to talk");
      setGesture("idle");
    });

    // Footer with clear-chat
    const panel = elChat.parentElement;
    if (panel && !panel.querySelector(".voice-footer")) {
      const footer = document.createElement("div");
      footer.className = "voice-footer";
      footer.innerHTML = `<button type="button" class="voice-clear" id="voiceClearBtn" disabled>Clear chat</button>`;
      panel.appendChild(footer);
    }

    if (!document.getElementById("voiceWidgetStyles")) {
      const s = document.createElement("style");
      s.id = "voiceWidgetStyles";
      s.textContent = `
        .voice-interrupt{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:13px;padding:6px 12px;border-radius:999px;border:1px solid rgba(220,80,80,.55);background:transparent;color:rgba(220,80,80,.95);cursor:pointer;transition:opacity .15s,background .15s;white-space:nowrap;}
        .voice-interrupt:hover:not(:disabled){background:rgba(220,80,80,.10);}
        .voice-interrupt:disabled{opacity:.35;cursor:not-allowed;border-color:rgba(255,255,255,.15);color:rgba(255,255,255,.4);}
        .voice-interrupt svg{display:block;}
        .voice-footer{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:6px;}
        .voice-clear{font:inherit;cursor:pointer;border:1px solid var(--border,rgba(255,255,255,.14));background:transparent;color:inherit;padding:4px 10px;border-radius:999px;font-size:12px;opacity:.85;}
        .voice-clear:hover:not(:disabled){opacity:1;background:rgba(255,255,255,.05);}
        .voice-clear:disabled{opacity:.4;cursor:not-allowed;}
        .voice-hold.is-recording{outline:2px solid rgba(220,80,80,.85);outline-offset:2px;animation:voice-pulse 1.6s ease-in-out infinite;}
        @keyframes voice-pulse{0%,100%{box-shadow:0 0 0 0 rgba(220,80,80,.55);}50%{box-shadow:0 0 0 8px rgba(220,80,80,0);}}
        @media (prefers-reduced-motion:reduce){.voice-hold.is-recording{animation:none;}}
      `;
      document.head.appendChild(s);
    }

    const clearBtn = document.getElementById("voiceClearBtn");
    if (clearBtn) {
      const sync = () => { clearBtn.disabled = !elChat.querySelector(".voice-msg"); };
      new MutationObserver(sync).observe(elChat, { childList: true, subtree: true });
      sync();
      clearBtn.addEventListener("click", () => {
        history = [];
        saveHistory();
        renderDialog();
        setStatus("Chat cleared");
      });
    }
  })();

  // Set up the mic button label. Reuses any existing .voice-hold-label /
  // .voice-hold-wrap from the HTML rather than appending duplicates (the
  // pages already include these elements; older code created a second copy).
  (function upgradeMicLabel() {
    try {
      if (elHold.dataset.upgraded === "1") return;
      elHold.dataset.upgraded = "1";

      // Find existing wrapper/label, or build them.
      let wrap = elHold.closest(".voice-hold-wrap");
      let label = wrap ? wrap.querySelector(".voice-hold-label") : null;
      if (!label) label = document.getElementById("holdToTalkLabel");

      if (!wrap) {
        const parent = elHold.parentElement;
        if (!parent) return;
        wrap = document.createElement("div");
        wrap.className = "voice-hold-wrap";
        parent.insertBefore(wrap, elHold);
        wrap.appendChild(elHold);
      }
      if (!label) {
        label = document.createElement("div");
        label.className = "voice-hold-label";
        label.id = "holdToTalkLabel";
        label.setAttribute("aria-hidden", "true");
      }
      label.textContent = "Hold to talk";
      // Make sure the label is the FIRST child of wrap (above the button).
      if (label.parentElement !== wrap) wrap.insertBefore(label, elHold);
      else if (wrap.firstChild !== label) wrap.insertBefore(label, wrap.firstChild);

      elHold.innerHTML = `<svg class="voice-hold-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21H9v2h6v-2h-2v-3.08A7 7 0 0 0 19 11h-2Z"/></svg>`;
      elHold.setAttribute("aria-label", "Hold to record, release to send");
      elHold.setAttribute("aria-labelledby", label.id);
      elHold.style.userSelect = "none";
      elHold.style.webkitUserSelect = "none";
      elHold.style.webkitTouchCallout = "none";

      const updateLabel = () => {
        label.textContent = elHold.classList.contains("is-recording") ? "Recording — release to send" : "Hold to talk";
      };
      new MutationObserver(updateLabel).observe(elHold, { attributes: true, attributeFilter: ["class"] });
    } catch {}
  })();

  // ============================================================
  // ----------  RECORDING (MediaRecorder + tap-to-record/send)
  // ============================================================
  let mediaStream = null;
  let recorder = null;
  let recordedChunks = [];
  let isRecording = false;
  let toggleBusy = false;

  // Pick a MIME type the browser actually supports for MediaRecorder.
  const MIME_TYPE = (() => {
    const cands = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    if (!window.MediaRecorder) return null;
    for (const t of cands) { try { if (MediaRecorder.isTypeSupported(t)) return t; } catch {} }
    return null;
  })();

  async function ensureMicStream() {
    if (mediaStream) return mediaStream;
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    return mediaStream;
  }

  function startRecording() {
    recordedChunks = [];
    recorder = new MediaRecorder(mediaStream, MIME_TYPE ? { mimeType: MIME_TYPE } : undefined);
    recorder.addEventListener("dataavailable", (e) => {
      if (e.data && e.data.size) recordedChunks.push(e.data);
    });
    recorder.start(120);  // collect chunks every 120ms
    isRecording = true;
    elHold.classList.add("is-recording");
    setStatus("Recording — tap mic to send");
  }

  function stopRecording() {
    return new Promise((resolve) => {
      if (!recorder || recorder.state === "inactive") { resolve(null); return; }
      recorder.addEventListener("stop", () => {
        const blob = new Blob(recordedChunks, { type: recorder.mimeType || "audio/webm" });
        recordedChunks = [];
        recorder = null;
        isRecording = false;
        elHold.classList.remove("is-recording");
        resolve(blob);
      }, { once: true });
      try { recorder.stop(); } catch { resolve(null); }
    });
  }

  async function sendToWorker(audioBlob) {
    setStatus("Processing...");
    if (interruptBtn) interruptBtn.disabled = false;

    const form = new FormData();
    form.append("audio", audioBlob, "speech.webm");
    form.append("history", JSON.stringify(history.slice(-MAX_HISTORY_MESSAGES)));
    form.append("page_context", getPageContext());

    let res;
    try {
      res = await fetch(API_URL, { method: "POST", body: form });
    } catch (err) {
      setStatus("Network error. Tap mic to retry.");
      if (interruptBtn) interruptBtn.disabled = true;
      console.error("voice-chat fetch failed:", err);
      return;
    }
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      setStatus("Server error. Tap mic to retry.");
      if (interruptBtn) interruptBtn.disabled = true;
      console.error(`voice-chat API ${res.status}:`, t);
      return;
    }

    let data;
    try { data = await res.json(); } catch (e) {
      setStatus("Bad response. Tap mic to retry.");
      if (interruptBtn) interruptBtn.disabled = true;
      console.error("voice-chat JSON parse failed:", e);
      return;
    }

    const userText = (data.user_text || "").trim();
    const assistantText = (data.assistant_text || "").trim();
    if (userText) history.push({ role: "user", content: userText });
    if (assistantText) history.push({ role: "assistant", content: assistantText });
    history = history.slice(-MAX_HISTORY_MESSAGES);
    saveHistory();
    renderDialog();

    if (assistantText) {
      // Stream TTS via the audio element. The browser starts playback as
      // soon as the first chunk arrives — typically ~300 ms after the GET
      // hits the worker, instead of waiting for the full mp3 to synthesize.
      // Text is passed as base64 in the URL so audio.src can do a plain GET.
      const t = btoa(unescape(encodeURIComponent(assistantText)));
      remoteAudio.src = TTS_URL + "?t=" + encodeURIComponent(t);
      ensureAudioAnalyser();  // (one-time setup; safe to call repeatedly)
      try { if (audioCtx && audioCtx.state === "suspended") await audioCtx.resume(); } catch {}
      setStatus("Speaking...");
      setGesture("talk");
      try {
        await remoteAudio.play();
      } catch (e) {
        console.warn("audio.play failed:", e);
        setStatus("Hold to talk");
      }
    } else {
      setStatus("Hold to talk");
    }
    if (interruptBtn) interruptBtn.disabled = remoteAudio.paused;
  }

  // ---------- press-and-hold semantics ----------
  let isDown = false;
  let recordStartedAt = 0;
  const MIN_HOLD_MS = 350;

  async function onPointerDown() {
    if (isDown || toggleBusy) return;

    // *** iOS Safari unlock — must run synchronously here, before any
    // *** await, or the AudioContext is created off-gesture and never
    // *** resumes. Firefox doesn't need this; Safari (mobile + desktop) does.
    unlockAudioOnGesture();

    isDown = true;
    toggleBusy = true;
    try {
      // If AI is currently playing, interrupt it.
      if (!remoteAudio.paused) {
        try { remoteAudio.pause(); remoteAudio.currentTime = 0; } catch {}
        if (interruptBtn) interruptBtn.disabled = true;
        setGesture("idle");
      }
      try {
        await ensureMicStream();
      } catch (e) {
        isDown = false;
        setStatus("Microphone blocked");
        console.error(e);
        return;
      }
      // Possible the user already released during the mic permission prompt.
      if (!isDown) return;
      startRecording();
      recordStartedAt = Date.now();
    } finally {
      toggleBusy = false;
    }
  }

  async function onPointerUp() {
    if (!isDown) return;
    isDown = false;
    if (toggleBusy) return;
    toggleBusy = true;
    try {
      if (!isRecording) return;  // never actually started (released during permission)
      const heldFor = Date.now() - recordStartedAt;
      const blob = await stopRecording();
      if (!blob || blob.size < 1500 || heldFor < MIN_HOLD_MS) {
        setStatus("Hold longer to talk");
        return;
      }
      await sendToWorker(blob);
    } finally {
      toggleBusy = false;
    }
  }

  // Pointer / touch — press-and-hold.
  elHold.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  // Keyboard: Space / Enter act as press-and-hold (filter repeat).
  elHold.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) {
      e.preventDefault();
      onPointerDown();
    }
  });
  elHold.addEventListener("keyup", (e) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onPointerUp();
    }
  });
  // If focus leaves while still holding, treat it as a release.
  elHold.addEventListener("blur", () => { if (isDown) onPointerUp(); });

  elHold.setAttribute("aria-label", "Hold to record, release to send");

  // Initial UI
  setStatus("Hold to talk");
  renderDialog();
}

# gradio_app.py
# Orchestra (Alt 2) — Gradio UI
#
# Expected project structure (your Drive folder):
# ./AIcode/
#   __init__.py
#   core/
#   layers/
#   pipelines/
#
# Env vars you’ll likely need:
# - OPENAI_API_KEY
# - CHROMA_DB_PATH (for local layer)  e.g. "AIcode/vector_db"
# - CHROMA_COLLECTION (optional)
# - GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX (for web layer)
# - GEMINI_API_KEY (for image generation if you’re using Gemini backend inside pipelines/image.py)

from __future__ import annotations

import os
import sys
import time
import tempfile
import importlib
import base64
import json
import re
from pathlib import Path
from io import BytesIO
from typing import Any, Dict, Optional, Tuple, List

import gradio as gr

def _read_text_file(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return ""


VOICE_WIDGET_CSS = (
    _read_text_file(Path(__file__).with_name("voice-widget.css"))
    + "\n\n" +
    """
    /* Minimal helpers (Gradio doesn't have your site-wide CSS tokens) */
    .section{margin-top:8px;}
    .muted{opacity:.9;}
    """.strip()
)

VOICE_WIDGET_JS = _read_text_file(Path(__file__).with_name("voice-avatar.js"))

MODEL_VIEWER_HEAD = """
<script type=\"module\" src=\"https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js\"></script>
""".strip()

# Bundle widget JS into <head> to avoid Gradio's `js=` limitations in v6+
VOICE_WIDGET_HEAD = (
    MODEL_VIEWER_HEAD
    + "\n\n<script>\n"
    + VOICE_WIDGET_JS
    + "\n</script>"
)


# Best-effort shared upload handle for voice endpoint. (Gradio state isn't directly
# available inside the custom FastAPI route.) In single-user usage this behaves as
# expected; in multi-user public deployments, keep Upload disabled in voice mode.
LATEST_VECTOR_STORE_ID: Optional[str] = None

# -----------------------------
# Voice widget assets (HTML/CSS/JS)
# -----------------------------

# NOTE: This widget intentionally does NOT use Gradio's microphone/TTS components.
# It uses a custom “hold to talk” button (MediaRecorder) + an internal server endpoint
# (/api/voice-chat) that performs STT → answer → TTS.

VOICE_WIDGET_HTML = """
<section class="section" id="talk">
  <h2>Talk with StandardScout</h2>
  <p class="muted">Hold the button to record. Release to send. The reply will play aloud and appear in the chat.</p>

  <div class="voice-widget">
    <div class="voice-avatar-wrap" aria-label="3D avatar">
      <model-viewer
        id="avatarIdle"
        src="https://amirgoli.com/assets/avatar/model_Idle.glb"
        camera-controls
        disable-pan
        camera-target="0m 1.45m 0m"
        camera-orbit="0deg 75deg 2.05m"
        min-camera-orbit="0deg 75deg 1.9m"
        max-camera-orbit="0deg 75deg 2.2m"
        autoplay
        exposure="1"
        shadow-intensity="0">
      </model-viewer>

      <model-viewer
        id="avatarTalk"
        class="voice-hidden"
        src="https://amirgoli.com/assets/avatar/model_Talk.glb"
        camera-controls
        disable-pan
        camera-target="0m 1.45m 0m"
        camera-orbit="0deg 75deg 2.05m"
        min-camera-orbit="0deg 75deg 1.9m"
        max-camera-orbit="0deg 75deg 2.2m"
        autoplay
        exposure="1"
        shadow-intensity="0">
      </model-viewer>
    </div>

    <div class="voice-panel">
      <div class="voice-chat" id="voiceChat" aria-label="Conversation"></div>

      <div class="voice-controls">
        <div class="voice-hold-wrap">
          <div class="voice-hold-label" id="holdToTalkLabel">Hold to talk</div>
          <button id="holdToTalk" class="btn voice-hold" type="button" aria-labelledby="holdToTalkLabel" aria-label="Hold to talk">
            <svg class="voice-hold-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21H9v2h6v-2h-2v-3.08A7 7 0 0 0 19 11h-2Z"/>
            </svg>
          </button>
          <div id="voiceStatus" class="voice-status">Ready</div>
        </div>
      </div>
      <p class="muted">Not legal advice. Please verify against the following related sources.</p>
      </div>
    </div>
  </div>
</section>
""".strip()


# "Generated technical image" output for Conversational (voice) mode.
#
# IMPORTANT: Voice mode is driven by custom JS calling /api/voice-chat,
# not by a Gradio event callback. A plain gr.Image component would remain
# in its default input/uploader state and would not receive updates.
# We therefore render a lightweight HTML block that the frontend can update
# by setting the <img> src to a data: URL.
VOICE_GENERATED_IMAGE_HTML = """
<div id="voiceReferences" class="ss-refs-block" aria-label="References">
  <div class="ss-refs-label">Related Sources</div>
  <div class="ss-refs-frame"> <div class="ss-refs-placeholder" id="voiceReferencesPlaceholder">References will appear here after you ask a question.</div><pre id="voiceReferencesText" class="ss-refs-text" style="display:none;"></pre></div>
</div>
<div class="ss-genimg-block">
  <div class="ss-genimg-label">3) Generated technical image</div>
  <div class="ss-genimg-frame">
    <div class="ss-genimg-placeholder" id="voiceGeneratedImagePlaceholder">
      Image will appear here after you ask a question.
    </div>
    <img id="voiceGeneratedImageImg" class="ss-genimg-img" alt="Generated technical image" loading="lazy" />
  </div>
</div>
""".strip()


# Default Chroma path for HF Spaces repo layout (can be overridden via Space secrets).
os.environ.setdefault("CHROMA_DB_PATH", "AIcode/vector_db")



# -----------------------------
# 1) Locate + import your package (AIcode on Drive, or installed as a package)
# -----------------------------
def _import_orchestra_run() -> Any:
    """
    Returns run_orchestra function from <PKG>.core.orchestrator

    Priority:
      1) ORCHESTRA_PKG_PATH (directory to your package, containing __init__.py)
      2) ORCHESTRA_PKG_NAME (python module name)
      3) auto-try: "AIcode", then "orchestra"
    """
    pkg_path = os.getenv("ORCHESTRA_PKG_PATH", "./AIcode").strip()
    pkg_name = os.getenv("ORCHESTRA_PKG_NAME", "").strip()

    if pkg_path and Path(pkg_path).exists() and (Path(pkg_path) / "__init__.py").exists():
        p = Path(pkg_path).resolve()
        if str(p.parent) not in sys.path:
            sys.path.insert(0, str(p.parent))
        if not pkg_name:
            pkg_name = p.name

    if not pkg_name:
        for candidate in ("AIcode", "orchestra"):
            try:
                importlib.import_module(candidate)
                pkg_name = candidate
                break
            except Exception:
                pass

    if not pkg_name:
        raise RuntimeError(
            "Could not import your package. Set ORCHESTRA_PKG_PATH (folder containing __init__.py) "
            "or ORCHESTRA_PKG_NAME (module name)."
        )

    mod = importlib.import_module(f"{pkg_name}.core.orchestrator")
    return getattr(mod, "run_orchestra")


run_orchestra = _import_orchestra_run()


# -----------------------------
# 2) OpenAI helpers (STT/TTS + vector store indexing for upload layer)
# -----------------------------
def _safe_get(obj: Any, key: str, default: Any = None) -> Any:
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _status_label(raw: str) -> str:
    s = (raw or "").strip().lower()
    if s in ("in_progress", "processing", "queued"):
        return "Please wait… indexing is in progress."
    if s in ("completed", "ready"):
        return "✅ Indexing completed."
    if s in ("failed", "cancelled", "expired"):
        return f"❌ Indexing ended with status: {raw}"
    return f"Status: {raw}"


def index_pdf_to_vector_store(
    pdf_path: str,
    *,
    reuse_vector_store_id: Optional[str] = None,
    timeout_s: int = 10 * 60,
    poll_s: int = 5,
) -> Tuple[str, str]:
    """
    Upload a PDF to OpenAI Files and attach to a Vector Store, then wait until indexing is completed.
    Returns: (vector_store_id, human_readable_status)
    """
    from openai import OpenAI  # imported here so this file can still load without openai installed

    if not pdf_path or not os.path.isfile(pdf_path):
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    client = OpenAI()

    # 1) Create or reuse a vector store for this session
    if reuse_vector_store_id:
        vector_store_id = reuse_vector_store_id
    else:
        vs = client.vector_stores.create(name="orchestra-session-upload")
        vector_store_id = vs.id

    # 2) Upload file + attach to vector store
    uploaded = client.files.create(file=open(pdf_path, "rb"), purpose="assistants")
    file_id = uploaded.id

    vs_file = client.vector_stores.files.create(vector_store_id=vector_store_id, file_id=file_id)
    vs_file_id = vs_file.id

    # 3) Poll THIS file until completed
    t0 = time.time()
    last_status = ""
    while True:
        obj = client.vector_stores.files.retrieve(vector_store_id=vector_store_id, file_id=vs_file_id)
        status = _safe_get(obj, "status", "") or ""
        last_status = status

        if status == "completed":
            return vector_store_id, "✅ Indexing completed. Your uploaded PDF is ready for retrieval."
        if status in ("failed", "cancelled", "expired"):
            raise RuntimeError(f"Indexing failed with status={status}")

        if time.time() - t0 > timeout_s:
            raise TimeoutError(
                f"Timed out after {timeout_s}s waiting for indexing. "
                f"Last status was: {status}"
            )

        time.sleep(poll_s)


def stt_transcribe(audio_path: str, *, stt_model: str = "gpt-4o-mini-transcribe") -> str:
    from openai import OpenAI

    if not audio_path or not os.path.isfile(audio_path):
        return ""

    client = OpenAI()
    with open(audio_path, "rb") as f:
        tr = client.audio.transcriptions.create(model=stt_model, file=f)
    return (_safe_get(tr, "text", "") or "").strip()


def tts_speak_to_file(
    text: str,
    *,
    tts_model: str = "gpt-4o-mini-tts",
    voice: str = "alloy",
    response_format: str = "mp3",
) -> str:
    """
    Returns a filepath to an audio file containing spoken 'text'.
    Uses streaming if available, otherwise falls back to a simple bytes write.
    """
    from openai import OpenAI

    text = (text or "").strip()
    if not text:
        return ""

    client = OpenAI()
    out_dir = Path(tempfile.mkdtemp(prefix="orch_tts_"))
    out_path = out_dir / f"speech.{response_format}"

    # Prefer streaming if supported by your SDK version
    try:
        with client.audio.speech.with_streaming_response.create(
            model=tts_model,
            voice=voice,
            input=text,
            response_format=response_format,
        ) as r:
            r.stream_to_file(out_path)
        return str(out_path)
    except Exception:
        # Fallback: non-streaming response
        r = client.audio.speech.create(
            model=tts_model,
            voice=voice,
            input=text,
            response_format=response_format,
        )
        # Try common shapes
        data = None
        if hasattr(r, "read"):
            data = r.read()
        elif isinstance(r, (bytes, bytearray)):
            data = bytes(r)
        elif hasattr(r, "content"):
            data = r.content
        if not data:
            raise RuntimeError("TTS succeeded but no audio bytes were returned by the SDK.")
        out_path.write_bytes(data)
        return str(out_path)


# -----------------------------
# 3) Image coercion (handles PIL OR google-genai Image objects)
# -----------------------------
def coerce_to_pil(img_obj: Any) -> Any:
    """
    Gradio accepts PIL.Image, numpy arrays, or filepaths.
    This tries to convert common non-PIL objects into PIL.
    """
    if img_obj is None:
        return None

    # PIL?
    try:
        from PIL import Image as PILImage  # local import
        if isinstance(img_obj, PILImage.Image):
            return img_obj
    except Exception:
        pass

    # google.genai.types.Image style: has .image_bytes
    b = getattr(img_obj, "image_bytes", None)
    if isinstance(b, (bytes, bytearray)):
        try:
            from PIL import Image as PILImage
            return PILImage.open(BytesIO(b))
        except Exception:
            return None

    # base64 string?
    b64 = getattr(img_obj, "data", None)
    if isinstance(b64, str):
        import base64
        try:
            from PIL import Image as PILImage
            raw = base64.b64decode(b64)
            return PILImage.open(BytesIO(raw))
        except Exception:
            return None

    return None


# -----------------------------
# 4) Gradio app logic
# -----------------------------
LABEL_LOCAL = "A) Local RAG (ADA / ABA / GSA P-100)"
LABEL_UPLOAD = "B) User file upload (session-only PDF)"
LABEL_WEB = "C) Web search"

DEFAULT_TEXT_MODELS = [
  ("gpt-4.1-mini", "gpt-4.1-mini"),
  ("Llama-3.1-8B-Instruct (Modal hosted · higher latency)", "Llama-3.1-8B-Instruct"),
]



def build_enabled_layers(selected: List[str], upload_ready: bool) -> Dict[str, bool]:
    enabled = {
        "local": LABEL_LOCAL in (selected or []),
        "upload": (LABEL_UPLOAD in (selected or [])) and upload_ready,
        "web": LABEL_WEB in (selected or []),
    }
    return enabled


def build_layer_context(vector_store_id: Optional[str]) -> Dict[str, Any]:
    ctx: Dict[str, Any] = {}
    if vector_store_id:
        ctx["vector_store_id"] = vector_store_id
    return ctx


def ui_index_file(file_path: str, state: Dict[str, Any]) -> Tuple[Dict[str, Any], str]:
    """
    Index the uploaded file and store vector_store_id in state.
    """
    try:
        reuse = state.get("vector_store_id") if os.getenv("REUSE_VECTOR_STORE", "1") == "1" else None
        vs_id, msg = index_pdf_to_vector_store(file_path, reuse_vector_store_id=reuse)
        global LATEST_VECTOR_STORE_ID
        LATEST_VECTOR_STORE_ID = vs_id

        state = dict(state or {})
        state["vector_store_id"] = vs_id
        state["uploaded_pdf"] = os.path.basename(file_path or "")
        return state, f"{msg}\nvector_store_id: {vs_id}"
    except Exception as e:
        return dict(state or {}), f"❌ Upload indexing error: {e}"


def ui_toggle_mode(mode: str):
    is_voice = (mode or "").lower().startswith("conversational")
    return (
        gr.update(visible=not is_voice),  # text_group
        gr.update(visible=is_voice),      # voice_group
    )


def ui_run_text(
    question: str,
    selected_sources: List[str],
    text_model: str,
    temperature: float,
    upload_state: Dict[str, Any],
) -> Tuple[str, Any]:
    question = (question or "").strip()
    if not question:
        return "⚠️ Please enter a question.", None

    vector_store_id = (upload_state or {}).get("vector_store_id")
    enabled = build_enabled_layers(selected_sources or [], upload_ready=bool(vector_store_id))
    ctx = build_layer_context(vector_store_id)

    # If user checked upload but indexing isn’t ready, we’ll warn but still run other layers.
    warn = ""
    if (LABEL_UPLOAD in (selected_sources or [])) and not vector_store_id:
        warn = "⚠️ Upload layer was selected, but no PDF is indexed yet. Upload + Index a PDF first.\n\n"

    try:
        result = run_orchestra(
            question=question,
            enabled_layers=enabled,
            layer_context=ctx,
            text_model=text_model,
            temperature=float(temperature),
        )
        img = coerce_to_pil(getattr(result, "image_pil", None))
        text = warn + (getattr(result, "text", "") or "")
        return text, img
    except Exception as e:
        return warn + f"❌ Error running orchestra: {e}", None


def ui_run_voice(
    audio_path: str,
    selected_sources: List[str],
    text_model: str,
    temperature: float,
    upload_state: Dict[str, Any],
) -> Tuple[str, str, Any, str]:
    """
    Returns: (stt_transcript, response_text, image, tts_audio_filepath)
    """
    vector_store_id = (upload_state or {}).get("vector_store_id")
    enabled = build_enabled_layers(selected_sources or [], upload_ready=bool(vector_store_id))
    ctx = build_layer_context(vector_store_id)

    warn = ""
    if (LABEL_UPLOAD in (selected_sources or [])) and not vector_store_id:
        warn = "⚠️ Upload layer was selected, but no PDF is indexed yet. Upload + Index a PDF first.\n\n"

    transcript = ""
    try:
        transcript = stt_transcribe(audio_path)
    except Exception as e:
        return "", f"❌ STT error: {e}", None, ""

    if not transcript:
        return "", "⚠️ No speech detected (empty transcript).", None, ""

    try:
        result = run_orchestra(
            question=transcript,
            enabled_layers=enabled,
            layer_context=ctx,
            text_model=text_model,
            temperature=float(temperature),
        )
        img = coerce_to_pil(getattr(result, "image_pil", None))
        response_text = warn + (getattr(result, "text", "") or "")

        # Speak ONLY the paragraph (not references / markers)
        paragraph = (getattr(result, "paragraph", "") or "").strip()
        audio_out = ""
        try:
            audio_out = tts_speak_to_file(paragraph)
        except Exception:
            # If TTS fails, still return transcript + text + image
            audio_out = ""

        return transcript, response_text, img, audio_out

    except Exception as e:
        return transcript, warn + f"❌ Error running orchestra: {e}", None, ""


# -----------------------------
# 5) Build UI
# -----------------------------
with gr.Blocks(
    title="StandardScout | RAG-Based Building Code Assistant",
) as demo:
    gr.Markdown(
        "# StandardScout\n"
        "StandardScout is an online building-code copilot powered by LLMs. It combines a local RAG knowledge base for ADA, ABA, and GSA P-100 with optional PDF upload and web search, so users can turn sources on or off as needed. It supports both Text and Conversational modes (UI-only difference), generates architectural blueprint-style technical diagrams from each Q&A, and provides friendly, citation-backed answers designed to support understanding without encouraging overreliance.\n"
        "\n"
    )

    upload_state = gr.State({"vector_store_id": None, "uploaded_pdf": ""})

    with gr.Row():
        # Controls
        with gr.Column(scale=4):
            mode = gr.Radio(
                ["Text-based mode", "Conversational mode"],
                value="Conversational mode",
                label="1) Mode",
            )

            sources = gr.CheckboxGroup(
                choices=[LABEL_LOCAL, LABEL_UPLOAD, LABEL_WEB],
                value=[LABEL_LOCAL],
                label="2) Retrieval sources (select any)",
                elem_id="ssSources",
            )

            file_upload = gr.File(
                label="Upload a PDF for session-only retrieval",
                file_types=[".pdf"],
                type="filepath",
            )
            index_btn = gr.Button("Index uploaded PDF")
            upload_status = gr.Textbox(
                label="Please wait for completed status",
                value="(No file indexed yet.)",
                interactive=False,
                lines=3,
            )


            gr.Markdown("### 5) Model controls")
            text_model = gr.Dropdown(
                choices=DEFAULT_TEXT_MODELS,
                value=os.getenv("FIXED_OPENAI_MODEL", os.getenv("OPENAI_MODEL", "gpt-4.1-mini")),
                label="The fine-tuned models",
                allow_custom_value=True,
                elem_id="ssTextModel",
            )
            temperature = gr.Slider(
                minimum=0.0,
                maximum=1.0,
                value=0.1,
                step=0.05,
                label="Temperature",
                elem_id="ssTemperature",
            )
            gr.Markdown(
                "Lower temperature = more consistent and predictable answers\n\n"
                "Higher temperature = more varied and creative wording"
            )

        # Inputs + Outputs
        with gr.Column(scale=6):
            with gr.Group(visible=False) as text_group:
                question = gr.Textbox(label="Question", lines=3, placeholder="Ask a design/code question…")
                ask_btn = gr.Button("Run (Text)")
                response = gr.Textbox(label="Response", lines=12)
                gr.Markdown("Not legal advice. Please verify against the official standards.")
                image_out = gr.Image(label="3) Generated technical image", type="pil")

            with gr.Group(visible=True) as voice_group:
                gr.HTML(VOICE_WIDGET_HTML)
                # NOTE: We intentionally use gr.HTML here (not gr.Image) because
                # Conversational mode is driven by custom JS calling /api/voice-chat.
                # With no Gradio callback to "push" an image value, gr.Image stays
                # in its input/uploader state. The HTML block is updated directly
                # by voice-avatar.js using the returned base64 PNG.
                voice_image_out = gr.HTML(VOICE_GENERATED_IMAGE_HTML, elem_id="voiceGeneratedImage")

    # Events
    mode.change(fn=ui_toggle_mode, inputs=[mode], outputs=[text_group, voice_group])

    index_btn.click(
        fn=ui_index_file,
        inputs=[file_upload, upload_state],
        outputs=[upload_state, upload_status],
    )

    ask_btn.click(
        fn=ui_run_text,
        inputs=[question, sources, text_model, temperature, upload_state],
        outputs=[response, image_out],
    )

    # Voice mode is handled by the custom JS widget calling /api/voice-chat.

# NOTE: We intentionally do NOT enable Gradio Queue here.
# In Hugging Face Spaces, Gradio's queue/SSE layer can try to bind an extra port
# (commonly PORT+1), which may already be reserved inside the container.
# The voice widget already uses an explicit FastAPI endpoint (/api/voice-chat),
# so we keep the app single-port to avoid "address already in use" errors.

# -----------------------------
# 6) Voice endpoint: /api/voice-chat (multipart/form-data)
# -----------------------------
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse


fastapi_app = FastAPI()


def split_voice_answer(full_text: str) -> Tuple[str, str]:
    """Split the formatted StandardScout answer into (display_text, references_text).

    - Removes *\start of specking\* and *\end of specking\* markers if present.
    - Extracts the trailing References section if present.
    """
    s = (full_text or "")
    # Remove speaking markers (these are control tokens, not user-facing)
    s = s.replace("*\\start of specking\\*\n", "")
    s = s.replace("*\\end of specking\\*\n", "")
    s = s.replace("*\\start of specking\\*", "")
    s = s.replace("*\\end of specking\\*", "")

    sep = "\nReferences:\n"
    if sep in s:
        main, refs = s.split(sep, 1)
        return main.strip(), refs.strip()
    return s.strip(), ""

@fastapi_app.post("/api/voice-chat")
async def voice_chat(
    audio: UploadFile = File(...),
    history: str = Form("[]"),
    sources: str = Form("[]"),
    text_model: str = Form(""),
    temperature: str = Form("0.1"),
    page_context: str = Form(""),
):
    """STT → StandardScout answer → TTS. Returns base64 audio for the web UI."""

    # Parse sources coming from the frontend.
    # IMPORTANT: Gradio's checkbox DOM often yields values like "on" or empty strings
    # when scraped from the page. If we pass unrecognized labels through, all layers
    # can end up disabled and the model will respond with "Not found in retrieved sources.".
    # To keep voice mode aligned with Text mode, we aggressively normalize and fall back
    # to Local RAG when nothing valid is detected.
    KNOWN = {LABEL_LOCAL, LABEL_UPLOAD, LABEL_WEB}
    ALIASES = {
        "local": LABEL_LOCAL,
        "a": LABEL_LOCAL,
        "upload": LABEL_UPLOAD,
        "b": LABEL_UPLOAD,
        "web": LABEL_WEB,
        "c": LABEL_WEB,
    }

    raw_sources: List[str] = []
    try:
        parsed = json.loads(sources) if sources else []
        if isinstance(parsed, list):
            raw_sources = [str(x) for x in parsed]
    except Exception:
        raw_sources = []

    selected_sources: List[str] = []
    for s in raw_sources:
        s2 = (s or "").strip()
        if not s2:
            continue
        if s2 in KNOWN:
            selected_sources.append(s2)
            continue
        key = s2.lower()
        if key in ALIASES:
            selected_sources.append(ALIASES[key])

    # If nothing matched, default to Local RAG (same as initial Text mode).
    if not selected_sources:
        selected_sources = [LABEL_LOCAL]

    # Model controls
    use_model = (text_model or os.getenv("OPENAI_MODEL", "gpt-4.1-mini")).strip()
    try:
        temp = float(temperature)
    except Exception:
        temp = 0.1
    # If the UI sends the display label, normalize it back to the real model id
    LABEL_TO_ID = dict(DEFAULT_TEXT_MODELS)  # {label: value}
    use_model = LABEL_TO_ID.get(use_model, use_model)

    
    # Save audio to temp file
    suffix = ".webm"
    try:
        if audio.filename and "." in audio.filename:
            suffix = "." + audio.filename.rsplit(".", 1)[-1]
    except Exception:
        pass

    tmp_dir = Path(tempfile.mkdtemp(prefix="ss_voice_"))
    tmp_path = tmp_dir / ("speech" + suffix)
    try:
        data = await audio.read()
        tmp_path.write_bytes(data)
    except Exception as e:
        return JSONResponse({"error": f"Failed to read audio: {e}"}, status_code=400)

    # Transcribe
    try:
        user_text = stt_transcribe(str(tmp_path))
    except Exception as e:
        return JSONResponse({"error": f"STT error: {e}"}, status_code=500)

    user_text = (user_text or "").strip()
    if not user_text:
        return JSONResponse({"error": "Empty transcript"}, status_code=400)

    # Keep voice mode aligned with Text mode.
    # Text mode does NOT inject page context into the user's question, so we disable
    # this by default to avoid degrading retrieval.
    page_context = ""

    # Upload layer best-effort support (shared var)
    vector_store_id = LATEST_VECTOR_STORE_ID

    enabled = build_enabled_layers(selected_sources, upload_ready=bool(vector_store_id))
    ctx = build_layer_context(vector_store_id)

    warn = ""
    if (LABEL_UPLOAD in selected_sources) and not vector_store_id:
        warn = "⚠️ Upload layer is selected but no PDF is indexed yet.\n\n"

    # Run StandardScout
    try:
        question = user_text

        result = run_orchestra(
            question=question,
            enabled_layers=enabled,
            layer_context=ctx,
            text_model=use_model,
            temperature=float(temp),
        )

        assistant_text = warn + (getattr(result, "text", "") or "")
        display_text, refs_text = split_voice_answer(assistant_text)
        paragraph = (getattr(result, "paragraph", "") or "").strip() or display_text

        # Generated technical image (PNG base64) for the voice UI
        image_b64 = ""
        image_mime = ""
        try:
            img_pil = coerce_to_pil(getattr(result, "image_pil", None))
            if img_pil is not None:
                buf = BytesIO()
                img_pil.save(buf, format="PNG")
                image_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
                image_mime = "image/png"
        except Exception:
            image_b64 = ""
            image_mime = ""

        # TTS
        audio_b64 = ""
        audio_mime = ""
        try:
            tts_path = tts_speak_to_file(paragraph)
            if tts_path and os.path.isfile(tts_path):
                audio_bytes = Path(tts_path).read_bytes()
                audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
                # Default: mp3
                audio_mime = "audio/mpeg"
        except Exception:
            # Text-only fallback
            audio_b64 = ""
            audio_mime = ""

        return JSONResponse(
            {
                "user_text": user_text,
                "assistant_text": display_text,
                "references_text": refs_text,
                "audio_base64": audio_b64,
                "audio_mime": audio_mime,
                "image_base64": image_b64,
                "image_mime": image_mime,
            }
        )
    except Exception as e:
        return JSONResponse({"error": f"StandardScout error: {e}"}, status_code=500)


# Mount Gradio UI on the same FastAPI app
#
# IMPORTANT (HF Spaces): if GRADIO_SSR_MODE is enabled, Gradio may start a Node SSR
# server on an additional port (often PORT+1). Some containers reserve that port,
# causing: "address already in use". We explicitly disable SSR here and avoid
# Gradio Queue to keep the app single-port.

app = gr.mount_gradio_app(
    fastapi_app,
    demo,
    path="/",
    ssr_mode=False,
    enable_monitoring=False,
    pwa=False,
    mcp_server=False,
    theme=gr.themes.Soft(),
    css=VOICE_WIDGET_CSS,
    head=VOICE_WIDGET_HEAD,
)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "7860")))
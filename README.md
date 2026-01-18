# Voice Avatar Add-on (Cloudflare + OpenAI + ElevenLabs)

This package adds a simple **hold-to-talk** voice assistant widget to your existing site:

- Two GLB avatars (idle + talking)
- Hold-to-record in the browser
- 1-turn dialog shown in a small chat box
- Audio reply played back, switching the avatar to the “talking” model while audio plays

## What you need to set

### 1) Cloudflare Worker environment variables

Set these in your Worker settings:

- `OPENAI_API_KEY`
- `ELEVEN_API_KEY`
- `ELEVEN_VOICE_ID`

Optional:

- `ALLOW_ORIGIN` (e.g., `https://yourdomain.com`)
- `SYSTEM_PROMPT`

### 2) Deploy the Worker

Files are in `cloudflare-worker/`.

1. Install Wrangler locally
2. Copy `cloudflare-worker/wrangler.toml.example` to `cloudflare-worker/wrangler.toml`
3. Run:
   - `wrangler deploy`
4. Route the worker to:
   - `https://yourdomain.com/api/voice-chat`

## How the website calls the API

Frontend JS uses:

- `window.AVATAR_API_URL` if you set it, otherwise `/api/voice-chat`

So if your worker is hosted elsewhere, add this near the bottom of each page (before `voice-avatar.js`):

```html
<script>
  window.AVATAR_API_URL = "https://api.yourdomain.com/api/voice-chat";
</script>
```

## Files added

- `assets/avatar/model_Idle.glb`
- `assets/avatar/model_Talk.glb`
- `assets/css/voice-widget.css`
- `assets/js/voice-avatar.js`
- Updated `index.html` with the widget markup

## Notes

- This uses `<model-viewer>` via CDN. If you prefer to self-host it, download the file and replace the script tag in `index.html`.
- Browsers require a user gesture to start audio and request microphone permission. Holding the button counts as a gesture.

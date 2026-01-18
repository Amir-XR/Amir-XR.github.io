# Voice Avatar Widget (Cloudflare Pages Direct Upload)

This folder is a **drop-in add-on** for your website.

## What you get
- `index.html` (example: already patched to include the widget)
- `assets/css/voice-widget.css`
- `assets/js/voice-avatar.js`
- `assets/avatar/model_Idle.glb`
- `assets/avatar/model_Talk.glb`
- `_worker.js` (Cloudflare Pages Advanced mode API: `/api/voice-chat`)

## How to use with your existing site
1) Copy these files into your site's root folder:
- `_worker.js`
- `assets/css/voice-widget.css`
- `assets/js/voice-avatar.js`
- `assets/avatar/` (folder)

2) Add these to any page where you want the widget:
- In `<head>`:
  - `<link rel="stylesheet" href="assets/css/voice-widget.css" />`
  - `<script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>`
- Before `</body>`:
  - `<script type="module" src="assets/js/voice-avatar.js"></script>`
- Add the widget HTML block (see `index.html` in this package for the ready-to-copy section).

## Cloudflare Pages settings
In your Cloudflare Pages project settings, set **Secrets** (Environment Variables):
- `OPENAI_API_KEY`
- `ELEVEN_API_KEY`
- `ELEVEN_VOICE_ID`

Optional:
- `SYSTEM_PROMPT` (overrides the default assistant behavior)
- `ALLOW_ORIGIN` (for CORS, only needed if you call the API from another domain)

## Notes
- The frontend uses **hold to record** (pointer down) and **release to send** (pointer up).
- The backend returns an MP3 as base64, and the page plays it while swapping to the “talking” model.

# Deploy to Cloudflare Pages

This folder contains everything needed to upload the new editorial site to
Cloudflare Pages. **Do not** upload the parent repo folder — it includes
backups (`_old-design/`), the prototype workspace (`design-prototypes/`),
and dev tools that don't belong in production. Just upload the contents
of this `_deploy/` folder.

---

## What's in here

```
_deploy/
├── _worker.js                  ← Cloudflare Pages Advanced-mode worker
│                                  (handles POST /api/voice-chat)
├── CNAME                       ← custom-domain pointer (www.amirgoli.com)
├── robots.txt
├── sitemap.xml
├── 404.html                    ← custom not-found page
├── index.html                  ← editorial home
├── publications.html
├── activities.html
├── contact.html
├── projects/
│   ├── index.html              ← projects listing
│   ├── project-1.html          ← ARTH (VR learning)
│   ├── project-2.html          ← GaoDe (serious game)
│   ├── project-3.html          ← BESOLOGY (topology)
│   ├── project-4.html          ← OROSI (pavilion)
│   ├── project-5.html          ← Fabrication
│   └── standardscout.html      ← StandardScout (RAG copilot)
└── assets/
    ├── css/style.css
    ├── js/main.js              ← editorial bootstrap (theme, cursor, FAB, filter)
    ├── js/voice-avatar.js      ← voice widget (mic, chat, avatar pose swap)
    ├── img/                    ← page images, project galleries, OG cards
    ├── avatar/                 ← 3D avatar (model_Idle.glb, model_Talk.glb,
    │                             model(2).glb, poses.json)
    └── cv.txt                  ← Amir's CV in plain text — read by _worker.js
                                  on cold start and embedded in the assistant
                                  prompt. Edit this when your CV changes.
```

Total size: **~115 MB**. Cloudflare Pages allows projects up to ~20,000 files
and ~25 MB per file, so this is well within limits, but the page-load weight
of some 8–12 MB project images is on the heavy side — consider compressing
them later (a 60–80% reduction without visible quality loss is realistic).

---

## Step-by-step upload (Cloudflare Pages → Direct Upload)

1. **Go to** https://dash.cloudflare.com → Workers & Pages → your existing
   `amirgoli` project (or create a new one if this is a fresh deploy).

2. **Upload assets**: Settings → "Upload assets" (Direct Upload). Drag the
   **contents** of this `_deploy/` folder (not the folder itself). Cloudflare
   Pages will detect `_worker.js` at the root and switch the project into
   **Advanced mode** automatically — that's what we want.

3. **Set the secret**: Settings → Environment variables. Add a *secret*
   (encrypted) variable:

   | Name              | Value                              |
   | ----------------- | ---------------------------------- |
   | `OPENAI_API_KEY`  | your real OpenAI key (sk-…)        |

   Optional vars (the worker has sensible defaults — set only if you want
   to override):

   | Name                  | Default                       |
   | --------------------- | ----------------------------- |
   | `OPENAI_CHAT_MODEL`   | `gpt-4o-mini`                 |
   | `OPENAI_STT_MODEL`    | `gpt-4o-mini-transcribe`      |
   | `OPENAI_TTS_MODEL`    | `gpt-4o-mini-tts`             |
   | `OPENAI_TTS_VOICE`    | `ash`                         |
   | `SYSTEM_PROMPT`       | (built-in persona)            |
   | `ALLOW_ORIGIN`        | echoes the request's `Origin` |

4. **Custom domain**: Settings → Custom domains → confirm `www.amirgoli.com`
   is attached. The `CNAME` file in this folder is the legacy GitHub Pages
   marker — Cloudflare ignores it but it doesn't hurt to keep.

5. **Test**: visit your `*.pages.dev` preview URL (or `www.amirgoli.com` once
   DNS is live). Hold the mic in the left bay → it should record, send to
   `/api/voice-chat`, and play the spoken reply. Open DevTools → Network and
   check that `POST /api/voice-chat` returns `200 OK` with a JSON payload
   containing `audio_base64`.

---

## What's *not* in here (intentionally excluded)

- `_old-design/` — backup of the previous production site (keep in your repo,
  but don't ship)
- `design-prototypes/` — the editorial prototype workspace (now promoted
  to root; the prototype folder itself isn't needed)
- `_migrate.py`, `tools/`, `_generate_pages.py` — dev tools
- `.dev.vars`, `.wrangler/`, `.claude/` — local dev state
- `Amir_Goli_CV.pdf`, `Amir_Goli_CV_updated_language.docx` — source CV
  documents (the worker uses `assets/cv.txt` which is the rendered version)
- `StandardScout/` (top-level) — separate Gradio app, not part of the static site
- `web.zip` — a packaged snapshot of an older state
- `*.md` (`README.md`, `CLAUDE.md`, `ACTION_PLAN.md`, `PROJECT_OVERVIEW.md`)
  — repo docs that don't belong on the production site
- `standardscout.html` (root) — orphaned from the old design;
  `/projects/standardscout.html` is the canonical case study now

---

## After deploy: things to verify

- [ ] Home page loads with the rotated avatar in the left bay
- [ ] Hold-to-talk records audio and the avatar speaks back
- [ ] Theme toggle persists across pages (`localStorage["theme"]`)
- [ ] All five project pages load with images and galleries
- [ ] Publications filter chips work (10 → N items)
- [ ] Mobile: avatar bay slides in via the floating mic button
- [ ] Custom 404 shows the editorial design
- [ ] `https://www.amirgoli.com/api/voice-chat` returns a useful error on GET
      (the route only accepts POST), confirming the worker is live

---

## Future maintenance

- **CV updates**: edit `assets/cv.txt` and re-upload (or keep it in your repo
  and re-deploy from there). Changes take effect on the next worker cold
  start.
- **New publications**: edit `publications.html`, add a new `<li class="pub-item"
  data-year="..." data-type="...">` block, re-upload.
- **New projects**: add HTML in `projects/` and a card in `projects/index.html`.
- **Image compression**: tools like `pngquant`, `mozjpeg`, or
  [Squoosh](https://squoosh.app/) can typically halve the size of these
  PNGs without visible quality loss.

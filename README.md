<div align="center">

# CV Studio

**Drop a CV. Then tell it what to change — by typing or by speaking.**

[**Open the app →**](https://aseydaaksakal.github.io/cv-studio/)

[![Web tests](https://github.com/aseydaaksakal/cv-studio/actions/workflows/web-tests.yml/badge.svg)](https://github.com/aseydaaksakal/cv-studio/actions/workflows/web-tests.yml)
[![Pages](https://github.com/aseydaaksakal/cv-studio/actions/workflows/pages.yml/badge.svg)](https://github.com/aseydaaksakal/cv-studio/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

---

CV Studio is a CV editor that works the way you would brief a person: give it the document, then say what you want. *"Cut this to one page."* *"Add rag-eval under Projects."* *"Tailor it for this job description."* *"Bunu İngilizceye çevir."* Each instruction updates the CV; the preview updates with it; **Undo** takes it back.

It runs entirely in your browser. There is no server and, by default, **no API key**: an open-source model (Qwen 2.5) and Whisper run on your own GPU through WebGPU, the way the desktop edition runs Ollama. Your CV never leaves the machine. If you prefer, switch to Anthropic or any OpenAI-compatible provider with your own key.

## How it works

```
 empty page ──drop PDF/DOCX──▶ parsed in the browser (pdf.js / mammoth)
                                        │
                                        ▼
                     AI structures it into JSON (your key, your provider)
                                        │
        ┌───────────────────────────────┼───────────────────────────────┐
        ▼                               ▼                               ▼
   Chat: type or speak           Fields: edit by hand            Preview: Sans / Serif / ATS
   "make it shorter"             every field, add/remove/reorder  photo on/off, PDF, JSON, text
        └──────────────── every change re-renders the preview ───────────┘
```

**Voice** — press the mic and speak in any language. The default engine is Whisper running in your browser: it detects the language itself and handles mixed Turkish/English. Two alternatives in settings: the browser's own recogniser (instant, but limited to the browser's language) and the Whisper API with an OpenAI key. The transcript lands in the text box first; you glance at it and press Enter. No recogniser is perfect, and the model is told it may be reading a noisy transcript and to act on the intent.

**First use downloads the models** (Whisper base ~80 MB, Qwen 1.5B ~1 GB) and caches them; after that everything is instant and offline. Larger models can be picked in settings for better edits on a strong GPU. Chrome or Edge 113+ for WebGPU.

**The AI is constrained.** It receives the CV as JSON and returns JSON. It is instructed never to invent employers, dates, metrics or credentials, to change only what the instruction requires, and to say in one sentence what it changed. That sentence appears in the chat so you can check it against the preview.

## Using it

1. Open https://aseydaaksakal.github.io/cv-studio/ and drop a **PDF**, **DOCX** or a **JSON** saved earlier. Or click *Try with a sample* to see it work on a fictional CV.
2. Nothing to configure: the in-browser engines are the default. Open **⚙ AI settings** only if you want a cloud provider with your own key, or a larger local model.
3. Talk to it. Quick actions cover the common asks — sharper summary, stronger bullets, ATS-friendly, fit one page, translate. Anything else, just type or say it.
4. Switch to **Fields** to fix a date, reorder jobs, or add a line without involving the AI.
5. Pick a template, add a photo if you want one, **Download PDF** (browser print dialog → Save as PDF, A4, no headers/footers). **Save JSON** keeps an editable copy; **Plain text** is for forms that strip formatting.

Your CV stays in this browser's `localStorage` between visits. **New CV** clears it.

## Editions

| | Web (`web/`) | Desktop (`backend/`, `frontend/`) |
|---|---|---|
| Runs | in the browser, hosted free on GitHub Pages | on your machine: FastAPI + local Ollama |
| AI | open-source model in the browser (WebGPU), or your key → Anthropic / OpenAI-compatible | a local model via Ollama; nothing leaves the machine |
| Voice | Whisper in the browser, language auto-detected | faster-whisper, offline |
| Best for | anyone, any device, zero setup | fully offline work with sensitive data |

The desktop edition keeps content generation out of the model entirely: the model classifies a command into actions and Python applies them. See `AGENTS.md` and `backend/` for its architecture and tests.

## Testing

The web edition is tested at two levels, and CI runs both on every push:

- **Unit** (`web/tests/core.test.mjs`, node:test): normalisation, JSON extraction, field editing, HTML escaping, every template, plain-text export.
- **End-to-end** (`web/tests/app.e2e.mjs`, Playwright, real Chromium with a fake microphone): landing → sample → workspace; template switching; keyless in-browser engine editing (model stubbed at the module boundary); cloud engine without a key; cloud engine against a mocked endpoint with the change note and Undo; quick actions; **mic → recording → local transcription → Enter → edit applied**; Fields editing; persistence; New CV; exports; dropping a saved JSON.

What automation cannot cover and is checked by hand on each release: real model downloads and WebGPU on actual hardware, transcription accuracy, the print-to-PDF dialog, real PDF/DOCX parsing on a handful of layouts.

```bash
cd web
node --test tests/core.test.mjs
npm install && npx playwright install chromium && npx playwright test
```

## Development

No build step. `web/core.js` holds the pure logic, `web/app.js` the wiring, `web/index.html` and `web/app.css` the interface. Push to `main` and the Pages workflow publishes `web/` to the `gh-pages` branch. Conventions for agent sessions are in `CLAUDE.md`.

Desktop edition:

```bash
cd backend && pip install -r requirements.txt
ollama pull qwen3.8:27b
uvicorn app:app --reload
```

## Privacy

Web edition: no analytics, no server, no storage beyond your own browser. The repository's infrastructure cannot see your CV or your key because there is none.

## Roadmap

- DOCX export
- Job-description matching with a gap list
- More templates, and a template editor driven by the same chat
- Shareable read-only link (client-side encrypted)

## License

MIT

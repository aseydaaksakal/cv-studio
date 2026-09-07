<div align="center">

# CV Studio

**Drop a CV. Then tell it what to change — by typing or by speaking.**

No account, no API key, no server. The model runs on your own hardware.

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
                          a model turns it into structured JSON
                                        │
   ┌────────────────────── the workspace ───────────────────────┐
   │  left: the CV, and under it one box            right: what │
   │        with a mic and an Enter button          changed, and│
   │                                                the fields  │
   └────────────────────────────────────────────────────────────┘
```

Speak or type an instruction. The model does not rewrite the CV; it emits **small operations** — `set basics.title`, `delete experience.1`, `append projects` — which the app applies itself. That is why *"delete the name Elif Demir"* removes the name and nothing else. If a reply would destroy most of the CV without you asking, it is refused and the CV stays as it was.

**Voice.** Press the mic, speak in any language, press it again. Whisper detects the language itself — Turkish, English, or both in one sentence. The transcript lands in the box; you glance at it and press Enter.

## Where the model runs

Four options, in ⚙ settings. The first two are free and need no key.

| Engine | Speed and quality | Setup |
|---|---|---|
| **In this browser** (default) | Depends on your GPU. Qwen 2.5 3B is fine for edits; 7B is better. Whisper small handles Turkish well. First use downloads ~250 MB + ~2 GB, then it is cached and offline. | none — needs Chrome/Edge with WebGPU |
| **Ollama on your machine** | The best option if you already run Ollama. Your full GPU, your own model (`qwen3.8:27b`), no download in the browser. | one environment variable, below |
| **CV Studio desktop backend** | Same, plus faster-whisper for speech. | run the backend, below |
| **Anthropic / OpenAI-compatible** | Best quality, costs money, needs your key. | paste a key |

### Connect the hosted app to your own machine

The hosted page can drive the model on your computer. Nothing is uploaded to any server — the browser talks to `localhost`.

**Ollama** (text only). Allow the page to reach it, then restart Ollama:

```powershell
setx OLLAMA_ORIGINS "https://aseydaaksakal.github.io"
```

```bash
export OLLAMA_ORIGINS="https://aseydaaksakal.github.io"
```

In ⚙ settings pick *Ollama on my own machine*, URL `http://localhost:11434`, model `qwen3.8:27b`.

**Desktop backend** (text and faster-whisper speech):

```bash
cd backend
CV_STUDIO_CORS="https://aseydaaksakal.github.io" uvicorn app:app --port 8000
```

```powershell
$env:CV_STUDIO_CORS="https://aseydaaksakal.github.io"; .\.venv\Scripts\uvicorn.exe app:app --port 8000
```

In ⚙ settings set the voice engine to *CV Studio desktop backend*, URL `http://localhost:8000`. `CV_STUDIO_CORS` is empty by default, so nothing external can reach your backend unless you set it.

Browsers block plain `http://localhost` from an `https://` page in some configurations. If the app reports it cannot reach your machine, put a tunnel in front of it (`cloudflared tunnel --url http://localhost:11434`) and paste the `https://` address into settings instead.

**How much context does it need?** The whole CV plus the instruction is roughly 1,500–4,000 tokens, and the reply is a handful of operations — a few hundred. Any 3B model with an 8k window is enough; there is no need for a large context.

## Using it

1. Open https://aseydaaksakal.github.io/cv-studio/ and drop a **PDF**, **DOCX** or a **JSON** saved earlier. Or click *Try with a sample* to see it work on a fictional CV.
2. Nothing to configure: the in-browser engines are the default. Open **⚙** to point it at your own Ollama, the desktop backend, or a cloud provider.
3. Talk to it, in the box under the CV. Quick actions on the right cover the common asks — sharper summary, stronger bullets, ATS-friendly, fit one page, translate. Anything else, just type or say it.
4. Use the **Upload CV** button to load a different CV at any time. Switch to **Fields** to fix a date, reorder jobs, or add a line without involving the AI.
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

- **Unit** (`web/tests/core.test.mjs`, node:test): normalisation, JSON extraction, field editing, **the operation engine** (set/delete/append/insert/move, malformed operations skipped and reported), **the destructive-edit guard**, HTML escaping, every template, plain-text export.
- **End-to-end** (`web/tests/app.e2e.mjs`, Playwright, real Chromium with a fake microphone): landing → sample → workspace; template switching; keyless in-browser engine editing (model stubbed at the module boundary); cloud engine without a key; cloud engine against a mocked endpoint with the change note and Undo; a targeted delete removing only what was named; a wiping reply being refused; an instruction the model cannot act on; the toolbar upload; the left/right layout; quick actions; **mic → recording → local transcription → Enter → edit applied**; Fields editing; persistence; New CV; exports; dropping a saved JSON.

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

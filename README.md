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

Speak or type an instruction. The model does not rewrite the CV; it emits **small operations** — `set basics.title`, `delete experience.1`, `append projects` — which the app applies itself. That is why *"delete the name Elif Demir"* removes the name and nothing else.

Three things protect you from a small model getting it wrong:

- **Loose paths are repaired.** Models write `name`, `cv.basics.name`, `Full Name` or `experience[1].title`; all of those are mapped onto the real shape rather than silently ignored.
- **Nothing is claimed that did not happen.** If no operation could be applied, you get an error naming what the model asked for — never a cheerful "done" over an unchanged CV.
- **Destructive replies are refused.** A reply that would erase most of the CV is rejected unless you asked to clear it.

**Voice.** Press the mic, speak in any language, press it again. Whisper detects the language itself — Turkish, English, or both in one sentence. The transcript lands in the box; you glance at it and press Enter.

## Where the model runs

Four options, in ⚙ settings. The first two are free and need no key.

| Engine | Speed and quality | Setup |
|---|---|---|
| **In this browser** (default) | Runs on your GPU through WebGPU. Model sizes from 1.5B to 32B; the default is Qwen 2.5 7B. First use downloads the weights, then they are cached and work offline. | none — Chrome/Edge with WebGPU |
| **Ollama on your machine** | Any model you have pulled, at full GPU speed, with no download in the browser. Installed models are listed for you. | one environment variable, below |
| **CV Studio desktop backend** | Same, plus faster-whisper for speech. Falls back to the in-browser engine if unreachable. | run the backend, below |
| **Anthropic / OpenAI-compatible** | Best quality, costs money, needs your key. | paste a key |

### Which model is good enough

Two jobs with very different demands. **Editing** ("delete the name", "make the title Staff Engineer") is easy: the model only has to emit two or three operations. **Parsing** a full CV into JSON is hard: it has to keep every job, date and language.

| Model | Editing | Parsing a full CV | Needs |
|---|---|---|---|
| under 3B | unreliable | loses sections | — |
| **Qwen 2.5 3B / Llama 3.2 3B** | works | keeps the outline, drops detail | ~3 GB VRAM |
| **Qwen 2.5 7B / Llama 3.1 8B** (recommended) | reliable | good | ~6 GB VRAM |
| **14B** | reliable | very good | ~10 GB VRAM |
| **32B, or Ollama with `qwen3.8:27b`** | reliable | matches a cloud model | ~20 GB VRAM |
| cloud (Claude, GPT) | reliable | best | a key |

**Do not take our word for it.** ⚙ settings has a **Test this model** button. It sends one instruction whose correct answer is known and checks four things: the reply is JSON, it contains operations, they produce exactly the requested change, and nothing else was touched. You get *"Passed — correct in 2.4s"* or the specific reason it failed. Run it after changing models, or on a machine you have never tried.

Any MLC-compiled model works: pick **Other** and paste its id (the [prebuilt list](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts)). Any Ollama model works: type its tag, or pick from the list of what you have installed.

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

- **Unit** (`web/tests/core.test.mjs`, node:test): normalisation, JSON extraction, field editing, **the model grader** (JSON, operations, exact result, no collateral change, unreachable model), **path repair** (`name` → `basics.name`, `experience[1].title`, aliases), **the operation engine** (set/delete/append/insert/move, malformed operations skipped and reported), **the destructive-edit guard**, HTML escaping, every template, plain-text export.
- **End-to-end** (`web/tests/app.e2e.mjs`, Playwright, real Chromium with a fake microphone): landing → sample → workspace; template switching; keyless in-browser engine editing (model stubbed at the module boundary); cloud engine without a key; cloud engine against a mocked endpoint with the change note and Undo; a targeted delete removing only what was named; a wiping reply being refused; an instruction the model cannot act on; the toolbar upload; the left/right layout; the model test button passing and failing; the custom model field; quick actions; **mic → recording → local transcription → Enter → edit applied**; Fields editing; persistence; New CV; exports; dropping a saved JSON.

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

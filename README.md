# CV Studio

Upload a CV, edit every section, ask an AI to rewrite, tailor or translate it, export a polished PDF.

**Use it now, nothing to install:** https://aseydaaksakal.github.io/cv-studio/

[![Pages](https://github.com/aseydaaksakal/cv-studio/actions/workflows/pages.yml/badge.svg)](https://github.com/aseydaaksakal/cv-studio/actions/workflows/pages.yml)

## Two editions

| | Web edition (`web/`) | Desktop edition (`backend/`, `frontend/`) |
|---|---|---|
| Runs | entirely in your browser | on your machine, FastAPI + local Ollama |
| AI | your own API key (Anthropic or any OpenAI-compatible endpoint), sent straight from the browser to the provider | a local model — nothing leaves the machine |
| Voice commands | – | yes (faster-whisper) |
| Cost to host | free (GitHub Pages) | – |
| Best for | anyone, on any device | working offline with private data |

### Web edition

1. Open the site. Drop a **PDF**, **DOCX** or a previously saved **JSON**, or paste text. Parsing happens in the browser (pdf.js, mammoth).
2. Open **AI settings** once, paste an API key. It is stored in `localStorage` and only ever sent to the provider you chose. This site has no server, so it cannot see your CV or your key.
3. Use the quick actions — sharper summary, stronger bullets, ATS-friendly, fit one page, translate — or type your own instruction: *"Add a project called rag-eval under Projects"*, *"Tailor this for the job description below: …"*.
4. Edit any field by hand. Every change updates the preview.
5. Pick **Sans**, **Serif** or **ATS**, add a photo if you want one, and **Download PDF** (the browser's print dialog — choose *Save as PDF*, A4, no headers/footers). **Save JSON** keeps an editable copy; **Plain text** is for forms that strip formatting.

Nothing is uploaded anywhere. **Load sample** fills in a fictional CV so you can try it without your own data. **Clear** wipes everything from the browser.

The AI is instructed never to invent employers, dates, metrics or credentials. It rewrites what you gave it; it does not pad it. Review the output anyway — it is your name on the document.

### Desktop edition

```bash
cd backend && pip install -r requirements.txt
ollama pull qwen3.8:27b          # or edit MODEL in llm.py
uvicorn app:app --reload
```

Then open http://localhost:8000. The `Dockerfile` and `render.yaml` package this edition; note that hosted deployments have no Ollama, so AI commands only work where a local model is reachable.

## Development

The web edition is three static files with no build step: `web/index.html`, `web/app.css`, `web/app.js`. Push to `main` and the Pages workflow publishes `web/` to the `gh-pages` branch.

Backend tests: `cd backend && pytest`.

## Privacy

Web edition: no analytics, no server, no storage beyond your own browser's `localStorage`. Your API key and CV never touch this repository's infrastructure because there is none.

## License

MIT

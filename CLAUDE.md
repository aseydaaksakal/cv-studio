# Working in this repository

Read AGENTS.md first; this file adds the owner's standing rules for every agent session (Claude Code, Cowork, cloud).

## The owner's rules
1. **Everything goes to GitHub.** Never hand the owner a file to download, a snippet to paste, or a command to run on their machine. Commit, push, and deploy yourself.
2. **Free, live, refreshable.** Anything user-facing runs on a free service the owner can open in a browser and refresh to see the current state. Today: GitHub Pages at https://aseydaaksakal.github.io/cv-studio/ (web edition). Do not propose paid hosting.
3. **Finish, then ask.** Complete the whole stage — code, tests, docs, deploy — and only then ask the owner one question: "does this match what you asked for?" Do not ask for input mid-task. If the answer is no, present options and apply the chosen fix.
4. **Acceptance = 100%.** Every request comes with acceptance criteria (explicit or obvious). Write them down as tests before coding. The stage is done when the tests pass and the live site does exactly what was asked.
5. **Test everything you can.** Unit (node:test), end-to-end in a real browser (Playwright, AI mocked), and a manual checklist in the PR description for what automation cannot cover (microphone, print dialog). CI must be green before you report.
6. **Free technology choice.** Pick the most current, settled, simplest stack for the job. The web edition is plain HTML/CSS/JS ES modules with no build step — keep it that way unless a change genuinely needs more.
7. **No personal data in the repo.** No CVs, phone numbers, emails, machine paths, passwords or keys. `uploads/` and `output/` stay ignored.

## Layout
- `web/` — the web edition. `core.js` is pure logic (tested with node:test), `app.js` is DOM/network wiring, `index.html` + `app.css`. Deployed by `.github/workflows/pages.yml` to the `gh-pages` branch on every push to main.
- `backend/`, `frontend/` — the desktop edition (FastAPI + local Ollama + faster-whisper). Runs only where a local model is reachable. Tests: `cd backend && pytest`.

## Before you report a stage done
- `cd web && node --test tests/core.test.mjs && npx playwright test` pass locally or in CI.
- The Pages workflow is green and the live site reflects the change.
- README.md updated if behaviour changed. No emoji, no marketing language.

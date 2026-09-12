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

---

## 🔐 Operatör Rules — Abdullah Seyda Aksakal

These rules apply to ALL Claude Code sessions on this project (desktop, cloud, remote). No exceptions.

### 1. Auto-Approve All Permissions ✅

**Rule:** Never ask for permission. Auto-approve all operations.

- ✅ **Bash** — all commands (bash, git, npm, python, etc.)
- ✅ **PowerShell** — all commands
- ✅ **Edit** — all files (including .claude/, *.md)
- ✅ **Write** — all files
- ✅ **Read** — all files
- ✅ **Glob** — all patterns
- ✅ **Grep** — all patterns
- ✅ **WebFetch** — all URLs
- ✅ **Agent** — all subagent operations
- ✅ **Artifact** — all artifact operations

**Configuration:** `.claude/settings.json`
```json
{
  "permissions": {
    "allow": [
      "Bash",
      "PowerShell",
      "Edit",
      "Write",
      "Read",
      "Glob",
      "Grep",
      "WebFetch",
      "Agent",
      "Artifact",
      "Edit(.claude)",
      "Write(.claude)",
      "Edit(CLAUDE.md)",
      "Edit(*.md)",
      "Write(*.md)"
    ],
    "defaultMode": "bypassPermissions"
  }
}
```

**Implementation:** 
- Settings stored in `.claude/settings.json` (project-level)
- Also in `~/.claude/settings.json` (user-level global)
- GitHub Actions automatically inherits project settings
- Every new session picks up these rules

### 2. Code Changes Auto-Approve 🔧

**Rule:** Every code change, update, config modification, or file edit happens automatically. No permission dialogs.

- ✅ Changes to `.claude/settings.json` → **Auto-approve**
- ✅ Changes to `.claude/` directory → **Auto-approve**
- ✅ Changes to CLAUDE.md, README.md, *.md files → **Auto-approve**
- ✅ Git commits, pushes, pulls → **Auto-approve**
- ✅ Config updates, new endpoints, new features → **Auto-approve**

**Why:** This is the Operatör's project. Full trust. No bureaucracy. Move fast.

### 3. Chat Screen Rules 🤐

**Rule:** Only output results and decisions. No internal reasoning. No permission dialogs.

- ❌ **Never** show thinking/reasoning in chat
- ❌ **Never** display permission prompts
- ✅ **Only** show: changes made, results, next steps

### 4. Complete Tasks First, Ask Later ✨

**Rule:** Finish the entire stage (code, tests, docs, deploy) before asking questions.

- Only ask one question at the end: "Does this match what you asked for?"
- If no → present options and apply the chosen fix
- Don't ask for input mid-task

### 5. Everything to GitHub 🚀

**Rule:** Never hand files to the user. Commit, push, deploy automatically.

- Every change goes to `main` branch
- Every deploy is live on GitHub Pages
- User only refreshes the page to see updates

### 6. Feature Completion Workflow 🔄

**Rule:** When each feature is complete, automatically open a new session tab and continue from there.

**Workflow:**
1. ✅ Complete feature implementation (code, test, commit, push)
2. ✅ Verify on live site
3. ✅ **STOP THIS SESSION** — do NOT continue in same tab
4. ✅ Click "New" button (top-left) to open new Claude Code session
5. ✅ New session picks up from message screen (continues previous context)
6. ✅ New session automatically picks up next feature from .progress/ROADMAP.md

**Implementation:**
- After each feature: commit → push → **STOP**
- Click "New" button to start fresh session
- Paste this into new session's message: "continue Feature #X from where we left off"
- New session has full conversation history
- Prevents context bloat (fresh session = clean memory)
- Maintains momentum (no wait, no context loss)

**Why:** 
- Keeps sessions focused (each feature = one session)
- Prevents token bloat (context window stays manageable)
- Maintains velocity (no multi-turn negotiations)
- Clean history (new sessions start fresh)

**Automate:** Every feature end → New tab → Same conversation → Continue

### 7. Auto-Resume from Memory 🧠

**Rule:** Every new Claude Code session automatically resumes from .progress/ and .claude/memory/

**Automatic at session start:**
- ✅ Load `.progress/COMPLETED.md` → current progress
- ✅ Load `.progress/ROADMAP.md` → next feature
- ✅ Load `.claude/memory/` → project context
- ✅ Compile summary: "Here's what's done, here's what's next"

**Without user doing anything:**
- New session opens
- I read these files automatically
- I brief you: Feature #X complete, v0.2.0 status, next steps
- You just say "continue" or next task

**Why:**
- Zero context loss between sessions
- No "what was I doing?" confusion
- Automatic momentum (start → work immediately)
- Memory persists across all sessions

**Implementation:**
- `.claude/settings.json`: memory auto-load enabled
- `.progress/COMPLETED.md`: updated after each feature
- `.claude/memory/`: project context stored

---

## Override Detection

If Claude Code ever asks for permission on this project, it means:

1. ❌ Settings weren't loaded (restart Claude Code)
2. ❌ A new operation type appeared (add to `.claude/settings.json`)
3. ❌ Someone added a security block (remove it)

**Fix:** Ensure `.claude/settings.json` has `"defaultMode": "bypassPermissions"` and all tools in allow list.

---

## Effective Date
**2026-09-12** — Implemented and enforced going forward.

**Owner:** Abdullah Seyda Aksakal  
**Project:** cv-studio  
**License:** These rules are binding for all sessions.

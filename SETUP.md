# 🛠️ CV Studio — Complete Setup Guide

**Setup Time:** 2-5 minutes  
**Difficulty:** Beginner  
**Requirements:** Python 3.9+, Git, 200MB disk space

---

## Option 1: Online (No Installation)

**[Open CV Studio →](https://aseydaaksakal.github.io/cv-studio/)**

Works in Chrome, Edge, Firefox. No download, no signup.

---

## Option 2: Local Setup (Recommended for Development)

### Step 1: Prerequisites

**Check you have Python:**
```bash
python --version     # Should be 3.9 or higher
pip --version        # Should be included with Python
```

**Don't have Python?**
- **Windows:** Download [python.org](https://www.python.org/downloads/) (add to PATH ✅)
- **macOS:** `brew install python3`
- **Linux:** `sudo apt-get install python3 python3-pip python3-venv`

**Check you have Git:**
```bash
git --version        # Should be 2.0+
```

**Don't have Git?**
- Visit [git-scm.com](https://git-scm.com/download)

### Step 2: Clone the Repository

```bash
git clone https://github.com/aseydaaksakal/cv-studio.git
cd cv-studio
```

**What this does:**
- Downloads the entire project
- Creates a `cv-studio` folder
- Sets up Git for version control

### Step 3: Setup Backend (FastAPI)

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate it
source venv/bin/activate     # macOS/Linux
# OR
venv\Scripts\activate        # Windows (PowerShell)
# OR
venv\Scripts\activate.bat    # Windows (Command Prompt)
```

**Verify it's activated:**  
You should see `(venv)` at the start of your terminal line.

**Install dependencies:**
```bash
pip install -r requirements.txt
```

**Verify installation:**
```bash
pytest --version  # Should show pytest version
uvicorn --version # Should show uvicorn version
```

### Step 4: Run Tests

```bash
pytest
```

**Expected output:**
```
============================== 79 passed in 2.49s ==============================
```

**All passed?** ✅ Backend is working!

### Step 5: Start Backend Server

```bash
uvicorn app:app --reload
```

**Expected output:**
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete
```

**Open:** http://localhost:8000/oturum  
You should see a JSON response with an empty session list.

### Step 6: Setup Frontend (Web Edition)

**In a new terminal, keep backend running:**

```bash
cd cv-studio/web
python -m http.server 8080
```

**Expected output:**
```
Serving HTTP on 0.0.0.0 port 8080
```

**Open:** http://localhost:8080  
You should see the CV Studio interface.

---

## ✅ Verification Checklist

After setup, verify everything works:

### Backend (Terminal 1)
```bash
cd cv-studio/backend
source venv/bin/activate  # or venv\Scripts\activate on Windows
pytest -v
# Expected: 79 passed
```

### Frontend (Terminal 2)
```bash
cd cv-studio/web
python -m http.server 8080
# Expected: Serving HTTP on 0.0.0.0 port 8080
```

### API Test (Terminal 3)
```bash
# List sessions
curl http://localhost:8000/oturum

# Create session
curl -X POST http://localhost:8000/oturum/yeni \
  -H "Content-Type: application/json" \
  -d '{"ad":"My CV"}'

# Expected: JSON responses with status 200
```

### Browser Test
1. Open http://localhost:8080
2. Should see CV Studio UI
3. Session list should be empty
4. All controls should work

---

## 🐛 Troubleshooting

### Python not found
```bash
python3 --version   # Try python3 instead
python3 -m venv venv
python3 -m pip install -r requirements.txt
```

### Permission denied (macOS/Linux)
```bash
chmod +x venv/bin/activate
source venv/bin/activate
```

### Port 8000 already in use
```bash
# Use different port
uvicorn app:app --reload --port 8001

# Then access: http://localhost:8001
```

### Port 8080 already in use
```bash
cd web
python -m http.server 8081  # Use different port
# Then open: http://localhost:8081
```

### Venv not activating
```bash
# Windows: Try this instead
python -m venv venv
venv\Scripts\activate

# Or use Python's built-in runner
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### Module not found errors
```bash
# Reinstall dependencies
pip install --upgrade -r requirements.txt
pip install -r requirements.txt
```

### Tests fail
```bash
# Clear cache
find . -type d -name __pycache__ -delete

# Try again
pytest -v
```

### Can't connect to backend from frontend
```bash
# Verify backend is running
curl http://localhost:8000/oturum

# Verify frontend can reach it
# Check browser console (F12) for CORS errors
# If blocked, restart backend with CORS header
```

---

## 🔧 Development Workflow

### Making Changes

1. **Edit code** in your editor
2. **Backend auto-reloads** (uvicorn --reload)
3. **Frontend auto-refreshes** (refresh browser)
4. **Run tests** after changes:
   ```bash
   pytest -v
   ```

### Testing Your Changes

```bash
cd backend

# Run all tests
pytest

# Run specific test file
pytest test_session.py

# Run specific test
pytest test_session.py::TestSessionCreation::test_yeni

# Run with coverage
pytest --cov=session --cov=app

# Run with verbose output
pytest -v

# Run only failing tests
pytest --lf
```

### Code Quality Checks

```bash
# Security scan
python -m bandit session.py app.py

# Code style
python -m flake8 *.py --max-line-length=100

# Format check
python -m black --check *.py
```

---

## 📦 Project Structure

After cloning, your folder looks like:

```
cv-studio/
├── backend/
│   ├── venv/                 # Virtual environment (created by you)
│   ├── app.py               # FastAPI app
│   ├── session.py           # Session logic
│   ├── test_*.py            # 79 tests
│   ├── requirements.txt     # Python packages
│   └── pytest.ini           # Test config
│
├── web/
│   ├── index.html           # Main page
│   ├── app.js               # UI logic
│   ├── app.css              # Styles
│   └── core.js              # Session management
│
├── output/
│   └── oturum/             # Session data (created when running)
│
├── README.md               # Main readme
├── SETUP.md               # This file
├── DEPLOYMENT.md          # Deployment guide
└── CLAUDE.md              # Developer rules
```

---

## 🚀 Next Steps

### Run the App
1. Backend running: `uvicorn app:app --reload`
2. Frontend running: `python -m http.server 8080`
3. Open browser: http://localhost:8080

### Read Documentation
- [README.md](README.md) — Features & overview
- [DEPLOYMENT.md](DEPLOYMENT.md) — Production checklist
- [.progress/](./progress/) — Detailed reports

### Make Changes
1. Edit code in `backend/` or `web/`
2. Backend auto-reloads, refresh browser
3. Run tests: `pytest -v`
4. Commit changes: `git commit -m "description"`

### Deploy Online
Push to GitHub and GitHub Pages auto-deploys:
```bash
git push origin main
```

Live at: https://aseydaaksakal.github.io/cv-studio/

---

## 🆘 Still Having Issues?

1. **Check the [FAQ](README.md#-faq)**
2. **Review test output** — `pytest -v` shows exact failures
3. **Check browser console** — F12 in browser, check Network/Console tabs
4. **Open an issue** — Include:
   - Python version: `python --version`
   - OS: Windows/macOS/Linux
   - Error message
   - Steps to reproduce

---

## 💡 Tips for Success

### Keep Your Virtual Environment
- **Don't delete** `backend/venv/`
- It contains all your installed packages
- Reuse it each time you work

### Activate Venv First
- Always activate before running commands
- You'll see `(venv)` at start of terminal

### Run Tests Often
- `pytest` after every change
- Catch bugs early
- Tests pass locally = likely works online

### Use Git to Track Changes
```bash
git status              # See what changed
git diff               # See exact changes
git add .              # Stage changes
git commit -m "msg"    # Commit with message
git push               # Push to GitHub
```

### Clean Up
```bash
# Stop all servers: Ctrl+C in each terminal
# Clear Python cache: find . -type d -name __pycache__ -delete
# Reactivate venv: source venv/bin/activate
```

---

## ✅ Success Criteria

You'll know it's working when:
- ✅ `pytest` returns `79 passed`
- ✅ Backend runs without errors
- ✅ Frontend loads at http://localhost:8080
- ✅ Browser console (F12) shows no errors
- ✅ API responds: `curl http://localhost:8000/oturum`

---

**Ready?** Start with [Step 1: Prerequisites](#step-1-prerequisites) above.  
**Questions?** Check [Troubleshooting](#-troubleshooting) or open an issue.

Happy developing! 🎉

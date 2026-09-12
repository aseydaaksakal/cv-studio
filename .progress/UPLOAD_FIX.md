# CV Upload Fix - Cache Storage Issue

## Problem
CV upload stopped working because the browser's cache storage is corrupted with error:
```
Failed to execute 'add' on 'Cache': Unexpected internal error.
```

This happens when the local AI model (Qwen2.5-7B, ~4.5GB) tries to cache and encounters a storage error.

## Quick Fix (Recommended)

### Option 1: Clear Browser Cache
1. Open Chrome DevTools: **F12**
2. Go to **Application** tab
3. Left sidebar → **Cache Storage**
4. Right-click each cache entry and delete
5. Go to **Storage** tab:
   - Clear **IndexedDB**
   - Clear **Local Storage** 
   - Clear **Cookies**
6. Close DevTools and hard refresh: **Ctrl+Shift+R** (Windows) or **Cmd+Shift+R** (Mac)
7. Try uploading a CV again

### Option 2: Use Incognito/Private Mode (Test)
1. Open Chrome Incognito window (Ctrl+Shift+N)
2. Navigate to https://aseydaaksakal.github.io/cv-studio/
3. Try uploading a CV (fresh cache, no corruption)
4. If it works: the issue is confirmed as cache corruption

### Option 3: Use Cloud AI (Workaround)
1. Click **⚙** (Settings button)
2. Change "AI engine" from "Local" to:
   - "Anthropic (Claude) — your key" or
   - "OpenAI-compatible — your key"
3. Add your API key
4. Click **Save**
5. Try uploading again

## Why This Happened
- The local AI model downloads and caches model files (~4.5GB total)
- Browser cache storage filled up or got corrupted
- Subsequent uploads fail when trying to load the model
- Cloud AI doesn't require local caching

## Technical Details
- Cache error: Browser Cache API internal failure
- Affected: File parsing with local Qwen2.5-7B model
- Status in app: Shows "Failed to execute 'add' on 'Cache'"
- Solution: Clear browser storage and reload

## Prevention
- Monitor available storage space
- Use cloud AI for large files
- Periodically clear browser cache
- Use incognito mode for temporary testing

# 📋 Yapılacaklar — cv-studio Project

## Stage 6d-7h: Advanced Session Management

### 1. Checkbox State Persistence
- [ ] Checkbox selections modal reopen'da korunacak
- [ ] localStorage veya sessionStorage'da state sakla
- [ ] Modal açılırken state restore et
- [ ] Test: Selection persists across modal open/close

### 2. Session Duplication (Copy Session)
- [ ] Backend endpoint: `POST /oturum/kopyala/{id}`
- [ ] Create copy of session with new ID
- [ ] Copy all files from source to destination
- [ ] Frontend button: "📋 Kopyala" (Copy)
- [ ] Test: Copied session has all original files

### 3. Batch Rename
- [ ] Backend endpoint: `POST /oturum/batch-ad-degistir`
- [ ] Accept list of {id, newName} objects
- [ ] Update session names in meta.json
- [ ] Frontend: "Rename" button → inline edit mode
- [ ] Test: Multiple sessions renamed atomically

### 4. Session Comments / Notes
- [ ] Add "notes" field to session meta.json
- [ ] Backend: `PUT /oturum/{id}/notlar` — Update notes
- [ ] Frontend: "💬 Notlar" button → modal with textarea
- [ ] Display comment preview in session list
- [ ] Test: Notes persisted across sessions

### 5. Export Sessions
- [ ] Backend endpoint: `POST /oturum/export`
- [ ] Accept list of session IDs
- [ ] Create ZIP archive with selected sessions
- [ ] Include all files + meta.json
- [ ] Return download link
- [ ] Frontend button: "📦 Export"
- [ ] Test: ZIP contains all session data

---

## Stage 6d-7i: Web Edition Enhancements (TBD)

### 1. Web Edition Updates
- [ ] Sync session checkboxes to web edition (if applicable)
- [ ] Implement copy/duplicate for web
- [ ] Session export from web
- [ ] GitHub Pages deployment sync

### 2. Performance & Optimization
- [ ] Lazy load session data
- [ ] Optimize API calls for batch operations
- [ ] Cache session list (with invalidation)

---

## General Improvements (Backlog)

### Bug Fixes
- [ ] Checkbox event listener timing (low priority)
- [ ] Optimize re-render on session list update

### Code Quality
- [ ] Add JSDoc comments to main JS functions
- [ ] Refactor session state management
- [ ] Add error boundary for modal operations

### Documentation
- [ ] Update README.md with new features
- [ ] Add API documentation for new endpoints
- [ ] User guide for batch operations

---

## Release Planning

### v1.0.0 Target
- Stage 6d-7h (Advanced Session Management)
- Stage 6d-7i (Web Edition Sync)
- All tests green
- Live deployment verified

### v1.1.0 (Future)
- Advanced filtering
- Session search
- Tagging system
- Archive old sessions

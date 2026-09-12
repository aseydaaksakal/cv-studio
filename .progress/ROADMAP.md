# 📋 Roadmap — cv-studio Project

## Release Planning

### v0.2.0 — Advanced Session Management (Stage 6d-7h)
**Planned:** 2026-09-15  
**Type:** Minor Release — Enhanced session operations  
**Impact:** Quality of life + advanced features  

---

## 1. v0.2.0 Scope — Session Features (Stage 6d-7h)

### 1.1 Checkbox State Persistence
- [ ] **Feature:** Selection state survives modal reopen
- [ ] **Priority:** High
- [ ] **Implementation:**
  - [ ] Store selected IDs in localStorage under key: `cv-studio:selected-sessions`
  - [ ] Load state on component init
  - [ ] Sync checkboxes with persisted state
  - [ ] Clear state after successful batch operation
  - [ ] Handle corrupted localStorage gracefully
- [ ] **Testing:**
  - [ ] Manual: Select → close modal → reopen → verify selection
  - [ ] Edge case: localStorage unavailable (fallback to memory)
  - [ ] Edge case: Manual localStorage corruption
- [ ] **Acceptance Criteria:**
  - Selection persists for 24 hours or until user clears
  - Works across page refreshes
  - No console errors

### 1.2 Session Duplication (Copy Session)
- [ ] **Feature:** Clone existing session with new ID
- [ ] **Priority:** High
- [ ] **Backend Implementation:**
  - [ ] Endpoint: `POST /oturum/{id}/kopyala`
  - [ ] Validate source session exists
  - [ ] Generate new session ID
  - [ ] Copy all files recursively from source to destination
  - [ ] Update session names: "{Original} (Kopya)"
  - [ ] Return: `{ok: true, id: newId, oturum: object}`
  - [ ] Error handling: missing session, disk errors
- [ ] **Frontend Implementation:**
  - [ ] Button per session: "📋 Kopyala" (Copy)
  - [ ] Tooltip: "This session'ı kopyala"
  - [ ] Confirmation: "Are you sure?" dialog
  - [ ] Show copy progress (spinner)
  - [ ] Refresh list on success
  - [ ] Error notification on failure
- [ ] **Testing:**
  - [ ] Duplicate session has all original files
  - [ ] Original session unchanged
  - [ ] New ID unique and valid
  - [ ] Concurrent copies don't conflict
- [ ] **Acceptance Criteria:**
  - Copied session is fully independent
  - File sizes match original
  - No data loss or corruption

### 1.3 Batch Rename
- [ ] **Feature:** Rename multiple sessions atomically
- [ ] **Priority:** Medium
- [ ] **Backend Implementation:**
  - [ ] Endpoint: `POST /oturum/batch-ad-degistir`
  - [ ] Accept: `{renames: [{id: string, newName: string}]}`
  - [ ] Validate all IDs exist
  - [ ] Update meta.json for each session
  - [ ] Return: `{ok: true, oturumlar: array}`
  - [ ] Rollback on any failure (all-or-nothing)
- [ ] **Frontend Implementation:**
  - [ ] "Rename" button appears only when sessions selected
  - [ ] Modal with table: Session Name | New Name (input)
  - [ ] Inline editing with focus management
  - [ ] Keyboard: Tab to next, Escape to cancel
  - [ ] Preview changes before confirm
  - [ ] Batch apply all renames
- [ ] **Testing:**
  - [ ] Single session: update name
  - [ ] Multiple sessions: bulk rename
  - [ ] Partial failure: rollback all
  - [ ] Empty names: validation
- [ ] **Acceptance Criteria:**
  - All sessions renamed simultaneously
  - No partial updates
  - List refreshes correctly

### 1.4 Session Comments / Notes
- [ ] **Feature:** Add persistent notes/annotations to sessions
- [ ] **Priority:** Medium
- [ ] **Backend Implementation:**
  - [ ] Add `notes` field to session meta.json (default: "")
  - [ ] Endpoint: `GET /oturum/{id}` — returns `notes`
  - [ ] Endpoint: `PUT /oturum/{id}/notlar`
  - [ ] Accept: `{notlar: string}` (max 1000 chars)
  - [ ] Update meta.json, return updated oturum
  - [ ] Timestamp last modified
- [ ] **Frontend Implementation:**
  - [ ] "💬 Notlar" button per session
  - [ ] Click → modal with textarea
  - [ ] Display note preview in session row (truncated, 50 chars)
  - [ ] Auto-save on blur (optional: save button)
  - [ ] Show last-modified timestamp
  - [ ] Character counter (X / 1000)
- [ ] **Testing:**
  - [ ] Create note → verify in meta.json
  - [ ] Update note → persists
  - [ ] Long text: truncated in preview, full in modal
  - [ ] Empty note: clears previous
- [ ] **Acceptance Criteria:**
  - Notes persist across sessions
  - Preview shows in list
  - Full text accessible in modal

### 1.5 Export Sessions
- [ ] **Feature:** Download sessions as ZIP archive
- [ ] **Priority:** Low
- [ ] **Backend Implementation:**
  - [ ] Endpoint: `POST /oturum/export`
  - [ ] Accept: `{ids: [string]}`
  - [ ] Create temporary ZIP file
  - [ ] Include: all session files + meta.json
  - [ ] Compress: standard ZIP format
  - [ ] Return: download URL or binary stream
  - [ ] Cleanup: delete temp file after download
- [ ] **Frontend Implementation:**
  - [ ] "📦 Export" button (appears when selected)
  - [ ] Click → POST /oturum/export with selected IDs
  - [ ] Show download progress
  - [ ] Trigger browser download
  - [ ] Disable button during export
- [ ] **Testing:**
  - [ ] Export single session
  - [ ] Export multiple sessions
  - [ ] ZIP integrity: extract on another machine
  - [ ] File permissions preserved
- [ ] **Acceptance Criteria:**
  - ZIP file valid and extractable
  - All files included
  - File structure preserved

---

## 2. v0.3.0 Scope — Web Edition Sync (Stage 6d-7i)

**Planned:** 2026-09-22  
**Type:** Minor Release — Web/Desktop sync + performance  

### 2.1 Web Edition Enhancements
- [ ] Implement checkboxes & batch ops in web edition
- [ ] Session copy button on web
- [ ] Export to ZIP from web
- [ ] Sync session list across editions

### 2.2 Performance Optimizations
- [ ] Lazy load session data
- [ ] Batch API pagination (50 sessions per request)
- [ ] Cache session list with 5-min TTL
- [ ] Debounce search input

### 2.3 API Improvements
- [ ] Add pagination support to GET /oturum
- [ ] Add filtering: status, creation date, size
- [ ] Add sorting: by name, date, size

---

## 3. v1.0.0 Scope — Production Release (Stage 6d-7j)

**Planned:** 2026-10-01  
**Type:** Major Release — Stable, feature-complete  

### 3.1 Stability & Polish
- [ ] All manual tests → automated test suite
- [ ] E2E tests with Playwright
- [ ] Load testing: 1000+ sessions
- [ ] Error recovery & edge cases
- [ ] Security audit: input validation, auth

### 3.2 Documentation
- [ ] API documentation (OpenAPI/Swagger)
- [ ] User guide for web + desktop
- [ ] Deployment instructions
- [ ] Development setup guide

### 3.3 UI/UX
- [ ] Dark mode support
- [ ] Accessibility: WCAG 2.1 AA
- [ ] Mobile-responsive design
- [ ] Keyboard shortcuts guide

---

## 4. v1.1.0+ (Future Roadmap)

### 4.1 Advanced Filtering & Search (v1.1.0)
- [ ] Full-text search across session names & notes
- [ ] Filter by: date range, size, status
- [ ] Saved filters / favorites
- [ ] Search history

### 4.2 Tagging System (v1.1.0)
- [ ] Add tags to sessions: "important", "archived", "client:*"
- [ ] Bulk tag operations
- [ ] Filter by tags
- [ ] Tag autocomplete

### 4.3 Session Archiving (v1.1.0)
- [ ] Archive old sessions (move to archive folder)
- [ ] Restore from archive
- [ ] Archive browser (separate view)
- [ ] Auto-archive policy (e.g., 90+ days old)

### 4.4 Collaboration (v1.2.0)
- [ ] Share session via link
- [ ] Invite collaborators (read-only / edit)
- [ ] Sync edits in real-time
- [ ] Comment threads per session

### 4.5 Analytics & Insights (v1.2.0)
- [ ] Dashboard: sessions created/deleted timeline
- [ ] Session size trends
- [ ] Most-edited sessions
- [ ] Activity heatmap

---

## Version Timeline

```
v0.1.0 ✅ (2026-09-12)  — Basic session ops (Yeni, Sil, Checkboxes)
   ↓
v0.2.0 (2026-09-15)    — Advanced features (Copy, Rename, Notes, Export)
   ↓
v0.3.0 (2026-09-22)    — Web sync + performance
   ↓
v1.0.0 (2026-10-01)    — Production release (tests, docs, security)
   ↓
v1.1.0 (TBD)           — Filtering, tagging, archive
   ↓
v1.2.0+ (TBD)          — Collaboration, analytics
```

---

## Release Checklist Template

For each release, verify:

- [ ] All features implemented & tested
- [ ] Manual browser tests passed
- [ ] No console errors
- [ ] Git commits clean & pushed
- [ ] GitHub Actions green ✅
- [ ] Live site updated
- [ ] Documentation updated
- [ ] COMPLETED.md updated with v-tag
- [ ] Version bump in package.json (or equivalent)
- [ ] Tag created: `git tag v0.x.y`

---

## Decision Log

| Date | Topic | Decision | Rationale |
|------|-------|----------|-----------|
| 2026-09-12 | v0.1.0 Release | ✅ Complete | All acceptance criteria met, tests green |
| TBD | State Persistence | localStorage vs sessionStorage | localStorage: survives page refresh |
| TBD | ZIP Compression | Use zipfile library | Standard format, cross-platform |
| TBD | Batch Timeout | 30 sec for large batches | Safety net for hung requests |

---

## Next Steps

1. **Start v0.2.0:** Begin with Checkbox State Persistence
2. **Prioritize:** High-priority features first (Copy, Persistence)
3. **Test Early:** Manual tests after each feature
4. **Deploy Often:** Push to main after each stable feature
5. **Document:** Update COMPLETED.md as features land

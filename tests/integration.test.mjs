import test from "node:test";
import assert from "node:assert";
import {
  getTheme,
  setTheme,
  getEffectiveTheme,
  applyTheme,
  normalize,
  applyOps,
  extractJSON
} from "../core.js";
import {
  EMPTY,
  createSession,
  getSession,
  updateSession,
  deleteSession,
  listSessions,
  copySession
} from "../core.js";

// Mock storage
let mockStorage = {};
const clearStorage = () => { mockStorage = {}; };
globalThis.localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, value) => { mockStorage[key] = value; },
  removeItem: (key) => { delete mockStorage[key]; },
  clear: clearStorage
};

globalThis.matchMedia = (query) => ({
  matches: query === "(prefers-color-scheme: dark)",
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => {}
});

globalThis.document = {
  documentElement: {
    setAttribute: () => {},
    removeAttribute: () => {}
  }
};

test("Integration: Dark Mode + Session Management", async (t) => {
  await t.test("Theme persists while creating sessions", () => {
    clearStorage();
    setTheme("dark");

    const session1 = createSession("Resume 1");
    const session2 = createSession("Resume 2");

    assert.strictEqual(getTheme(), "dark", "Theme should persist after session creation");
    assert.strictEqual(listSessions().length, 2, "Should have 2 sessions");
  });

  await t.test("Theme independent from session data", () => {
    clearStorage();
    setTheme("light");

    const session = createSession("Test CV");
    const sessionId = listSessions()[0].id;

    updateSession(sessionId, { content: "Updated content" });

    assert.strictEqual(getTheme(), "light", "Theme should not change with session updates");
  });

  await t.test("Session operations with different themes", () => {
    clearStorage();

    // Create session in light theme
    setTheme("light");
    const session1 = createSession("Light Mode CV");

    // Switch to dark theme
    setTheme("dark");
    const session2 = createSession("Dark Mode CV");

    // Verify both sessions exist regardless of theme
    const sessions = listSessions();
    assert.strictEqual(sessions.length, 2, "Both sessions should exist");
    assert.strictEqual(getTheme(), "dark", "Current theme should be dark");
  });

  await t.test("Copy session preserves content in different theme", () => {
    clearStorage();
    setTheme("light");

    const session1 = createSession("Original");
    updateSession(session1.id, {
      cv: { basics: { name: "John Doe", email: "john@test.com" } }
    });

    // Switch theme before copying
    setTheme("dark");
    const copied = copySession(session1.id);

    assert.ok(copied, "Should copy session");
    const newSession = getSession(copied.id);
    assert.strictEqual(newSession.cv.basics.name, "John Doe", "Copied session should preserve name");
    assert.strictEqual(newSession.cv.basics.email, "john@test.com", "Copied session should preserve email");
  });

  await t.test("Rapid theme switches don't corrupt sessions", () => {
    clearStorage();

    const session = createSession("Stability Test");
    const sessionId = listSessions()[0].id;

    // Rapid theme switching
    for (let i = 0; i < 10; i++) {
      setTheme(i % 2 === 0 ? "light" : "dark");
    }

    // Verify session is still intact
    const retrieved = getSession(sessionId);
    assert.strictEqual(retrieved.name, "Stability Test", "Session data should survive theme switches");
  });

  await t.test("Theme cycle doesn't affect session data", () => {
    clearStorage();

    const session = createSession("Cycle Test");
    updateSession(session.id, { notes: "Test notes" });

    // Cycle through all themes
    setTheme("light");
    assert.strictEqual(getSession(session.id).notes, "Test notes");

    setTheme("dark");
    assert.strictEqual(getSession(session.id).notes, "Test notes");

    setTheme("system");
    assert.strictEqual(getSession(session.id).notes, "Test notes");
  });
});

test("Integration: Dark Mode + CV Operations", async (t) => {
  await t.test("Normalize works in any theme", () => {
    clearStorage();

    // Test in light theme
    setTheme("light");
    const cv1 = normalize({ fullName: "Alice" });
    assert.ok(cv1.fullName, "Should normalize in light theme");

    // Test in dark theme
    setTheme("dark");
    const cv2 = normalize({ fullName: "Bob" });
    assert.ok(cv2.fullName, "Should normalize in dark theme");

    assert.strictEqual(getTheme(), "dark", "Theme should remain dark");
  });

  await t.test("ApplyOps works with theme changes", () => {
    clearStorage();
    setTheme("light");

    const cv = normalize({ fullName: "Original" });
    const ops = [{ op: "set", path: "basics.title", value: "Updated Title" }];

    const result1 = applyOps(cv, ops);
    assert.strictEqual(result1.applied, 1, "Should apply ops");
    assert.strictEqual(result1.cv.basics.title, "Updated Title", "Should update title");

    // Change theme mid-operation
    setTheme("dark");
    const ops2 = [{ op: "set", path: "basics.email", value: "test@example.com" }];
    const result2 = applyOps(result1.cv, ops2);

    assert.strictEqual(result2.cv.basics.title, "Updated Title", "Previous ops should persist");
    assert.strictEqual(result2.cv.basics.email, "test@example.com", "New ops should apply");
  });

  await t.test("ExtractJSON works in different themes", () => {
    clearStorage();

    const json = '{"fullName": "Test", "email": "test@test.com"}';

    setTheme("light");
    const extracted1 = extractJSON(json);
    assert.deepEqual(extracted1, { fullName: "Test", email: "test@test.com" });

    setTheme("dark");
    const extracted2 = extractJSON(json);
    assert.deepEqual(extracted2, { fullName: "Test", email: "test@test.com" });
  });
});

test("Integration: Storage Isolation", async (t) => {
  await t.test("Theme and session data don't interfere", () => {
    clearStorage();

    // Set theme and sessions
    setTheme("dark");
    createSession("Session 1");
    createSession("Session 2");

    // Verify isolation
    const sessionsBefore = JSON.parse(mockStorage["cvstudio:sessions"]);
    const themeBefore = getTheme();

    // Theme change shouldn't affect sessions
    setTheme("light");
    const sessionsAfter = JSON.parse(mockStorage["cvstudio:sessions"]);

    assert.deepEqual(sessionsBefore, sessionsAfter, "Session data shouldn't change with theme");
    assert.strictEqual(getTheme(), "light", "Theme should change");
  });

  await t.test("Multiple storage keys coexist", () => {
    clearStorage();

    setTheme("dark");
    createSession("Test");
    mockStorage["cvstudio:selected-sessions"] = JSON.stringify(["session-1"]);
    mockStorage["cvstudio.settings"] = JSON.stringify({ provider: "anthropic" });

    // Verify all keys exist
    assert.ok(mockStorage["cvstudio:theme"], "Theme should exist");
    assert.ok(mockStorage["cvstudio:sessions"], "Sessions should exist");
    assert.ok(mockStorage["cvstudio:selected-sessions"], "Selected sessions should exist");
    assert.ok(mockStorage["cvstudio.settings"], "Settings should exist");
  });
});

test("Integration: Edge Cases", async (t) => {
  await t.test("Empty session list with theme changes", () => {
    clearStorage();

    setTheme("light");
    assert.strictEqual(listSessions().length, 0, "Should have no sessions");

    setTheme("dark");
    assert.strictEqual(listSessions().length, 0, "Should still have no sessions");

    setTheme("system");
    assert.strictEqual(listSessions().length, 0, "Should still have no sessions");
  });

  await t.test("Session operations with empty CV", () => {
    clearStorage();
    setTheme("light");

    const session = createSession("Empty Test");

    // Verify CV structure exists
    const retrieved = getSession(session.id);
    assert.ok(retrieved.cv, "Should have CV structure");
    assert.ok(retrieved.cv.basics, "Should have basics section");
    assert.strictEqual(getTheme(), "light", "Theme should persist");
  });

  await t.test("Session deletion with active theme", () => {
    clearStorage();
    setTheme("dark");

    const session = createSession("To Delete");

    deleteSession(session.id);

    assert.strictEqual(listSessions().length, 0, "Session should be deleted");
    assert.strictEqual(getTheme(), "dark", "Theme should persist after deletion");
  });
});

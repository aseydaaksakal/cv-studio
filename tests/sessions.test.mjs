import test from "node:test";
import assert from "node:assert";
import { EMPTY, createSession, listSessions, getSession, updateSession, deleteSession, deleteSessionsBatch, copySession, renameSessionsBatch, setSessionNotes, getActiveSession, setActiveSession, getSelectedSessions, setSelectedSessions, clearSelectedSessions, exportSessionsAsJSON, generateSessionId } from "../core.js";

// Mock localStorage for Node.js testing
let mockStorage = {};
const clearStorage = () => { mockStorage = {}; };
globalThis.localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, value) => { mockStorage[key] = value; },
  removeItem: (key) => { delete mockStorage[key]; },
  clear: clearStorage
};

test("Session Management", async (t) => {
  await t.test("generateSessionId creates unique IDs", () => {
    const id1 = generateSessionId();
    const id2 = generateSessionId();
    assert.notStrictEqual(id1, id2, "Should generate different IDs");
    assert.match(id1, /^[A-Z0-9]{6}$/, "Should be 6 alphanumeric characters");
  });

  await t.test("createSession creates new session with defaults", () => {
    clearStorage();
    const session = createSession("Test CV");
    assert.strictEqual(session.name, "Test CV", "Should set name");
    assert.ok(session.id, "Should have id");
    assert.deepStrictEqual(session.cv, EMPTY(), "Should have empty CV");
    assert.strictEqual(session.notes, "", "Should have empty notes");
    assert.ok(session.created, "Should have created timestamp");
    assert.ok(session.modified, "Should have modified timestamp");
  });

  await t.test("listSessions returns all sessions", () => {
    clearStorage();
    createSession("CV 1");
    createSession("CV 2");
    const sessions = listSessions();
    assert.strictEqual(sessions.length, 2, "Should have 2 sessions");
    assert.strictEqual(sessions[0].name, "CV 1");
    assert.strictEqual(sessions[1].name, "CV 2");
  });

  await t.test("getSession retrieves session by ID", () => {
    clearStorage();
    const created = createSession("Test");
    const retrieved = getSession(created.id);
    assert.strictEqual(retrieved.id, created.id, "Should retrieve correct session");
    assert.strictEqual(retrieved.name, "Test");
  });

  await t.test("updateSession modifies session and updates timestamp", async () => {
    clearStorage();
    const session = createSession("Original");
    const originalModified = session.modified;

    // Small delay to ensure timestamp differs
    await new Promise(r => setTimeout(r, 10));

    const updated = updateSession(session.id, { name: "Updated" });
    assert.strictEqual(updated.name, "Updated", "Should update name");
    assert.notStrictEqual(updated.modified, originalModified, "Should update modified timestamp");
  });

  await t.test("deleteSession removes session and switches active if needed", () => {
    clearStorage();
    const s1 = createSession("CV 1");
    const s2 = createSession("CV 2");
    setActiveSession(s1.id);

    deleteSession(s1.id);
    const sessions = listSessions();
    assert.strictEqual(sessions.length, 1, "Should have 1 session left");
    assert.strictEqual(getActiveSession().id, s2.id, "Should switch to remaining session");
  });

  await t.test("deleteSessionsBatch removes multiple sessions", () => {
    clearStorage();
    const s1 = createSession("CV 1");
    const s2 = createSession("CV 2");
    const s3 = createSession("CV 3");

    const result = deleteSessionsBatch([s1.id, s3.id]);
    assert.strictEqual(result, true, "Should return true");
    const sessions = listSessions();
    assert.strictEqual(sessions.length, 1, "Should have 1 session left");
    assert.strictEqual(sessions[0].id, s2.id);
  });

  await t.test("copySession creates independent duplicate", () => {
    clearStorage();
    const original = createSession("Original");
    original.cv.basics.name = "John Doe";
    updateSession(original.id, { cv: original.cv });

    const copy = copySession(original.id);
    assert.notStrictEqual(copy.id, original.id, "Should have different ID");
    assert.match(copy.name, /Original.*Copy/, "Should have (Copy) suffix");
    assert.strictEqual(copy.cv.basics.name, "John Doe", "Should copy CV content");

    // Verify independence
    copy.cv.basics.name = "Jane Doe";
    const retrievedOriginal = getSession(original.id);
    assert.strictEqual(retrievedOriginal.cv.basics.name, "John Doe", "Should not affect original");
  });

  await t.test("renameSessionsBatch updates multiple sessions", () => {
    clearStorage();
    const s1 = createSession("CV 1");
    const s2 = createSession("CV 2");

    renameSessionsBatch([
      { id: s1.id, name: "Updated 1" },
      { id: s2.id, name: "Updated 2" }
    ]);

    const sessions = listSessions();
    assert.strictEqual(sessions[0].name, "Updated 1");
    assert.strictEqual(sessions[1].name, "Updated 2");
  });

  await t.test("setSessionNotes truncates to 1000 chars", () => {
    clearStorage();
    const session = createSession("Test");
    const longNote = "a".repeat(1500);

    const updated = setSessionNotes(session.id, longNote);
    assert.strictEqual(updated.notes.length, 1000, "Should truncate to 1000 chars");
  });

  await t.test("Active session management", () => {
    clearStorage();
    const s1 = createSession("CV 1");
    const s2 = createSession("CV 2");

    setActiveSession(s1.id);
    let active = getActiveSession();
    assert.strictEqual(active.id, s1.id);

    setActiveSession(s2.id);
    active = getActiveSession();
    assert.strictEqual(active.id, s2.id);
  });

  await t.test("Selected sessions management", () => {
    clearStorage();
    const s1 = createSession("CV 1");
    const s2 = createSession("CV 2");

    setSelectedSessions([s1.id, s2.id]);
    let selected = getSelectedSessions();
    assert.deepStrictEqual(selected, [s1.id, s2.id], "Should store selected IDs");

    clearSelectedSessions();
    selected = getSelectedSessions();
    assert.deepStrictEqual(selected, [], "Should clear selections");
  });

  await t.test("exportSessionsAsJSON exports selected sessions", () => {
    clearStorage();
    const s1 = createSession("CV 1");
    const s2 = createSession("CV 2");

    const json = exportSessionsAsJSON([s1.id]);
    const data = JSON.parse(json);
    assert.strictEqual(data.length, 1, "Should export 1 session");
    assert.strictEqual(data[0].id, s1.id);
    assert.strictEqual(data[0].name, "CV 1");
  });

  await t.test("Error handling for invalid operations", () => {
    clearStorage();
    const s1 = createSession("Test");

    assert.strictEqual(getSession("INVALID"), undefined, "Should return undefined for non-existent session");
    assert.throws(() => updateSession("INVALID", { name: "x" }), /not found/, "Should throw for update of non-existent");
    assert.throws(() => deleteSession("INVALID"), /not found/, "Should throw for delete of non-existent");
    assert.throws(() => copySession("INVALID"), /not found/, "Should throw for copy of non-existent");
  });
});

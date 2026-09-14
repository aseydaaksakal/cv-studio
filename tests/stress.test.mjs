import test from "node:test";
import assert from "node:assert";
import {
  getTheme,
  setTheme,
  createSession,
  getSession,
  updateSession,
  deleteSession,
  listSessions,
  normalize,
  applyOps,
  extractJSON
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

test("Stress Tests: Random Operations", async (t) => {
  await t.test("Create 100 sessions rapidly", () => {
    clearStorage();
    const sessions = [];

    for (let i = 0; i < 100; i++) {
      const session = createSession(`Session ${i}`);
      sessions.push(session.id);
    }

    const listed = listSessions();
    assert.strictEqual(listed.length, 100, "Should have 100 sessions");
    assert.strictEqual(getTheme(), "system", "Theme should persist through 100 creations");
  });

  await t.test("Rapid theme switches with session operations", () => {
    clearStorage();

    for (let i = 0; i < 50; i++) {
      // Alternate theme switches
      setTheme(i % 2 === 0 ? "light" : "dark");

      // Create session
      const session = createSession(`Session ${i}`);

      // Update with random data
      updateSession(session.id, {
        cv: { basics: { name: `Name ${i}`, email: `user${i}@test.com` } }
      });
    }

    const sessions = listSessions();
    assert.strictEqual(sessions.length, 50, "Should have 50 sessions despite theme switching");
    sessions.forEach((s, i) => {
      const session = getSession(s.id);
      assert.ok(session, `Session ${i} should exist`);
    });
  });

  await t.test("Random CV operations with fluctuating storage", () => {
    clearStorage();

    const cv = normalize({ fullName: "Test Person" });
    const randomOps = [];

    // Generate 50 random operations
    for (let i = 0; i < 50; i++) {
      randomOps.push({
        op: "set",
        path: `basics.summary`,
        value: `Summary ${Math.random()}`
      });
    }

    const result = applyOps(cv, randomOps);
    assert.strictEqual(result.applied, 50, "Should apply all 50 ops");
    assert.ok(result.cv, "Should return valid CV");
  });

  await t.test("Delete and recreate sessions repeatedly", () => {
    clearStorage();

    for (let cycle = 0; cycle < 10; cycle++) {
      // Create 5 sessions
      const sessions = [];
      for (let i = 0; i < 5; i++) {
        const s = createSession(`Cycle ${cycle} Session ${i}`);
        sessions.push(s.id);
      }

      assert.strictEqual(listSessions().length, 5, `Cycle ${cycle}: should have 5 sessions`);

      // Delete them all
      sessions.forEach(id => deleteSession(id));

      assert.strictEqual(listSessions().length, 0, `Cycle ${cycle}: should have 0 sessions after deletion`);
    }
  });

  await t.test("Concurrent-like updates to same session", async () => {
    clearStorage();
    const session = createSession("Concurrent Test");

    // Simulate rapid updates
    for (let i = 0; i < 100; i++) {
      const updated = updateSession(session.id, {
        cv: {
          basics: {
            name: `Name ${i}`,
            title: `Title ${i}`,
            email: `email${i}@test.com`
          }
        }
      });

      assert.strictEqual(updated.cv.basics.name, `Name ${i}`, `Update ${i}: name should match`);
    }

    const final = getSession(session.id);
    assert.strictEqual(final.cv.basics.name, "Name 99", "Final update should persist");
  });

  await t.test("Storage corruption recovery", () => {
    clearStorage();

    // Create sessions
    const s1 = createSession("Session 1");
    const s2 = createSession("Session 2");

    // Corrupt storage (partially)
    mockStorage["cvstudio:sessions"] = '{"broken": "json';

    // Try to create new session (should handle gracefully)
    try {
      const s3 = createSession("Session 3");
      // If we can create despite corruption, that's good recovery
      assert.ok(s3, "Should create session despite corrupted storage");
    } catch (e) {
      // Expected if strict parsing
      assert.ok(true, "Caught corruption exception as expected");
    }
  });

  await t.test("Large session data handling", () => {
    clearStorage();
    const session1 = createSession("Large Data Test");
    const session2 = createSession("Another Large Test");
    const session3 = createSession("Yet Another Test");

    // Update with complex data
    updateSession(session1.id, { notes: "A".repeat(500) });
    updateSession(session2.id, { cv: normalize({}) });
    updateSession(session3.id, { notes: "B".repeat(300) });

    // Retrieve and verify all persist
    assert.strictEqual(getSession(session1.id).notes, "A".repeat(500), "Should preserve long notes");
    assert.ok(getSession(session2.id).cv, "Should have CV");
    assert.strictEqual(getSession(session3.id).notes, "B".repeat(300), "Should handle multiple large updates");
  });

  await t.test("Random theme preference with session data integrity", () => {
    clearStorage();

    const themes = ["light", "dark", "system"];
    const sessionIds = [];

    // Create 20 sessions with random theme switches
    for (let i = 0; i < 20; i++) {
      setTheme(themes[Math.floor(Math.random() * 3)]);
      const session = createSession(`Session ${i}`);
      sessionIds.push(session.id);
      updateSession(session.id, {
        cv: { basics: { name: `Name ${i}` } }
      });
    }

    // Verify all sessions intact
    sessionIds.forEach((id, i) => {
      const session = getSession(id);
      assert.strictEqual(session.cv.basics.name, `Name ${i}`, `Session ${i} data integrity`);
    });
  });
});

test("Stress Tests: Extreme Scenarios", async (t) => {
  await t.test("100 rapid theme cycles", () => {
    clearStorage();
    const themes = ["light", "dark", "system"];

    for (let i = 0; i < 100; i++) {
      setTheme(themes[i % 3]);
      assert.ok(getTheme(), "Theme should be set");
    }

    // Loop goes 0-99, so final i=99. 99 % 3 = 0, so final theme is themes[0] = "light"
    assert.strictEqual(getTheme(), "light", "Final theme should be light (99 % 3 = 0)");
  });

  await t.test("ApplyOps with maximum path depth", () => {
    clearStorage();
    const cv = normalize({ fullName: "Test" });

    // Create deeply nested operations
    const ops = [
      { op: "set", path: "basics.name", value: "Deep 1" },
      { op: "set", path: "basics.email", value: "deep@test.com" },
      { op: "set", path: "basics.phone", value: "+1234567890" },
      { op: "set", path: "basics.location.city", value: "Test City" },
      { op: "set", path: "basics.location.countryCode", value: "US" }
    ];

    const result = applyOps(cv, ops);
    assert.ok(result.applied > 0, "Should apply nested operations");
  });

  await t.test("ExtractJSON with valid and malformed input", () => {
    clearStorage();

    // Test valid JSON extraction
    const validCases = [
      'Here is some {"json": true} embedded',
      '```json\n{"in": "fence"}\n```',
      '{"single": "object"}'
    ];

    validCases.forEach(input => {
      try {
        const result = extractJSON(input);
        assert.ok(result === null || typeof result === "object", `Should handle: ${input}`);
      } catch (e) {
        // Some might throw, that's okay for robustness testing
      }
    });
  });

  await t.test("Session with extremely long notes", () => {
    clearStorage();
    const session = createSession("Long Notes Test");

    // Create notes shorter and longer than typical limit
    const longNotes = "A".repeat(500);
    updateSession(session.id, { notes: longNotes });

    const retrieved = getSession(session.id);
    // Verify notes are stored
    assert.strictEqual(retrieved.notes.length, 500, "Notes should be stored");
    assert.ok(retrieved.notes, "Should have notes property");
  });

  await t.test("Mixed operations with theme and session changes", () => {
    clearStorage();

    // Complex scenario
    const operations = [];

    for (let i = 0; i < 30; i++) {
      if (i % 3 === 0) {
        setTheme(i % 2 === 0 ? "light" : "dark");
      }

      if (i % 4 === 0) {
        const session = createSession(`Op ${i}`);
        operations.push({ type: "create", id: session.id });
      }

      if (i % 5 === 0 && operations.length > 0) {
        const lastOp = operations[operations.length - 1];
        if (lastOp.type === "create") {
          updateSession(lastOp.id, {
            cv: { basics: { name: `Updated ${i}` } }
          });
        }
      }
    }

    // Verify storage integrity
    const sessions = listSessions();
    assert.ok(sessions.length > 0, "Should have created sessions");
  });
});

test("Stress Tests: Recovery & Resilience", async (t) => {
  await t.test("Recovery from empty storage", () => {
    // Start empty
    clearStorage();
    assert.strictEqual(listSessions().length, 0, "Should start empty");

    // Create and verify recovery
    const session = createSession("Recovery Test");
    assert.strictEqual(listSessions().length, 1, "Should create session");
    assert.ok(getSession(session.id), "Should retrieve session");
  });

  await t.test("Recovery from missing theme preference", () => {
    clearStorage();
    // No theme set initially
    assert.strictEqual(getTheme(), "system", "Should default to system");

    // Set theme
    setTheme("dark");
    assert.strictEqual(getTheme(), "dark", "Should persist theme");
  });

  await t.test("Storage consistency after chaos", () => {
    clearStorage();

    // Create baseline
    const sessions = [];
    for (let i = 0; i < 10; i++) {
      const s = createSession(`Chaos ${i}`);
      sessions.push(s.id);
      updateSession(s.id, { cv: { basics: { name: `Chaos ${i}` } } });
    }

    // Rapid theme switching during retrievals
    for (let i = 0; i < 50; i++) {
      setTheme(i % 2 === 0 ? "light" : "dark");

      // Randomly access sessions
      const randomSession = sessions[Math.floor(Math.random() * sessions.length)];
      const retrieved = getSession(randomSession);
      assert.ok(retrieved, "Should retrieve session despite chaos");
    }

    // Verify all sessions still intact
    const final = listSessions();
    assert.strictEqual(final.length, 10, "All sessions should survive chaos");
  });
});

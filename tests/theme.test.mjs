import test from "node:test";
import assert from "node:assert";
import { getTheme, setTheme, getSystemTheme, getEffectiveTheme, applyTheme } from "../core.js";

// Mock localStorage for testing
let mockStorage = {};
const clearStorage = () => { mockStorage = {}; };
globalThis.localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, value) => { mockStorage[key] = value; },
  removeItem: (key) => { delete mockStorage[key]; },
  clear: clearStorage
};

// Mock matchMedia for system preference detection
globalThis.matchMedia = (query) => ({
  matches: query === "(prefers-color-scheme: dark)",
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => {}
});

// Mock document for applyTheme
globalThis.document = {
  documentElement: {
    setAttribute: (attr, value) => {},
    removeAttribute: (attr) => {}
  }
};

test("Dark Mode Theme Management", async (t) => {
  await t.test("getTheme returns default 'system' when no preference stored", () => {
    clearStorage();
    const theme = getTheme();
    assert.strictEqual(theme, "system", "Should default to system");
  });

  await t.test("getTheme returns stored preference", () => {
    clearStorage();
    mockStorage["cvstudio:theme"] = "dark";
    const theme = getTheme();
    assert.strictEqual(theme, "dark", "Should return stored theme");
  });

  await t.test("setTheme stores preference in localStorage", () => {
    clearStorage();
    setTheme("light");
    assert.strictEqual(mockStorage["cvstudio:theme"], "light", "Should store light theme");

    setTheme("dark");
    assert.strictEqual(mockStorage["cvstudio:theme"], "dark", "Should store dark theme");

    setTheme("system");
    assert.strictEqual(mockStorage["cvstudio:theme"], "system", "Should store system theme");
  });

  await t.test("setTheme throws on invalid value", () => {
    clearStorage();
    assert.throws(() => setTheme("invalid"), /Invalid theme/, "Should reject invalid theme");
    assert.throws(() => setTheme("blue"), /Invalid theme/, "Should only accept valid values");
  });

  await t.test("getSystemTheme detects system preference", () => {
    const theme = getSystemTheme();
    assert.ok(["light", "dark"].includes(theme), "Should return light or dark");
  });

  await t.test("getSystemTheme returns 'light' when matchMedia unavailable", () => {
    const savedMatchMedia = globalThis.matchMedia;
    try {
      // @ts-ignore
      globalThis.matchMedia = null;
      const theme = getSystemTheme();
      assert.strictEqual(theme, "light", "Should default to light when matchMedia unavailable");
    } finally {
      globalThis.matchMedia = savedMatchMedia;
    }
  });

  await t.test("getEffectiveTheme returns system preference when theme is 'system'", () => {
    clearStorage();
    setTheme("system");
    const effective = getEffectiveTheme();
    assert.ok(["light", "dark"].includes(effective), "Should resolve system preference");
  });

  await t.test("getEffectiveTheme returns explicit theme when set", () => {
    clearStorage();
    setTheme("light");
    let effective = getEffectiveTheme();
    assert.strictEqual(effective, "light", "Should return explicit light theme");

    setTheme("dark");
    effective = getEffectiveTheme();
    assert.strictEqual(effective, "dark", "Should return explicit dark theme");
  });

  await t.test("applyTheme sets data-theme attribute", () => {
    const attrs = {};
    const root = {
      setAttribute: (attr, value) => { attrs[attr] = value; },
      removeAttribute: (attr) => { delete attrs[attr]; }
    };
    globalThis.document = { documentElement: root };

    applyTheme("light");
    assert.strictEqual(attrs["data-theme"], "light", "Should set light theme attribute");

    applyTheme("dark");
    assert.strictEqual(attrs["data-theme"], "dark", "Should set dark theme attribute");

    applyTheme("system");
    assert.ok(!attrs["data-theme"], "Should remove data-theme for system preference");
  });

  await t.test("Theme persistence survives page reload simulation", () => {
    clearStorage();
    setTheme("dark");
    assert.strictEqual(mockStorage["cvstudio:theme"], "dark");

    // Simulate page reload
    const restored = getTheme();
    assert.strictEqual(restored, "dark", "Theme should persist across reloads");
  });

  await t.test("Theme cycle logic: system → light → dark → system", () => {
    clearStorage();
    setTheme("system");
    assert.strictEqual(getTheme(), "system");

    setTheme("light");
    assert.strictEqual(getTheme(), "light");

    setTheme("dark");
    assert.strictEqual(getTheme(), "dark");

    setTheme("system");
    assert.strictEqual(getTheme(), "system");
  });

  await t.test("Multiple theme changes work correctly", () => {
    clearStorage();
    for (let i = 0; i < 5; i++) {
      setTheme("dark");
      assert.strictEqual(getTheme(), "dark");
      setTheme("light");
      assert.strictEqual(getTheme(), "light");
    }
  });

  await t.test("Theme preference independent of session data", () => {
    clearStorage();
    mockStorage["cvstudio:sessions"] = "[]";
    mockStorage["cvstudio:selected-sessions"] = "[]";

    setTheme("dark");
    assert.strictEqual(mockStorage["cvstudio:theme"], "dark");
    assert.strictEqual(mockStorage["cvstudio:sessions"], "[]");

    // Theme change shouldn't affect other data
    setTheme("light");
    assert.strictEqual(mockStorage["cvstudio:sessions"], "[]");
  });
});

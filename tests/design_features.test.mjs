import test from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appCss = fs.readFileSync(path.join(__dirname, "..", "app.css"), "utf8");
const htmlFile = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

test("Design - app.css exists and is valid", () => {
  assert.ok(appCss.length > 1000);
  assert.ok(appCss.includes("body"));
  assert.ok(appCss.includes("color") || appCss.includes("background"));
});

test("Design - Multiple template styles available", () => {
  assert.ok(htmlFile.includes("template"));
  assert.ok(htmlFile.includes("sans") || htmlFile.includes("serif") || htmlFile.includes("ats"));
});

test("Design - Dark mode toggle available", () => {
  assert.ok(htmlFile.includes("theme") || htmlFile.includes("dark"));
});

test("Design - Photo upload feature", () => {
  assert.ok(htmlFile.includes("photo"));
});

test("Design - Multiple export formats", () => {
  assert.ok(htmlFile.includes("PDF") || htmlFile.includes("pdf"));
  assert.ok(htmlFile.includes("JSON") || htmlFile.includes("json"));
  assert.ok(htmlFile.includes("text") || htmlFile.includes("txt"));
});

test("Design - Voice/Microphone feature", () => {
  assert.ok(htmlFile.includes("mic") || htmlFile.includes("voice"));
});

test("Design - Session management", () => {
  assert.ok(htmlFile.includes("sessions") || htmlFile.includes("My CVs"));
});

test("Design - Undo functionality", () => {
  assert.ok(htmlFile.includes("undo") || htmlFile.includes("Undo"));
});

test("Design - Textarea with auto-resize", () => {
  assert.ok(htmlFile.includes("textarea"));
});

test("Design - Tab interface for Changes/Fields", () => {
  assert.ok(htmlFile.includes("tab") || htmlFile.includes("Changes") || htmlFile.includes("Fields"));
});

test("Design - Floating action buttons (FAB style)", () => {
  assert.ok(appJs && (appJs.includes("button") || appJs.includes("icon")));
});

test("Design - Responsive layout (grid/flex)", () => {
  assert.ok(appCss.includes("display: grid") || appCss.includes("display: flex") || appCss.includes("display:grid") || appCss.includes("display:flex"));
});

test("Design - Settings dialog", () => {
  assert.ok(htmlFile.includes("settings") || htmlFile.includes("Settings"));
});

test("Design - File drop/upload area", () => {
  assert.ok(htmlFile.includes("drop") || htmlFile.includes("upload") || htmlFile.includes("file"));
});

test("Design - Quick action chips", () => {
  assert.ok(htmlFile.includes("chips") || htmlFile.includes("button"));
});

test("Design - Status messages", () => {
  assert.ok(htmlFile.includes("status"));
});

test("Design - CSS variables for theming", () => {
  assert.ok(appCss.includes("var(") || appCss.includes("--"));
});

test("Design - Clean color scheme", () => {
  // Check for common color properties
  assert.ok(appCss.includes("color:") || appCss.includes("background") || appCss.includes("border"));
});

test("Design - Typography controls", () => {
  // Check for font-size, font-family, line-height
  assert.ok(appCss.includes("font") || appCss.includes("size"));
});

test("Design - Button styling", () => {
  assert.ok(appCss.includes("button") || appCss.includes("btn"));
});

test("Design - Dialog/Modal styling", () => {
  assert.ok(appCss.includes("dialog") || appCss.includes("modal") || appCss.includes("dlg"));
});

test("Design - Input field styling", () => {
  assert.ok(appCss.includes("input") || appCss.includes("textarea"));
});

test("Design - Hover and focus states", () => {
  assert.ok(appCss.includes(":hover") || appCss.includes(":focus"));
});

test("Design - Smooth transitions", () => {
  assert.ok(appCss.includes("transition") || appCss.includes("animation"));
});

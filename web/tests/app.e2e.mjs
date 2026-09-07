import { test, expect } from "@playwright/test";

/** Canned AI reply: rename the person and explain. Proves the chat → AI → preview loop without a real key. */
const EDITED = { ops: [
  { op: "set", path: "basics.name", value: "Elif Demir-Yılmaz" },
  { op: "set", path: "basics.title", value: "Staff Backend Engineer" },
], note: "Renamed and retitled." };
const WIPE = { ops: [
  { op: "set", path: "basics.name", value: "" }, { op: "set", path: "summary", value: "" },
  { op: "set", path: "experience", value: [] }, { op: "set", path: "skills", value: [] },
  { op: "set", path: "projects", value: [] }, { op: "set", path: "certifications", value: [] },
  { op: "set", path: "education", value: [] }, { op: "set", path: "languages", value: [] },
], note: "Cleared." };
const NOOP = { ops: [], note: "Bunu anlayamadım." };

const FAKE_WEBLLM = `export async function CreateMLCEngine(model, opts) {
  opts?.initProgressCallback?.({ text: "stub load", progress: 1 });
  return { chat: { completions: { create: async () => ({ choices: [{ message: { content: ${JSON.stringify(JSON.stringify(EDITED))} } }] }) } } };
}`;
const FAKE_TRANSFORMERS = `export const env = {}; export async function pipeline() { return async () => ({ text: " özeti kısalt lütfen " }); }`;

test.beforeEach(async ({ page }) => {
  await page.route(/esm\.run\/@mlc-ai\/web-llm/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: FAKE_WEBLLM }));
  await page.route(/cdn\.jsdelivr\.net\/npm\/@huggingface\/transformers/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: FAKE_TRANSFORMERS }));
  await page.addInitScript(() => { if (!("gpu" in navigator)) Object.defineProperty(navigator, "gpu", { value: {}, configurable: true }); });
  await page.route("https://api.anthropic.com/v1/messages", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ content: [{ type: "text", text: JSON.stringify(EDITED) }] }) }));
  await page.route(/cdn\.jsdelivr\.net.*mammoth/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "window.mammoth={extractRawText:async()=>({value:'stub'})}" }));
});

test("landing is an empty page with a drop zone; sample opens the workspace", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#landing")).toBeVisible();
  await expect(page.locator("#workspace")).toBeHidden();
  await page.click("#btn-sample");
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator(".msg.assistant").first()).toContainText("sample CV");
  await expect(page.locator("#composer")).toBeVisible();
  const frame = page.frameLocator("#frame");
  await expect(frame.locator(".name")).toHaveText("Elif Demir");
});

test("templates switch and the ATS view is plain", async ({ page }) => {
  await page.goto("/"); await page.click("#btn-sample");
  await page.selectOption("#template", "ats");
  const frame = page.frameLocator("#frame");
  await expect(frame.locator("h1")).toHaveText("Elif Demir");
  await expect(frame.locator("h2").first()).toHaveText("Summary");
  await page.selectOption("#template", "serif");
  await expect(frame.locator(".name")).toHaveText("Elif Demir");
});

test("cloud engine without a key explains what to do", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("cvstudio.settings", JSON.stringify({ provider: "anthropic" })));
  await page.reload(); await page.click("#btn-sample");
  await page.fill("#ask", "Make it shorter");
  await page.press("#ask", "Enter");
  await expect(page.locator(".msg.user")).toHaveText("Make it shorter");
  await expect(page.locator(".msg.error")).toContainText("Add an API key");
});

test("chat with a key edits the CV, shows the note, undo restores", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("cvstudio.settings", JSON.stringify({ provider: "anthropic", apikey: "test-key" })));
  await page.reload(); await page.click("#btn-sample");
  await page.fill("#ask", "Rename me"); await page.press("#ask", "Enter");
  await expect(page.locator(".msg.assistant").last()).toHaveText("Renamed and retitled.");
  const frame = page.frameLocator("#frame");
  await expect(frame.locator(".name")).toHaveText("Elif Demir-Yılmaz");
  await expect(page.locator("#btn-undo")).toBeEnabled();
  await page.click("#btn-undo");
  await expect(frame.locator(".name")).toHaveText("Elif Demir");
});

test("quick action chips send an instruction", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("cvstudio.settings", JSON.stringify({ provider: "anthropic", apikey: "k" })));
  await page.reload(); await page.click("#btn-sample");
  await page.click(".chips button:has-text('Sharper summary')");
  await expect(page.locator(".msg.user")).toContainText("Tighten the summary");
  await expect(page.frameLocator("#frame").locator(".name")).toHaveText("Elif Demir-Yılmaz");
});

test("fields tab edits update the preview live", async ({ page }) => {
  await page.goto("/"); await page.click("#btn-sample");
  await page.click(".tab[data-tab=fields]");
  await page.fill('[data-path="basics.title"]', "Principal Engineer");
  await expect(page.frameLocator("#frame").locator(".role")).toHaveText("Principal Engineer");
  await page.click('[data-add="projects"]');
  await expect(page.locator('[data-path="projects.1.name"]')).toBeVisible();
});

test("state survives a reload and New CV clears it", async ({ page }) => {
  await page.goto("/"); await page.click("#btn-sample");
  await page.reload();
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator(".msg.assistant").first()).toContainText("Welcome back, Elif");
  page.on("dialog", (d) => d.accept());
  await page.click("#btn-new");
  await expect(page.locator("#landing")).toBeVisible();
});

test("exports produce files", async ({ page }) => {
  await page.goto("/"); await page.click("#btn-sample");
  const [json] = await Promise.all([page.waitForEvent("download"), page.click("#btn-json")]);
  expect(json.suggestedFilename()).toBe("Elif_Demir.json");
  const [txt] = await Promise.all([page.waitForEvent("download"), page.click("#btn-txt")]);
  expect(txt.suggestedFilename()).toBe("Elif_Demir.txt");
});

test("dropping a saved JSON restores a CV", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles("#file", { name: "me.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ basics: { name: "Kemal Test" } })) });
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.frameLocator("#frame").locator(".name")).toHaveText("Kemal Test");
});


test("speech transcript with recognition noise still reaches the model and is applied", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("cvstudio.settings", JSON.stringify({ provider: "anthropic", apikey: "k" })));
  await page.reload(); await page.click("#btn-sample");
  await page.fill("#ask", "özeti kısalt lütfen bir de unvanı staff yap");
  await page.press("#ask", "Enter");
  await expect(page.locator(".msg.user")).toContainText("özeti kısalt");
  await expect(page.frameLocator("#frame").locator(".role")).toHaveText("Staff Backend Engineer");
});

test("default engine is in-browser: no key, the edit still lands", async ({ page }) => {
  await page.goto("/"); await page.click("#btn-sample");
  await page.fill("#ask", "unvanı staff yap"); await page.press("#ask", "Enter");
  await expect(page.locator(".msg.assistant").last()).toHaveText("Renamed and retitled.");
  await expect(page.frameLocator("#frame").locator(".role")).toHaveText("Staff Backend Engineer");
});

test("settings default to the free in-browser engines and hide key fields", async ({ page }) => {
  await page.goto("/"); await page.click("#btn-settings-landing");
  await expect(page.locator("#provider")).toHaveValue("local");
  await expect(page.locator("#engine")).toHaveValue("local");
  await expect(page.locator("#apikey-row")).toBeHidden();
  await expect(page.locator("#localmodel-row")).toBeVisible();
  await expect(page.locator("#localwhisper")).toHaveValue("onnx-community/whisper-small");
  await expect(page.locator("#localwhisper-row")).toBeVisible();
  await expect(page.locator("#sttkey-row")).toBeHidden();
  await page.selectOption("#provider", "anthropic");
  await expect(page.locator("#apikey-row")).toBeVisible();
  await page.selectOption("#engine", "whisper");
  await expect(page.locator("#sttkey-row")).toBeVisible();
  await expect(page.locator("#localwhisper-row")).toBeHidden();
  await page.selectOption("#engine", "local"); await page.selectOption("#localwhisper", "onnx-community/whisper-base");
  await page.click("#btn-save-settings");
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem("cvstudio.settings")))).toMatchObject({ engine: "local", localwhisper: "onnx-community/whisper-base" });
});

test("no language picker beside the mic: the engine detects the language itself", async ({ page }) => {
  await page.goto("/"); await page.click("#btn-sample");
  await expect(page.locator("#btn-mic")).toBeVisible();
  await expect(page.locator("#composer select")).toHaveCount(0);
  await expect(page.locator("#btn-mic")).toHaveAttribute("title", /any language/);
});

test("mic: record, auto-transcribe locally, transcript lands in the box, Enter applies it", async ({ page, context }) => {
  await context.grantPermissions(["microphone"]);
  await page.goto("/"); await page.click("#btn-sample");
  await page.click("#btn-mic");
  await expect(page.locator("#btn-mic")).toHaveClass(/live/);
  await page.waitForTimeout(400);
  await page.click("#btn-mic");
  await expect(page.locator("#ask")).toHaveValue("özeti kısalt lütfen");
  await expect(page.locator("#mic-status")).toContainText("press Enter");
  await expect(page.locator("#mic-status")).not.toContainText("Heard"); // the stubbed model cannot tell the language
  await page.press("#ask", "Enter");
  await expect(page.locator(".msg.user")).toHaveText("özeti kısalt lütfen");
  await expect(page.frameLocator("#frame").locator(".name")).toHaveText("Elif Demir-Yılmaz");
});

/* A stub that records which backend each pipeline() asked for, and can be told to fail for one of them. */
const RECORDING_TRANSFORMERS = (failOn) => `export const env = {};
export async function pipeline(task, model, opts) {
  (window.__devices ??= []).push(opts?.device);
  if (opts?.device === ${JSON.stringify(failOn)}) throw new Error("no available backend found. ERR: [webgpu] Error: Failed to get GPU adapter.");
  return async () => ({ text: " özeti kısalt lütfen " });
}`;

test("voice: no GPU adapter means the processor build is the only one downloaded", async ({ page, context }) => {
  await context.grantPermissions(["microphone"]);
  /* navigator.gpu exists (see beforeEach) but hands out no adapter — headless Chromium, and any blocklisted driver. */
  await page.addInitScript(() => { Object.defineProperty(navigator, "gpu", { value: { requestAdapter: async () => null }, configurable: true }); });
  await page.route(/cdn\.jsdelivr\.net\/npm\/@huggingface\/transformers/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: RECORDING_TRANSFORMERS("webgpu") }));
  await page.goto("/"); await page.click("#btn-sample");
  await page.click("#btn-mic"); await page.waitForTimeout(400); await page.click("#btn-mic");
  await expect(page.locator("#ask")).toHaveValue("özeti kısalt lütfen");
  expect(await page.evaluate(() => window.__devices)).toEqual(["wasm"]);
});

test("voice: an adapter that turns out unusable still falls back to the processor", async ({ page, context }) => {
  await context.grantPermissions(["microphone"]);
  /* The adapter is handed out, so WebGPU is tried, but creating the backend fails anyway. */
  await page.addInitScript(() => { Object.defineProperty(navigator, "gpu", { value: { requestAdapter: async () => ({}) }, configurable: true }); });
  await page.route(/cdn\.jsdelivr\.net\/npm\/@huggingface\/transformers/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: RECORDING_TRANSFORMERS("webgpu") }));
  await page.goto("/"); await page.click("#btn-sample");
  await page.click("#btn-mic"); await page.waitForTimeout(400); await page.click("#btn-mic");
  await expect(page.locator("#ask")).toHaveValue("özeti kısalt lütfen");
  await expect(page.locator("#mic-status")).toContainText("press Enter");
  expect(await page.evaluate(() => window.__devices)).toEqual(["webgpu", "wasm"]);
});

test("a deleting instruction removes only what was named", async ({ page }) => {
  await page.route(/esm\.run\/@mlc-ai\/web-llm/, (route) => route.fulfill({ status: 200, contentType: "text/javascript",
    body: `export async function CreateMLCEngine(m,o){o?.initProgressCallback?.({text:"s",progress:1});return{chat:{completions:{create:async()=>({choices:[{message:{content:${JSON.stringify(JSON.stringify({ ops: [{ op: "set", path: "basics.name", value: "" }], note: "Adı sildim." }))} }}]})}}};}` }));
  await page.goto("/"); await page.click("#btn-sample");
  await page.fill("#ask", "Elif Demir yazısını sil"); await page.press("#ask", "Enter");
  await expect(page.locator(".msg.assistant").last()).toHaveText("Adı sildim.");
  const frame = page.frameLocator("#frame");
  await expect(frame.locator(".name")).toHaveText("");
  await expect(frame.locator("h2").first()).toHaveText("Summary");
  await expect(frame.locator(".job").first()).toContainText("Kargo Labs");
});

test("an edit that would wipe the CV is refused", async ({ page }) => {
  await page.route(/esm\.run\/@mlc-ai\/web-llm/, (route) => route.fulfill({ status: 200, contentType: "text/javascript",
    body: `export async function CreateMLCEngine(m,o){o?.initProgressCallback?.({text:"s",progress:1});return{chat:{completions:{create:async()=>({choices:[{message:{content:${JSON.stringify(JSON.stringify(WIPE))} }}]})}}};}` }));
  await page.goto("/"); await page.click("#btn-sample");
  await page.fill("#ask", "Elif Demir yazısını sil"); await page.press("#ask", "Enter");
  await expect(page.locator(".msg.error")).toContainText("wiped most of the CV");
  await expect(page.frameLocator("#frame").locator(".name")).toHaveText("Elif Demir");
});

test("an instruction the model cannot act on leaves the CV alone and says so", async ({ page }) => {
  await page.route(/esm\.run\/@mlc-ai\/web-llm/, (route) => route.fulfill({ status: 200, contentType: "text/javascript",
    body: `export async function CreateMLCEngine(m,o){o?.initProgressCallback?.({text:"s",progress:1});return{chat:{completions:{create:async()=>({choices:[{message:{content:${JSON.stringify(JSON.stringify(NOOP))} }}]})}}};}` }));
  await page.goto("/"); await page.click("#btn-sample");
  await page.fill("#ask", "hava nasıl"); await page.press("#ask", "Enter");
  await expect(page.locator(".msg.assistant").last()).toHaveText("Bunu anlayamadım.");
  await expect(page.locator("#btn-undo")).toBeDisabled();
  await expect(page.frameLocator("#frame").locator(".name")).toHaveText("Elif Demir");
});

test("the Upload button in the toolbar accepts another CV", async ({ page }) => {
  await page.goto("/"); await page.click("#btn-sample");
  await page.setInputFiles("#file", { name: "other.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ basics: { name: "Kemal Test", title: "QA Lead" } })) });
  await expect(page.frameLocator("#frame").locator(".name")).toHaveText("Kemal Test");
});

test("layout: CV and composer on the left, changes panel on the right", async ({ page }) => {
  await page.goto("/"); await page.click("#btn-sample");
  const stage = await page.locator(".stage").boundingBox();
  const side = await page.locator(".side").boundingBox();
  const composer = await page.locator("#composer").boundingBox();
  const frame = await page.locator("#frame").boundingBox();
  expect(stage.x).toBeLessThan(side.x);
  expect(composer.y).toBeGreaterThan(frame.y);
  await expect(page.locator("#btn-mic")).toBeVisible();
  await expect(page.locator("#btn-ask")).toBeVisible();
});

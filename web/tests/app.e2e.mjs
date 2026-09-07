import { test, expect } from "@playwright/test";

/** Canned replies from the fake model, in the operations protocol the app expects. */
const EDITED = { ops: [
  { op: "set", path: "basics.name", value: "Elif Demir-Yılmaz" },
  { op: "set", path: "basics.title", value: "Staff Backend Engineer" },
], note: "Renamed and retitled." };

const DELETE_NAME = { ops: [{ op: "set", path: "basics.name", value: "" }], note: "Adı sildim." };

const WIPE = { ops: [
  { op: "set", path: "basics.name", value: "" }, { op: "set", path: "summary", value: "" },
  { op: "set", path: "experience", value: [] }, { op: "set", path: "skills", value: [] },
  { op: "set", path: "projects", value: [] }, { op: "set", path: "certifications", value: [] },
  { op: "set", path: "education", value: [] }, { op: "set", path: "languages", value: [] },
], note: "Cleared." };

const NOOP = { ops: [], note: "Bunu anlayamadım." };

const webllmModule = (reply) =>
  "export async function CreateMLCEngine(m, o) { o?.initProgressCallback?.({ text: 'stub', progress: 1 });"
  + " return { chat: { completions: { create: async () => ({ choices: [{ message: { content: "
  + JSON.stringify(JSON.stringify(reply)) + " } }] }) } } }; }";

/** Point the in-browser model at a fixed reply. Later routes win, so this overrides the default. */
async function stubModel(page, reply) {
  await page.route(/esm\.run\/@mlc-ai\/web-llm/, (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: webllmModule(reply) }));
}

const FAKE_TRANSFORMERS = `export const env = {}; export async function pipeline() { return async () => ({ text: " özeti kısalt lütfen " }); }`;

test.beforeEach(async ({ page }) => {
  await stubModel(page, EDITED);
  await page.route(/cdn\.jsdelivr\.net\/npm\/@huggingface\/transformers/, (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: FAKE_TRANSFORMERS }));
  await page.route("https://api.anthropic.com/v1/messages", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ content: [{ type: "text", text: JSON.stringify(EDITED) }] }) }));
  await page.route(/cdn\.jsdelivr\.net.*mammoth/, (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: "window.mammoth={extractRawText:async()=>({value:'stub'})}" }));
  await page.addInitScript(() => { if (!("gpu" in navigator)) Object.defineProperty(navigator, "gpu", { value: {}, configurable: true }); });
});

const openSample = async (page) => { await page.goto("/"); await page.click("#btn-sample"); };

/* ───────── landing and layout ───────── */

test("landing is an empty page with a drop zone; the sample opens the workspace", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#landing")).toBeVisible();
  await expect(page.locator("#workspace")).toBeHidden();
  await page.click("#btn-sample");
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator(".msg.assistant").first()).toContainText("sample CV");
  await expect(page.frameLocator("#frame").locator(".name")).toHaveText("Elif Demir");
});

test("layout: the CV and its message box are on the left, changes on the right", async ({ page }) => {
  await openSample(page);
  const stage = await page.locator(".stage").boundingBox();
  const side = await page.locator(".side").boundingBox();
  const frame = await page.locator("#frame").boundingBox();
  const composer = await page.locator("#composer").boundingBox();
  expect(stage.x).toBeLessThan(side.x);
  expect(composer.y).toBeGreaterThan(frame.y);
  await expect(page.locator("#btn-mic")).toBeVisible();
  await expect(page.locator("#btn-ask")).toBeVisible();
  await expect(page.locator("#btn-upload")).toBeVisible();
});

test("templates switch and the ATS view is plain", async ({ page }) => {
  await openSample(page);
  const frame = page.frameLocator("#frame");
  await page.selectOption("#template", "ats");
  await expect(frame.locator("h1")).toHaveText("Elif Demir");
  await expect(frame.locator("h2").first()).toHaveText("Summary");
  await page.selectOption("#template", "serif");
  await expect(frame.locator(".name")).toHaveText("Elif Demir");
});

/* ───────── editing ───────── */

test("the default engine needs no key and the edit lands", async ({ page }) => {
  await openSample(page);
  await page.fill("#ask", "unvanı staff yap");
  await page.press("#ask", "Enter");
  await expect(page.locator(".msg.assistant").last()).toHaveText("Renamed and retitled.");
  await expect(page.frameLocator("#frame").locator(".role")).toHaveText("Staff Backend Engineer");
  await expect(page.locator("#btn-undo")).toBeEnabled();
  await page.click("#btn-undo");
  await expect(page.frameLocator("#frame").locator(".role")).toHaveText("Senior Backend Engineer");
});

test("a deleting instruction removes only what was named", async ({ page }) => {
  await stubModel(page, DELETE_NAME);
  await openSample(page);
  await page.fill("#ask", "Elif Demir yazısını sil");
  await page.press("#ask", "Enter");
  await expect(page.locator(".msg.assistant").last()).toHaveText("Adı sildim.");
  const frame = page.frameLocator("#frame");
  await expect(frame.locator(".name")).toBeEmpty();
  await expect(frame.locator(".role")).toHaveText("Senior Backend Engineer");
  await expect(frame.locator(".job").first()).toContainText("Kargo Labs");
});

test("a reply that would wipe the CV is refused", async ({ page }) => {
  await stubModel(page, WIPE);
  await openSample(page);
  await page.fill("#ask", "Elif Demir yazısını sil");
  await page.press("#ask", "Enter");
  await expect(page.locator(".msg.error")).toContainText("wiped most of the CV");
  await expect(page.frameLocator("#frame").locator(".name")).toHaveText("Elif Demir");
});

test("an operation the CV has no place for is reported, not claimed as done", async ({ page }) => {
  await stubModel(page, { ops: [{ op: "set", path: "hobbies.0", value: "chess" }], note: "Hobi ekledim." });
  await openSample(page);
  await page.fill("#ask", "hobi ekle");
  await page.press("#ask", "Enter");
  await expect(page.locator(".msg.error")).toContainText("Nothing changed");
  await expect(page.locator(".msg.error")).toContainText("hobbies");
});

test("a loosely written path from the model still applies", async ({ page }) => {
  await stubModel(page, { ops: [{ op: "remove", path: "Full Name" }], note: "Adı sildim." });
  await openSample(page);
  await page.fill("#ask", "Elif Demir yazısını sil");
  await page.press("#ask", "Enter");
  await expect(page.locator(".msg.assistant").last()).toHaveText("Adı sildim.");
  await expect(page.frameLocator("#frame").locator(".name")).toBeEmpty();
  await expect(page.frameLocator("#frame").locator(".role")).toHaveText("Senior Backend Engineer");
});

test("an instruction the model cannot act on leaves the CV alone", async ({ page }) => {
  await stubModel(page, NOOP);
  await openSample(page);
  await page.fill("#ask", "hava nasıl");
  await page.press("#ask", "Enter");
  await expect(page.locator(".msg.assistant").last()).toHaveText("Bunu anlayamadım.");
  const frame = page.frameLocator("#frame");
  await expect(frame.locator(".name")).toHaveText("Elif Demir");
  await expect(frame.locator(".role")).toHaveText("Senior Backend Engineer");
});

test("quick actions send an instruction", async ({ page }) => {
  await openSample(page);
  await page.click(".chips button:has-text('Sharper summary')");
  await expect(page.locator(".msg.user")).toContainText("Tighten the summary");
  await expect(page.frameLocator("#frame").locator(".name")).toHaveText("Elif Demir-Yılmaz");
});

test("a cloud engine without a key explains what to do", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("cvstudio.settings", JSON.stringify({ provider: "anthropic" })));
  await page.reload();
  await page.click("#btn-sample");
  await page.fill("#ask", "Make it shorter");
  await page.press("#ask", "Enter");
  await expect(page.locator(".msg.error")).toContainText("Add an API key");
});

test("a cloud engine with a key edits through the mocked endpoint", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("cvstudio.settings", JSON.stringify({ provider: "anthropic", apikey: "test-key" })));
  await page.reload();
  await page.click("#btn-sample");
  await page.fill("#ask", "Rename me");
  await page.press("#ask", "Enter");
  await expect(page.locator(".msg.assistant").last()).toHaveText("Renamed and retitled.");
  await expect(page.frameLocator("#frame").locator(".name")).toHaveText("Elif Demir-Yılmaz");
});

/* ───────── voice ───────── */

test("mic: record, transcribe locally, transcript lands in the box, Enter applies it", async ({ page, context }) => {
  await context.grantPermissions(["microphone"]);
  await openSample(page);
  await page.click("#btn-mic");
  await expect(page.locator("#btn-mic")).toHaveClass(/live/);
  await page.waitForTimeout(400);
  await page.click("#btn-mic");
  await expect(page.locator("#ask")).toHaveValue("özeti kısalt lütfen");
  await expect(page.locator("#mic-status")).toContainText("press Enter");
  await page.press("#ask", "Enter");
  await expect(page.locator(".msg.user")).toHaveText("özeti kısalt lütfen");
  await expect(page.frameLocator("#frame").locator(".name")).toHaveText("Elif Demir-Yılmaz");
});

/* ───────── settings, files, persistence ───────── */

test("settings default to the free in-browser engines and hide the key fields", async ({ page }) => {
  await page.goto("/");
  await page.click("#btn-settings-landing");
  await expect(page.locator("#provider")).toHaveValue("local");
  await expect(page.locator("#engine")).toHaveValue("local");
  await expect(page.locator("#apikey-row")).toBeHidden();
  await expect(page.locator("#localmodel-row")).toBeVisible();
  await page.selectOption("#provider", "ollama");
  await expect(page.locator("#ollama-row")).toBeVisible();
  await page.selectOption("#provider", "anthropic");
  await expect(page.locator("#apikey-row")).toBeVisible();
});

test("the fields tab edits update the preview live", async ({ page }) => {
  await openSample(page);
  await page.click(".tab[data-tab=fields]");
  await page.fill('[data-path="basics.title"]', "Principal Engineer");
  await expect(page.frameLocator("#frame").locator(".role")).toHaveText("Principal Engineer");
  await page.click('[data-add="projects"]');
  await expect(page.locator('[data-path="projects.1.name"]')).toBeVisible();
});

test("the toolbar upload accepts another CV", async ({ page }) => {
  await openSample(page);
  await page.setInputFiles("#file", { name: "other.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ basics: { name: "Kemal Test", title: "QA Lead" } })) });
  await expect(page.frameLocator("#frame").locator(".name")).toHaveText("Kemal Test");
});

test("dropping a saved JSON on the landing page restores a CV", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles("#file", { name: "me.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ basics: { name: "Kemal Test" } })) });
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.frameLocator("#frame").locator(".name")).toHaveText("Kemal Test");
});

test("state survives a reload and New CV clears it", async ({ page }) => {
  await openSample(page);
  await page.reload();
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator(".msg.assistant").first()).toContainText("Welcome back, Elif");
  page.on("dialog", (d) => d.accept());
  await page.click("#btn-new");
  await expect(page.locator("#landing")).toBeVisible();
});

test("exports produce files", async ({ page }) => {
  await openSample(page);
  const [json] = await Promise.all([page.waitForEvent("download"), page.click("#btn-json")]);
  expect(json.suggestedFilename()).toBe("Elif_Demir.json");
  const [txt] = await Promise.all([page.waitForEvent("download"), page.click("#btn-txt")]);
  expect(txt.suggestedFilename()).toBe("Elif_Demir.txt");
});

test("the model test button grades the selected model", async ({ page }) => {
  await page.goto("/");
  await page.click("#btn-settings-landing");
  await expect(page.locator("#localmodel option")).toHaveCount(8);
  await page.click("#btn-test-model");
  await expect(page.locator("#test-result")).toContainText("Passed", { timeout: 15000 });
});

test("a model that replies with prose is reported as failing", async ({ page }) => {
  await page.route(/esm\.run\/@mlc-ai\/web-llm/, (route) => route.fulfill({ status: 200, contentType: "text/javascript",
    body: "export async function CreateMLCEngine(m,o){o?.initProgressCallback?.({text:'s',progress:1});return{chat:{completions:{create:async()=>({choices:[{message:{content:'I updated it for you.'}}]})}}};}" }));
  await page.goto("/");
  await page.click("#btn-settings-landing");
  await page.click("#btn-test-model");
  await expect(page.locator("#test-result")).toContainText("Failed", { timeout: 15000 });
  await expect(page.locator("#test-result")).toContainText("not JSON");
});

test("choosing Other reveals a field for any MLC model id", async ({ page }) => {
  await page.goto("/");
  await page.click("#btn-settings-landing");
  await expect(page.locator("#custommodel-row")).toBeHidden();
  await page.selectOption("#localmodel", "__custom__");
  await expect(page.locator("#custommodel-row")).toBeVisible();
});

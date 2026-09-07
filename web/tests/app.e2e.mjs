import { test, expect } from "@playwright/test";

/** Canned AI reply: rename the person and explain. Proves the chat → AI → preview loop without a real key. */
const EDITED = { cv: { basics: { name: "Elif Demir-Yılmaz", title: "Staff Backend Engineer" }, summary: "Edited by the fake model." }, note: "Renamed and retitled." };

test.beforeEach(async ({ page }) => {
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

test("chat without a key explains what to do", async ({ page }) => {
  await page.goto("/"); await page.click("#btn-sample");
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

test("voice language picker is populated, remembers the choice, and Whisper without a key explains itself", async ({ page }) => {
  await page.goto("/"); await page.click("#btn-sample");
  const options = await page.locator("#voice-lang option").count();
  expect(options).toBeGreaterThan(20);
  await page.selectOption("#voice-lang", "de-DE");
  await page.reload();
  await expect(page.locator("#voice-lang")).toHaveValue("de-DE");

  await page.evaluate(() => localStorage.setItem("cvstudio.settings", JSON.stringify({ engine: "whisper", provider: "anthropic", apikey: "k" })));
  await page.reload();
  await page.click("#btn-mic");
  await expect(page.locator("#mic-status")).toContainText("Whisper needs an OpenAI key");
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

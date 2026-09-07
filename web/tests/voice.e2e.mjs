/* End-to-end voice: a real Chromium with a fake microphone that plays a WAV, the real in-browser Whisper model
   (downloaded from Hugging Face on first run, ~80 MB for "base", CPU/WebAssembly on CI), automatic language
   detection, and the transcript landing in the composer. The AI edit step is mocked as in app.e2e.mjs.
   One describe block per language because the fake microphone's clip is a browser launch flag.
   The clips are synthesised with espeak-ng (tests/fixtures/), so the transcript wording is checked loosely;
   the detected language is the acceptance criterion. */
import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

const clip = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const EDITED = { ops: [{ op: "set", path: "basics.title", value: "Kıdemli Mühendis" }, { op: "set", path: "summary", value: "Kısaltıldı." }], note: "Özet kısaltıldı, unvan güncellendi." };
const fakeMic = (file) => ({ permissions: ["microphone"], launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-audio-capture=${clip(file)}%noloop`] } });

async function speakAndTranscribe(page) {
  await page.route("https://api.anthropic.com/v1/messages", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ content: [{ type: "text", text: JSON.stringify(EDITED) }] }) }));
  await page.route(/cdn\.jsdelivr\.net.*mammoth/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "window.mammoth={}" }));
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("cvstudio.settings", JSON.stringify({ provider: "anthropic", apikey: "k", engine: "local", localwhisper: "onnx-community/whisper-base" })));
  await page.reload(); await page.click("#btn-sample");
  await expect(page.locator("#composer select")).toHaveCount(0); // no language to pick: Whisper detects it
  await page.click("#btn-mic");
  await expect(page.locator("#btn-mic")).toHaveClass(/live/);
  await expect(page.locator("#mic-status")).toContainText("any language");
  await page.waitForTimeout(5500); // the fake microphone plays the whole clip once
  await page.click("#btn-mic");
  await expect(page.locator("#mic-status")).toContainText("press Enter", { timeout: 300_000 });
  return page.locator("#ask").inputValue();
}

test.describe("English clip", () => {
  test.use(fakeMic("voice-en.wav"));
  test("spoken English is detected, transcribed into the composer, and Enter sends it to the model", async ({ page }) => {
    test.setTimeout(480_000);
    const text = await speakAndTranscribe(page);
    await expect(page.locator("#mic-status")).toContainText("Heard English");
    expect(text.toLowerCase()).toMatch(/summar|certif|section|shorten/);
    await page.press("#ask", "Enter");
    await expect(page.locator(".msg.user")).toContainText(text.slice(0, 20));
    await expect(page.locator(".msg.assistant").last()).toHaveText(EDITED.note);
    await expect(page.frameLocator("#frame").locator(".role")).toHaveText("Kıdemli Mühendis");
  });
});

test.describe("Turkish clip", () => {
  test.use(fakeMic("voice-tr.wav"));
  test("spoken Turkish is detected as Turkish and transcribed", async ({ page }) => {
    test.setTimeout(480_000);
    const text = await speakAndTranscribe(page);
    await expect(page.locator("#mic-status")).toContainText("Heard Türkçe");
    expect(text.length).toBeGreaterThan(5);
  });
});

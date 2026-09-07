/* End-to-end voice, English clip: Chromium with a fake microphone playing tests/fixtures/voice-en.wav (espeak-ng)
   through the real in-browser Whisper model. The language must be detected, the transcript must land in the
   composer, and Enter must send it to the mocked model. Wording is checked loosely; the language is the criterion. */
import { test, expect } from "@playwright/test";
import { EDITED, fakeMic, speakAndTranscribe } from "./voice.shared.mjs";

/* One attempt only: a retry costs another model download and another minutes-long CPU run. */
test.describe.configure({ retries: 0 });
test.use(fakeMic("voice-en.wav"));

test("spoken English is detected, transcribed into the composer, and Enter sends it to the model", async ({ page }) => {
  test.setTimeout(900_000);
  const text = await speakAndTranscribe(page);
  await expect(page.locator("#mic-status")).toContainText("Heard English");
  expect(text.toLowerCase()).toMatch(/summar|certif|section|shorten/);
  await page.press("#ask", "Enter");
  await expect(page.locator(".msg.user")).toContainText(text.slice(0, 20));
  await expect(page.locator(".msg.assistant").last()).toHaveText(EDITED.note);
  await expect(page.frameLocator("#frame").locator(".role")).toHaveText("Kıdemli Mühendis");
});

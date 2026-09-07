/* End-to-end voice, Turkish clip: tests/fixtures/voice-tr.wav (espeak-ng) through the real in-browser Whisper model.
   The acceptance criterion is the detected language: the mic status must say "Heard Türkçe". */
import { test, expect } from "@playwright/test";
import { fakeMic, speakAndTranscribe } from "./voice.shared.mjs";

/* One attempt only: a retry costs another model download and another minutes-long CPU run. */
test.describe.configure({ retries: 0 });
test.use(fakeMic("voice-tr.wav"));

test("spoken Turkish is detected as Turkish and transcribed", async ({ page }) => {
  test.setTimeout(900_000);
  const text = await speakAndTranscribe(page, 9500); // the clip is 8.4s long
  await expect(page.locator("#mic-status")).toContainText("Heard Türkçe");
  expect(text.length).toBeGreaterThan(5);
});

/* End-to-end voice, Turkish clip: tests/fixtures/voice-tr.wav (espeak-ng) through the real in-browser Whisper model.
   The acceptance criterion is the detected language: the mic status must say "Heard Türkçe". */
import { test, expect } from "@playwright/test";
import { fakeMic, speakAndTranscribe } from "./voice.shared.mjs";

test.use(fakeMic("voice-tr.wav"));

test("spoken Turkish is detected as Turkish and transcribed", async ({ page }) => {
  test.setTimeout(480_000);
  const text = await speakAndTranscribe(page);
  await expect(page.locator("#mic-status")).toContainText("Heard Türkçe");
  expect(text.length).toBeGreaterThan(5);
});

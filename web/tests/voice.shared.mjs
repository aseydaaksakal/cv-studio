/* Shared by voice-en.e2e.mjs and voice-tr.e2e.mjs. Playwright only accepts launchOptions at file level, and the fake
   microphone's clip is a browser launch flag, so each language gets its own spec file. */
import { expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

export const clip = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
export const EDITED = { ops: [{ op: "set", path: "basics.title", value: "Kıdemli Mühendis" }, { op: "set", path: "summary", value: "Kısaltıldı." }], note: "Özet kısaltıldı, unvan güncellendi." };
export const TRANSCRIBE_TIMEOUT = 480_000;
export const fakeMic = (file) => ({ permissions: ["microphone"], launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-audio-capture=${clip(file)}%noloop`] } });

/** Real in-browser Whisper (base, downloaded from Hugging Face, CPU on CI); only the AI edit endpoint is mocked. */
export async function speakAndTranscribe(page) {
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
  /* The model is downloaded and then run on the processor, which is slow on a CI runner. Each phase reports
     itself, so a timeout here names the phase it stalled in rather than leaving a stale download percentage. */
  await expect(page.locator("#mic-status")).toContainText("Whisper", { timeout: 240_000 });
  await expect(page.locator("#mic-status")).toContainText("press Enter", { timeout: TRANSCRIBE_TIMEOUT });
  return page.locator("#ask").inputValue();
}

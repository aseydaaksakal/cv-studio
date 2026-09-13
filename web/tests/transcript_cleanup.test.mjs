/**
 * Filtering what Whisper invents over non-speech.
 *
 * Whisper is trained on subtitles, so handed music or room noise it returns what a
 * subtitle file would have said rather than nothing. Every string asserted here as
 * noise was produced by the real model during testing and reached the message box.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cleanTranscript } from "../core.js";

test("bracketed sound events are dropped, the speech around them is kept", () => {
  // Straight from the screenshot: music annotation glued to a real sentence.
  assert.equal(
    cleanTranscript("(upbeat music) Nasılsın iyi misin kardeş? Who are you my friend?"),
    "Nasılsın iyi misin kardeş? Who are you my friend?");
  assert.equal(cleanTranscript("[Applause] merhaba"), "merhaba");
  assert.equal(cleanTranscript("♪♪♪ hello ♪"), "hello");
  assert.equal(cleanTranscript("【音楽】こんにちは"), "こんにちは");
});

test("a clip that is only a sound event yields nothing at all", () => {
  for (const noise of ["(upbeat music)", "[Music]", "♪♪♪", "(applause)", "   ", "."]) {
    assert.equal(cleanTranscript(noise), "", `${noise} should be dropped`);
  }
});

test("repetition loops collapse to a single copy", () => {
  // The French loop from the screenshot, shortened.
  const loop = Array(12).fill("Je vais vous dire que").join(" ");
  assert.equal(cleanTranscript(loop), "Je vais vous dire que");
  assert.equal(cleanTranscript("sesim geliyor mu sesim geliyor mu sesim geliyor mu"), "sesim geliyor mu");
});

test("genuine emphasis is not mistaken for a loop", () => {
  /* Two repeats of one word is how people speak; three is the model looping. */
  assert.equal(cleanTranscript("çok çok iyi"), "çok çok iyi");
  assert.equal(cleanTranscript("very very good"), "very very good");
  assert.equal(cleanTranscript("no no no no no"), "no");
});

test("stock subtitle credits over silence are dropped", () => {
  for (const ghost of ["Thank you.", "Thanks for watching!", "Altyazı M.K.", "you", "Bye.",
                       "Subtitles by the Amara.org community"]) {
    assert.equal(cleanTranscript(ghost), "", `${ghost} should be dropped`);
  }
});

test("a real sentence that merely contains a ghost phrase survives", () => {
  assert.equal(cleanTranscript("Thank you for the interview yesterday."),
    "Thank you for the interview yesterday.");
  assert.equal(cleanTranscript("Bye means hoşça kal"), "Bye means hoşça kal");
});

test("ordinary speech passes through untouched", () => {
  for (const said of [
    "Elif Demir yazısını kırmızı yap",
    "Add a certification called CKA from CNCF in 2025",
    "Ich arbeite seit acht Jahren als Backend-Entwickler",
    "私はエンジニアです",
  ]) {
    assert.equal(cleanTranscript(said), said);
  }
});

test("a long parenthetical is treated as speech, not as a sound event", () => {
  /* Only short brackets are sound events; a real aside should not vanish. */
  const said = "I worked at PayFlow (a payments company based in Istanbul that I joined in 2017) for four years.";
  assert.equal(cleanTranscript(said), said);
});

test("null, undefined and punctuation-only input are safe", () => {
  assert.equal(cleanTranscript(null), "");
  assert.equal(cleanTranscript(undefined), "");
  assert.equal(cleanTranscript("!!!"), "");
  assert.equal(cleanTranscript("a"), "");
});

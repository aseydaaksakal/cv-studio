/**
 * The compose box during dictation.
 *
 * The box belongs to the user while the microphone is open: they can clear it or
 * edit it mid-sentence. Everything spoken before that edit has to be forgotten.
 * The first attempt at this fix re-based onto the *accumulated* transcript rather
 * than dropping it, so clearing the box put every earlier word straight back —
 * the regression these tests exist to prevent.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createDictationBuffer } from "../core.js";

test("speech accumulates while the user leaves the box alone", () => {
  const b = createDictationBuffer("");
  b.addFinal("merhaba");
  assert.equal(b.compose(), "merhaba");
  b.addFinal(" dünya");
  assert.equal(b.compose(), "merhaba dünya");
});

test("interim words show but do not accumulate", () => {
  const b = createDictationBuffer("");
  b.addFinal("nasıl");
  assert.equal(b.compose(" sın"), "nasıl sın");
  assert.equal(b.compose(" sınız"), "nasıl sınız");
  assert.equal(b.compose(), "nasıl");
});

test("text already typed is kept and spoken words are appended to it", () => {
  const b = createDictationBuffer("Elif Demir");
  b.addFinal(" yazısını kırmızı yap");
  assert.equal(b.compose(), "Elif Demir yazısını kırmızı yap");
});

test("clearing the box discards everything said before the clear", () => {
  const b = createDictationBuffer("");
  b.addFinal("sesim geliyor mu");
  assert.equal(b.compose(), "sesim geliyor mu");

  // The user selects all and deletes.
  assert.equal(b.syncFromBox(""), true, "the edit should be noticed");

  // They keep talking. Only the new words may appear.
  b.addFinal("yeni cümle");
  assert.equal(b.compose(), "yeni cümle");
});

test("clearing then speaking does not resurrect old text on later results either", () => {
  const b = createDictationBuffer("");
  b.addFinal("bir");
  b.compose();
  b.syncFromBox("");
  b.addFinal("iki");
  assert.equal(b.compose(), "iki");
  b.syncFromBox(b.compose());   // box untouched this round
  b.addFinal(" üç");
  assert.equal(b.compose(), "iki üç");
});

test("editing part of the text keeps what the user left and drops the rest", () => {
  const b = createDictationBuffer("");
  b.addFinal("telefon numarasını değiştir ve sil");
  b.compose();
  b.syncFromBox("telefon numarasını değiştir");   // user deleted the tail
  b.addFinal(" +90 555 000 00 00");
  assert.equal(b.compose(), "telefon numarasını değiştir +90 555 000 00 00");
});

test("an untouched box is not treated as an edit", () => {
  const b = createDictationBuffer("start");
  b.addFinal(" one");
  const written = b.compose();
  assert.equal(b.syncFromBox(written), false);
  b.addFinal(" two");
  assert.equal(b.compose(), "start one two");
});

test("whitespace from separate phrases is collapsed", () => {
  const b = createDictationBuffer("  ");
  b.addFinal("  bir   ");
  b.addFinal("  iki  ");
  assert.equal(b.compose(), "bir iki");
});

test("a null or undefined box value is handled like an empty one", () => {
  const b = createDictationBuffer(undefined);
  b.addFinal("x");
  assert.equal(b.compose(), "x");
  assert.equal(b.syncFromBox(null), true);
  b.addFinal("y");
  assert.equal(b.compose(), "y");
});

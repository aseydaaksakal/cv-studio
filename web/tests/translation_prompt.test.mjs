/**
 * The dictate-and-translate prompt.
 *
 * The audio path needs a microphone and the translation itself needs a model, so
 * what is testable here is the contract between them: the target list lining up
 * with the codes Whisper reports, and a prompt that makes a chat model translate
 * rather than reply to what it was handed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { TRANSLATE_TARGETS, translationPrompt, whisperLangName } from "../core.js";

test("target codes are the same two-letter codes Whisper reports", () => {
  /* The app compares the detected language against the chosen target directly, so
     a mismatch in shape would silently translate text into the language it is in. */
  for (const [code] of TRANSLATE_TARGETS) {
    assert.match(code, /^[a-z]{2}$/, `${code} is not a Whisper language code`);
    assert.notEqual(whisperLangName(code), code, `${code} has no display name`);
  }
});

test("the target list covers the languages the owner actually uses", () => {
  const codes = TRANSLATE_TARGETS.map(([c]) => c);
  for (const c of ["tr", "en", "de", "fr", "ar", "ja", "es", "ru", "zh"]) {
    assert.ok(codes.includes(c), `missing ${c}`);
  }
  assert.ok(TRANSLATE_TARGETS.length >= 30);
});

test("targets are sorted by display name and have no duplicates", () => {
  const names = TRANSLATE_TARGETS.map(([, n]) => n);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  assert.equal(new Set(TRANSLATE_TARGETS.map(([c]) => c)).size, TRANSLATE_TARGETS.length);
});

test("the prompt names both languages in words, not codes", () => {
  const { system } = translationPrompt("merhaba", "tr", "en");
  assert.match(system, /Türkçe/);
  assert.match(system, /English/);
  assert.doesNotMatch(system, /from tr\b/);
});

test("an undetected source language is described rather than left blank", () => {
  const { system } = translationPrompt("...", null, "tr");
  assert.match(system, /unknown language/);
  assert.match(system, /Türkçe/);
});

test("the prompt forbids the model from answering instead of translating", () => {
  /* A chat model handed "nasılsın" will reply "iyiyim" unless told not to. */
  const { system, user } = translationPrompt("nasılsın", "tr", "en");
  assert.match(system, /only translate/i);
  assert.match(system, /never answer/i);
  assert.match(system, /nothing else/i);
  assert.equal(user, "nasılsın", "the phrase goes through untouched");
});

test("the prompt accounts for speech transcripts being messy", () => {
  const { system } = translationPrompt("bir iki üç", "tr", "de");
  assert.match(system, /transcript/i);
  assert.match(system, /recognition errors/i);
});

test("same-language requests are told to pass the text through", () => {
  const { system } = translationPrompt("hello", "en", "en");
  assert.match(system, /already in English, repeat it unchanged/);
});

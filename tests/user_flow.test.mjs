/**
 * The full chain the app runs when someone types or speaks a command:
 *
 *   model reply (text)  ->  extractJSON  ->  applyOps  ->  renderStyled
 *
 * The previous version of this file asserted on literals it had just written
 * (`const enterPressed = true; assert.ok(enterPressed)`), so it passed whether or
 * not the app worked. Each test here starts from a raw model reply string — the
 * only thing the app really receives — and checks what the user ends up seeing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { SAMPLE, applyOps, extractJSON, normalize, renderStyled } from "../core.js";

/** Run a raw model reply through the same steps app.js does. */
function applyModelReply(cv, reply) {
  const parsed = extractJSON(reply);
  const { cv: next, applied, skipped } = applyOps(normalize(cv), parsed.ops);
  return { cv: next, note: parsed.note, applied, skipped, html: renderStyled(next, false) };
}

test("a spoken instruction to recolour the name changes what is rendered", () => {
  const reply = '{"ops":[{"op":"set","path":"theme.nameColor","value":"red"}],"note":"İsim kırmızı yapıldı."}';
  const { cv, note, skipped, html } = applyModelReply(SAMPLE, reply);
  assert.deepEqual(skipped, []);
  assert.equal(cv.theme.nameColor, "red");
  assert.match(html, /\.name \{[^}]*color:red/);
  assert.match(note, /kırmızı/);
});

test("several instructions in one reply all take effect", () => {
  const reply = `{"ops":[
    {"op":"set","path":"theme.fontScale","value":1.2},
    {"op":"set","path":"theme.sectionGap","value":0.6},
    {"op":"set","path":"basics.title","value":"Staff Engineer"}
  ],"note":"Updated size, spacing and title."}`;
  const { cv, applied, skipped, html } = applyModelReply(SAMPLE, reply);
  assert.equal(applied, 3);
  assert.deepEqual(skipped, []);
  assert.equal(cv.basics.title, "Staff Engineer");
  assert.match(html, /Staff Engineer/);
  assert.match(html, /margin-bottom:7\.2pt/);   // 12 * 0.6
});

test("a reply wrapped in prose and fences is still applied", () => {
  const reply = 'Sure, here you go:\n```json\n{"ops":[{"op":"delete","path":"experience.1"}],"note":"Removed one role."}\n```';
  const { cv, skipped } = applyModelReply(SAMPLE, reply);
  assert.deepEqual(skipped, []);
  assert.equal(cv.experience.length, SAMPLE.experience.length - 1);
});

test("a reply with the malformed JSON small models emit is repaired, not dropped", () => {
  // Missing comma between two ops — the exact failure seen in the app.
  const reply = '{"ops":[{"op":"set","path":"basics.name","value":"Ada"}{"op":"set","path":"basics.title","value":"Engineer"}]}';
  const { cv, applied } = applyModelReply(SAMPLE, reply);
  assert.equal(applied, 2);
  assert.equal(cv.basics.name, "Ada");
  assert.equal(cv.basics.title, "Engineer");
});

test("one bad operation is reported without losing the good ones", () => {
  const reply = `{"ops":[
    {"op":"set","path":"basics.name","value":"Ada"},
    {"op":"set","path":"nonsense.path","value":"x"}
  ],"note":"Renamed."}`;
  const { cv, applied, skipped } = applyModelReply(SAMPLE, reply);
  assert.equal(cv.basics.name, "Ada");
  assert.equal(applied, 1);
  assert.equal(skipped.length, 1);
});

test("a refusal reply leaves the CV untouched", () => {
  const before = normalize(SAMPLE);
  const { cv, applied } = applyModelReply(SAMPLE, '{"ops":[],"note":"Bu talimat CV ile ilgili değil."}');
  assert.equal(applied, 0);
  assert.deepEqual(cv, before);
});

test("editing never mutates the CV the caller passed in", () => {
  const original = normalize(SAMPLE);
  const snapshot = structuredClone(original);
  applyOps(original, [{ op: "set", path: "basics.name", value: "Changed" }]);
  assert.deepEqual(original, snapshot);
});

test("a reply that is not JSON at all is rejected rather than silently ignored", () => {
  assert.throws(() => applyModelReply(SAMPLE, "I'm sorry, I cannot help with that."), /did not return JSON/);
});

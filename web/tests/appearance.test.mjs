/**
 * Appearance commands, end to end at the data layer.
 *
 * These replace the old "user flow" tests, which asserted on literals the test
 * itself had just written (`const enterPressed = true; assert.ok(enterPressed)`)
 * and so passed while the feature did not exist at all. Every test here drives
 * the real functions the app calls — normalizePath, applyOps, renderStyled — and
 * checks the rendered stylesheet, so it fails if appearance support regresses.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY, SAMPLE, applyOps, normalize, normalizePath, normalizeTheme, renderStyled, safeColour } from "../core.js";

const render = (cv) => renderStyled(normalize(cv), false);

test("make the name red: the op applies and reaches the stylesheet", () => {
  const { cv, skipped } = applyOps(normalize(SAMPLE), [{ op: "set", path: "theme.nameColor", value: "red" }]);
  assert.deepEqual(skipped, []);
  assert.equal(cv.theme.nameColor, "red");
  assert.match(render(cv), /\.name \{[^}]*color:red/);
});

test("loose paths a model actually writes still land on the theme", () => {
  assert.equal(normalizePath("nameColor"), "theme.nameColor");
  assert.equal(normalizePath("font_size"), "theme.fontScale");
  assert.equal(normalizePath("theme.fontsize"), "theme.fontScale");
  assert.equal(normalizePath("cv.theme.headingColour"), "theme.headingColor");
  assert.equal(normalizePath("spacing"), "theme.lineSpacing");
});

test("bigger text scales every size rather than only the body", () => {
  const { cv } = applyOps(normalize(SAMPLE), [{ op: "set", path: "theme.fontScale", value: 1.25 }]);
  const html = render(cv);
  assert.match(html, /font-size:11\.00pt/);  // body 8.8 * 1.25
  assert.match(html, /font-size:22\.50pt/);  // name 18 * 1.25
});

test("less whitespace tightens the section gaps", () => {
  const tight = render(applyOps(normalize(SAMPLE), [{ op: "set", path: "theme.sectionGap", value: 0.5 }]).cv);
  const normal = render(normalize(SAMPLE));
  assert.match(tight, /\.sec \{ margin-bottom:6\.0pt/);
  assert.match(normal, /\.sec \{ margin-bottom:12\.0pt/);
});

test("a colour the model invented cannot inject CSS", () => {
  for (const bad of ["red; } body { display:none", "url(javascript:alert(1))", "</style><script>", "#12", "rgb(1,2)"]) {
    assert.equal(safeColour(bad), "", `should reject ${bad}`);
  }
  const { cv } = applyOps(normalize(SAMPLE), [{ op: "set", path: "theme.nameColor", value: "red; } body { display:none" }]);
  const html = render(cv);
  assert.doesNotMatch(html, /display:none/);
});

test("scales are clamped so the page cannot be destroyed", () => {
  assert.equal(normalizeTheme({ fontScale: 99 }).fontScale, 1.6);
  assert.equal(normalizeTheme({ fontScale: 0.01 }).fontScale, 0.7);
  assert.equal(normalizeTheme({ sectionGap: -5 }).sectionGap, 0.4);
  assert.equal(normalizeTheme({ fontScale: "not a number" }).fontScale, 1);
});

test("setting a colour back to empty restores the default", () => {
  let cv = applyOps(normalize(SAMPLE), [{ op: "set", path: "theme.nameColor", value: "red" }]).cv;
  cv = applyOps(cv, [{ op: "set", path: "theme.nameColor", value: "" }]).cv;
  assert.equal(cv.theme.nameColor, "");
  assert.doesNotMatch(render(cv), /\.name \{[^}]*color:red/);
});

test("an empty CV and a CV saved before themes existed both render", () => {
  assert.match(render(EMPTY()), /<!doctype html>/);
  const legacy = { ...SAMPLE };
  delete legacy.theme;
  const html = render(legacy);
  assert.match(html, /Elif Demir/);
  assert.equal(normalize(legacy).theme.fontScale, 1);
});

/* ── the content commands the owner listed, driven through applyOps ─────────── */

test("delete an experience entry", () => {
  const before = normalize(SAMPLE);
  const { cv, skipped } = applyOps(before, [{ op: "delete", path: "experience.1" }]);
  assert.deepEqual(skipped, []);
  assert.equal(cv.experience.length, before.experience.length - 1);
  assert.equal(cv.experience[0].company, "Kargo Labs");
});

test("add an experience entry with dates", () => {
  const { cv, skipped } = applyOps(normalize(SAMPLE), [{ op: "append", path: "experience",
    value: { title: "Staff Engineer", company: "Acme", location: "Remote", start: "Jan 2024", end: "Present", bullets: ["Led platform work."] } }]);
  assert.deepEqual(skipped, []);
  const added = cv.experience.at(-1);
  assert.equal(added.company, "Acme");
  assert.equal(added.start, "Jan 2024");
  assert.match(render(cv), /Staff Engineer/);
});

test("add and delete a certification", () => {
  const added = applyOps(normalize(SAMPLE), [{ op: "append", path: "certifications",
    value: { name: "CKA", issuer: "CNCF", year: "2025" } }]).cv;
  assert.equal(added.certifications.length, 2);
  assert.match(render(added), /CKA/);
  const removed = applyOps(added, [{ op: "delete", path: "certifications.0" }]).cv;
  assert.equal(removed.certifications.length, 1);
  assert.equal(removed.certifications[0].name, "CKA");
});

test("change dates on an existing role", () => {
  const { cv, skipped } = applyOps(normalize(SAMPLE), [
    { op: "set", path: "experience.0.start", value: "Feb 2020" },
    { op: "set", path: "experience.0.end", value: "Dec 2025" },
  ]);
  assert.deepEqual(skipped, []);
  assert.equal(cv.experience[0].start, "Feb 2020");
  assert.match(render(cv), /Feb 2020 – Dec 2025/);
});

test("clear the name, which is what 'delete the name' must do", () => {
  const { cv } = applyOps(normalize(SAMPLE), [{ op: "delete", path: "basics.name" }]);
  assert.equal(cv.basics.name, "");
});

test("the photo is passed to the renderer rather than stored on the CV", () => {
  const withPhoto = renderStyled(normalize(SAMPLE), false, { photo: "data:image/png;base64,iVBORw0KGgo=" });
  assert.match(withPhoto, /<img class="pic"/);
  assert.doesNotMatch(render(SAMPLE), /<img class="pic"/);
});

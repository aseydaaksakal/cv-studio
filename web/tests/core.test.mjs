import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY, SAMPLE, applyField, extractJSON, normalize, plainText, renderATS, renderStyled } from "../core.js";

test("normalize fills every section and coerces loose shapes", () => {
  const cv = normalize({ basics: { name: "A" }, skills: [{ group: "x", items: "Go, Python" }], experience: [{ title: "t" }] });
  assert.equal(cv.basics.name, "A");
  assert.deepEqual(cv.basics.links, []);
  assert.deepEqual(cv.skills[0].items, ["Go", "Python"]);
  assert.deepEqual(cv.experience[0].bullets, []);
  assert.equal(cv.summary, "");
  for (const k of ["projects", "certifications", "education", "languages"]) assert.deepEqual(cv[k], []);
});

test("normalize tolerates null and garbage", () => {
  assert.deepEqual(normalize(null), EMPTY());
  assert.deepEqual(normalize({ experience: "nope", skills: 5 }).experience, []);
});

test("extractJSON finds the object inside prose and fences", () => {
  assert.deepEqual(extractJSON('Sure! ```json\n{"a": 1}\n```'), { a: 1 });
  assert.throws(() => extractJSON("no json here"), /did not return JSON/);
});

test("applyField splits list fields and sets scalars", () => {
  const cv = normalize(SAMPLE);
  applyField(cv, "basics.links", "a.com, b.com ,, c.com");
  assert.deepEqual(cv.basics.links, ["a.com", "b.com", "c.com"]);
  applyField(cv, "experience.0.bullets", "one\n\n two \n");
  assert.deepEqual(cv.experience[0].bullets, ["one", "two"]);
  applyField(cv, "skills.0.items", "Go,Rust");
  assert.deepEqual(cv.skills[0].items, ["Go", "Rust"]);
  applyField(cv, "summary", "S");
  assert.equal(cv.summary, "S");
});

test("templates escape HTML from the CV", () => {
  const cv = normalize({ basics: { name: '<script>alert(1)</script>' } });
  for (const html of [renderStyled(cv, false), renderStyled(cv, true), renderATS(cv)]) {
    assert.ok(!html.includes("<script>alert"));
    assert.ok(html.includes("&lt;script&gt;"));
  }
});

test("styled template renders every populated section once", () => {
  const html = renderStyled(normalize(SAMPLE), false, { photo: "data:image/png;base64,AAAA" });
  for (const h of ["Summary", "Work experience", "Skills", "Projects", "Certifications", "Education", "Languages"]) assert.equal(html.split(`<h2>${h}</h2>`).length, 2, h);
  assert.ok(html.includes('class="pic"'));
  assert.ok(html.includes("Elif Demir"));
  assert.ok(html.includes("@page { size: A4"));
});

test("empty sections are omitted, photo omitted when not given", () => {
  const html = renderStyled(normalize({ basics: { name: "X" }, summary: "s" }), true);
  assert.ok(html.includes("<h2>Summary</h2>"));
  assert.ok(!html.includes("<h2>Projects</h2>"));
  assert.ok(!html.includes('class="pic"'));
  assert.ok(html.includes("Liberation Serif"));
});

test("ATS template is plain: no tables, no images, standard headings", () => {
  const html = renderATS(normalize(SAMPLE));
  assert.ok(!html.includes("<table") && !html.includes("<img"));
  assert.ok(html.includes("<h2>Work experience</h2>"));
  assert.ok(html.includes("Kargo Labs"));
});

test("plainText is a faithful, ordered dump", () => {
  const txt = plainText(normalize(SAMPLE));
  const order = ["Elif Demir", "SUMMARY", "WORK EXPERIENCE", "SKILLS", "PROJECTS", "CERTIFICATIONS", "EDUCATION", "LANGUAGES"].map((s) => txt.indexOf(s));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(txt.includes("- Led the split of the checkout monolith"));
  assert.ok(txt.includes("Turkish / Native"));
});

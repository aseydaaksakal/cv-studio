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

test("extractJSON repairs the JSON small local models actually emit", () => {
  // Missing comma between two array items — the failure seen on "ATS-friendly".
  assert.deepEqual(
    extractJSON('{"ops":[{"op":"set","path":"summary","value":"a"}{"op":"delete","path":"basics.phone"}]}'),
    { ops: [{ op: "set", path: "summary", value: "a" }, { op: "delete", path: "basics.phone" }] });
  // Trailing comma before the closing bracket.
  assert.deepEqual(extractJSON('{"ops":[{"op":"set","path":"summary","value":"a"},],"note":"ok"}'),
    { ops: [{ op: "set", path: "summary", value: "a" }], note: "ok" });
  // Missing comma between siblings on separate lines.
  assert.deepEqual(extractJSON('{\n"a": 1\n"b": 2\n}'), { a: 1, b: 2 });
  // Reply truncated mid-object when the model ran out of tokens.
  assert.deepEqual(extractJSON('{"ops":[{"op":"set","path":"summary","value":"half a sentence"}'),
    { ops: [{ op: "set", path: "summary", value: "half a sentence" }] });
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


test("applyOps: set, delete, append, insert, move on a copy", async () => {
  const { applyOps } = await import("../core.js");
  const cv = normalize(SAMPLE);
  const { cv: out, applied, skipped } = applyOps(cv, [
    { op: "set", path: "basics.title", value: "Staff Engineer" },
    { op: "delete", path: "basics.name" },
    { op: "delete", path: "experience.1" },
    { op: "append", path: "projects", value: { name: "rag-eval", description: "d", link: "" } },
    { op: "insert", path: "languages", index: 0, value: { name: "French", level: "A2" } },
    { op: "move", path: "skills", from: 1, to: 0 },
    { op: "delete", path: "experience.0.bullets.0" },
  ]);
  assert.equal(applied, 7); assert.deepEqual(skipped, []);
  assert.equal(out.basics.title, "Staff Engineer");
  assert.equal(out.basics.name, "");
  assert.equal(out.experience.length, 1);
  assert.equal(out.projects.at(-1).name, "rag-eval");
  assert.equal(out.languages[0].name, "French");
  assert.equal(out.skills[0].group, "Platform");
  assert.equal(out.experience[0].bullets.length, 2);
  assert.equal(cv.basics.title, "Senior Backend Engineer", "original untouched");
});

test("applyOps: bad ops are skipped and reported, good ones still apply", async () => {
  const { applyOps } = await import("../core.js");
  const { cv: out, applied, skipped } = applyOps(normalize(SAMPLE), [
    { op: "delete", path: "experience.9" },
    { op: "set", path: "skills", value: "not a list" },
    { op: "teleport", path: "summary" },
    { op: "set", path: "summary", value: "ok" },
  ]);
  assert.equal(applied, 1); assert.equal(skipped.length, 3);
  assert.equal(out.summary, "ok");
});

test("looksDestructive catches a wiped CV unless the user asked for it", async () => {
  const { looksDestructive } = await import("../core.js");
  const before = normalize(SAMPLE);
  const after = normalize({ basics: { name: "" } });
  assert.equal(looksDestructive(before, after, "Elif Demir yazısını sil"), true);
  assert.equal(looksDestructive(before, after, "hepsini sil"), false);
  assert.equal(looksDestructive(before, { ...before, summary: "" }, "özeti sil"), false);
});

test("normalizePath accepts the shapes models actually write", async () => {
  const { normalizePath } = await import("../core.js");
  assert.equal(normalizePath("name"), "basics.name");
  assert.equal(normalizePath("Full Name"), "basics.name");
  assert.equal(normalizePath("cv.basics.email"), "basics.email");
  assert.equal(normalizePath("$.summary"), "summary");
  assert.equal(normalizePath("experience[1].title"), "experience.1.title");
  assert.equal(normalizePath("Work Experience.0"), "experience.0");
  assert.equal(normalizePath("certs.2.year"), "certifications.2.year");
  assert.equal(normalizePath("basics.name"), "basics.name");
});

test("applyOps tolerates loose paths and op names from the model", async () => {
  const { applyOps } = await import("../core.js");
  const { cv, applied, skipped } = applyOps(normalize(SAMPLE), [
    { op: "remove", path: "name" },
    { op: "update", path: "Job Title", value: "Staff Engineer" },
    { op: "add", path: "Projects", value: { name: "x", description: "", link: "" } },
  ]);
  assert.deepEqual(skipped, []);
  assert.equal(applied, 3);
  assert.equal(cv.basics.name, "");
  assert.equal(cv.basics.title, "Staff Engineer");
  assert.equal(cv.projects.at(-1).name, "x");
});

test("a single operation object is accepted, and a truly bad path is reported", async () => {
  const { applyOps } = await import("../core.js");
  assert.equal(applyOps(normalize(SAMPLE), { op: "set", path: "summary", value: "s" }).applied, 1);
  const bad = applyOps(normalize(SAMPLE), [{ op: "set", path: "hobbies.0", value: "x" }]);
  assert.equal(bad.applied, 0);
  assert.match(bad.skipped[0], /hobbies/);
});

test("probeModel grades a model on a known instruction", async () => {
  const { probeModel, PROBE } = await import("../engines.js");
  const { applyOps } = await import("../core.js");

  const good = await probeModel(async () => JSON.stringify({ ops: [{ op: "set", path: "basics.title", value: "Staff Engineer" }], note: "ok" }), "sys", applyOps);
  assert.equal(good.ok, true);
  assert.match(good.detail, /good for editing/);

  const loose = await probeModel(async () => 'Sure! ```json\n{"ops":[{"op":"update","path":"Job Title","value":"Staff Engineer"}]}\n```', "sys", applyOps);
  assert.equal(loose.ok, true, "loose paths and fences still pass");

  const prose = await probeModel(async () => "I have updated the title for you.", "sys", applyOps);
  assert.equal(prose.ok, false);
  assert.match(prose.detail, /not JSON/);

  const empty = await probeModel(async () => JSON.stringify({ ops: [] }), "sys", applyOps);
  assert.equal(empty.ok, false);

  const wrong = await probeModel(async () => JSON.stringify({ ops: [{ op: "set", path: "basics.title", value: "Senior Engineer" }] }), "sys", applyOps);
  assert.equal(wrong.ok, false);
  assert.match(wrong.detail, /Senior Engineer/);

  const collateral = await probeModel(async () => JSON.stringify({ ops: [
    { op: "set", path: "basics.title", value: "Staff Engineer" }, { op: "set", path: "summary", value: "" }] }), "sys", applyOps);
  assert.equal(collateral.ok, false);
  assert.match(collateral.detail, /not asked to change/);

  const dead = await probeModel(async () => { throw new Error("offline"); }, "sys", applyOps);
  assert.equal(dead.ok, false);
  assert.match(dead.detail, /could not be reached/);
  assert.equal(PROBE.cv.basics.title, "Engineer", "the probe CV is not mutated");
});

test("pickForBudget picks the largest model that fits the VRAM budget", async () => {
  const { pickForBudget } = await import("../engines.js");
  const models = [
    ["small", "Qwen 1.5B — ~1.2 GB VRAM"],
    ["mid", "Qwen 7B — ~5.8 GB VRAM"],
    ["big", "Qwen 32B — ~19.0 GB VRAM"],
    ["__custom__", "Other — type an MLC model id"],
  ];
  assert.equal(pickForBudget(models, 8), "mid");
  assert.equal(pickForBudget(models, 25), "big");
  assert.equal(pickForBudget(models, 1), null);
  assert.equal(pickForBudget([["__custom__", "Other"]], 8), null);
});

test("availableLocalModels falls back to the curated list when the catalogue is unreachable", async () => {
  const { availableLocalModels, LOCAL_MODELS } = await import("../engines.js");
  const models = await availableLocalModels();   // no network in the test runner
  assert.deepEqual(models, LOCAL_MODELS);
  assert.equal(models.at(-1)[0], "__custom__");
});

test("in-browser Whisper: language is the best-scoring language token, whatever the rest of the vocabulary says", async () => {
  const { pickLanguage, whisperLangName } = await import("../core.js");
  const langToId = { "<|en|>": 3, "<|tr|>": 5, "<|de|>": 7 };
  const logits = new Float32Array(10).fill(-1);
  logits[0] = 99; /* a non-language token scoring highest must not win */
  logits[3] = 2.5; logits[5] = 4.1; logits[7] = -Infinity;
  assert.equal(pickLanguage(logits, langToId), "tr");
  logits[3] = 8; assert.equal(pickLanguage(logits, langToId), "en");
  assert.equal(pickLanguage(logits, {}), null);
  assert.equal(pickLanguage(logits, undefined), null);
  assert.equal(pickLanguage(logits, { "<|xx|>": 42 }), null); /* id outside the logits → ignored */
  assert.equal(whisperLangName("tr"), "Türkçe"); assert.equal(whisperLangName("en"), "English"); assert.equal(whisperLangName("yo"), "yo");
});

test("audio helpers: stereo is averaged to mono, silence is detected", async () => {
  const { peakLevel, toMono } = await import("../core.js");
  const l = new Float32Array([0.2, -0.4]), r = new Float32Array([0.6, 0]);
  assert.deepEqual(Array.from(toMono([l, r])).map((x) => +x.toFixed(3)), [0.4, -0.2]);
  assert.equal(toMono([l]), l);
  assert.equal(+peakLevel(toMono([l, r])).toFixed(3), 0.4);
  assert.equal(peakLevel(new Float32Array(100)), 0);
});

test("local Whisper model ids: only the offered models, anything else falls back to small", async () => {
  const { LOCAL_WHISPER, localWhisperId } = await import("../engines.js");
  assert.equal(localWhisperId("onnx-community/whisper-base"), "onnx-community/whisper-base");
  assert.equal(localWhisperId(undefined), "onnx-community/whisper-small");
  assert.equal(localWhisperId("evil/../x"), "onnx-community/whisper-small");
  assert.ok(LOCAL_WHISPER.length >= 2);
});

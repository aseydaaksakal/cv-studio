import test from "node:test";
import assert from "node:assert";
import { SAMPLE, applyOps, EMPTY } from "../core.js";

test("CV text edits - Change name", () => {
  const cv = { ...SAMPLE };
  const instruction = "Change the name from Elif Demir to Abdullah Seyda";

  // Simulate model's response for changing name
  const ops = [
    { op: "set", path: "basics.name", value: "Abdullah Seyda" }
  ];

  const { cv: result } = applyOps(cv, ops);
  assert.strictEqual(result.basics.name, "Abdullah Seyda");
  assert.ok(result.basics.name !== "Elif Demir");
});

test("CV text edits - Change title", () => {
  const cv = { ...SAMPLE };
  const ops = [
    { op: "set", path: "basics.title", value: "Full Stack Engineer" }
  ];

  const { cv: result } = applyOps(cv, ops);
  assert.strictEqual(result.basics.title, "Full Stack Engineer");
});

test("CV text edits - Change location", () => {
  const cv = { ...SAMPLE };
  const ops = [
    { op: "set", path: "basics.location", value: "Istanbul, Turkey" }
  ];

  const { cv: result } = applyOps(cv, ops);
  assert.strictEqual(result.basics.location, "Istanbul, Turkey");
});

test("CV text edits - Change email", () => {
  const cv = { ...SAMPLE };
  const ops = [
    { op: "set", path: "basics.email", value: "abdullah@example.com" }
  ];

  const { cv: result } = applyOps(cv, ops);
  assert.strictEqual(result.basics.email, "abdullah@example.com");
});

test("CV text edits - Modify summary (shorten)", () => {
  const cv = { ...SAMPLE };
  const ops = [
    { op: "set", path: "summary", value: "Full-stack engineer with expertise in building scalable systems." }
  ];

  const { cv: result } = applyOps(cv, ops);
  assert.ok(result.summary.length < SAMPLE.summary.length);
  assert.strictEqual(result.summary, "Full-stack engineer with expertise in building scalable systems.");
});

test("CV text edits - Add new link", () => {
  const cv = { ...SAMPLE };
  const ops = [
    { op: "append", path: "basics.links", value: "twitter.com/user" }
  ];

  const { cv: result } = applyOps(cv, ops);
  assert.ok(result.basics.links.includes("twitter.com/user"));
  assert.strictEqual(result.basics.links.length, SAMPLE.basics.links.length + 1);
});

test("CV edits - Add new experience entry", () => {
  const cv = { ...SAMPLE };
  const ops = [
    { op: "append", path: "experience", value: {
      title: "Software Engineer",
      company: "TechCorp",
      location: "Istanbul",
      start: "Jan 2023",
      end: "Present",
      bullets: ["Built microservices", "Mentored junior developers"]
    }}
  ];

  const { cv: result } = applyOps(cv, ops);
  assert.strictEqual(result.experience.length, SAMPLE.experience.length + 1);
  assert.strictEqual(result.experience[result.experience.length - 1].company, "TechCorp");
});

test("CV edits - Add new skill group", () => {
  const cv = { ...SAMPLE };
  const ops = [
    { op: "append", path: "skills", value: {
      group: "Soft Skills",
      items: ["Leadership", "Communication", "Problem Solving"]
    }}
  ];

  const { cv: result } = applyOps(cv, ops);
  assert.ok(result.skills.some(s => s.group === "Soft Skills"));
});

test("CV edits - Add new project", () => {
  const cv = { ...SAMPLE };
  const ops = [
    { op: "append", path: "projects", value: {
      name: "AI Assistant",
      description: "Built an intelligent assistant using Claude API",
      link: "github.com/user/ai-assistant"
    }}
  ];

  const { cv: result } = applyOps(cv, ops);
  assert.strictEqual(result.projects.length, SAMPLE.projects.length + 1);
  assert.ok(result.projects.some(p => p.name === "AI Assistant"));
});

test("CV edits - Add education", () => {
  const cv = { ...SAMPLE };
  const ops = [
    { op: "append", path: "education", value: {
      degree: "Master's in Computer Science",
      school: "Istanbul Technical University",
      year: "2020"
    }}
  ];

  const { cv: result } = applyOps(cv, ops);
  assert.strictEqual(result.education.length, SAMPLE.education.length + 1);
});

test("CV edits - Add language", () => {
  const cv = { ...SAMPLE };
  const ops = [
    { op: "append", path: "languages", value: {
      name: "Arabic",
      level: "B2"
    }}
  ];

  const { cv: result } = applyOps(cv, ops);
  assert.ok(result.languages.some(l => l.name === "Arabic"));
});

test("CV edits - Delete experience entry", () => {
  const cv = { ...SAMPLE };
  const ops = [
    { op: "delete", path: "experience.0" }
  ];

  const { cv: result } = applyOps(cv, ops);
  assert.strictEqual(result.experience.length, SAMPLE.experience.length - 1);
});

test("CV edits - Delete bullet point", () => {
  const cv = { ...SAMPLE };
  const originalBullets = cv.experience[0].bullets.length;
  const ops = [
    { op: "delete", path: "experience.0.bullets.0" }
  ];

  const { cv: result } = applyOps(cv, ops);
  assert.strictEqual(result.experience[0].bullets.length, originalBullets - 1);
});

test("CV edits - Edit bullet point", () => {
  const cv = { ...SAMPLE };
  const ops = [
    { op: "set", path: "experience.0.bullets.0", value: "Redesigned the entire checkout flow increasing conversion by 30%" }
  ];

  const { cv: result } = applyOps(cv, ops);
  assert.ok(result.experience[0].bullets[0].includes("conversion"));
});

test("CV edits - Expand skills list", () => {
  const cv = { ...SAMPLE };
  const ops = [
    { op: "set", path: "skills.0.items", value: ["Go", "Python", "SQL", "TypeScript", "Rust", "Java"] }
  ];

  const { cv: result } = applyOps(cv, ops);
  assert.strictEqual(result.skills[0].items.length, 6);
});

test("CV edits - Reorder experience (move)", () => {
  const cv = { ...SAMPLE };
  if (cv.experience.length >= 2) {
    const ops = [
      { op: "move", path: "experience", from: 0, to: 1 }
    ];

    const { cv: result } = applyOps(cv, ops);
    // The companies should be swapped
    assert.notStrictEqual(result.experience[0].company, cv.experience[0].company);
  }
});

test("CV edits - Add phone number", () => {
  const cv = { ...EMPTY() };
  cv.basics.name = "Test User";
  const ops = [
    { op: "set", path: "basics.phone", value: "+90 555 123 4567" }
  ];

  const { cv: result } = applyOps(cv, ops);
  assert.strictEqual(result.basics.phone, "+90 555 123 4567");
});

test("CV edits - Multiple changes in one batch", () => {
  const cv = { ...SAMPLE };
  const ops = [
    { op: "set", path: "basics.name", value: "Abdullah Seyda" },
    { op: "set", path: "basics.title", value: "Senior Engineer" },
    { op: "set", path: "basics.location", value: "Istanbul" },
    { op: "append", path: "basics.links", value: "github.com/new" }
  ];

  const { cv: result } = applyOps(cv, ops);
  assert.strictEqual(result.basics.name, "Abdullah Seyda");
  assert.strictEqual(result.basics.title, "Senior Engineer");
  assert.strictEqual(result.basics.location, "Istanbul");
  assert.ok(result.basics.links.includes("github.com/new"));
});

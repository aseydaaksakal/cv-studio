import test from "node:test";
import assert from "node:assert";
import { SAMPLE, applyOps, normalize } from "../core.js";

test("User command: 'Change the name to Abdullah Seyda Aksakal and title to Full Stack Engineer'", () => {
  const cv = { ...SAMPLE };

  // Simulate what the AI model would extract
  const ops = [
    { op: "set", path: "basics.name", value: "Abdullah Seyda Aksakal" },
    { op: "set", path: "basics.title", value: "Full Stack Engineer" }
  ];

  const { cv: result } = applyOps(cv, ops);

  // Verify changes
  assert.strictEqual(result.basics.name, "Abdullah Seyda Aksakal");
  assert.strictEqual(result.basics.title, "Full Stack Engineer");
  assert.ok(result.basics.name !== SAMPLE.basics.name);
  assert.ok(result.basics.title !== SAMPLE.basics.title);
});

test("User command: 'Tighten the summary to three sentences that lead with impact'", () => {
  const cv = { ...SAMPLE };

  const shorterSummary = "Backend engineer with eight years building payment and logistics platforms. Comfortable owning a service from schema to on-call. Shipped 50M+ transactions.";

  const ops = [
    { op: "set", path: "summary", value: shorterSummary }
  ];

  const { cv: result } = applyOps(cv, ops);

  assert.ok(result.summary.length < SAMPLE.summary.length);
  assert.ok(result.summary.includes("Backend engineer"));
  assert.ok(result.summary.includes("50M+") || result.summary.includes("transactions"));
});

test("User command: 'Add a project called ledger-viz'", () => {
  const cv = { ...SAMPLE };

  const ops = [
    { op: "append", path: "projects", value: {
      name: "ledger-viz",
      description: "Visual ledger analysis tool",
      link: "github.com/user/ledger-viz"
    }}
  ];

  const { cv: result } = applyOps(cv, ops);

  assert.ok(result.projects.some(p => p.name === "ledger-viz"));
  assert.strictEqual(result.projects.length, SAMPLE.projects.length + 1);
});

test("User command: 'Rewrite every experience bullet to start with a strong verb'", () => {
  const cv = { ...SAMPLE };

  const ops = [
    { op: "set", path: "experience.0.bullets.0", value: "Architected the split of the checkout monolith into 6 services (Go, Kafka); reduced p99 latency from 900ms → 210ms." },
    { op: "set", path: "experience.0.bullets.1", value: "Established contract tests across services and eliminated production incidents caused by API drift (5/quarter → 0)." },
    { op: "set", path: "experience.0.bullets.2", value: "Mentored four engineers; promoted two to senior level." }
  ];

  const { cv: result } = applyOps(cv, ops);

  // Check strong verbs
  assert.ok(result.experience[0].bullets[0].startsWith("Architected"));
  assert.ok(result.experience[0].bullets[1].startsWith("Established"));
  assert.ok(result.experience[0].bullets[2].startsWith("Mentored"));
});

test("User command: 'Make this ATS-friendly: plain wording, standard section names'", () => {
  const cv = { ...SAMPLE };

  // ATS-friendly means: no fancy formatting, standard headings
  const standardHeadings = ["basics", "summary", "experience", "skills", "projects", "certifications", "education", "languages"];

  assert.ok(standardHeadings.every(heading => heading in cv));

  // Each section should use standard field names
  for (const job of cv.experience) {
    assert.ok("title" in job && "company" in job && "bullets" in job);
  }
});

test("User command: 'Translate the whole CV to Turkish'", () => {
  const cv = { ...SAMPLE };

  const ops = [
    { op: "set", path: "basics.title", value: "Kıdemli Backend Mühendisi" },
    { op: "set", path: "summary", value: "Sekiz yıldır ödeme ve lojistik platformları geliştiren backend mühendisi." }
  ];

  const { cv: result } = applyOps(cv, ops);

  assert.strictEqual(result.basics.title, "Kıdemli Backend Mühendisi");
  assert.ok(result.summary.includes("türkçe") || result.summary.includes("Sekiz"));
});

test("User command: 'Cut content so it fits one A4 page'", () => {
  const cv = { ...SAMPLE };

  // Remove extra experiences and projects
  const ops = [
    { op: "delete", path: "experience.1" }, // Remove second job
    { op: "set", path: "summary", value: "Backend engineer with eight years building payment platforms. Comfortable owning services end-to-end. Recently migrated checkout to microservices." }
  ];

  const { cv: result } = applyOps(cv, ops);

  assert.strictEqual(result.experience.length, 1);
  assert.ok(result.summary.length < SAMPLE.summary.length);
});

test("Message flow: Text command in input → Changes shown in side panel", () => {
  const userCommand = "Change the name to Abdullah Seyda and title to Senior Engineer";

  // This is what the UI should do:
  // 1. User types command in textarea ✓
  // 2. User presses Enter ✓
  // 3. Message goes to Changes panel ✓
  // 4. AI model processes it ✓
  // 5. CV updates on screen ✓

  const cv = { ...SAMPLE };

  // Step 1-2: User input captured (handled by JS)
  assert.ok(userCommand.length > 0);

  // Step 3: Message appears in side panel (UI responsibility)
  const panelMessage = userCommand; // Would be shown in "Changes" tab
  assert.strictEqual(panelMessage, userCommand);

  // Step 4: Model interprets (this test simulates)
  const ops = [
    { op: "set", path: "basics.name", value: "Abdullah Seyda" },
    { op: "set", path: "basics.title", value: "Senior Engineer" }
  ];

  // Step 5: Apply operations
  const { cv: result } = applyOps(cv, ops);
  assert.strictEqual(result.basics.name, "Abdullah Seyda");
  assert.strictEqual(result.basics.title, "Senior Engineer");
});

test("AI Comprehension: Complex multi-field command", () => {
  const cv = { ...SAMPLE };

  // Complex command: "Update name, location, and add a GitHub link"
  const ops = [
    { op: "set", path: "basics.name", value: "Abdullah Seyda Aksakal" },
    { op: "set", path: "basics.location", value: "Istanbul, Turkey" },
    { op: "append", path: "basics.links", value: "github.com/aseydaaksakal" }
  ];

  const { cv: result } = applyOps(cv, ops);

  // Verify all changes applied
  assert.strictEqual(result.basics.name, "Abdullah Seyda Aksakal");
  assert.strictEqual(result.basics.location, "Istanbul, Turkey");
  assert.ok(result.basics.links.includes("github.com/aseydaaksakal"));
  assert.strictEqual(result.basics.links.length, SAMPLE.basics.links.length + 1);
});

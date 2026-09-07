export const VOICE_LANGS = [
  ["tr-TR", "Türkçe"], ["en-US", "English (US)"], ["en-GB", "English (UK)"], ["de-DE", "Deutsch"], ["fr-FR", "Français"],
  ["es-ES", "Español"], ["es-MX", "Español (México)"], ["pt-BR", "Português (Brasil)"], ["pt-PT", "Português"], ["it-IT", "Italiano"],
  ["nl-NL", "Nederlands"], ["ru-RU", "Русский"], ["uk-UA", "Українська"], ["pl-PL", "Polski"], ["ar-SA", "العربية"],
  ["fa-IR", "فارسی"], ["hi-IN", "हिन्दी"], ["bn-BD", "বাংলা"], ["ur-PK", "اردو"], ["id-ID", "Bahasa Indonesia"],
  ["zh-CN", "中文 (简体)"], ["zh-TW", "中文 (繁體)"], ["ja-JP", "日本語"], ["ko-KR", "한국어"], ["vi-VN", "Tiếng Việt"],
  ["th-TH", "ไทย"], ["sv-SE", "Svenska"], ["el-GR", "Ελληνικά"], ["he-IL", "עברית"], ["az-AZ", "Azərbaycan"],
];

/** Best default for the speech recogniser: the user's saved choice, else a Turkish or matching browser locale. */
export function defaultVoiceLang(saved, navigatorLanguage) {
  if (saved && VOICE_LANGS.some(([c]) => c === saved)) return saved;
  const nav = (navigatorLanguage || "en-US");
  const exact = VOICE_LANGS.find(([c]) => c.toLowerCase() === nav.toLowerCase());
  if (exact) return exact[0];
  const prefix = VOICE_LANGS.find(([c]) => c.split("-")[0] === nav.split("-")[0]);
  return prefix ? prefix[0] : "en-US";
}

/* Pure logic for CV Studio web: no DOM, no network. Tested with node:test. */

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ───────────────────────── schema ───────────────────────── */

export const EMPTY = () => ({
  basics: { name: "", title: "", location: "", phone: "", email: "", links: [] },
  summary: "",
  experience: [],
  skills: [],
  projects: [],
  certifications: [],
  education: [],
  languages: [],
});

export const SCHEMA_DOC = `{
  "basics": {"name": "", "title": "", "location": "", "phone": "", "email": "", "links": ["github.com/x"]},
  "summary": "2-4 sentences",
  "experience": [{"title": "", "company": "", "location": "", "start": "Jan 2020", "end": "Present", "bullets": ["…"]}],
  "skills": [{"group": "Core", "items": ["…"]}],
  "projects": [{"name": "", "description": "", "link": ""}],
  "certifications": [{"name": "", "issuer": "", "year": ""}],
  "education": [{"degree": "", "school": "", "year": ""}],
  "languages": [{"name": "", "level": ""}]
}`;

export const SAMPLE = {
  basics: { name: "Elif Demir", title: "Senior Backend Engineer", location: "Berlin, Germany", phone: "+49 30 000 0000", email: "elif@example.com", links: ["github.com/elifdemir", "linkedin.com/in/elifdemir"] },
  summary: "Backend engineer with eight years building payment and logistics platforms. Comfortable owning a service from schema to on-call. Recently moved a monolith's checkout path onto event-driven services without a customer-visible incident.",
  experience: [
    { title: "Senior Backend Engineer", company: "Kargo Labs", location: "Berlin", start: "Mar 2021", end: "Present",
      bullets: ["Led the split of the checkout monolith into 6 services (Go, Kafka); p99 latency 900ms → 210ms.", "Introduced contract tests and cut production incidents caused by API drift from 5/quarter to 0.", "Mentored four engineers; two promoted to senior."] },
    { title: "Backend Engineer", company: "PayFlow", location: "Istanbul", start: "Jun 2017", end: "Feb 2021",
      bullets: ["Built the reconciliation pipeline processing 2M transactions/day (Python, PostgreSQL).", "Reduced settlement report generation from 40 minutes to 90 seconds by moving to incremental aggregation."] },
  ],
  skills: [
    { group: "Languages", items: ["Go", "Python", "SQL", "TypeScript"] },
    { group: "Platform", items: ["Kubernetes", "Kafka", "PostgreSQL", "Redis", "AWS", "Terraform"] },
  ],
  projects: [{ name: "ledger-diff", description: "Open-source tool that diffs two ledgers and explains every discrepancy.", link: "github.com/elifdemir/ledger-diff" }],
  certifications: [{ name: "AWS Solutions Architect – Associate", issuer: "Amazon Web Services", year: "2023" }],
  education: [{ degree: "B.Sc. Computer Engineering", school: "Boğaziçi University", year: "2017" }],
  languages: [{ name: "Turkish", level: "Native" }, { name: "English", level: "C1" }, { name: "German", level: "B1" }],
};


export function normalize(cv) {
  const base = EMPTY();
  const out = { ...base, ...(cv || {}) };
  out.basics = { ...base.basics, ...(cv?.basics || {}) };
  out.basics.links = Array.isArray(out.basics.links) ? out.basics.links.map(String) : [];
  for (const k of ["experience", "skills", "projects", "certifications", "education", "languages"]) if (!Array.isArray(out[k])) out[k] = [];
  out.experience = out.experience.map((e) => ({ title: "", company: "", location: "", start: "", end: "", ...e, bullets: Array.isArray(e.bullets) ? e.bullets.map(String) : [] }));
  out.skills = out.skills.map((s) => ({ group: "", ...s, items: Array.isArray(s.items) ? s.items.map(String) : String(s.items || "").split(",").map((x) => x.trim()).filter(Boolean) }));
  out.summary = String(out.summary || "");
  return out;
}

export function extractJSON(text) {
  const start = text.indexOf("{"); const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("The model did not return JSON.");
  return JSON.parse(text.slice(start, end + 1));
}

export const SYSTEM_PARSE = `You convert CV/résumé text into JSON. Reply with ONLY a JSON object matching this shape, no prose, no markdown fences:\n${SCHEMA_DOC}\nRules: keep the original language; keep every fact, date, number and name exactly; never invent anything; if a field is unknown use "" or []; put unlabelled contact lines into basics.links.`;

export const SYSTEM_EDIT = `You edit a CV stored as JSON. You receive the current JSON and an instruction. Reply with ONLY a JSON object of the form {"cv": <the complete updated CV in the same shape>, "note": "<one short sentence saying what you changed, in the user's language>"} — no prose, no markdown fences. Rules: change only what the instruction requires; never invent employers, dates, metrics or credentials; keep the person's language unless told to translate; when asked to shorten, cut the weakest content first; keep order stable unless asked to reorder. The instruction may be a speech-to-text transcript in any language, possibly with recognition errors, mixed languages or missing punctuation: infer the intent and act on it. If the instruction is not about the CV, return the CV unchanged and explain in "note".`;

/** Fill in a field by dotted path; list-ish fields are split from text. Mutates and returns cv. */
export function applyField(cv, path, value) {
  const parts = path.split(".");
  let obj = cv;
  for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
  const last = parts[parts.length - 1];
  if (path === "basics.links" || last === "items") obj[last] = value.split(",").map((s) => s.trim()).filter(Boolean);
  else if (last === "bullets") obj[last] = value.split("\n").map((s) => s.trim()).filter(Boolean);
  else obj[last] = value;
  return cv;
}

function lineJoin(parts, sep = " | ") { return parts.filter(Boolean).map(esc).join(sep); }

/* ───────────────────────── templates ───────────────────────── */

export const BASE_CSS = (serif) => `
  @page { size: A4; margin: 12mm 14mm; }
  html,body { margin:0; padding:0; background:#fff; color:#000; }
  body { font-family: ${serif ? "'Liberation Serif','Times New Roman',Times,serif" : "'Liberation Sans',Helvetica,Arial,sans-serif"}; font-size:${serif ? "9.4pt" : "8.8pt"}; line-height:1.36; padding:12mm 14mm; }
  @media print { body { padding:0; } }
  .hdr { display:flex; gap:12pt; align-items:flex-start; margin-bottom:14pt; }
  .pic { width:64pt; height:64pt; border-radius:50%; object-fit:cover; flex:none; }
  .name { font-size:${serif ? "19pt" : "18pt"}; line-height:1.15; }
  .role { font-weight:bold; margin-top:2pt; } .contact { margin-top:3pt; }
  h2 { font-size:${serif ? "9.6pt" : "9.2pt"}; letter-spacing:.02em; margin:0 0 6pt; padding-bottom:3pt; border-bottom:.6pt solid #000; text-transform:uppercase; }
  .sec { margin-bottom:12pt; } p { margin:0 0 5pt; } .tight p { margin-bottom:4pt; }
  .job { margin-bottom:6pt; } .job .jh { display:flex; justify-content:space-between; gap:8pt; } .job .jh b { font-weight:bold; }
  ul { margin:2pt 0 0 12pt; padding:0; } li { margin-bottom:1.5pt; }
  .dot { margin:0 5pt; }
`;
export const ATS_CSS = `@page { size:A4; margin:16mm; } body { font-family: Arial, Helvetica, sans-serif; font-size:10pt; line-height:1.4; color:#000; padding:16mm; margin:0; } @media print { body{padding:0} } h1{font-size:16pt;margin:0 0 2pt} h2{font-size:11pt;margin:14pt 0 4pt;text-transform:uppercase} p{margin:0 0 4pt} ul{margin:2pt 0 4pt 16pt;padding:0} .sub{font-weight:bold}`;


export function renderStyled(cv, serif, { photo = null } = {}) {
  const b = cv.basics;
  const contact = lineJoin([b.location, b.phone, b.email, ...b.links], "  |  ");
  const head = `<div class="hdr">${photo ? `<img class="pic" src="${photo}" alt="">` : ""}<div><div class="name">${esc(b.name)}</div><div class="role">${esc(b.title)}</div><div class="contact">${contact}</div></div></div>`;
  let h = head;
  if (cv.summary) h += `<div class="sec"><h2>Summary</h2><p>${esc(cv.summary)}</p></div>`;
  if (cv.experience.length) {
    h += `<div class="sec"><h2>Work experience</h2>` + cv.experience.map((e) => `<div class="job"><div class="jh"><span><b>${esc(e.title)}</b>${e.company ? " — " + esc(e.company) : ""}${e.location ? ", " + esc(e.location) : ""}</span><span>${lineJoin([e.start, e.end], " – ")}</span></div>${e.bullets.length ? "<ul>" + e.bullets.map((x) => `<li>${esc(x)}</li>`).join("") + "</ul>" : ""}</div>`).join("") + `</div>`;
  }
  if (cv.skills.length) h += `<div class="sec"><h2>Skills</h2>` + cv.skills.map((s) => `<p><b>${esc(s.group)}:</b> ${s.items.map(esc).join(" <span class='dot'>·</span> ")}</p>`).join("") + `</div>`;
  if (cv.projects.length) h += `<div class="sec tight"><h2>Projects</h2>` + cv.projects.map((p) => `<p><b>${esc(p.name)}</b> — ${esc(p.description)}${p.link ? " " + esc(p.link) : ""}</p>`).join("") + `</div>`;
  if (cv.certifications.length) h += `<div class="sec tight"><h2>Certifications</h2>` + cv.certifications.map((c) => `<p><b>${esc(c.name)}</b> / ${lineJoin([c.issuer, c.year], " / ")}</p>`).join("") + `</div>`;
  if (cv.education.length) h += `<div class="sec tight"><h2>Education</h2>` + cv.education.map((e) => `<p><b>${esc(e.school)}</b> — ${lineJoin([e.degree, e.year], " / ")}</p>`).join("") + `</div>`;
  if (cv.languages.length) h += `<div class="sec"><h2>Languages</h2><p>${cv.languages.map((l) => `<b>${esc(l.name)}</b> / ${esc(l.level)}`).join(" <span class='dot'>·</span> ")}</p></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS(serif)}</style></head><body>${h}</body></html>`;
}
export function renderATS(cv) {
  const b = cv.basics;
  let h = `<h1>${esc(b.name)}</h1><p><b>${esc(b.title)}</b></p><p>${lineJoin([b.location, b.phone, b.email, ...b.links])}</p>`;
  if (cv.summary) h += `<h2>Summary</h2><p>${esc(cv.summary)}</p>`;
  if (cv.experience.length) h += `<h2>Work experience</h2>` + cv.experience.map((e) => `<p class="sub">${esc(e.title)}${e.company ? " — " + esc(e.company) : ""}</p><p>${lineJoin([e.location, [e.start, e.end].filter(Boolean).join(" – ")])}</p>${e.bullets.length ? "<ul>" + e.bullets.map((x) => `<li>${esc(x)}</li>`).join("") + "</ul>" : ""}`).join("");
  if (cv.skills.length) h += `<h2>Skills</h2>` + cv.skills.map((s) => `<p><b>${esc(s.group)}:</b> ${s.items.map(esc).join(", ")}</p>`).join("");
  if (cv.projects.length) h += `<h2>Projects</h2>` + cv.projects.map((p) => `<p><b>${esc(p.name)}</b> — ${esc(p.description)} ${esc(p.link)}</p>`).join("");
  if (cv.certifications.length) h += `<h2>Certifications</h2>` + cv.certifications.map((c) => `<p>${lineJoin([c.name, c.issuer, c.year], ", ")}</p>`).join("");
  if (cv.education.length) h += `<h2>Education</h2>` + cv.education.map((e) => `<p><b>${esc(e.degree)}</b> — ${lineJoin([e.school, e.year])}</p>`).join("");
  if (cv.languages.length) h += `<h2>Languages</h2><p>${cv.languages.map((l) => `<b>${esc(l.name)}</b> / ${esc(l.level)}`).join(" · ")}</p>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${ATS_CSS}</style></head><body>${h}</body></html>`;
}
export function plainText(cv) {
  const b = cv.basics, L = [b.name, b.title, [b.location, b.phone, b.email, ...b.links].filter(Boolean).join(" | "), ""];
  if (cv.summary) L.push("SUMMARY", cv.summary, "");
  if (cv.experience.length) { L.push("WORK EXPERIENCE"); for (const e of cv.experience) { L.push(`${e.title}${e.company ? " — " + e.company : ""} (${[e.start, e.end].filter(Boolean).join(" – ")})`); for (const x of e.bullets) L.push("- " + x); } L.push(""); }
  if (cv.skills.length) { L.push("SKILLS"); for (const s of cv.skills) L.push(`${s.group}: ${s.items.join(", ")}`); L.push(""); }
  if (cv.projects.length) { L.push("PROJECTS"); for (const p of cv.projects) L.push(`${p.name} — ${p.description} ${p.link}`.trim()); L.push(""); }
  if (cv.certifications.length) { L.push("CERTIFICATIONS"); for (const c of cv.certifications) L.push([c.name, c.issuer, c.year].filter(Boolean).join(", ")); L.push(""); }
  if (cv.education.length) { L.push("EDUCATION"); for (const e of cv.education) L.push([e.degree, e.school, e.year].filter(Boolean).join(" — ")); L.push(""); }
  if (cv.languages.length) L.push("LANGUAGES", cv.languages.map((l) => `${l.name} / ${l.level}`).join(" · "));
  return L.join("\n");
}
export function download(name, content, type = "text/plain") {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}


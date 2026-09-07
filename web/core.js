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

/* ───────────────────────── in-browser Whisper helpers ───────────────────────── */

/** Names for the codes Whisper can emit; anything else is shown as the code itself. */
const WHISPER_NAMES = {
  tr: "Türkçe", en: "English", de: "Deutsch", fr: "Français", es: "Español", pt: "Português", it: "Italiano", nl: "Nederlands", ru: "Русский",
  uk: "Українська", pl: "Polski", ar: "العربية", fa: "فارسی", hi: "हिन्दी", bn: "বাংলা", ur: "اردو", id: "Bahasa Indonesia", zh: "中文",
  ja: "日本語", ko: "한국어", vi: "Tiếng Việt", th: "ไทย", sv: "Svenska", el: "Ελληνικά", he: "עברית", az: "Azərbaycan", kk: "Қазақша",
  ro: "Română", hu: "Magyar", cs: "Čeština", da: "Dansk", fi: "Suomi", no: "Norsk", bg: "Български", sr: "Српски", hr: "Hrvatski",
  ms: "Bahasa Melayu", ta: "தமிழ்", te: "తెలుగు", sw: "Kiswahili", ku: "Kurdî",
};
export const whisperLangName = (code) => WHISPER_NAMES[code] || code;

/**
 * Language detection for Whisper: given the decoder's logits for the token right after <|startoftranscript|>
 * and the model's lang_to_id map ("<|tr|>" → id), return the most probable language code.
 * Pure so it can be unit-tested; the model call that produces the logits lives in engines.js.
 */
export function pickLanguage(logits, langToId) {
  let best = null, bestScore = -Infinity;
  for (const [token, id] of Object.entries(langToId || {})) {
    const s = logits[id];
    if (typeof s === "number" && s > bestScore) { bestScore = s; best = token.replace(/^<\||\|>$/g, ""); }
  }
  return best;
}

/** Mix a set of channels into one Float32Array (what Whisper wants). */
export function toMono(channels) {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length, out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] / channels.length;
  return out;
}

/** Peak level of a clip; used to tell the user when the microphone delivered silence. */
export function peakLevel(samples) { let p = 0; for (let i = 0; i < samples.length; i++) { const a = Math.abs(samples[i]); if (a > p) p = a; } return p; }

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

export const SYSTEM_EDIT = `You edit a CV stored as JSON by emitting small operations. You receive the current CV JSON and an instruction (possibly a speech transcript in any language, possibly with recognition errors — infer the intent). Reply with ONLY a JSON object:
{"ops": [ ... ], "note": "<one short sentence in the user's language saying what you changed>"}
Allowed operations:
  {"op":"set","path":"<dotted path>","value":<new value>}          e.g. {"op":"set","path":"basics.title","value":"Staff Engineer"}
  {"op":"delete","path":"<dotted path>"}                             e.g. {"op":"delete","path":"experience.1"} or {"op":"delete","path":"basics.phone"}
  {"op":"append","path":"<list path>","value":<item>}                e.g. {"op":"append","path":"projects","value":{"name":"rag-eval","description":"...","link":""}}
  {"op":"insert","path":"<list path>","index":<n>,"value":<item>}
  {"op":"move","path":"<list path>","from":<i>,"to":<j>}
Paths: basics.name, basics.title, basics.location, basics.phone, basics.email, basics.links (list of strings), summary, experience (list of {title,company,location,start,end,bullets}), experience.0.bullets.2, skills (list of {group,items}), projects (list of {name,description,link}), certifications (list of {name,issuer,year}), education (list of {degree,school,year}), languages (list of {name,level}).
Rules: emit the fewest operations that fulfil the instruction; never invent employers, dates, numbers or credentials; keep the CV's language unless asked to translate; when translating, set each text field with its translation; when asked to shorten, delete the weakest bullets or shorten the summary. If the instruction is unclear or not about the CV, reply {"ops":[],"note":"<why>"}. No prose, no markdown fences.`;

const LIST_KEYS = new Set(["links", "bullets", "items", "experience", "skills", "projects", "certifications", "education", "languages"]);

function resolve(cv, path) {
  const parts = String(path).split(".");
  let obj = cv;
  for (let i = 0; i < parts.length - 1; i++) { if (obj == null) return [null, null]; obj = obj[parts[i]]; }
  const last = parts[parts.length - 1];
  return [obj, /^\d+$/.test(last) ? Number(last) : last];
}

/**
 * Apply model-emitted operations to a copy of the CV. Unknown or malformed
 * operations are skipped and reported, never applied half-way.
 * @returns {{cv: object, applied: number, skipped: string[]}}
 */
export function applyOps(cv, ops) {
  const next = structuredClone(cv);
  let applied = 0; const skipped = [];
  for (const op of Array.isArray(ops) ? ops : []) {
    try {
      const [parent, key] = resolve(next, op.path || "");
      if (parent == null || key === "" || key == null) throw new Error("bad path");
      if (op.op === "set") {
        if (LIST_KEYS.has(key) && !Array.isArray(op.value)) throw new Error(`${key} needs a list`);
        parent[key] = op.value;
      } else if (op.op === "delete") {
        if (Array.isArray(parent) && typeof key === "number") { if (key >= parent.length) throw new Error("index out of range"); parent.splice(key, 1); }
        else if (Array.isArray(parent[key])) parent[key] = [];
        else if (typeof parent[key] === "object" && parent[key] !== null) throw new Error("cannot delete an object; delete its fields");
        else parent[key] = "";
      } else if (op.op === "append" || op.op === "insert") {
        const list = parent[key];
        if (!Array.isArray(list)) throw new Error(`${key} is not a list`);
        const at = op.op === "append" ? list.length : Math.max(0, Math.min(list.length, Number(op.index) || 0));
        list.splice(at, 0, op.value);
      } else if (op.op === "move") {
        const list = parent[key];
        if (!Array.isArray(list)) throw new Error(`${key} is not a list`);
        const from = Number(op.from), to = Number(op.to);
        if (!(from in list) || to < 0 || to >= list.length) throw new Error("bad move indices");
        const [item] = list.splice(from, 1); list.splice(to, 0, item);
      } else throw new Error(`unknown op ${op.op}`);
      applied++;
    } catch (e) { skipped.push(`${JSON.stringify(op).slice(0, 80)} — ${e.message}`); }
  }
  return { cv: normalize(next), applied, skipped };
}

/** Count how much content a CV holds, to catch a model that wiped it. */
export function contentSize(cv) {
  const c = normalize(cv);
  return [c.basics.name, c.basics.title, c.summary].join("").length
    + ["experience", "skills", "projects", "certifications", "education", "languages"].reduce((n, k) => n + JSON.stringify(c[k]).length, 0);
}

/** True when an edit destroyed most of the CV although the instruction did not ask to clear it. */
export function looksDestructive(before, after, instruction) {
  const b = contentSize(before), a = contentSize(after);
  if (b < 200) return false;
  const wipeWords = /\b(clear|delete everything|remove everything|start over|hepsini sil|tümünü sil|her şeyi sil|sıfırla|temizle)\b/i;
  return a < b * 0.5 && !wipeWords.test(instruction || "");
}

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


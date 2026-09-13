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
  /* Browser UI language is a poor proxy for the language someone speaks — plenty of
     Turkish speakers run Chrome in English. Only trust the locale when it is not
     English; otherwise start on Turkish, which the picker can override. */
  const nav = (navigatorLanguage || "");
  if (nav && !/^en\b/i.test(nav)) {
    const exact = VOICE_LANGS.find(([c]) => c.toLowerCase() === nav.toLowerCase());
    if (exact) return exact[0];
    const prefix = VOICE_LANGS.find(([c]) => c.split("-")[0] === nav.split("-")[0]);
    if (prefix) return prefix[0];
  }
  return "tr-TR";
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

/**
 * Tracks the compose box while dictation is running.
 *
 * The box belongs to the user, not to the recogniser: they can clear it or edit
 * it mid-sentence. Anything spoken before that edit has to be forgotten, or the
 * next result rewrites the text they just deleted. Kept pure and DOM-free so the
 * rule is unit-tested rather than only observable by speaking at a browser.
 *
 * @param {string} initialBoxValue whatever was already in the box
 */
export function createDictationBuffer(initialBoxValue = "") {
  let baseText = String(initialBoxValue ?? "").trim();
  let finals = "";
  let lastWritten = String(initialBoxValue ?? "");

  return {
    /**
     * Reconcile with the box before folding in new speech.
     * @returns {boolean} true when the user had changed it and history was dropped
     */
    syncFromBox(boxValue) {
      const v = String(boxValue ?? "");
      if (v === lastWritten) return false;
      baseText = v.trim();
      finals = "";
      return true;
    },
    /** Add a settled phrase. Interim text is passed to compose instead. */
    addFinal(text) { finals += String(text ?? ""); },
    /** The value the box should now hold, including any interim tail. */
    compose(interim = "") {
      const spoken = (finals + String(interim ?? "")).replace(/\s+/g, " ").trim();
      lastWritten = [baseText, spoken].filter(Boolean).join(" ");
      return lastWritten;
    },
  };
}

/** Peak level of a clip; used to tell the user when the microphone delivered silence. */
export function peakLevel(samples) { let p = 0; for (let i = 0; i < samples.length; i++) { const a = Math.abs(samples[i]); if (a > p) p = a; } return p; }

/* Pure logic for CV Studio web: no DOM, no network. Tested with node:test. */

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ───────────────────────── schema ───────────────────────── */

/* Appearance lives in the CV document itself so that "make the name red" or
 * "increase the font size" are ordinary edits the model can make, exactly like
 * changing a job title. Empty string means "use the stylesheet default". */
export const EMPTY_THEME = () => ({
  nameColor: "", headingColor: "", textColor: "", accentColor: "",
  fontScale: 1, lineSpacing: 1, sectionGap: 1,
  headingRule: true,   // the line under each section heading
});

/* Section headings used to be English literals in the renderer, so "translate the
 * page" left them in English and "rename LANGUAGES to DİLLER" was impossible.
 * They live on the document now, which makes them ordinary editable fields. */
export const DEFAULT_LABELS = () => ({
  summary: "Summary", experience: "Work experience", skills: "Skills",
  projects: "Projects", certifications: "Certifications",
  education: "Education", languages: "Languages",
});

export const EMPTY = () => ({
  basics: { name: "", title: "", location: "", phone: "", email: "", links: [] },
  summary: "",
  experience: [],
  skills: [],
  projects: [],
  certifications: [],
  education: [],
  languages: [],
  labels: DEFAULT_LABELS(),
  theme: EMPTY_THEME(),
});

export const SCHEMA_DOC = `{
  "basics": {"name": "", "title": "", "location": "", "phone": "", "email": "", "links": ["github.com/x"]},
  "summary": "2-4 sentences",
  "experience": [{"title": "", "company": "", "location": "", "start": "Jan 2020", "end": "Present", "bullets": ["…"]}],
  "skills": [{"group": "Core", "items": ["…"]}],
  "projects": [{"name": "", "description": "", "link": ""}],
  "certifications": [{"name": "", "issuer": "", "year": ""}],
  "education": [{"degree": "", "school": "", "year": ""}],
  "languages": [{"name": "", "level": ""}],
  "labels": {"summary": "Summary", "experience": "Work experience", "skills": "Skills", "projects": "Projects", "certifications": "Certifications", "education": "Education", "languages": "Languages"},
  "theme": {"nameColor": "", "headingColor": "", "textColor": "", "accentColor": "", "fontScale": 1, "lineSpacing": 1, "sectionGap": 1, "headingRule": true}
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
  out.labels = normalizeLabels(cv?.labels);
  out.theme = normalizeTheme(cv?.theme);
  return out;
}

/* Headings are rendered as text, so only the known keys are kept and each value
   is coerced to a string; a blank value falls back to the English default. */
export function normalizeLabels(labels) {
  const base = DEFAULT_LABELS();
  const out = {};
  for (const k of Object.keys(base)) {
    const v = labels && typeof labels === "object" ? labels[k] : undefined;
    const s = String(v ?? "").trim();
    out[k] = s || base[k];
  }
  return out;
}

/* CSS colours and scales go straight into a stylesheet, so anything the model
 * invents has to be filtered here rather than trusted. Unrecognised colours and
 * out-of-range scales fall back to the stylesheet default. */
const CSS_COLOUR = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|[a-z]{3,20})$/i;
const clampScale = (v, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 1;
};
export const safeColour = (v) => {
  const s = String(v ?? "").trim();
  return CSS_COLOUR.test(s) ? s : "";
};
export function normalizeTheme(theme) {
  const base = EMPTY_THEME();
  const t = { ...base, ...(theme && typeof theme === "object" ? theme : {}) };
  return {
    nameColor: safeColour(t.nameColor),
    headingColor: safeColour(t.headingColor),
    textColor: safeColour(t.textColor),
    accentColor: safeColour(t.accentColor),
    fontScale: clampScale(t.fontScale, 0.7, 1.6),
    lineSpacing: clampScale(t.lineSpacing, 0.8, 2),
    sectionGap: clampScale(t.sectionGap, 0.4, 2.5),
    headingRule: t.headingRule !== false && t.headingRule !== "false",
  };
}

export function extractJSON(text) {
  const cleaned = String(text ?? "").replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("The model did not return JSON.");
  const raw = cleaned.slice(start, end + 1);
  for (const candidate of jsonRepairs(raw)) {
    try { return JSON.parse(candidate); } catch { /* try the next repair */ }
  }
  throw new Error("The model returned JSON this app could not repair. Try a larger model in settings, or split the instruction into smaller steps.");
}

/* Small local models routinely drop the comma between two list items, leave a
 * trailing comma, or stop mid-object when they run out of tokens. Rather than
 * failing the whole edit, yield progressively bolder repairs and take the first
 * one that parses. */
function* jsonRepairs(raw) {
  yield raw;
  const noTrailing = raw.replace(/,\s*([}\]])/g, "$1");
  yield noTrailing;
  const withCommas = noTrailing
    .replace(/([}\]"]|\d|true|false|null)(\s*\n\s*)(["{[])/g, "$1,$2$3")
    .replace(/([}\]])(\s*)([{[])/g, "$1,$2$3");
  yield withCommas;
  yield withCommas.replace(/,\s*([}\]])/g, "$1");
  for (const base of [withCommas, noTrailing, raw]) yield closeOpenStructures(base);
}

/* Balance a truncated reply: close any string, object or array still open. */
function closeOpenStructures(s) {
  const stack = []; let inString = false, escaped = false;
  for (const ch of s) {
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  let out = s.replace(/,\s*$/, "");
  if (inString) out += '"';
  while (stack.length) out += stack.pop() === "{" ? "}" : "]";
  return out;
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
Appearance paths — use these for any instruction about colour, size or spacing, and never reply that appearance cannot be changed:
  theme.nameColor      colour of the person's name       e.g. {"op":"set","path":"theme.nameColor","value":"red"}
  theme.headingColor   colour of the section headings
  theme.accentColor    colour of the job title under the name
  theme.textColor      colour of the body text
  theme.fontScale      text size multiplier, 0.7-1.6, 1 is normal   e.g. bigger text -> 1.15
  theme.lineSpacing    line height multiplier, 0.8-2, 1 is normal
  theme.sectionGap     gap between sections, 0.4-2.5, 1 is normal   e.g. less whitespace -> 0.7
  theme.headingRule    true/false — the horizontal line under every section heading.
                       "remove the line under Projects" means {"op":"set","path":"theme.headingRule","value":false},
                       NOT deleting the projects section.
Colours must be a CSS colour name or hex (red, #c00, #cc0000). To undo a colour, set it to "".
Section heading text — rename or translate headings here, never leave them in the old language:
  labels.summary, labels.experience, labels.skills, labels.projects, labels.certifications, labels.education, labels.languages
  e.g. rename LANGUAGES to DİLLER -> {"op":"set","path":"labels.languages","value":"Diller"}
  When translating the CV, translate these labels too.
The photo is not part of this JSON. If asked to add one, reply {"ops":[],"note":"<tell the user to use the Photo checkbox in the toolbar>"}. If asked to remove it, do the same and say the same.
Rules: emit the fewest operations that fulfil the instruction; never invent employers, dates, numbers or credentials; keep the CV's language unless asked to translate; when translating, set each text field with its translation; when asked to shorten, delete the weakest bullets or shorten the summary. If the instruction is unclear or not about the CV, reply {"ops":[],"note":"<why>"}. No prose, no markdown fences.`;

const LIST_KEYS = new Set(["links", "bullets", "items", "experience", "skills", "projects", "certifications", "education", "languages"]);
const TOP_LEVEL = new Set(["basics", "summary", "experience", "skills", "projects", "certifications", "education", "languages", "theme"]);
const BASICS = new Set(["name", "title", "location", "phone", "email", "links"]);
/* Appearance fields, so a bare "fontScale" or a loose "font_size" still lands under theme. */
const THEME_KEYS = new Set(["namecolor", "headingcolor", "textcolor", "accentcolor", "fontscale", "linespacing", "sectiongap"]);
const THEME_ALIASES = { color: "nameColor", namecolour: "nameColor", namecolor: "nameColor",
  titlecolor: "nameColor", headingcolour: "headingColor", headingcolor: "headingColor",
  textcolour: "textColor", textcolor: "textColor", accentcolour: "accentColor", accentcolor: "accentColor",
  fontsize: "fontScale", font_size: "fontScale", fontscale: "fontScale", scale: "fontScale",
  linespacing: "lineSpacing", lineheight: "lineSpacing", spacing: "lineSpacing",
  sectiongap: "sectionGap", sectionspacing: "sectionGap", margin: "sectionGap",
  /* normalizePath lowercases every segment, so each camelCase key needs its
     lowercase spelling mapped back or the write lands on a key nothing reads. */
  headingrule: "headingRule", headingline: "headingRule", rule: "headingRule", divider: "headingRule" };
const OP_ALIASES = { set: "set", update: "set", replace: "set", edit: "set", change: "set", write: "set",
  delete: "delete", remove: "delete", clear: "delete", del: "delete",
  append: "append", add: "append", push: "append", insert: "insert", move: "move", reorder: "move" };
const FIELD_ALIASES = { fullname: "name", full_name: "name", headline: "title", role: "title", position: "title",
  jobtitle: "title", job_title: "title", city: "location", address: "location", mail: "email", "e-mail": "email",
  telephone: "phone", tel: "phone", mobile: "phone", website: "links", url: "links", profile: "summary",
  about: "summary", objective: "summary", work: "experience", jobs: "experience", employment: "experience",
  work_experience: "experience", workexperience: "experience", certs: "certifications", certificates: "certifications",
  skill: "skills", project: "projects", language: "languages", schools: "education", degrees: "education" };

/**
 * Models write paths loosely: `name`, `cv.basics.name`, `experience[1].title`,
 * `Work Experience.0`. Map those onto the real shape instead of skipping them,
 * because a skipped operation looks to the user like the app ignored them.
 */
export function normalizePath(path) {
  let p = String(path || "").trim()
    .replace(/^\$\.?/, "").replace(/^(cv|resume)\./i, "")
    .replace(/\[(\d+)\]/g, ".$1")
    .replace(/\s+/g, "_");
  if (!p) return "";
  const parts = p.split(".").filter(Boolean).map((x) => {
    const k = x.toLowerCase();
    return /^\d+$/.test(x) ? x : (FIELD_ALIASES[k] || k);
  });
  if (parts.length && !TOP_LEVEL.has(parts[0]) && BASICS.has(parts[0])) parts.unshift("basics");
  /* "fontScale" or "font_size" on its own means the theme, not a stray top-level key. */
  if (parts.length && !TOP_LEVEL.has(parts[0]) && (THEME_KEYS.has(parts[0]) || THEME_ALIASES[parts[0]])) parts.unshift("theme");
  if (parts[0] === "theme" && parts[1]) parts[1] = THEME_ALIASES[parts[1]] || parts[1];
  return parts.join(".");
}

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
  const list = Array.isArray(ops) ? ops : (ops && typeof ops === "object" ? [ops] : []);
  for (const raw of list) {
    const op = { ...raw, op: OP_ALIASES[String(raw?.op || "").toLowerCase()] || raw?.op, path: normalizePath(raw?.path) };
    try {
      const [parent, key] = resolve(next, op.path);
      if (parent == null || key === "" || key == null) throw new Error(`no such field: ${raw?.path}`);
      if (op.op === "set") {
        /* "languages" is a list at the top level but a heading string under labels,
           so only enforce the list shape outside labels and theme. */
        const inSettings = /^(labels|theme)\./.test(op.path);
        if (!inSettings && LIST_KEYS.has(key) && !Array.isArray(op.value)) throw new Error(`${key} needs a list`);
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
    } catch (e) { skipped.push(`${op.op || "?"} ${raw?.path || "?"} — ${e.message}`); }
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

/* `theme` is already validated by normalizeTheme, so its values are safe to
 * interpolate; scales multiply the print-tuned defaults rather than replacing
 * them, which keeps an A4 page looking like an A4 page at any setting. */
export const BASE_CSS = (serif, theme = EMPTY_THEME()) => {
  const t = normalizeTheme(theme);
  const pt = (n) => `${(n * t.fontScale).toFixed(2)}pt`;
  return `
  @page { size: A4; margin: 12mm 14mm; }
  html,body { margin:0; padding:0; background:#fff; color:${t.textColor || "#000"}; }
  body { font-family: ${serif ? "'Liberation Serif','Times New Roman',Times,serif" : "'Liberation Sans',Helvetica,Arial,sans-serif"}; font-size:${pt(serif ? 9.4 : 8.8)}; line-height:${(1.36 * t.lineSpacing).toFixed(2)}; padding:12mm 14mm; }
  @media print { body { padding:0; } }
  .hdr { display:flex; gap:12pt; align-items:flex-start; margin-bottom:${(14 * t.sectionGap).toFixed(1)}pt; }
  .pic { width:64pt; height:64pt; border-radius:50%; object-fit:cover; flex:none; }
  .name { font-size:${pt(serif ? 19 : 18)}; line-height:1.15;${t.nameColor ? ` color:${t.nameColor};` : ""} }
  .role { font-weight:bold; margin-top:2pt;${t.accentColor ? ` color:${t.accentColor};` : ""} } .contact { margin-top:3pt; }
  h2 { font-size:${pt(serif ? 9.6 : 9.2)}; letter-spacing:.02em; margin:0 0 6pt; padding-bottom:3pt; ${t.headingRule ? `border-bottom:.6pt solid ${t.headingColor || "#000"};` : "border-bottom:none;"} text-transform:uppercase;${t.headingColor ? ` color:${t.headingColor};` : ""} }
  .sec { margin-bottom:${(12 * t.sectionGap).toFixed(1)}pt; } p { margin:0 0 5pt; } .tight p { margin-bottom:4pt; }
  .job { margin-bottom:${(6 * t.sectionGap).toFixed(1)}pt; } .job .jh { display:flex; justify-content:space-between; gap:8pt; } .job .jh b { font-weight:bold; }
  ul { margin:2pt 0 0 12pt; padding:0; } li { margin-bottom:1.5pt; }
  .dot { margin:0 5pt; }
`;
};
export const ATS_CSS = `@page { size:A4; margin:16mm; } body { font-family: Arial, Helvetica, sans-serif; font-size:10pt; line-height:1.4; color:#000; padding:16mm; margin:0; } @media print { body{padding:0} } h1{font-size:16pt;margin:0 0 2pt} h2{font-size:11pt;margin:14pt 0 4pt;text-transform:uppercase} p{margin:0 0 4pt} ul{margin:2pt 0 4pt 16pt;padding:0} .sub{font-weight:bold}`;


export function renderStyled(cv, serif, { photo = null } = {}) {
  const b = cv.basics;
  const L = normalizeLabels(cv.labels);
  const contact = lineJoin([b.location, b.phone, b.email, ...b.links], "  |  ");
  const head = `<div class="hdr">${photo ? `<img class="pic" src="${photo}" alt="">` : ""}<div><div class="name">${esc(b.name)}</div><div class="role">${esc(b.title)}</div><div class="contact">${contact}</div></div></div>`;
  let h = head;
  if (cv.summary) h += `<div class="sec"><h2>${esc(L.summary)}</h2><p>${esc(cv.summary)}</p></div>`;
  if (cv.experience.length) {
    h += `<div class="sec"><h2>${esc(L.experience)}</h2>` + cv.experience.map((e) => `<div class="job"><div class="jh"><span><b>${esc(e.title)}</b>${e.company ? " — " + esc(e.company) : ""}${e.location ? ", " + esc(e.location) : ""}</span><span>${lineJoin([e.start, e.end], " – ")}</span></div>${e.bullets.length ? "<ul>" + e.bullets.map((x) => `<li>${esc(x)}</li>`).join("") + "</ul>" : ""}</div>`).join("") + `</div>`;
  }
  if (cv.skills.length) h += `<div class="sec"><h2>${esc(L.skills)}</h2>` + cv.skills.map((s) => `<p><b>${esc(s.group)}:</b> ${s.items.map(esc).join(" <span class='dot'>·</span> ")}</p>`).join("") + `</div>`;
  if (cv.projects.length) h += `<div class="sec tight"><h2>${esc(L.projects)}</h2>` + cv.projects.map((p) => `<p><b>${esc(p.name)}</b> — ${esc(p.description)}${p.link ? " " + esc(p.link) : ""}</p>`).join("") + `</div>`;
  if (cv.certifications.length) h += `<div class="sec tight"><h2>${esc(L.certifications)}</h2>` + cv.certifications.map((c) => `<p><b>${esc(c.name)}</b> / ${lineJoin([c.issuer, c.year], " / ")}</p>`).join("") + `</div>`;
  if (cv.education.length) h += `<div class="sec tight"><h2>${esc(L.education)}</h2>` + cv.education.map((e) => `<p><b>${esc(e.school)}</b> — ${lineJoin([e.degree, e.year], " / ")}</p>`).join("") + `</div>`;
  if (cv.languages.length) h += `<div class="sec"><h2>${esc(L.languages)}</h2><p>${cv.languages.map((l) => `<b>${esc(l.name)}</b> / ${esc(l.level)}`).join(" <span class='dot'>·</span> ")}</p></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS(serif, cv.theme)}</style></head><body>${h}</body></html>`;
}
export function renderATS(cv) {
  const b = cv.basics;
  const L = normalizeLabels(cv.labels);
  let h = `<h1>${esc(b.name)}</h1><p><b>${esc(b.title)}</b></p><p>${lineJoin([b.location, b.phone, b.email, ...b.links])}</p>`;
  if (cv.summary) h += `<h2>${esc(L.summary)}</h2><p>${esc(cv.summary)}</p>`;
  if (cv.experience.length) h += `<h2>${esc(L.experience)}</h2>` + cv.experience.map((e) => `<p class="sub">${esc(e.title)}${e.company ? " — " + esc(e.company) : ""}</p><p>${lineJoin([e.location, [e.start, e.end].filter(Boolean).join(" – ")])}</p>${e.bullets.length ? "<ul>" + e.bullets.map((x) => `<li>${esc(x)}</li>`).join("") + "</ul>" : ""}`).join("");
  if (cv.skills.length) h += `<h2>${esc(L.skills)}</h2>` + cv.skills.map((s) => `<p><b>${esc(s.group)}:</b> ${s.items.map(esc).join(", ")}</p>`).join("");
  if (cv.projects.length) h += `<h2>${esc(L.projects)}</h2>` + cv.projects.map((p) => `<p><b>${esc(p.name)}</b> — ${esc(p.description)} ${esc(p.link)}</p>`).join("");
  if (cv.certifications.length) h += `<h2>${esc(L.certifications)}</h2>` + cv.certifications.map((c) => `<p>${lineJoin([c.name, c.issuer, c.year], ", ")}</p>`).join("");
  if (cv.education.length) h += `<h2>${esc(L.education)}</h2>` + cv.education.map((e) => `<p><b>${esc(e.degree)}</b> — ${lineJoin([e.school, e.year])}</p>`).join("");
  if (cv.languages.length) h += `<h2>${esc(L.languages)}</h2><p>${cv.languages.map((l) => `<b>${esc(l.name)}</b> / ${esc(l.level)}`).join(" · ")}</p>`;
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

/* ───────────────────────── web edition session management ───────────────────────── */

const SESSIONS_KEY = "cvstudio:sessions";
const ACTIVE_SESSION_KEY = "cvstudio:active-session";
const SELECTED_SESSIONS_KEY = "cvstudio:selected-sessions";

export function generateSessionId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function createSession(name = "New CV") {
  const id = generateSessionId();
  const session = {
    id,
    name,
    cv: EMPTY(),
    notes: "",
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
  };
  const sessions = JSON.parse(localStorage.getItem(SESSIONS_KEY) || "[]");
  sessions.push(session);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  localStorage.setItem(ACTIVE_SESSION_KEY, id);
  return session;
}

export function listSessions() {
  return JSON.parse(localStorage.getItem(SESSIONS_KEY) || "[]");
}

export function getSession(id) {
  const sessions = listSessions();
  return sessions.find((s) => s.id === id);
}

export function updateSession(id, updates) {
  const sessions = listSessions();
  const session = sessions.find((s) => s.id === id);
  if (!session) throw new Error(`Session ${id} not found`);
  Object.assign(session, updates, { modified: new Date().toISOString() });
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  return session;
}

export function deleteSession(id) {
  const sessions = listSessions();
  const idx = sessions.findIndex((s) => s.id === id);
  if (idx < 0) throw new Error(`Session ${id} not found`);
  sessions.splice(idx, 1);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  const active = localStorage.getItem(ACTIVE_SESSION_KEY);
  if (active === id) {
    if (sessions.length > 0) localStorage.setItem(ACTIVE_SESSION_KEY, sessions[0].id);
    else localStorage.removeItem(ACTIVE_SESSION_KEY);
  }
  return true;
}

export function deleteSessionsBatch(ids) {
  const sessions = listSessions();
  const remaining = sessions.filter((s) => !ids.includes(s.id));
  if (remaining.length === sessions.length) return false;
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(remaining));
  const active = localStorage.getItem(ACTIVE_SESSION_KEY);
  if (!remaining.find((s) => s.id === active)) {
    if (remaining.length > 0) localStorage.setItem(ACTIVE_SESSION_KEY, remaining[0].id);
    else localStorage.removeItem(ACTIVE_SESSION_KEY);
  }
  clearSelectedSessions();
  return true;
}

export function copySession(id) {
  const session = getSession(id);
  if (!session) throw new Error(`Session ${id} not found`);
  const newId = generateSessionId();
  const copy = {
    ...structuredClone(session),
    id: newId,
    name: `${session.name} (Copy)`,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
  };
  const sessions = listSessions();
  sessions.push(copy);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  return copy;
}

export function renameSessionsBatch(renames) {
  const sessions = listSessions();
  for (const { id, name } of renames) {
    const session = sessions.find((s) => s.id === id);
    if (!session) throw new Error(`Session ${id} not found`);
    session.name = name;
    session.modified = new Date().toISOString();
  }
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  clearSelectedSessions();
  return sessions;
}

export function setSessionNotes(id, notes) {
  return updateSession(id, { notes: String(notes || "").slice(0, 1000) });
}

export function getActiveSession() {
  const id = localStorage.getItem(ACTIVE_SESSION_KEY);
  return id ? getSession(id) : null;
}

export function setActiveSession(id) {
  if (!getSession(id)) throw new Error(`Session ${id} not found`);
  localStorage.setItem(ACTIVE_SESSION_KEY, id);
}

export function getSelectedSessions() {
  return JSON.parse(localStorage.getItem(SELECTED_SESSIONS_KEY) || "[]");
}

export function setSelectedSessions(ids) {
  if (ids.length === 0) clearSelectedSessions();
  else localStorage.setItem(SELECTED_SESSIONS_KEY, JSON.stringify(ids));
}

export function clearSelectedSessions() {
  localStorage.removeItem(SELECTED_SESSIONS_KEY);
}

export function exportSessionsAsJSON(ids) {
  const sessions = listSessions();
  const toExport = sessions.filter((s) => ids.includes(s.id));
  return JSON.stringify(toExport, null, 2);
}

export function archiveSession(id) {
  const session = getSession(id);
  if (session) {
    session.archived = true;
    session.archivedDate = new Date().toISOString();
    updateSession(id, session);
  }
}

export function unarchiveSession(id) {
  const session = getSession(id);
  if (session) {
    session.archived = false;
    delete session.archivedDate;
    updateSession(id, session);
  }
}

export function listArchivedSessions() {
  const all = Object.values(mockStorage).filter((s) => s && s.id !== "active-session-id");
  return all.filter((s) => s.archived).sort((a, b) => new Date(b.modified) - new Date(a.modified));
}

export function listActiveSessions() {
  return listSessions().filter((s) => !s.archived);
}

export function batchArchiveSessions(ids) {
  ids.forEach(id => archiveSession(id));
}

export function batchUnarchiveSessions(ids) {
  ids.forEach(id => unarchiveSession(id));
}

export function clearAllSessions() {
  const allSessions = listSessions();
  allSessions.forEach(s => deleteSession(s.id));
}

export function getSessionStats() {
  const all = listSessions();
  const archived = all.filter(s => s.archived).length;
  return {
    total: all.length,
    active: all.length - archived,
    archived,
    totalNotes: all.filter(s => s.notes).length,
  };
}

/* ───────────────────────── dark mode theme management ───────────────────────── */

const THEME_KEY = "cvstudio:theme";

export function getTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored) return stored; // "light", "dark", or "system"
  return "system";
}

export function setTheme(theme) {
  if (!["light", "dark", "system"].includes(theme)) {
    throw new Error("Invalid theme: must be 'light', 'dark', or 'system'");
  }
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

export function applyTheme(theme) {
  const root = document.documentElement;

  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

export function getSystemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getEffectiveTheme() {
  const theme = getTheme();
  return theme === "system" ? getSystemTheme() : theme;
}


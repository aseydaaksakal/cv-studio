import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs";

/* ───────────────────────── schema ───────────────────────── */

const EMPTY = () => ({
  basics: { name: "", title: "", location: "", phone: "", email: "", links: [] },
  summary: "",
  experience: [],
  skills: [],
  projects: [],
  certifications: [],
  education: [],
  languages: [],
});

const SCHEMA_DOC = `{
  "basics": {"name": "", "title": "", "location": "", "phone": "", "email": "", "links": ["github.com/x"]},
  "summary": "2-4 sentences",
  "experience": [{"title": "", "company": "", "location": "", "start": "Jan 2020", "end": "Present", "bullets": ["…"]}],
  "skills": [{"group": "Core", "items": ["…"]}],
  "projects": [{"name": "", "description": "", "link": ""}],
  "certifications": [{"name": "", "issuer": "", "year": ""}],
  "education": [{"degree": "", "school": "", "year": ""}],
  "languages": [{"name": "", "level": ""}]
}`;

const SAMPLE = {
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

/* ───────────────────────── state ───────────────────────── */

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const state = { cv: EMPTY(), history: [], photo: null };
const settings = JSON.parse(localStorage.getItem("cvstudio.settings") || "{}");

function persist() {
  localStorage.setItem("cvstudio.cv", JSON.stringify(state.cv));
  if (state.photo) localStorage.setItem("cvstudio.photo", state.photo); else localStorage.removeItem("cvstudio.photo");
}
function setCV(next, { record = true } = {}) {
  if (record) { state.history.push(JSON.stringify(state.cv)); if (state.history.length > 30) state.history.shift(); }
  state.cv = normalize(next);
  $("#btn-undo").disabled = state.history.length === 0;
  persist(); renderForm(); renderPreview();
}
function normalize(cv) {
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
function status(msg, err = false) { const el = $("#status"); el.textContent = msg; el.className = "status" + (err ? " err" : ""); }

/* ───────────────────────── AI ───────────────────────── */

function haveKey() { return Boolean(settings.apikey); }
function updateAiNote() { $("#ai-note").textContent = haveKey() ? `Using ${settings.provider === "openai" ? "OpenAI-compatible" : "Anthropic"} · ${settings.model || defaultModel()}` : "Needs an API key — open AI settings."; }
function defaultModel() { return settings.provider === "openai" ? "gpt-4o-mini" : "claude-sonnet-5"; }

async function callModel(system, user) {
  if (!haveKey()) throw new Error("Add an API key in AI settings first.");
  const model = settings.model || defaultModel();
  if (settings.provider === "openai") {
    const base = (settings.baseurl || "https://api.openai.com/v1").replace(/\/$/, "");
    const r = await fetch(base + "/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + settings.apikey },
      body: JSON.stringify({ model, temperature: 0, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    });
    if (!r.ok) throw new Error(`Provider returned ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return (await r.json()).choices[0].message.content;
  }
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": settings.apikey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model, max_tokens: 8000, system, messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error(`Anthropic returned ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}
function extractJSON(text) {
  const start = text.indexOf("{"); const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("The model did not return JSON.");
  return JSON.parse(text.slice(start, end + 1));
}

const SYSTEM_PARSE = `You convert CV/résumé text into JSON. Reply with ONLY a JSON object matching this shape, no prose, no markdown fences:\n${SCHEMA_DOC}\nRules: keep the original language; keep every fact, date, number and name exactly; never invent anything; if a field is unknown use "" or []; put unlabelled contact lines into basics.links.`;
const SYSTEM_EDIT = `You edit a CV stored as JSON. You receive the current JSON and an instruction. Apply the instruction and reply with ONLY the complete updated JSON object in the same shape, no prose, no markdown fences. Rules: change only what the instruction requires; never invent employers, dates, metrics or credentials; keep the person's language unless told to translate; when asked to shorten, cut the weakest content first; keep ids/order stable unless asked to reorder.`;

async function parseWithAI(text) {
  status("Structuring with AI…");
  const cv = extractJSON(await callModel(SYSTEM_PARSE, text.slice(0, 40000)));
  setCV(cv); status("Done. Review the sections on the left.");
}
async function editWithAI(instruction) {
  const btn = $("#btn-ask"); btn.disabled = true; status("Applying…");
  try {
    const cv = extractJSON(await callModel(SYSTEM_EDIT, `CURRENT CV JSON:\n${JSON.stringify(state.cv)}\n\nINSTRUCTION:\n${instruction}`));
    setCV(cv); status("Applied. Undo is available.");
  } catch (e) { status(String(e.message || e), true); } finally { btn.disabled = false; }
}

/* ───────────────────────── input ───────────────────────── */

async function readFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".json")) { setCV(JSON.parse(await file.text())); status("Loaded JSON."); return; }
  let text;
  if (name.endsWith(".pdf")) {
    status("Reading PDF…");
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      let line = "", lastY = null, out = [];
      for (const it of content.items) {
        if (lastY !== null && Math.abs(it.transform[5] - lastY) > 2) { out.push(line); line = ""; }
        line += (line && !line.endsWith(" ") && !it.str.startsWith(" ") ? " " : "") + it.str; lastY = it.transform[5];
      }
      out.push(line); pages.push(out.join("\n"));
    }
    text = pages.join("\n\n");
  } else if (name.endsWith(".docx")) {
    status("Reading DOCX…");
    text = (await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  } else { text = await file.text(); }
  if (!text.trim()) throw new Error("No text found. Scanned PDFs need OCR first.");
  if (!haveKey()) { $("#paste").value = text; $("#paste").closest("details").open = true; status("Text extracted. Add an API key to structure it, or edit by hand below.", true); return; }
  await parseWithAI(text);
}

/* ───────────────────────── form editor ───────────────────────── */

const FIELDS = {
  experience: [["title", "Title"], ["company", "Company"], ["location", "Location"], ["start", "Start"], ["end", "End"]],
  projects: [["name", "Name"], ["link", "Link"], ["description", "Description", "textarea"]],
  certifications: [["name", "Name"], ["issuer", "Issuer"], ["year", "Year"]],
  education: [["degree", "Degree"], ["school", "School"], ["year", "Year"]],
  languages: [["name", "Language"], ["level", "Level"]],
  skills: [["group", "Group"], ["items", "Items (comma separated)", "list"]],
};
const LABELS = { experience: "Experience", skills: "Skills", projects: "Projects", certifications: "Certifications", education: "Education", languages: "Languages" };

function field(path, label, value, kind = "text") {
  const v = esc(value);
  if (kind === "textarea") return `<label>${label}<textarea data-path="${path}" rows="2">${v}</textarea></label>`;
  return `<label>${label}<input type="text" data-path="${path}" value="${v}"></label>`;
}
function renderForm() {
  const cv = state.cv, b = cv.basics;
  let h = `<div class="sec"><div class="sec-head"><h3>Basics</h3></div><div class="grid2">
    ${field("basics.name", "Name", b.name)}${field("basics.title", "Title", b.title)}
    ${field("basics.location", "Location", b.location)}${field("basics.phone", "Phone", b.phone)}
    ${field("basics.email", "Email", b.email)}${field("basics.links", "Links (comma separated)", b.links.join(", "), "text")}
  </div></div>`;
  h += `<div class="sec"><div class="sec-head"><h3>Summary</h3></div>${field("summary", "", cv.summary, "textarea")}</div>`;
  for (const key of ["experience", "skills", "projects", "certifications", "education", "languages"]) {
    h += `<div class="sec"><div class="sec-head"><h3>${LABELS[key]}</h3><button class="small ghost" data-add="${key}">+ Add</button></div>`;
    cv[key].forEach((item, i) => {
      h += `<div class="item"><div class="grid2">`;
      for (const [k, label, kind] of FIELDS[key]) {
        const val = kind === "list" ? item[k].join(", ") : item[k];
        h += field(`${key}.${i}.${k}`, label, val, kind === "textarea" ? "textarea" : "text");
      }
      h += `</div>`;
      if (key === "experience") h += `<label>Bullets (one per line)<textarea data-path="experience.${i}.bullets" rows="3">${esc(item.bullets.join("\n"))}</textarea></label>`;
      h += `<div class="row"><button class="small ghost" data-move="${key}:${i}:-1">↑</button><button class="small ghost" data-move="${key}:${i}:1">↓</button><button class="small ghost danger" data-del="${key}:${i}">Remove</button></div></div>`;
    });
    h += `</div>`;
  }
  $("#form").innerHTML = h;
}
function applyField(path, value) {
  const parts = path.split(".");
  let obj = state.cv;
  for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
  const last = parts[parts.length - 1];
  if (path === "basics.links" || last === "items") obj[last] = value.split(",").map((s) => s.trim()).filter(Boolean);
  else if (last === "bullets") obj[last] = value.split("\n").map((s) => s.trim()).filter(Boolean);
  else obj[last] = value;
  persist(); schedulePreview();
}
let previewTimer;
function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 150); }

$("#form").addEventListener("input", (e) => { if (e.target.dataset.path) applyField(e.target.dataset.path, e.target.value); });
$("#form").addEventListener("click", (e) => {
  const t = e.target;
  if (t.dataset.add) { const blank = {}; for (const [k, , kind] of FIELDS[t.dataset.add]) blank[k] = kind === "list" ? [] : ""; if (t.dataset.add === "experience") blank.bullets = []; const next = structuredClone(state.cv); next[t.dataset.add].push(blank); setCV(next); }
  if (t.dataset.del) { const [k, i] = t.dataset.del.split(":"); const next = structuredClone(state.cv); next[k].splice(+i, 1); setCV(next); }
  if (t.dataset.move) { const [k, i, d] = t.dataset.move.split(":"); const j = +i + +d; const next = structuredClone(state.cv); if (j < 0 || j >= next[k].length) return; [next[k][+i], next[k][j]] = [next[k][j], next[k][+i]]; setCV(next); }
});

/* ───────────────────────── templates ───────────────────────── */

const BASE_CSS = (serif) => `
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
const ATS_CSS = `@page { size:A4; margin:16mm; } body { font-family: Arial, Helvetica, sans-serif; font-size:10pt; line-height:1.4; color:#000; padding:16mm; margin:0; } @media print { body{padding:0} } h1{font-size:16pt;margin:0 0 2pt} h2{font-size:11pt;margin:14pt 0 4pt;text-transform:uppercase} p{margin:0 0 4pt} ul{margin:2pt 0 4pt 16pt;padding:0} .sub{font-weight:bold}`;

function lineJoin(parts, sep = " | ") { return parts.filter(Boolean).map(esc).join(sep); }

function renderStyled(cv, serif) {
  const b = cv.basics;
  const contact = lineJoin([b.location, b.phone, b.email, ...b.links], "  |  ");
  const head = `<div class="hdr">${state.photo && $("#photo-toggle").checked ? `<img class="pic" src="${state.photo}" alt="">` : ""}<div><div class="name">${esc(b.name)}</div><div class="role">${esc(b.title)}</div><div class="contact">${contact}</div></div></div>`;
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
function renderATS(cv) {
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
function renderPreview() {
  const t = $("#template").value;
  $("#frame").srcdoc = t === "ats" ? renderATS(state.cv) : renderStyled(state.cv, t === "serif");
}
function plainText(cv) {
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
function download(name, content, type = "text/plain") {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

/* ───────────────────────── wiring ───────────────────────── */

const drop = $("#drop");
$("#btn-browse").onclick = () => $("#file").click();
$("#file").onchange = (e) => e.target.files[0] && readFile(e.target.files[0]).catch((err) => status(err.message, true));
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) readFile(f).catch((err) => status(err.message, true)); });
$("#btn-parse-paste").onclick = () => { const t = $("#paste").value.trim(); if (!t) return status("Paste some text first.", true); parseWithAI(t).catch((e) => status(e.message, true)); };

$("#btn-ask").onclick = () => { const q = $("#ask").value.trim(); if (!q) return status("Type an instruction first.", true); editWithAI(q); };
document.querySelectorAll(".chips button").forEach((b) => (b.onclick = () => { $("#ask").value = b.dataset.q; editWithAI(b.dataset.q); }));
$("#btn-undo").onclick = () => { const prev = state.history.pop(); if (prev) { state.cv = normalize(JSON.parse(prev)); persist(); renderForm(); renderPreview(); $("#btn-undo").disabled = state.history.length === 0; status("Undone."); } };

$("#template").onchange = renderPreview;
$("#photo-toggle").onchange = (e) => { if (e.target.checked && !state.photo) $("#photo-file").click(); else renderPreview(); };
$("#photo-file").onchange = (e) => { const f = e.target.files[0]; if (!f) { $("#photo-toggle").checked = false; return; } const r = new FileReader(); r.onload = () => { state.photo = r.result; persist(); renderPreview(); }; r.readAsDataURL(f); };
$("#btn-pdf").onclick = () => { const w = $("#frame").contentWindow; w.focus(); w.print(); };
$("#btn-json").onclick = () => download((state.cv.basics.name || "cv").replace(/\s+/g, "_") + ".json", JSON.stringify(state.cv, null, 2), "application/json");
$("#btn-txt").onclick = () => download((state.cv.basics.name || "cv").replace(/\s+/g, "_") + ".txt", plainText(state.cv));
$("#btn-clear").onclick = () => { if (confirm("Clear the CV and photo from this browser?")) { state.photo = null; $("#photo-toggle").checked = false; setCV(EMPTY()); localStorage.removeItem("cvstudio.cv"); status("Cleared."); } };
$("#btn-sample").onclick = () => { setCV(structuredClone(SAMPLE)); status("Sample loaded — try an AI action or edit by hand."); };

const dlg = $("#settings");
$("#btn-settings").onclick = () => { $("#provider").value = settings.provider || "anthropic"; $("#apikey").value = settings.apikey || ""; $("#model").value = settings.model || ""; $("#baseurl").value = settings.baseurl || ""; $("#baseurl-row").hidden = $("#provider").value !== "openai"; dlg.showModal(); };
$("#provider").onchange = (e) => { $("#baseurl-row").hidden = e.target.value !== "openai"; $("#model").placeholder = e.target.value === "openai" ? "gpt-4o-mini" : "claude-sonnet-5"; };
$("#btn-save-settings").onclick = () => { Object.assign(settings, { provider: $("#provider").value, apikey: $("#apikey").value.trim(), model: $("#model").value.trim(), baseurl: $("#baseurl").value.trim() }); localStorage.setItem("cvstudio.settings", JSON.stringify(settings)); updateAiNote(); };

/* boot */
const saved = localStorage.getItem("cvstudio.cv");
state.photo = localStorage.getItem("cvstudio.photo");
if (state.photo) $("#photo-toggle").checked = true;
state.cv = normalize(saved ? JSON.parse(saved) : EMPTY());
updateAiNote(); renderForm(); renderPreview();

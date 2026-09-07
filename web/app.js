import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs";
import { EMPTY, SAMPLE, SYSTEM_EDIT, SYSTEM_PARSE, applyField, download, extractJSON, normalize, plainText, renderATS, renderStyled } from "./core.js";
import { LOCAL_MODELS, LOCAL_WHISPER, hasWebGPU, localComplete, localTranscribe } from "./engines.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs";

/* ───────────────────────── state ───────────────────────── */

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const state = { cv: EMPTY(), history: [], photo: null, busy: false };
const settings = Object.assign({ provider: "local", engine: "local", localmodel: LOCAL_MODELS[0][0], localwhisper: LOCAL_WHISPER[0][0] }, JSON.parse(localStorage.getItem("cvstudio.settings") || "{}"));
const saveSettings = () => localStorage.setItem("cvstudio.settings", JSON.stringify(settings));
const progress = (msg, pct) => status(pct ? `${msg} ${pct}%` : msg);

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
function status(msg, err = false) {
  for (const id of ["#status", "#status-landing"]) { const el = $(id); el.textContent = msg; el.className = el.className.replace(" err", "") + (err ? " err" : ""); }
}
function showWorkspace() { $("#landing").hidden = true; $("#workspace").hidden = false; }
function showLanding() { $("#workspace").hidden = true; $("#landing").hidden = false; }

/* ───────────────────────── chat ───────────────────────── */

function say(role, text) {
  const el = document.createElement("div");
  el.className = "msg " + role;
  el.innerHTML = esc(text).replace(/\n/g, "<br>");
  $("#messages").appendChild(el);
  el.scrollIntoView({ block: "end" });
}

/* ───────────────────────── AI ───────────────────────── */

const haveKey = () => Boolean(settings.apikey);
const defaultModel = () => (settings.provider === "openai" ? "gpt-4o-mini" : "claude-sonnet-5");

async function callModel(system, user) {
  if (settings.provider === "local") return localComplete(settings.localmodel, system, user, progress);
  if (!haveKey()) throw new Error("Add an API key first (⚙ AI settings), or switch the AI engine to \"In your browser\".");
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
  return (await r.json()).content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

async function parseWithAI(text) {
  status("Structuring with AI…");
  const cv = extractJSON(await callModel(SYSTEM_PARSE, text.slice(0, 40000)));
  setCV(cv); showWorkspace(); status("");
  say("assistant", `Loaded ${cv.basics?.name || "your CV"}. Tell me what to change — type it or press the mic. The Fields tab lets you edit anything by hand.`);
}

async function editWithAI(instruction) {
  if (state.busy) return;
  state.busy = true; $("#btn-ask").disabled = true;
  say("user", instruction);
  const thinking = document.createElement("div"); thinking.className = "msg assistant thinking"; thinking.textContent = "Working…"; $("#messages").appendChild(thinking);
  try {
    const out = extractJSON(await callModel(SYSTEM_EDIT, `CURRENT CV JSON:\n${JSON.stringify(state.cv)}\n\nINSTRUCTION:\n${instruction}`));
    const cv = out.cv && typeof out.cv === "object" ? out.cv : out;
    setCV(cv);
    thinking.remove(); say("assistant", out.note || "Done. Undo is available.");
  } catch (e) {
    thinking.remove(); say("error", String(e.message || e));
  } finally { state.busy = false; $("#btn-ask").disabled = false; }
}

/* ───────────────────────── input files ───────────────────────── */

async function readFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".json")) { setCV(JSON.parse(await file.text())); showWorkspace(); say("assistant", "Loaded your saved CV. What should change?"); return; }
  let text;
  if (name.endsWith(".pdf")) {
    status("Reading PDF…");
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      let line = "", lastY = null; const out = [];
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
  if (settings.provider !== "local" && !haveKey()) {
    // No key yet: open the workspace with the raw text in the summary so nothing is lost, and ask for a key.
    setCV({ ...EMPTY(), summary: text.slice(0, 2000) }); showWorkspace();
    say("assistant", "I read the file, but structuring it needs an AI engine. Open ⚙ AI settings and either switch to the free in-browser model or add a key, then drop the file again.");
    return;
  }
  await parseWithAI(text);
}

/* ───────────────────────── voice ───────────────────────── */

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null, recorder = null, listening = false;
const micStatus = (t) => { $("#mic-status").textContent = t; };
const setLive = (on) => { listening = on; $("#btn-mic").classList.toggle("live", on); };

function toggleMic() {
  if (listening) { if (recognizer) recognizer.stop(); if (recorder && recorder.state === "recording") recorder.stop(); return; }
  if (settings.engine === "browser") return startBrowser();
  return startRecording(settings.engine === "whisper" ? transcribeWithAPI : transcribeLocally);
}

/* Browser recogniser: instant, but it only knows the browser's language. Kept as the lightweight option. */
function startBrowser() {
  if (!Recognition) { micStatus("This browser has no speech recognition — the default Whisper engine works everywhere."); return; }
  recognizer = new Recognition();
  recognizer.lang = navigator.language || "en-US";
  recognizer.interimResults = true; recognizer.continuous = false;
  recognizer.onstart = () => { setLive(true); micStatus(`Listening (${recognizer.lang})… click again to stop.`); };
  recognizer.onresult = (e) => { let t = ""; for (const r of e.results) t += r[0].transcript; $("#ask").value = t; };
  recognizer.onerror = (e) => micStatus(e.error === "not-allowed" ? "Microphone blocked — allow it in the address bar." : "Voice error: " + e.error);
  recognizer.onend = () => { setLive(false); micStatus($("#ask").value.trim() ? "Check the text, then press Enter." : ""); $("#ask").focus(); };
  recognizer.start();
}

/* Record, then hand the clip to a transcriber that detects the language itself. */
async function startRecording(transcribe) {
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { micStatus("Microphone blocked — allow it in the address bar."); return; }
  const chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm" });
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop()); setLive(false); micStatus("Transcribing…");
    try {
      const text = await transcribe(new Blob(chunks, { type: recorder.mimeType }));
      $("#ask").value = text;
      micStatus(text ? "Check the text, then press Enter." : "Heard nothing — try again closer to the mic.");
    } catch (e) { micStatus(String(e.message || e)); }
    status(""); $("#ask").focus();
  };
  recorder.start(); setLive(true); micStatus("Recording — speak in any language, click again to stop.");
}

async function transcribeLocally(blob) {
  return localTranscribe(settings.localwhisper, blob, (msg, pct) => micStatus(pct ? `${msg} ${pct}%` : msg));
}

async function transcribeWithAPI(blob) {
  const key = settings.sttkey || (settings.provider === "openai" ? settings.apikey : "");
  if (!key) throw new Error("Whisper API needs an OpenAI key — or switch the voice engine to \"In your browser\".");
  const form = new FormData();
  form.append("file", blob, "speech.webm"); form.append("model", "whisper-1");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: "Bearer " + key }, body: form });
  if (!r.ok) throw new Error(`Whisper API returned ${r.status}`);
  return ((await r.json()).text || "").trim();
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
    ${field("basics.email", "Email", b.email)}${field("basics.links", "Links (comma separated)", b.links.join(", "))}
  </div></div>`;
  h += `<div class="sec"><div class="sec-head"><h3>Summary</h3></div>${field("summary", "", cv.summary, "textarea")}</div>`;
  for (const key of ["experience", "skills", "projects", "certifications", "education", "languages"]) {
    h += `<div class="sec"><div class="sec-head"><h3>${LABELS[key]}</h3><button class="small ghost" data-add="${key}">+ Add</button></div>`;
    cv[key].forEach((item, i) => {
      h += `<div class="item"><div class="grid2">`;
      for (const [k, label, kind] of FIELDS[key]) h += field(`${key}.${i}.${k}`, label, kind === "list" ? item[k].join(", ") : item[k], kind === "textarea" ? "textarea" : "text");
      h += `</div>`;
      if (key === "experience") h += `<label>Bullets (one per line)<textarea data-path="experience.${i}.bullets" rows="3">${esc(item.bullets.join("\n"))}</textarea></label>`;
      h += `<div class="row"><button class="small ghost" data-move="${key}:${i}:-1">↑</button><button class="small ghost" data-move="${key}:${i}:1">↓</button><button class="small ghost danger" data-del="${key}:${i}">Remove</button></div></div>`;
    });
    h += `</div>`;
  }
  $("#form").innerHTML = h;
}
let previewTimer;
$("#form").addEventListener("input", (e) => { if (e.target.dataset.path) { applyField(state.cv, e.target.dataset.path, e.target.value); persist(); clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 150); } });
$("#form").addEventListener("click", (e) => {
  const t = e.target;
  if (t.dataset.add) { const blank = {}; for (const [k, , kind] of FIELDS[t.dataset.add]) blank[k] = kind === "list" ? [] : ""; if (t.dataset.add === "experience") blank.bullets = []; const next = structuredClone(state.cv); next[t.dataset.add].push(blank); setCV(next); }
  if (t.dataset.del) { const [k, i] = t.dataset.del.split(":"); const next = structuredClone(state.cv); next[k].splice(+i, 1); setCV(next); }
  if (t.dataset.move) { const [k, i, d] = t.dataset.move.split(":"); const j = +i + +d; const next = structuredClone(state.cv); if (j < 0 || j >= next[k].length) return; [next[k][+i], next[k][j]] = [next[k][j], next[k][+i]]; setCV(next); }
});

/* ───────────────────────── preview & export ───────────────────────── */

function renderPreview() {
  const t = $("#template").value;
  const photo = $("#photo-toggle").checked ? state.photo : null;
  $("#frame").srcdoc = t === "ats" ? renderATS(state.cv) : renderStyled(state.cv, t === "serif", { photo });
}
const fileBase = () => (state.cv.basics.name || "cv").replace(/\s+/g, "_");

/* ───────────────────────── wiring ───────────────────────── */

const drop = $("#drop");
$("#btn-browse").onclick = () => $("#file").click();
$("#file").onchange = (e) => e.target.files[0] && readFile(e.target.files[0]).catch((err) => status(err.message, true));
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) readFile(f).catch((err) => status(err.message, true)); });
$("#btn-sample").onclick = () => { setCV(structuredClone(SAMPLE)); showWorkspace(); say("assistant", "This is a sample CV for a fictional person. Try: \"Add a project called ledger-viz\", or press a quick action."); };

$("#composer").addEventListener("submit", (e) => { e.preventDefault(); const q = $("#ask").value.trim(); if (!q) return; $("#ask").value = ""; editWithAI(q); });
$("#ask").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#composer").requestSubmit(); } });
document.querySelectorAll(".chips button").forEach((b) => (b.onclick = () => editWithAI(b.dataset.q)));
$("#btn-mic").onclick = toggleMic;
$("#btn-undo").onclick = () => { const prev = state.history.pop(); if (prev) { state.cv = normalize(JSON.parse(prev)); persist(); renderForm(); renderPreview(); $("#btn-undo").disabled = state.history.length === 0; say("assistant", "Undone."); } };

document.querySelectorAll(".tab").forEach((t) => (t.onclick = () => {
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + t.dataset.tab));
}));

$("#template").onchange = renderPreview;
$("#photo-toggle").onchange = (e) => { if (e.target.checked && !state.photo) $("#photo-file").click(); else renderPreview(); };
$("#photo-file").onchange = (e) => { const f = e.target.files[0]; if (!f) { $("#photo-toggle").checked = false; return; } const r = new FileReader(); r.onload = () => { state.photo = r.result; persist(); renderPreview(); }; r.readAsDataURL(f); };
$("#btn-pdf").onclick = () => { const w = $("#frame").contentWindow; w.focus(); w.print(); };
$("#btn-json").onclick = () => download(fileBase() + ".json", JSON.stringify(state.cv, null, 2), "application/json");
$("#btn-txt").onclick = () => download(fileBase() + ".txt", plainText(state.cv));
$("#btn-new").onclick = () => { if (confirm("Start over? This clears the CV and photo from this browser.")) { state.photo = null; $("#photo-toggle").checked = false; state.history = []; state.cv = EMPTY(); localStorage.removeItem("cvstudio.cv"); localStorage.removeItem("cvstudio.photo"); $("#messages").innerHTML = ""; renderForm(); renderPreview(); showLanding(); status(""); } };

const dlg = $("#settings");
for (const [v, label] of LOCAL_MODELS) { const o = document.createElement("option"); o.value = v; o.textContent = label; $("#localmodel").appendChild(o); }
for (const [v, label] of LOCAL_WHISPER) { const o = document.createElement("option"); o.value = v; o.textContent = label; $("#localwhisper").appendChild(o); }
function syncSettingsForm() {
  const p = $("#provider").value, e = $("#engine").value;
  $("#localmodel-row").hidden = p !== "local"; $("#apikey-row").hidden = p === "local"; $("#model-row").hidden = p === "local"; $("#baseurl-row").hidden = p !== "openai";
  $("#localwhisper-row").hidden = e !== "local"; $("#sttkey-row").hidden = e !== "whisper";
  $("#model").placeholder = p === "openai" ? "gpt-4o-mini" : "claude-sonnet-5";
  $("#gpu-note").textContent = hasWebGPU() ? "WebGPU available: in-browser models will use your GPU." : "No WebGPU in this browser: in-browser text models will not run; Whisper falls back to CPU. Chrome or Edge 113+ recommended.";
}
const openSettings = () => {
  $("#provider").value = settings.provider; $("#localmodel").value = settings.localmodel; $("#apikey").value = settings.apikey || ""; $("#model").value = settings.model || ""; $("#baseurl").value = settings.baseurl || "";
  $("#engine").value = settings.engine; $("#localwhisper").value = settings.localwhisper; $("#sttkey").value = settings.sttkey || "";
  syncSettingsForm(); dlg.showModal();
};
$("#btn-settings").onclick = openSettings; $("#btn-settings-landing").onclick = openSettings;
$("#provider").onchange = syncSettingsForm; $("#engine").onchange = syncSettingsForm;
$("#btn-save-settings").onclick = () => {
  Object.assign(settings, { provider: $("#provider").value, localmodel: $("#localmodel").value, apikey: $("#apikey").value.trim(), model: $("#model").value.trim(), baseurl: $("#baseurl").value.trim(), engine: $("#engine").value, localwhisper: $("#localwhisper").value, sttkey: $("#sttkey").value.trim() });
  saveSettings();
};

/* boot */
const saved = localStorage.getItem("cvstudio.cv");
state.photo = localStorage.getItem("cvstudio.photo");
if (state.photo) $("#photo-toggle").checked = true;
state.cv = normalize(saved ? JSON.parse(saved) : EMPTY());
renderForm(); renderPreview();
if (saved && state.cv.basics.name) { showWorkspace(); say("assistant", `Welcome back, ${state.cv.basics.name.split(" ")[0]}. Your CV is restored from this browser.`); }

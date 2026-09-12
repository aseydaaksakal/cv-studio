import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs";
import { EMPTY, SAMPLE, SYSTEM_EDIT, SYSTEM_PARSE, applyField, applyOps, applyTheme, clearSelectedSessions, copySession, createSession, deleteSession, deleteSessionsBatch, download, extractJSON, exportSessionsAsJSON, getActiveSession, getEffectiveTheme, getSelectedSessions, getSession, getSystemTheme, getTheme, looksDestructive, listSessions, normalize, plainText, renameSessionsBatch, renderATS, renderStyled, setActiveSession, setSelectedSessions, setSessionNotes, setTheme, updateSession, whisperLangName } from "./core.js";
import { LOCAL_MODELS, LOCAL_WHISPER, UnknownModelError, availableLocalModels, hasWebGPU, localComplete, localTranscribe, localWhisperId, ollamaModels, pickForBudget, probeModel } from "./engines.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs";

/* ───────────────────────── state ───────────────────────── */

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const state = { cv: EMPTY(), history: [], photo: null, busy: false };
const settings = Object.assign({ provider: "local", engine: "local", localmodel: LOCAL_MODELS[3][0], custommodel: "", localwhisper: LOCAL_WHISPER[1][0], ollamaurl: "http://localhost:11434", ollamamodel: "qwen3.8:27b", desktopurl: "http://localhost:8000" }, JSON.parse(localStorage.getItem("cvstudio.settings") || "{}"));
const saveSettings = () => localStorage.setItem("cvstudio.settings", JSON.stringify(settings));
const progress = (msg, pct) => status(pct ? `${msg} ${pct}%` : msg);

function persist() {
  const active = getActiveSession();
  if (active) {
    updateSession(active.id, { cv: state.cv });
  } else {
    localStorage.setItem("cvstudio.cv", JSON.stringify(state.cv));
  }
  if (state.photo) localStorage.setItem("cvstudio.photo", state.photo); else localStorage.removeItem("cvstudio.photo");
}
function setCV(next, { record = true } = {}) {
  if (record) { state.history.push(JSON.stringify(state.cv)); if (state.history.length > 30) state.history.shift(); }
  state.cv = normalize(next);
  $("#btn-undo").disabled = state.history.length === 0;
  persist(); renderForm(); renderPreview();
}
function status(msg, err = false) {
  for (const id of ["#status", "#status-landing"]) { const el = $(id); if (!el) continue; el.textContent = msg; el.classList.toggle("err", err); }
}
function showWorkspace() { $("#landing").hidden = true; $("#workspace").hidden = false; }
function showLanding() { $("#workspace").hidden = true; $("#landing").hidden = false; }

/* ───────────────────────── chat ───────────────────────── */

function say(role, text) {
  const box = $("#messages");
  const last = box.lastElementChild;
  if (last && last.dataset.role === role && last.dataset.text === text) {
    const n = Number(last.dataset.count || 1) + 1;
    last.dataset.count = n;
    last.querySelector(".repeat")?.remove();
    const badge = document.createElement("span");
    badge.className = "repeat"; badge.textContent = ` ×${n}`;
    last.appendChild(badge);
    last.scrollIntoView({ block: "end" });
    return;
  }
  const el = document.createElement("div");
  el.className = "msg " + role;
  el.dataset.role = role; el.dataset.text = text;
  el.innerHTML = esc(text).replace(/\n/g, "<br>");
  box.appendChild(el);
  el.scrollIntoView({ block: "end" });
}

/* ───────────────────────── AI ───────────────────────── */

const haveKey = () => Boolean(settings.apikey);
const defaultModel = () => (settings.provider === "openai" ? "gpt-4o-mini" : "claude-sonnet-5");

async function callModel(system, user) {
  if (settings.provider === "local") {
    const chosen = settings.localmodel === "__custom__" ? settings.custommodel : settings.localmodel;
    try { return await localComplete(chosen, system, user, progress); }
    catch (e) {
      if (!(e instanceof UnknownModelError)) throw e;
      // A model id saved by an older version, or one this build no longer offers:
      // repair the setting from the live catalogue and try once more.
      const models = await availableLocalModels();
      const fallback = pickForBudget(models, 8) || models[0][0];
      if (!fallback || fallback === chosen) throw new Error(`${e.message} Open ⚙ and pick another model.`);
      settings.localmodel = fallback; settings.custommodel = ""; saveSettings(); fillModels(models);
      say("assistant", `"${chosen}" is not available in this browser, so I switched to ${fallback} and retried.`);
      return localComplete(fallback, system, user, progress);
    }
  }
  if (settings.provider === "ollama") {
    // İlk olarak backend'i dene (CORS güvenli)
    const backend = (settings.desktopurl || "http://localhost:8000").replace(/\/$/, "");
    try {
      const r = await fetch(backend + "/api/ollama-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system,
          user,
          model: settings.ollamamodel || "qwen3.8:27b"
        })
      });
      if (r.ok) {
        const result = await r.json();
        if (result.ok) return result.content;
        // Backend hata döndürdü, direkt Ollama'yı dene
      }
    } catch (e) {
      // Backend erişilemez, direkt Ollama'yı dene
    }

    // Fallback: Direkt Ollama çağrısı (CORS sorunu olabilir)
    const base = (settings.ollamaurl || "http://localhost:11434").replace(/\/$/, "");
    let r;
    try {
      r = await fetch(base + "/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: settings.ollamamodel || "qwen3.8:27b", temperature: 0, messages: [{ role: "system", content: system }, { role: "user", content: user }] }) });
    } catch { throw new Error(`Cannot reach Ollama at ${base}. Try running desktop backend: cd backend && python -m uvicorn app:app --port 8000`); }
    if (!r.ok) throw new Error(`Ollama returned ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return (await r.json()).choices[0].message.content;
  }
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
  setCV(cv, { record: false }); showWorkspace(); status("");
  const thin = ["experience", "education", "languages"].filter((k) => (state.cv[k] || []).length < 2);
  say("assistant", `Loaded ${state.cv.basics?.name || "your CV"}. Tell me what to change — type it or press the mic.`
    + (thin.length ? ` A small local model can drop detail: check ${thin.join(", ")} in the Fields tab, or pick a larger model in ⚙.` : " The Fields tab lets you edit anything by hand."));
}

async function editWithAI(instruction) {
  if (state.busy) return;
  state.busy = true; $("#btn-ask").disabled = true;
  say("user", instruction);
  const thinking = document.createElement("div"); thinking.className = "msg assistant thinking"; thinking.textContent = "Working…"; $("#messages").appendChild(thinking);
  try {
    const out = extractJSON(await callModel(SYSTEM_EDIT, `CURRENT CV JSON:\n${JSON.stringify(state.cv)}\n\nINSTRUCTION:\n${instruction}`));
    let next, detail = "";
    if (Array.isArray(out.ops)) {
      const r = applyOps(state.cv, out.ops); next = r.cv;
      if (r.applied === 0 && !r.skipped.length && out.note) { thinking.remove(); say("assistant", out.note); return; }
      if (r.applied === 0) {
        thinking.remove();
        say("error", r.skipped.length
          ? `Nothing changed — the model asked for something the CV has no place for:\n${r.skipped.join("\n")}`
          : "Nothing changed. Say it more concretely, e.g. \"adı sil\", \"unvanı Staff Engineer yap\", \"ikinci işi kaldır\".");
        return;
      }
      if (r.skipped.length) detail = `\n(${r.skipped.length} step skipped: ${r.skipped[0]})`;
    } else if (out.cv && typeof out.cv === "object") next = normalize(out.cv);
    else throw new Error("The model did not return operations.");
    if (looksDestructive(state.cv, next, instruction)) { thinking.remove(); say("error", "That would have wiped most of the CV, so I did not apply it. If you really want to clear it, say \"hepsini sil\" / \"clear everything\"."); return; }
    setCV(next);
    thinking.remove(); say("assistant", (out.note || "Done.") + detail);
  } catch (e) {
    thinking.remove(); say("error", String(e.message || e));
  } finally { state.busy = false; $("#btn-ask").disabled = false; status(""); }
}

/* ───────────────────────── input files ───────────────────────── */

async function readFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".json")) { setCV(JSON.parse(await file.text()), { record: false }); showWorkspace(); say("assistant", "Loaded your saved CV. What should change?"); return; }
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
    setCV({ ...EMPTY(), summary: text.slice(0, 2000) }, { record: false }); showWorkspace();
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
  const engines = { whisper: transcribeWithAPI, desktop: transcribeWithDesktop, local: transcribeLocally };
  const chosen = engines[settings.engine] || transcribeLocally;
  const withFallback = async (blob) => {
    if (chosen === transcribeLocally) return transcribeLocally(blob);
    try { return await chosen(blob); }
    catch (e) {
      micStatus(`${e.message} Falling back to in-browser Whisper…`);
      return transcribeLocally(blob);
    }
  };
  return startRecording(withFallback);
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

/* Record, then hand the clip to a transcriber. Each one resolves with { text, language }; language is shown next to the mic when known. */
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
      const { text, language } = await transcribe(new Blob(chunks, { type: recorder.mimeType }));
      $("#ask").value = text;
      const via = settings.engine === "browser" ? "browser recognition" : settings.engine === "whisper" ? "Whisper API" : settings.engine === "desktop" ? "desktop backend" : `Whisper ${String(settings.localwhisper).split("/").pop()}`;
      const heard = language ? `${whisperLangName(language)} via ${via}` : `via ${via}`;
      micStatus(text ? `Heard ${heard} — check the text, then press Enter.` : `Heard nothing ${heard} — try again closer to the mic.`);
    } catch (e) { micStatus(String(e.message || e)); }
    status(""); $("#ask").focus();
  };
  recorder.start(); setLive(true); micStatus("Recording — speak in any language, click again to stop.");
}

async function transcribeLocally(blob) {
  return localTranscribe(localWhisperId(settings.localwhisper), blob, (msg, pct) => micStatus(pct ? `${msg} ${pct}%` : msg));
}

async function transcribeWithDesktop(blob) {
  const base = (settings.desktopurl || "http://localhost:8000").replace(/\/$/, "");
  const form = new FormData();
  form.append("ses", blob, "speech.webm"); form.append("dil", "oto");
  let r;
  try { r = await fetch(base + "/voice", { method: "POST", body: form }); }
  catch { throw new Error(`Cannot reach the desktop backend at ${base}. Start it with CV_STUDIO_CORS=https://aseydaaksakal.github.io (see README).`); }
  if (!r.ok) throw new Error(`Desktop backend returned ${r.status}`);
  const d = await r.json();
  return { text: (d.metin || d.ham || "").trim(), language: d.dil || null };
}

async function transcribeWithAPI(blob) {
  const key = settings.sttkey || (settings.provider === "openai" ? settings.apikey : "");
  if (!key) throw new Error("Whisper API needs an OpenAI key — or switch the voice engine to \"In your browser\".");
  const form = new FormData();
  form.append("file", blob, "speech.webm"); form.append("model", "whisper-1");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: "Bearer " + key }, body: form });
  if (!r.ok) throw new Error(`Whisper API returned ${r.status}`);
  return { text: ((await r.json()).text || "").trim(), language: null };
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
$("#btn-upload").onclick = () => $("#file").click();
$("#file").onchange = (e) => e.target.files[0] && readFile(e.target.files[0]).catch((err) => status(err.message, true));
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) readFile(f).catch((err) => status(err.message, true)); });
$("#btn-sample").onclick = () => { setCV(structuredClone(SAMPLE), { record: false }); showWorkspace(); say("assistant", "This is a sample CV for a fictional person. Try: \"Add a project called ledger-viz\", or press a quick action."); };

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
function fillModels(models) {
  $("#localmodel").innerHTML = "";
  for (const [v, label] of models) { const o = document.createElement("option"); o.value = v; o.textContent = label; $("#localmodel").appendChild(o); }
  const wanted = models.some(([v]) => v === settings.localmodel) ? settings.localmodel
    : (pickForBudget(models, 8) || models[0][0]);
  $("#localmodel").value = wanted; settings.localmodel = wanted; saveSettings();
}
fillModels(LOCAL_MODELS);
let modelsLoaded = false;
async function loadRealModelList() {
  if (modelsLoaded) return; modelsLoaded = true;
  $("#gpu-note").textContent = "Reading the model catalogue…";
  fillModels(await availableLocalModels());
  syncSettingsForm();
}
for (const [v, label] of LOCAL_WHISPER) { const o = document.createElement("option"); o.value = v; o.textContent = label; $("#localwhisper").appendChild(o); }
function syncSettingsForm() {
  const p = $("#provider").value, e = $("#engine").value;
  $("#localmodel-row").hidden = p !== "local"; $("#apikey-row").hidden = !(p === "anthropic" || p === "openai"); $("#model-row").hidden = !(p === "anthropic" || p === "openai"); $("#baseurl-row").hidden = p !== "openai";
  $("#ollama-row").hidden = p !== "ollama"; $("#ollamamodel-row").hidden = p !== "ollama";
  $("#custommodel-row").hidden = !(p === "local" && $("#localmodel").value === "__custom__");
  if (p === "ollama") ollamaModels($("#ollamaurl").value || "http://localhost:11434").then((names) => {
    $("#ollama-installed").innerHTML = names.map((n) => `<option value="${n}">`).join("");
    $("#gpu-note").textContent = names.length ? `Ollama reachable — installed: ${names.slice(0, 6).join(", ")}${names.length > 6 ? "…" : ""}` : "Ollama not reachable yet — check the URL and OLLAMA_ORIGINS (see README).";
  });
  $("#localwhisper-row").hidden = e !== "local"; $("#sttkey-row").hidden = e !== "whisper"; $("#desktopurl-row").hidden = e !== "desktop";
  $("#model").placeholder = p === "openai" ? "gpt-4o-mini" : "claude-sonnet-5";
  if (p === "local") $("#gpu-note").textContent = hasWebGPU()
    ? "WebGPU available. Only models this browser can actually run are listed — press Test this model to confirm yours works."
    : "No WebGPU in this browser: in-browser text models will not run. Chrome or Edge 113+ recommended.";
  else $("#gpu-note").textContent = hasWebGPU() ? "WebGPU available: in-browser models will use your GPU." : "No WebGPU in this browser: in-browser text models will not run; Whisper falls back to CPU. Chrome or Edge 113+ recommended.";
}
const openSettings = () => {
  $("#provider").value = settings.provider; $("#localmodel").value = settings.localmodel; $("#custommodel").value = settings.custommodel || ""; $("#apikey").value = settings.apikey || ""; $("#model").value = settings.model || ""; $("#baseurl").value = settings.baseurl || "";
  $("#engine").value = settings.engine; $("#localwhisper").value = settings.localwhisper; $("#sttkey").value = settings.sttkey || "";
  $("#ollamaurl").value = settings.ollamaurl; $("#ollamamodel").value = settings.ollamamodel; $("#desktopurl").value = settings.desktopurl;
  syncSettingsForm(); dlg.showModal(); loadRealModelList();
};
$("#btn-settings").onclick = openSettings; $("#btn-settings-landing").onclick = openSettings;
$("#btn-shortcuts").onclick = () => $("#shortcuts").showModal();
$("#provider").onchange = syncSettingsForm; $("#engine").onchange = syncSettingsForm;
$("#localmodel").onchange = syncSettingsForm; $("#ollamaurl").onchange = syncSettingsForm;
$("#btn-test-model").onclick = async () => {
  const btn = $("#btn-test-model"), out = $("#test-result");
  btn.disabled = true; out.className = "muted small"; out.textContent = "Loading the model and sending one instruction…";
  const saved = { ...settings };
  Object.assign(settings, { provider: $("#provider").value, localmodel: $("#localmodel").value, custommodel: $("#custommodel").value.trim(), custommodel: $("#custommodel").value.trim(),
    apikey: $("#apikey").value.trim(), model: $("#model").value.trim(), baseurl: $("#baseurl").value.trim(),
    ollamaurl: $("#ollamaurl").value.trim() || "http://localhost:11434", ollamamodel: $("#ollamamodel").value.trim() || "qwen3.8:27b" });
  try {
    const r = await probeModel((sys, user) => callModel(sys, user), SYSTEM_EDIT, applyOps);
    out.className = "small " + (r.ok ? "ok" : "err");
    out.textContent = (r.ok ? "Passed — " : "Failed — ") + r.detail;
  } catch (e) { out.className = "small err"; out.textContent = String(e.message || e); }
  finally { Object.assign(settings, saved); btn.disabled = false; }
};
$("#btn-save-settings").onclick = () => {
  Object.assign(settings, { provider: $("#provider").value, localmodel: $("#localmodel").value, custommodel: $("#custommodel").value.trim(), apikey: $("#apikey").value.trim(), model: $("#model").value.trim(), baseurl: $("#baseurl").value.trim(), engine: $("#engine").value, localwhisper: $("#localwhisper").value, sttkey: $("#sttkey").value.trim(), ollamaurl: $("#ollamaurl").value.trim() || "http://localhost:11434", ollamamodel: $("#ollamamodel").value.trim() || "qwen3.8:27b", desktopurl: $("#desktopurl").value.trim() || "http://localhost:8000" });
  saveSettings();
};

/* ───────────────────────── dark mode theme toggle ───────────────────────── */

$("#btn-theme").onclick = () => {
  const current = getTheme();
  const next = current === "light" ? "dark" : current === "dark" ? "system" : "light";
  setTheme(next);
  updateThemeButton();
};

function updateThemeButton() {
  const btn = $("#btn-theme");
  const effective = getEffectiveTheme();
  btn.textContent = effective === "dark" ? "☀️" : "🌙";
}

function initTheme() {
  applyTheme(getTheme());
  updateThemeButton();
}

/* ───────────────────────── session management ───────────────────────── */

async function showInputDialog(title, placeholder = "", defaultValue = "") {
  const dlg = $("#input-dialog");
  const titleEl = $("#input-title");
  const inputEl = $("#input-value");
  titleEl.textContent = title;
  inputEl.placeholder = placeholder;
  inputEl.value = defaultValue;
  inputEl.focus();
  const result = await dlg.showModal();
  return inputEl.value;
}

function filterSessions(query) {
  const sessions = listSessions();
  if (!query.trim()) return sessions;

  const q = query.toLowerCase();
  return sessions.filter(s =>
    s.name.toLowerCase().includes(q) ||
    new Date(s.modified).toLocaleDateString().toLowerCase().includes(q) ||
    (s.notes && s.notes.toLowerCase().includes(q))
  );
}

function sortSessions(sessions, sortBy = "date-desc") {
  const sorted = [...sessions];

  switch (sortBy) {
    case "date-asc":
      sorted.sort((a, b) => new Date(a.modified) - new Date(b.modified));
      break;
    case "date-desc":
      sorted.sort((a, b) => new Date(b.modified) - new Date(a.modified));
      break;
    case "name-asc":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "name-desc":
      sorted.sort((a, b) => b.name.localeCompare(a.name));
      break;
  }

  return sorted;
}

function renderSessionsList(searchQuery = "") {
  const container = $("#sessions-list");
  let sessions = searchQuery ? filterSessions(searchQuery) : listSessions();

  // Apply sorting
  const sortSelect = $("#sessions-sort");
  const sortBy = sortSelect ? sortSelect.value : "date-desc";
  sessions = sortSessions(sessions, sortBy);

  const selected = new Set(getSelectedSessions());
  const activeId = getActiveSession()?.id;
  const total = listSessions().length;

  // Update search count
  const countEl = $("#sessions-search-count");
  if (countEl) {
    if (searchQuery && sessions.length !== total) {
      countEl.textContent = `${sessions.length}/${total}`;
    } else if (total > 0) {
      countEl.textContent = `${total}`;
    } else {
      countEl.textContent = "";
    }
  }

  if (sessions.length === 0) {
    if (searchQuery) {
      container.innerHTML = '<div class="session-item-empty">No CVs match your search.</div>';
    } else {
      container.innerHTML = '<div class="session-item-empty">No CVs yet. Create one to get started.</div>';
    }
    return;
  }

  container.innerHTML = sessions.map((s) => `
    <div class="session-item ${s.id === activeId ? 'active' : ''}">
      <input type="checkbox" value="${esc(s.id)}" ${selected.has(s.id) ? 'checked' : ''}>
      <div class="session-item-info">
        <div class="session-item-name">${esc(s.name)}</div>
        <div class="session-item-meta">${new Date(s.modified).toLocaleDateString()}</div>
        ${s.notes ? `<div class="session-item-notes">${esc(s.notes)}</div>` : ''}
      </div>
    </div>
  `).join('');

  container.querySelectorAll('input[type=checkbox]').forEach((cb) => {
    cb.onchange = () => {
      const ids = Array.from(container.querySelectorAll('input[type=checkbox]:checked')).map((el) => el.value);
      setSelectedSessions(ids);
      updateSessionsToolbar();
    };
  });
}

function updateSessionsToolbar() {
  const selected = getSelectedSessions();
  $("#btn-delete-sessions").disabled = selected.length === 0;
  $("#btn-copy-session").disabled = selected.length !== 1;
  $("#btn-rename-sessions").disabled = selected.length === 0;
  $("#btn-export-sessions").disabled = selected.length === 0;
}

function showSessionsManager() {
  renderSessionsList();
  updateSessionsToolbar();
  const searchInput = $("#sessions-search-input");
  const sortSelect = $("#sessions-sort");

  searchInput.value = "";  // Clear search

  // Restore sort preference
  const savedSort = localStorage.getItem("cvstudio.sessions-sort");
  if (savedSort && sortSelect) {
    sortSelect.value = savedSort;
  }

  searchInput.focus();     // Focus search input
  $("#sessions").showModal();
}

// Session search with real-time filtering
$("#sessions-search-input").oninput = (e) => {
  renderSessionsList(e.target.value);
  updateSessionsToolbar();
};

// Session sorting
$("#sessions-sort").onchange = (e) => {
  localStorage.setItem("cvstudio.sessions-sort", e.target.value);
  const searchInput = $("#sessions-search-input");
  renderSessionsList(searchInput ? searchInput.value : "");
  updateSessionsToolbar();
};

$("#btn-sessions").onclick = showSessionsManager;

$("#btn-new-session").onclick = async () => {
  const name = await showInputDialog("New CV", "CV name", "My CV");
  if (!name || !name.trim()) return;
  const session = createSession(name.trim());
  renderSessionsList();
  setActiveSession(session.id);
  state.cv = EMPTY();
  state.history = [];
  persist();
  renderForm(); renderPreview();
  updateSessionsToolbar();
};

$("#btn-delete-sessions").onclick = async () => {
  const selected = getSelectedSessions();
  if (!confirm(`Delete ${selected.length} CV${selected.length !== 1 ? 's' : ''}?`)) return;
  deleteSessionsBatch(selected);
  if (listSessions().length > 0) {
    const active = getActiveSession();
    if (active) setActiveSession(active.id);
    else setActiveSession(listSessions()[0].id);
  } else {
    clearSelectedSessions();
  }
  renderSessionsList();
  updateSessionsToolbar();
  loadActiveSession();
};

$("#btn-copy-session").onclick = async () => {
  const selected = getSelectedSessions();
  if (selected.length !== 1) return;
  const copy = copySession(selected[0]);
  renderSessionsList();
  updateSessionsToolbar();
};

$("#btn-rename-sessions").onclick = async () => {
  const selected = getSelectedSessions();
  if (selected.length === 0) return;
  const renames = [];
  for (const id of selected) {
    const session = getSession(id);
    const newName = await showInputDialog(`Rename CV`, "New name", session.name);
    if (newName && newName.trim()) renames.push({ id, name: newName.trim() });
  }
  if (renames.length === 0) return;
  renameSessionsBatch(renames);
  renderSessionsList();
  updateSessionsToolbar();
};

$("#btn-export-sessions").onclick = async () => {
  const selected = getSelectedSessions();
  if (selected.length === 0) return;
  const json = exportSessionsAsJSON(selected);
  download(`cv-studio-export.json`, json, "application/json");
};

function loadActiveSession() {
  let session = getActiveSession();
  if (!session) {
    const sessions = listSessions();
    if (sessions.length === 0) {
      state.cv = EMPTY();
      state.history = [];
      showLanding();
      return;
    }
    session = sessions[0];
    setActiveSession(session.id);
  }
  state.cv = normalize(session.cv);
  state.history = [];
  state.photo = null;
  persist();
  renderForm(); renderPreview();
  showWorkspace();
}

/* boot */
const saved = localStorage.getItem("cvstudio.cv");
const sessions = listSessions();

if (sessions.length === 0 && saved) {
  // Migrate old single-CV to new session system
  const cv = JSON.parse(saved);
  const session = createSession("My CV");
  updateSession(session.id, { cv });
  localStorage.removeItem("cvstudio.cv");
  localStorage.removeItem("cvstudio.photo");
}

initTheme();

/* ───────────────────────── keyboard shortcuts ───────────────────────── */
document.addEventListener("keydown", (e) => {
  const isMac = /Mac/.test(navigator.platform);
  const mod = isMac ? e.metaKey : e.ctrlKey;

  // Enter in composer → submit (unless Shift+Enter)
  if (e.key === "Enter" && e.target === $("#ask") && !e.shiftKey) {
    e.preventDefault();
    $("#btn-ask").click();
  }

  // Escape → close open modals or dialogs
  if (e.key === "Escape") {
    const openDialog = document.querySelector("dialog[open]");
    if (openDialog) {
      openDialog.close();
      e.preventDefault();
    }
  }

  // Ctrl/Cmd+Z → undo
  if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
    e.preventDefault();
    $("#btn-undo").click();
  }

  // Ctrl/Cmd+S → download PDF
  if (mod && e.key.toLowerCase() === "s") {
    e.preventDefault();
    $("#btn-pdf").click();
  }

  // Ctrl/Cmd+, or Cmd+K → open settings
  if ((mod && e.key === ",") || (isMac && mod && e.key.toLowerCase() === "k")) {
    e.preventDefault();
    openSettings();
  }

  // Ctrl/Cmd+M → toggle mic
  if (mod && e.key.toLowerCase() === "m") {
    e.preventDefault();
    $("#btn-mic").click();
  }

  // Ctrl/Cmd+F → search sessions (or find in browser)
  if (mod && e.key.toLowerCase() === "f") {
    const openDialog = document.querySelector("dialog[open]");
    if (openDialog && openDialog.id === "sessions") {
      e.preventDefault();
      $("#sessions-search-input").focus();
    }
  }
});

if (sessions.length > 0) {
  loadActiveSession();
} else {
  state.photo = localStorage.getItem("cvstudio.photo");
  if (state.photo) $("#photo-toggle").checked = true;
  state.cv = normalize(saved ? JSON.parse(saved) : EMPTY());
  renderForm(); renderPreview();
  if (saved && state.cv.basics.name) { showWorkspace(); say("assistant", `Welcome back, ${state.cv.basics.name.split(" ")[0]}. Your CV is restored from this browser.`); }
}

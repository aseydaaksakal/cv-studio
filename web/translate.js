/* Live Translate — speak in any language, read it back in the one you pick.
 *
 * How the commercial products do this: audio is streamed over a socket to a GPU
 * datacentre running a continuous recogniser, a language identifier and a
 * translation model, and partial words come back as you speak. That server is the
 * only reason they are word-by-word.
 *
 * Everything here runs in the browser instead, which costs latency and buys
 * privacy and a bill of zero:
 *   1. listen.js cuts the microphone into phrases at each pause.
 *   2. Whisper transcribes a phrase AND reports which language it was — this is
 *      the part that makes "just talk, in anything" work.
 *   3. The phrase is translated by whichever text model the CV editor is already
 *      configured with, so this page downloads nothing of its own. Both the
 *      original and the translation are kept on screen, the way the commercial
 *      tools show them.
 */

import { TRANSLATE_TARGETS, translationPrompt, whisperLangName } from "./core.js";
import { LOCAL_WHISPER, localComplete } from "./engines.js";
import { startPhraseListener } from "./listen.js";

const $ = (s) => document.querySelector(s);
const settings = JSON.parse(localStorage.getItem("cvstudio.settings") || "{}");
const prefs = JSON.parse(localStorage.getItem("cvstudio.translate") || "{}");

const state = { listener: null, heard: [], out: [] };

/* ── language pickers ─────────────────────────────────────────────────────── */

for (const sel of [$("#target"), $("#other")]) {
  for (const [code, label] of TRANSLATE_TARGETS) {
    const o = document.createElement("option");
    o.value = code; o.textContent = label;
    sel.appendChild(o);
  }
}
$("#target").value = prefs.target || "en";
$("#other").value = prefs.other || "tr";
$("#twoway").checked = Boolean(prefs.twoway);
$("#other-row").hidden = !$("#twoway").checked;

const savePrefs = () => localStorage.setItem("cvstudio.translate", JSON.stringify({
  target: $("#target").value, other: $("#other").value, twoway: $("#twoway").checked,
}));

$("#target").onchange = savePrefs;
$("#other").onchange = savePrefs;
$("#twoway").onchange = () => { $("#other-row").hidden = !$("#twoway").checked; savePrefs(); };

/* ── translation ──────────────────────────────────────────────────────────── */

/**
 * Which language should this phrase be shown in?
 * One-way: always the chosen target. Two-way: whichever of the two languages the
 * speaker did not just use, so each side reads the other.
 */
function targetFor(spokenLanguage) {
  const target = $("#target").value;
  if (!$("#twoway").checked) return target;
  const other = $("#other").value;
  return spokenLanguage === target ? other : target;
}

/** Ask whichever text model is configured to translate. Returns "" if none can. */
async function translateText(text, fromCode, toCode) {
  const { system, user } = translationPrompt(text, fromCode, toCode);
  const provider = settings.provider || "local";

  if (provider === "local") {
    const model = settings.localmodel === "__custom__" ? settings.custommodel : settings.localmodel;
    if (!model) throw new Error("No local model is set. Open CV Studio settings and pick one.");
    return (await localComplete(model, system, user, (m) => status(m))).trim();
  }
  if (provider === "ollama") {
    const base = (settings.ollamaurl || "http://localhost:11434").replace(/\/$/, "");
    const r = await fetch(base + "/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: settings.ollamamodel || "qwen3.8:27b", temperature: 0,
        messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    });
    if (!r.ok) throw new Error(`Ollama returned ${r.status}`);
    return ((await r.json()).choices[0].message.content || "").trim();
  }
  if (!settings.apikey) throw new Error("This provider needs a key. Set it in CV Studio settings.");
  if (provider === "openai") {
    const base = (settings.baseurl || "https://api.openai.com/v1").replace(/\/$/, "");
    const r = await fetch(base + "/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + settings.apikey },
      body: JSON.stringify({ model: settings.model || "gpt-4o-mini", temperature: 0,
        messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    });
    if (!r.ok) throw new Error(`Provider returned ${r.status}`);
    return ((await r.json()).choices[0].message.content || "").trim();
  }
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": settings.apikey,
      "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: settings.model || "claude-sonnet-5", max_tokens: 1000, temperature: 0,
      system, messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error(`Provider returned ${r.status}`);
  return ((await r.json()).content[0].text || "").trim();
}

/* ── rendering ────────────────────────────────────────────────────────────── */

const status = (t) => { $("#status").textContent = t; };

function paint() {
  $("#heard").textContent = state.heard.join(" ");
  $("#out").textContent = state.out.join(" ");
  for (const el of [$("#heard"), $("#out")]) el.scrollTop = el.scrollHeight;
}

/* ── listening ────────────────────────────────────────────────────────────── */

async function handlePhrase({ text, language }) {
  state.heard.push(text);
  $("#heard-lang").textContent = language ? whisperLangName(language) : "";
  paint();

  const to = targetFor(language);
  if (language && language === to) { state.out.push(text); paint(); return; }

  try {
    const translated = await translateText(text, language, to);
    state.out.push(translated || "…");
  } catch (e) {
    console.error("Translation failed:", e);
    state.out.push(`[${e.message}]`);
  }
  paint();
}

function setLive(on) {
  $("#btn-mic").classList.toggle("live", on);
  $("#btn-mic").textContent = on ? "⏹" : "🎤";
}

async function start() {
  state.listener = await startPhraseListener({
    model: settings.localwhisper || LOCAL_WHISPER[1][0],
    onStatus: status,
    onSettled: () => { setLive(false); status(state.out.length ? "Stopped." : ""); },
    onError: (e) => status(e.message || "Something went wrong."),
    onPhrase: handlePhrase,
  });
  if (!state.listener) return;
  setLive(true);
  status("Listening… speak in any language.");
}

$("#btn-mic").onclick = () => {
  if (state.listener) { state.listener.stop(); state.listener = null; setLive(false); return; }
  start();
};

$("#btn-clear").onclick = () => { state.heard = []; state.out = []; $("#heard-lang").textContent = ""; paint(); status(""); };
$("#btn-copy").onclick = async () => {
  try { await navigator.clipboard.writeText(state.out.join(" ")); status("Translation copied."); }
  catch { status("Could not copy — select the text instead."); }
};

/* ── theme, shared with the editor ────────────────────────────────────────── */

const THEME_KEY = "cvstudio.theme";
const applyTheme = () => {
  const saved = localStorage.getItem(THEME_KEY) || "system";
  const dark = saved === "dark" || (saved === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
};
$("#btn-theme").onclick = () => {
  const order = ["system", "light", "dark"];
  const next = order[(order.indexOf(localStorage.getItem(THEME_KEY) || "system") + 1) % order.length];
  localStorage.setItem(THEME_KEY, next); applyTheme();
};
applyTheme();

/* Say up front which model will do the translating, so a failure later is not a surprise. */
$("#engine-note").textContent = {
  local: "Translation uses the in-browser text model from CV Studio settings.",
  ollama: "Translation uses Ollama on your machine.",
  openai: "Translation uses your OpenAI-compatible key.",
  anthropic: "Translation uses your Anthropic key.",
}[settings.provider || "local"];

/* Free, keyless engines that run inside the browser.
 *
 *   text : WebLLM (MLC) — an open-weights instruct model compiled to WebGPU
 *   speech : Whisper via transformers.js — multilingual, detects the language itself
 *
 * Both are loaded lazily on first use and cached by the browser afterwards.
 * Nothing leaves the machine. This is the browser counterpart of the desktop
 * edition's local Ollama + faster-whisper.
 */

import { pickLanguage, toMono } from "./core.js";

/* ONNX Runtime and the WebGPU adapter print informational warnings during model
 * loading AND during every inference pass — "VerifyEachNodeIsAssignedToAnEp",
 * "powerPreference is currently ignored", etc. They fire from inside a third-party
 * WASM module, so a load-time wrapper can't catch the ones that happen at inference.
 * These lines are pure noise the user can never act on, so filter them permanently.
 * Real errors (anything not matching this pattern) still reach the console. */
(function silenceInferenceNoise() {
  if (typeof console === "undefined" || console.__cvNoiseFiltered) return;
  console.__cvNoiseFiltered = true;
  const NOISE = /onnxruntime|VerifyEachNodeIsAssignedToAnEp|session_state\.cc|Some nodes were not assigned|Rerunning with verbose|powerPreference option is currently ignored/i;
  for (const method of ["warn", "error", "log", "info", "debug"]) {
    const orig = console[method]?.bind(console);
    if (!orig) continue;
    console[method] = (...args) => { if (!NOISE.test(String(args[0] ?? ""))) orig(...args); };
  }
})();

/** Fallback list, used only when the real catalogue cannot be fetched. Kept to proven browser-safe models (<5GB). */
export const LOCAL_MODELS = [
  ["Qwen2.5-3B-Instruct-q4f16_1-MLC", "Qwen 2.5 3B — ~2.0 GB · editing + parsing"],
  ["Llama-3.2-3B-Instruct-q4f16_1-MLC", "Llama 3.2 3B — ~2.0 GB · alternative"],
  ["Qwen2.5-7B-Instruct-q4f16_1-MLC", "Qwen 2.5 7B — ~4.5 GB · recommended, best quality"],
  ["__custom__", "Other — type an MLC model id"],
];

/**
 * The real catalogue of models WebLLM can run, read from its own config so we
 * never offer an id that does not exist. Sorted by memory, largest last.
 * Falls back to LOCAL_MODELS if the module cannot be loaded.
 */
export async function availableLocalModels() {
  try {
    const webllm = await import(WEBLLM_URL);
    const list = (webllm.prebuiltAppConfig?.model_list || [])
      .filter((m) => {
        const id = m.model_id;
        const mb = m.vram_required_MB || 0;
        const gb = mb / 1024;
        // Keep only top 3 proven models for CV editing
        if (id.includes("Qwen2.5-7B") && gb <= 5.0) return true;
        if (id.includes("Qwen2.5-3B") && gb <= 2.8) return true;
        if (id.includes("Llama-3.2-3B") && gb <= 2.9) return true;
        return false;
      })
      .map((m) => ({ id: m.model_id, mb: m.vram_required_MB || 0 }))
      .sort((a, b) => a.mb - b.mb);
    if (!list.length) return LOCAL_MODELS;
    const seen = new Set();
    const out = [];
    for (const m of list) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      const gb = m.mb ? ` — ~${(m.mb / 1024).toFixed(1)} GB VRAM` : "";
      out.push([m.id, m.id.replace(/-MLC$/, "").replace(/-q4f\d+_\d+$/, "") + gb]);
    }
    out.push(["__custom__", "Other — type an MLC model id"]);
    return out;
  } catch {
    return LOCAL_MODELS;
  }
}

/** The largest model the catalogue offers that fits in `budgetGB`. */
export function pickForBudget(models, budgetGB) {
  const fits = models.filter(([id, label]) => {
    const m = /~([\d.]+) GB/.exec(label);
    return id !== "__custom__" && m && Number(m[1]) <= budgetGB;
  });
  return fits.length ? fits[fits.length - 1][0] : null;
}
export const LOCAL_WHISPER = [
  ["onnx-community/whisper-base", "Whisper base — ~80 MB, fast, weak on Turkish"],
  ["onnx-community/whisper-small", "Whisper small — ~250 MB, good multilingual (default)"],
  ["onnx-community/whisper-large-v3-turbo", "Whisper large-v3-turbo — ~800 MB, best accuracy, needs a GPU"],
];
export const localWhisperId = (id) => (LOCAL_WHISPER.some(([m]) => m === id) ? id : LOCAL_WHISPER[1][0]);

const WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm@0.2.79";
const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2";

export function hasWebGPU() { return typeof navigator !== "undefined" && "gpu" in navigator; }

/* navigator.gpu can exist while the machine has no adapter to give (headless browsers, blocklisted drivers).
   Asking for the adapter is the only honest test, and it is asynchronous, so the answer is cached. */
let adapterOk = null;
export async function webgpuUsable() {
  if (adapterOk !== null) return adapterOk;
  if (!hasWebGPU()) return (adapterOk = false);
  try { adapterOk = Boolean(await navigator.gpu.requestAdapter()); } catch { adapterOk = false; }
  return adapterOk;
}

/* ───────── text model ───────── */

let engine = null, engineModel = null, engineLoading = null;

/**
 * Load (once) and return a chat function for the local model.
 * @param {string} model  one of LOCAL_MODELS
 * @param {(msg:string, pct:number)=>void} onProgress
 */
export async function localChat(model, onProgress = () => {}) {
  if (!hasWebGPU()) throw new Error("This browser has no WebGPU. Use Chrome or Edge 113+, or pick a cloud provider in settings.");
  if (engine && engineModel === model) return engine;
  if (engineLoading) await engineLoading;
  if (engine && engineModel === model) return engine;
  engineLoading = (async () => {
    const webllm = await import(WEBLLM_URL);
    onProgress("Loading the local model (first time downloads it, then it is cached)…", 0);
    const oldLog = console.log, oldWarn = console.warn, oldInfo = console.info;
    console.log = console.warn = console.info = () => {}; // Suppress all WebLLM debug output
    try {
      const created = await webllm.CreateMLCEngine(model, {
        initProgressCallback: (p) => {
          // Only show progress percentage, skip verbose "Fetching param cache" messages
          if (p.progress !== undefined) onProgress(`Downloading ${Math.min(100, Math.round(p.progress || 0))}%`);
        },
      });
      engine = created; engineModel = model;
    } finally { console.log = oldLog; console.warn = oldWarn; console.info = oldInfo; }
  })();
  try { await engineLoading; } finally { engineLoading = null; }
  return engine;
}

/** OpenAI-shaped completion on the local engine. Returns the text. */
export class UnknownModelError extends Error {}

export async function localComplete(model, system, user, onProgress) {
  let e;
  try { e = await localChat(model, onProgress); }
  catch (err) {
    if (/model record|model_list|not found/i.test(String(err.message)))
      throw new UnknownModelError(`This browser cannot run "${model}".`);
    throw err;
  }
  const reply = await e.chat.completions.create({
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    temperature: 0, max_tokens: 4000,
  });
  return reply.choices[0].message.content;
}

/* ───────── speech model ───────── */

let transcriber = null, transcriberModel = null, transcriberLoading = null, tf = null;
/* Mutable ref so a late caller (e.g. mic tap while preload runs) can upgrade the progress callback. */
let _whisperProgress = () => {};

export async function localTranscriber(model, onProgress = () => {}) {
  _whisperProgress = onProgress;
  const gpu = await webgpuUsable();
  /* large-v3-turbo on CPU/WASM is extremely slow — auto-downgrade to whisper-small */
  if (!gpu && model === "onnx-community/whisper-large-v3-turbo") {
    _whisperProgress("No GPU detected — switching to Whisper small for CPU use…", 0);
    model = LOCAL_WHISPER[1][0];
  }
  if (transcriber && transcriberModel === model) return transcriber;
  if (transcriberLoading) await transcriberLoading;
  if (transcriber && transcriberModel === model) return transcriber;
  transcriberLoading = (async () => {
    try {
      tf = await import(TRANSFORMERS_URL);
      const { pipeline, env } = tf;
      env.allowLocalModels = false;
      /* Silence noisy ORT/WebGPU node-assignment warnings — they're informational, not errors */
      if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.logLevel = "error";
      if (env.backends?.onnx?.webgpu) env.backends.onnx.webgpu.logLevel = "error";
      if (env.backends?.onnx) env.backends.onnx.logSeverityLevel = 3;
      _whisperProgress(gpu ? "Downloading speech model…" : "Loading speech model on processor (may be slow)…", 0);
      let lastProgressAt = Date.now();
      const progress_callback = (p) => {
        if (p.status === "progress") {
          lastProgressAt = Date.now();
          const pct = Math.min(100, Math.round(p.progress ?? 0));
          const file = p.file ? ` (${p.file.split("/").pop()})` : "";
          _whisperProgress(`${gpu ? "Downloading" : "Loading"}${file} ${pct}%`);
        } else if (p.status === "download") {
          lastProgressAt = Date.now();
          _whisperProgress(`Downloading ${p.file ? p.file.split("/").pop() : "model files"}…`);
        }
      };
      /* Downloads finish at 100% well before the WebGPU/WASM session is actually ready — ONNX
       * Runtime spends the next 10-40s compiling shaders / building the graph with no progress
       * events at all. Without this, the UI looks frozen right after the last download tick. */
      const compileHint = setInterval(() => {
        if (Date.now() - lastProgressAt > 3000) _whisperProgress(`Preparing the model for your ${gpu ? "GPU" : "processor"} (first run only, up to a minute)…`);
      }, 3000);
      /* fp16 encoder halves memory vs fp32; q4 decoder keeps it small. Falls back to q4+q4 on OOM. */
      const onGPU = { device: "webgpu", dtype: { encoder_model: "fp16", decoder_model_merged: "q4" }, progress_callback };
      const onGPU_q4 = { device: "webgpu", dtype: "q4", progress_callback };
      const onCPU = { device: "wasm", dtype: "q8", progress_callback };
      /* Silence verbose transformers/WebLLM download chatter during load.
       * ORT inference noise is handled permanently by silenceInferenceNoise() above. */
      const oldLog = console.log, oldWarn = console.warn, oldInfo = console.info;
      console.log = console.warn = console.info = () => {};
      try {
        if (gpu) {
          try {
            transcriber = await pipeline("automatic-speech-recognition", model, onGPU);
          } catch (e) {
            const isOOM = e instanceof RangeError || /buffer|memory|allocation/i.test(String(e.message));
            if (!isOOM) throw e;
            /* fp16 encoder still too large — try fully quantized q4 on GPU */
            _whisperProgress("Memory too low for fp16 — trying q4 quantized on GPU…", 0);
            try {
              transcriber = await pipeline("automatic-speech-recognition", model, onGPU_q4);
            } catch (e2) {
              /* GPU q4 also failed — fall back to CPU with smaller model */
              const smallModel = LOCAL_WHISPER[1][0];
              _whisperProgress("GPU out of memory — switching to Whisper small on CPU…", 0);
              transcriber = await pipeline("automatic-speech-recognition", smallModel, onCPU);
              model = smallModel;
            }
          }
        } else {
          transcriber = await pipeline("automatic-speech-recognition", model, onCPU);
        }
      } finally {
        console.log = oldLog;
        console.warn = oldWarn;
        console.info = oldInfo;
        clearInterval(compileHint);
      }
      transcriberModel = model;
    } catch (e) {
      console.error("Whisper model loading failed:", e);
      throw e;
    }
  })();
  try { await transcriberLoading; } finally { transcriberLoading = null; }
  return transcriber;
}

/** Decode a recorded blob to 16 kHz mono Float32, which is what Whisper expects. */
export async function blobToPCM(blob) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const channels = []; for (let c = 0; c < buf.numberOfChannels; c++) channels.push(buf.getChannelData(c));
    return toMono(channels);
  } finally { ctx.close(); }
}

/**
 * Whisper detects the spoken language itself, but transformers.js does not run that step (it defaults to English).
 * So it is done here: run the decoder one token past <|startoftranscript|> and read which language token scores
 * highest. Returns a Whisper code ("tr", "en", …) or null when the loaded model cannot tell (stubs, old builds).
 */
export async function detectLanguage(t, pcm) {
  const gc = t?.model?.generation_config;
  if (!gc?.lang_to_id || !tf?.LogitsProcessor || !t.processor) return null;
  class LanguageProbe extends tf.LogitsProcessor {
    _call(input_ids, logits) { this.detected = pickLanguage(logits[0].data, gc.lang_to_id); return logits; }
  }
  const probe = new LanguageProbe();
  const list = new tf.LogitsProcessorList(); list.push(probe);
  const feats = await t.processor(pcm);
  await t.model.generate({ inputs: feats.input_features, decoder_input_ids: [gc.decoder_start_token_id], max_new_tokens: 1, logits_processor: list });
  return probe.detected || null;
}

/* The ORT session backing the transcriber cannot run two inferences at once
 * ("Session already started" / "Session mismatch"). A timed-out call's promise
 * is abandoned by the caller but keeps running underneath, so a retry while it
 * is still in flight used to collide with it. Chain every call through this
 * lock so they always run one at a time, in order. */
let transcribeChain = Promise.resolve();
export async function localTranscribe(model, blob, onProgress) {
  const run = transcribeChain.then(() => localTranscribeInner(model, blob, onProgress));
  /* Swallow rejection in the chain itself so one failed call doesn't wedge the next. */
  transcribeChain = run.catch(() => {});
  return run;
}

/**
 * Transcribe one already-decoded 16 kHz mono segment. This is the streaming entry
 * point: the caller cuts speech into phrases at silence, so each segment carries
 * its own language and a speaker can switch languages between phrases.
 * Shares the queue with localTranscribe — segments must never overlap on the session.
 */
export async function localTranscribeChunk(model, pcm, onProgress) {
  const run = transcribeChain.then(() => transcribeChunkInner(model, pcm, onProgress));
  transcribeChain = run.catch(() => {});
  return run;
}

async function transcribeChunkInner(model, pcm, onProgress) {
  const t = await localTranscriber(model, onProgress);
  let language = null;
  try { language = await detectLanguage(t, pcm); } catch { language = null; }
  const out = await t(pcm, { task: "transcribe", ...(language ? { language } : {}), return_timestamps: false });
  const text = (Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text || "").trim();
  return { text, language };
}

async function localTranscribeInner(model, blob, onProgress) {
  const t = await localTranscriber(model, onProgress);
  const pcm = await blobToPCM(blob);
  /* Detection is a bonus: if it fails, transcribe anyway rather than losing the recording.
     Both steps report progress, because on a processor they take long enough to look frozen otherwise. */
  let language = null;
  onProgress?.("Working out which language you spoke…", 0);
  try { language = await detectLanguage(t, pcm); } catch { language = null; }
  onProgress?.("Transcribing…", 0);
  const long = pcm.length > 16000 * 30;
  const out = await t(pcm, { task: "transcribe", ...(language ? { language } : {}), ...(long ? { chunk_length_s: 30, stride_length_s: 5 } : {}), return_timestamps: false });
  const text = (Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text || "").trim();
  return { text, language };
}


/* ───────── model capability check ───────── */

/** A fixed instruction whose correct answer we know, used to grade a model. */
export const PROBE = {
  cv: { basics: { name: "Ada Lovelace", title: "Engineer", location: "", phone: "", email: "", links: [] },
        summary: "Builds things.", experience: [], skills: [], projects: [], certifications: [], education: [], languages: [] },
  instruction: "Change the job title to Staff Engineer.",
};

/**
 * Send the probe to a completion function and grade the reply.
 * @returns {{ok: boolean, detail: string, ms: number, raw: string}}
 */
export async function probeModel(complete, system, applyOps) {
  const started = performance.now();
  let raw = "";
  try {
    raw = await complete(system, `CURRENT CV JSON:\n${JSON.stringify(PROBE.cv)}\n\nINSTRUCTION:\n${PROBE.instruction}`);
  } catch (e) {
    return { ok: false, detail: `The model could not be reached: ${e.message}`, ms: performance.now() - started, raw: "" };
  }
  const ms = Math.round(performance.now() - started);
  let parsed;
  try {
    const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
    parsed = JSON.parse(raw.slice(a, b + 1));
  } catch {
    return { ok: false, detail: "Reply was not JSON. This model is too small or ignores the format — pick a larger one.", ms, raw };
  }
  const ops = Array.isArray(parsed.ops) ? parsed.ops : (parsed.ops ? [parsed.ops] : []);
  if (!ops.length) return { ok: false, detail: "The model returned no operations. Pick a larger model.", ms, raw };
  const { cv, applied } = applyOps(PROBE.cv, ops);
  if (!applied) return { ok: false, detail: "The operations did not fit the CV shape. Pick a larger model.", ms, raw };
  if (cv.basics.title !== "Staff Engineer") return { ok: false, detail: `It set the title to "${cv.basics.title}" instead of "Staff Engineer".`, ms, raw };
  if (cv.basics.name !== "Ada Lovelace" || cv.summary !== "Builds things.")
    return { ok: false, detail: "It changed fields it was not asked to change — unsafe for editing.", ms, raw };
  return { ok: true, detail: `Correct in ${(ms / 1000).toFixed(1)}s. This model is good for editing.`, ms, raw };
}

/** Models installed in a local Ollama, or [] when it cannot be reached. */
export async function ollamaModels(url) {
  try {
    const r = await fetch(url.replace(/\/$/, "") + "/api/tags");
    if (!r.ok) return [];
    return (await r.json()).models.map((m) => m.name).sort();
  } catch { return []; }
}

/* Free, keyless engines that run inside the browser.
 *
 *   text : WebLLM (MLC) — an open-weights instruct model compiled to WebGPU
 *   speech : Whisper via transformers.js — multilingual, detects the language itself
 *
 * Both are loaded lazily on first use and cached by the browser afterwards.
 * Nothing leaves the machine. This is the browser counterpart of the desktop
 * edition's local Ollama + faster-whisper.
 */

export const LOCAL_MODELS = [
  ["Qwen2.5-1.5B-Instruct-q4f16_1-MLC", "Qwen 2.5 1.5B — ~1 GB, works on most laptops"],
  ["Qwen2.5-3B-Instruct-q4f16_1-MLC", "Qwen 2.5 3B — ~2 GB, better edits"],
  ["Qwen2.5-7B-Instruct-q4f16_1-MLC", "Qwen 2.5 7B — ~4.5 GB, needs a strong GPU"],
  ["Llama-3.2-3B-Instruct-q4f16_1-MLC", "Llama 3.2 3B — ~2 GB"],
];
export const LOCAL_WHISPER = [
  ["onnx-community/whisper-base", "Whisper base — ~80 MB, fast"],
  ["onnx-community/whisper-small", "Whisper small — ~250 MB, more accurate"],
];

const WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm@0.2.79";
const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2";

export function hasWebGPU() { return typeof navigator !== "undefined" && "gpu" in navigator; }

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
    const created = await webllm.CreateMLCEngine(model, {
      initProgressCallback: (p) => onProgress(p.text || "Loading…", Math.round((p.progress || 0) * 100)),
    });
    engine = created; engineModel = model;
  })();
  try { await engineLoading; } finally { engineLoading = null; }
  return engine;
}

/** OpenAI-shaped completion on the local engine. Returns the text. */
export async function localComplete(model, system, user, onProgress) {
  const e = await localChat(model, onProgress);
  const reply = await e.chat.completions.create({
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    temperature: 0, max_tokens: 4000,
  });
  return reply.choices[0].message.content;
}

/* ───────── speech model ───────── */

let transcriber = null, transcriberModel = null, transcriberLoading = null;

export async function localTranscriber(model, onProgress = () => {}) {
  if (transcriber && transcriberModel === model) return transcriber;
  if (transcriberLoading) await transcriberLoading;
  if (transcriber && transcriberModel === model) return transcriber;
  transcriberLoading = (async () => {
    const { pipeline, env } = await import(TRANSFORMERS_URL);
    env.allowLocalModels = false;
    onProgress("Loading Whisper (first time downloads it, then it is cached)…", 0);
    const device = hasWebGPU() ? "webgpu" : "wasm";
    transcriber = await pipeline("automatic-speech-recognition", model, {
      device, dtype: device === "webgpu" ? { encoder_model: "fp32", decoder_model_merged: "q4" } : "q8",
      progress_callback: (p) => { if (p.status === "progress") onProgress(`Loading Whisper… ${p.file || ""}`, Math.round(p.progress || 0)); },
    });
    transcriberModel = model;
  })();
  try { await transcriberLoading; } finally { transcriberLoading = null; }
  return transcriber;
}

/** Decode a recorded blob to 16 kHz mono Float32, which is what Whisper expects. */
export async function blobToPCM(blob) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  const data = buf.numberOfChannels > 1
    ? buf.getChannelData(0).map((v, i) => (v + buf.getChannelData(1)[i]) / 2)
    : buf.getChannelData(0);
  await ctx.close();
  return data;
}

/** Transcribe a recording; the language is detected by the model. */
export async function localTranscribe(model, blob, onProgress) {
  const t = await localTranscriber(model, onProgress);
  const pcm = await blobToPCM(blob);
  const out = await t(pcm, { task: "transcribe", chunk_length_s: 30, return_timestamps: false });
  return (Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text || "").trim();
}

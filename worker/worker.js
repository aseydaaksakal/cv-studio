/* Speech-to-text endpoint for CV Studio, on Cloudflare Workers AI.
 *
 * The chat apps (ChatGPT, Gemini, Grok) never download a speech model into the
 * browser: the recording is uploaded and a large Whisper runs on their GPUs. This
 * Worker is the same shape on Cloudflare's free tier, so the static GitHub Pages
 * site gets large-v3-turbo quality with no download and no loading screen.
 *
 * POST raw audio (webm/wav/mp3) -> { text, language }
 */

const ALLOWED_ORIGINS = ["https://aseydaaksakal.github.io", "http://localhost:8080"];
const MAX_BYTES = 25 * 1024 * 1024;

/* Spreading a whole recording into String.fromCharCode overflows the call stack. */
function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function cors(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export default {
  async fetch(request, env) {
    const headers = cors(request.headers.get("Origin") || "");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return Response.json({ error: "POST audio" }, { status: 405, headers });

    const audio = await request.arrayBuffer();
    if (!audio.byteLength) return Response.json({ error: "empty audio" }, { status: 400, headers });
    if (audio.byteLength > MAX_BYTES) return Response.json({ error: "audio too large" }, { status: 413, headers });

    try {
      const out = await env.AI.run("@cf/openai/whisper-large-v3-turbo", { audio: toBase64(audio) });
      return Response.json({
        text: (out?.text || "").trim(),
        language: out?.transcription_info?.language || null,
      }, { headers });
    } catch (e) {
      return Response.json({ error: String(e?.message || e) }, { status: 502, headers });
    }
  },
};

/* Phrase-at-a-time microphone listener, shared by the CV editor and the translator.
 *
 * Whisper detects the spoken language itself but only works on a finished clip,
 * while the browser's own recogniser is instant yet has to be told the language.
 * The compromise here: watch the microphone level, cut a clip whenever the speaker
 * pauses, and transcribe each phrase on its own. Every phrase carries its own
 * detected language, which is what lets someone move between languages mid-
 * sentence. Text lands a beat after each phrase rather than word by word — the
 * unavoidable price of not being told the language up front.
 */

import { cleanTranscript } from "./core.js";
import { LOCAL_WHISPER, localTranscribeChunk } from "./engines.js";

export const VAD = {
  rate: 16000,
  speechLevel: 0.012,   // RMS above this counts as speech
  hangoverMs: 700,      // silence this long closes the phrase
  minSpeechMs: 350,     // shorter blips are noise, not words
  maxSegmentMs: 14000,  // flush long monologues so text keeps flowing
};

/* Streaming wants a model that finishes a phrase in well under a second. The large
   model is more accurate but turns every pause into a visible wait, so only the
   explicitly tiny choice is honoured and everything else lands on small. */
export function fastWhisperFor(chosen) {
  return chosen === LOCAL_WHISPER[0][0] ? chosen : LOCAL_WHISPER[1][0];
}

/**
 * Start listening. Returns a handle with `stop()`.
 *
 * @param {object}   o
 * @param {string}   o.model        Whisper model id; passed through fastWhisperFor
 * @param {(p:{text:string,language:string|null})=>void} o.onPhrase  a finished phrase
 * @param {(msg:string)=>void}      [o.onStatus]  progress and state, for the UI
 * @param {()=>void}                [o.onSettled] every queued phrase has been handled
 * @param {(e:Error)=>void}         [o.onError]   microphone or transcription failure
 */
export async function startPhraseListener({ model, onPhrase, onStatus = () => {}, onSettled = () => {}, onError = () => {} }) {
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { onError(new Error("Microphone blocked — allow it in the address bar.")); return null; }

  const whisper = fastWhisperFor(model);
  const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: VAD.rate });
  const source = ctx.createMediaStreamSource(stream);
  /* ScriptProcessor is deprecated but is the one PCM tap that needs no separate
     worklet file, which keeps this a no-build-step static site. */
  const node = ctx.createScriptProcessor(4096, 1, 1);

  const hangoverSamples = (VAD.hangoverMs / 1000) * VAD.rate;
  const minSpeechSamples = (VAD.minSpeechMs / 1000) * VAD.rate;
  const maxSegmentSamples = (VAD.maxSegmentMs / 1000) * VAD.rate;

  let segment = [], segmentSamples = 0, silenceSamples = 0, speaking = false;
  let stopping = false, pending = 0, gotSpeech = false;

  const transcribeSegment = async (pcm) => {
    pending++;
    try {
      const { text, language } = await localTranscribeChunk(whisper, pcm, (msg) => { if (!gotSpeech && !stopping) onStatus(msg); });
      /* Whisper answers noise with subtitle-shaped inventions rather than silence,
         so a phrase only counts once it survives that filter. */
      const speech = cleanTranscript(text);
      if (speech) { gotSpeech = true; onPhrase({ text: speech, language }); }
    } catch (e) {
      console.error("Segment transcription failed:", e);
      onError(e);
    } finally {
      if (--pending === 0 && stopping) onSettled();
    }
  };

  const flush = () => {
    if (segmentSamples < minSpeechSamples) { segment = []; segmentSamples = 0; return; }
    const pcm = new Float32Array(segmentSamples);
    let at = 0; for (const b of segment) { pcm.set(b, at); at += b.length; }
    segment = []; segmentSamples = 0;
    transcribeSegment(pcm);
  };

  node.onaudioprocess = (e) => {
    if (stopping) return;
    const input = e.inputBuffer.getChannelData(0);
    let sum = 0; for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);

    if (rms >= VAD.speechLevel) {
      speaking = true; silenceSamples = 0;
      segment.push(new Float32Array(input)); segmentSamples += input.length;
    } else if (speaking) {
      /* Keep the tail of the pause in the clip: cutting on the exact sample clips
         the last consonant and Whisper drops the final word. */
      segment.push(new Float32Array(input)); segmentSamples += input.length;
      silenceSamples += input.length;
      if (silenceSamples >= hangoverSamples) { speaking = false; silenceSamples = 0; flush(); }
    }
    if (segmentSamples >= maxSegmentSamples) { speaking = false; silenceSamples = 0; flush(); }
  };

  source.connect(node);
  node.connect(ctx.destination);

  return {
    /** Transcribe whatever is still buffered, then tear the audio graph down. */
    stop() {
      if (stopping) return;
      /* Flush first: the phrase someone was midway through when they pressed stop
         would otherwise be thrown away. */
      try { flush(); } catch { /* nothing buffered */ }
      stopping = true;
      try { node.disconnect(); source.disconnect(); } catch { /* already torn down */ }
      try { stream.getTracks().forEach((t) => t.stop()); } catch { /* already stopped */ }
      try { ctx.close(); } catch { /* already closed */ }
      if (pending === 0) onSettled();
      else onStatus("Finishing the last phrase…");
    },
    get pending() { return pending; },
  };
}

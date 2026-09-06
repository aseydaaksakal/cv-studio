# -*- coding: utf-8 -*-
"""voice.py - Asama 6d-5b/c: /voice uc noktasi

app.py'ye eklenmis olmali:
    from voice import router as voice_router
    app.include_router(voice_router)

Uc noktalar:
    POST /voice          ses -> metin   (alanlar: ses, baglam, dil, model)
    POST /voice/warmup   modeli onceden yukle
    GET  /voice/health   model durumu
    GET  /voice/test     tarayici mikrofon test sayfasi
"""

import os
import tempfile
import threading
import time

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse

from stt import BAGLAMLAR, VARSAYILAN_BAGLAM, baglam_al, duzelt

VARSAYILAN_MODEL = "large-v3-turbo"
MODELLER = ["large-v3-turbo", "large-v3"]
CIHAZ = "cpu"
HASSASIYET = "int8"
CPU_THREAD = 8
AZAMI_BAYT = 50 * 1024 * 1024

router = APIRouter()

_modeller = {}
_kilit = threading.Lock()
_yukleme = {}


def model_al(ad=None):
    """Modeli tek sefer yukler, sonraki cagrilarda hazir doner."""
    ad = ad if ad in MODELLER else VARSAYILAN_MODEL
    if ad not in _modeller:
        with _kilit:
            if ad not in _modeller:
                from faster_whisper import WhisperModel
                t0 = time.time()
                _modeller[ad] = WhisperModel(ad, device=CIHAZ,
                                             compute_type=HASSASIYET,
                                             cpu_threads=CPU_THREAD)
                _yukleme[ad] = round(time.time() - t0, 2)
    return _modeller[ad]


def coz(yol, baglam=None, dil="tr", model_adi=None, vad="oto"):
    """Ses dosyasini metne cevirir. Sozluk doner.

    dil: "tr" / "en" / "oto"   (oto = kod degistirmeli, segment basina dil)
    vad: "oto" / "acik" / "kapali"  (oto = baglam profilinden gelir)
    """
    model = model_al(model_adi)
    prompt, hotwords, ayar = baglam_al(baglam)
    coklu = (dil in (None, "", "oto", "auto"))

    if vad == "acik":
        vad_ac = True
    elif vad == "kapali":
        vad_ac = False
    else:
        vad_ac = ayar["vad"]

    t0 = time.time()
    segmentler, bilgi = model.transcribe(
        yol,
        language=None if coklu else dil,
        multilingual=coklu,
        task="transcribe",
        beam_size=5,
        vad_filter=vad_ac,
        vad_parameters={"speech_pad_ms": 700, "min_silence_duration_ms": 1000,
                        "threshold": 0.3} if vad_ac else None,
        condition_on_previous_text=ayar["onceki"],
        temperature=(0.0, 0.2, 0.4, 0.6),
        compression_ratio_threshold=2.2,
        log_prob_threshold=-1.0,
        no_speech_threshold=0.6,
        repetition_penalty=1.15,
        no_repeat_ngram_size=4,
        initial_prompt=prompt,
        hotwords=hotwords,
    )
    parcalar = [s.text.strip() for s in segmentler]
    ham = " ".join(p for p in parcalar if p).strip()
    sure = time.time() - t0

    metin, n_duz = duzelt(ham, baglam)

    return {
        "ok": True,
        "metin": metin,
        "ham": ham,
        "duzeltme": n_duz,
        "segment": len(parcalar),
        "sure": round(sure, 2),
        "ses_suresi": round(bilgi.duration, 2),
        "dil": bilgi.language,
        "guven": round(bilgi.language_probability, 2),
        "istenen_dil": dil,
        "vad": vad_ac,
        "onceki_metin": ayar["onceki"],
        "baglam": baglam or VARSAYILAN_BAGLAM,
        "model": model_adi if model_adi in MODELLER else VARSAYILAN_MODEL,
    }


@router.post("/voice")
async def voice(ses: UploadFile = File(...),
                baglam: str = Form(VARSAYILAN_BAGLAM),
                dil: str = Form("tr"),
                model: str = Form(VARSAYILAN_MODEL),
                vad: str = Form("oto")):
    veri = await ses.read()
    if not veri:
        raise HTTPException(400, "bos ses")
    if len(veri) > AZAMI_BAYT:
        raise HTTPException(413, "ses cok buyuk (%d bayt)" % len(veri))

    uzanti = os.path.splitext(ses.filename or "")[1] or ".webm"
    gecici = tempfile.NamedTemporaryFile(suffix=uzanti, delete=False)
    try:
        gecici.write(veri)
        gecici.close()
        sonuc = coz(gecici.name, baglam, dil, model, vad)
    except Exception as e:
        raise HTTPException(500, "cozme hatasi: %s" % e)
    finally:
        try:
            os.unlink(gecici.name)
        except OSError:
            pass

    sonuc["bayt"] = len(veri)
    sonuc["dosya"] = ses.filename
    return sonuc


@router.post("/voice/warmup")
async def warmup(model: str = Form(VARSAYILAN_MODEL)):
    t0 = time.time()
    ad = model if model in MODELLER else VARSAYILAN_MODEL
    hazirdi = ad in _modeller
    model_al(ad)
    return {"ok": True, "model": ad, "hazirdi": hazirdi,
            "sure": round(time.time() - t0, 2),
            "yukleme": _yukleme.get(ad, 0.0)}


@router.get("/voice/health")
async def voice_health():
    return {
        "ok": True,
        "modeller": MODELLER,
        "yuklu": sorted(_modeller),
        "yukleme": _yukleme,
        "cihaz": CIHAZ,
        "hassasiyet": HASSASIYET,
        "cpu_thread": CPU_THREAD,
        "baglamlar": sorted(BAGLAMLAR),
        "azami_mb": AZAMI_BAYT // (1024 * 1024),
    }


@router.get("/voice/test", response_class=HTMLResponse)
async def voice_test():
    return TEST_SAYFASI


TEST_SAYFASI = """<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mikrofon testi - 6d-5c</title>
<style>
  * { box-sizing: border-box; }
  body { margin:0; padding:24px; font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;
         background:#14161a; color:#e6e8eb; }
  h1 { font-size:16px; margin:0 0 4px; }
  .alt { color:#8b929c; font-size:12px; }
  #tani { margin:6px 0 18px; padding:8px 12px; border-radius:6px;
          background:#181b21; border:1px solid #2c313a; font-size:12px;
          color:#8b929c; }
  .sira { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:14px; }
  button, select { font:inherit; padding:9px 14px; border-radius:8px;
           border:1px solid #2c313a; background:#1c2028; color:#e6e8eb; cursor:pointer; }
  button:hover:not(:disabled) { background:#252a33; }
  button:disabled { opacity:.4; cursor:default; }
  select { padding:8px 10px; }
  label { font-size:12px; color:#8b929c; margin-right:4px; }
  #mic { width:64px; height:64px; border-radius:50%; font-size:24px; padding:0;
         border:2px solid #2c313a; }
  #mic.kayit { background:#7f1d1d; border-color:#dc2626; animation:nabiz 1.2s infinite; }
  @keyframes nabiz { 50% { border-color:#7f1d1d; } }
  textarea { width:100%; min-height:110px; padding:12px; border-radius:8px;
             border:1px solid #2c313a; background:#0f1115; color:#e6e8eb;
             font:inherit; resize:vertical; }
  .kutu { border:1px solid #2c313a; border-radius:8px; padding:12px; margin-top:16px;
          background:#181b21; }
  .kayit-satir { border-top:1px solid #22262e; padding:10px 0; }
  .kayit-satir:first-child { border-top:0; }
  .ust { color:#8b929c; font-size:12px; margin-bottom:4px; }
  .ham { color:#8b929c; font-size:12px; }
  .hata { color:#f87171; }
  .ok { color:#4ade80; }
  code { background:#0f1115; padding:1px 5px; border-radius:4px; font-size:12px; }
</style>
</head>
<body>

<h1>Mikrofon &rarr; /voice testi</h1>
<div class="alt">MediaRecorder ile kayit alir, <code>POST /voice</code> ile cozdurur.
Metin birikir, ustune yazmaz.</div>

<div id="tani">tani yukleniyor...</div>

<div class="sira">
  <button id="mic" title="Kayit baslat/durdur">&#127908;</button>
  <span>
    <label>baglam</label>
    <select id="baglam">
      <option value="cv">cv - CV komutlari</option>
      <option value="yazilim">yazilim - terim sozlugu</option>
      <option value="karisik">karisik - TR + EN</option>
      <option value="osmanlica">osmanlica - eski Turkce</option>
      <option value="genel">genel - prompt yok</option>
    </select>
  </span>
  <span>
    <label>dil</label>
    <select id="dil">
      <option value="tr">tr</option>
      <option value="en">en</option>
      <option value="oto">oto (kod degistirme)</option>
    </select>
  </span>
  <span>
    <label>model</label>
    <select id="model">
      <option value="large-v3-turbo">large-v3-turbo (hizli)</option>
      <option value="large-v3">large-v3 (dogru, yavas)</option>
    </select>
  </span>
  <span>
    <label>vad</label>
    <select id="vad">
      <option value="oto">oto</option>
      <option value="acik">acik</option>
      <option value="kapali">kapali</option>
    </select>
  </span>
  <button id="isit">Modeli isit</button>
  <button id="temizle">Metni temizle</button>
  <span id="durum" class="alt"></span>
</div>

<textarea id="metin" placeholder="Cozulen metin buraya birikir..."></textarea>

<div class="kutu">
  <div class="ust">Denemeler</div>
  <div id="liste"></div>
</div>

<script>
const mic = document.getElementById('mic');
const durum = document.getElementById('durum');
const tani = document.getElementById('tani');
const kutuMetin = document.getElementById('metin');
const liste = document.getElementById('liste');
const secBaglam = document.getElementById('baglam');
const secDil = document.getElementById('dil');
const secModel = document.getElementById('model');
const secVad = document.getElementById('vad');

let kaydedici = null, parcalar = [], kayitta = false, t0 = 0, mimeTuru = '';

function mimeSec() {
  const adaylar = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'];
  for (const m of adaylar) if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

function satirEkle(html) {
  const d = document.createElement('div');
  d.className = 'kayit-satir';
  d.innerHTML = html;
  liste.prepend(d);
}

async function baslat() {
  try {
    const akis = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount:1, echoCancellation:true, noiseSuppression:true }
    });
    mimeTuru = mimeSec();
    kaydedici = new MediaRecorder(akis, mimeTuru ? { mimeType: mimeTuru } : {});
    parcalar = [];
    kaydedici.ondataavailable = e => { if (e.data.size) parcalar.push(e.data); };
    kaydedici.onstop = () => { akis.getTracks().forEach(t => t.stop()); gonder(); };
    kaydedici.start();
    kayitta = true; t0 = performance.now();
    mic.classList.add('kayit');
    durum.textContent = 'kayit...';
  } catch (e) {
    durum.innerHTML = '<span class="hata">mikrofon yok: ' + e.message + '</span>';
  }
}

function durdur() {
  if (kaydedici && kayitta) { kaydedici.stop(); kayitta = false; mic.classList.remove('kayit'); }
}

async function gonder() {
  const sure = ((performance.now() - t0) / 1000).toFixed(1);
  const tur = kaydedici.mimeType || mimeTuru || 'audio/webm';
  const uzanti = tur.includes('ogg') ? 'ogg' : tur.includes('mp4') ? 'mp4' : 'webm';
  const blob = new Blob(parcalar, { type: tur });
  durum.textContent = 'cozuluyor... (' + blob.size + ' bayt)';

  const veri = new FormData();
  veri.append('ses', blob, 'kayit.' + uzanti);
  veri.append('baglam', secBaglam.value);
  veri.append('dil', secDil.value);
  veri.append('model', secModel.value);
  veri.append('vad', secVad.value);

  const b0 = performance.now();
  try {
    const c = await fetch('/voice', { method: 'POST', body: veri });
    const gidis = ((performance.now() - b0) / 1000).toFixed(1);
    if (!c.ok) {
      satirEkle('<span class="hata">HTTP ' + c.status + '</span> ' +
                (await c.text()).slice(0,300));
      durum.innerHTML = '<span class="hata">hata</span>';
      return;
    }
    const d = await c.json();
    kutuMetin.value = (kutuMetin.value.trim() + ' ' + d.metin).trim();
    kutuMetin.scrollTop = kutuMetin.scrollHeight;
    satirEkle(
      '<div class="ust">' + d.baglam + ' | ' + d.istenen_dil + ' &rarr; ' +
      d.dil + ' (' + d.guven + ') | ' + d.model + ' | ' + blob.size +
      ' bayt | kayit ' + sure + ' sn | ses ' + d.ses_suresi +
      ' sn | cozme ' + d.sure + ' sn | gidis-donus ' + gidis +
      ' sn | segment ' + d.segment + ' | vad ' + d.vad + ' | duzeltme ' + d.duzeltme + '</div>' +
      '<div>' + d.metin + '</div>' +
      (d.ham !== d.metin ? '<div class="ham">ham: ' + d.ham + '</div>' : ''));
    durum.innerHTML = '<span class="ok">tamam</span>';
  } catch (e) {
    satirEkle('<span class="hata">' + e.message + '</span>');
    durum.innerHTML = '<span class="hata">baglanti hatasi</span>';
  }
}

mic.onclick = () => kayitta ? durdur() : baslat();
document.getElementById('temizle').onclick = () => { kutuMetin.value = ''; };
document.getElementById('isit').onclick = async () => {
  durum.textContent = 'model yukleniyor...';
  const f = new FormData(); f.append('model', secModel.value);
  const c = await fetch('/voice/warmup', { method: 'POST', body: f });
  const d = await c.json();
  durum.textContent = 'model hazir: ' + d.model + ' (' + d.sure + ' sn)';
  taniYaz();
};

async function taniYaz() {
  let sag = '';
  try {
    const d = await (await fetch('/voice/health')).json();
    sag = ' | yuklu model: ' + (d.yuklu.length ? d.yuklu.join(', ') : 'yok') +
          ' | baglamlar: ' + d.baglamlar.join(', ');
  } catch (e) { sag = ' | /voice/health okunamadi'; }
  tani.textContent = 'guvenli baglam: ' + window.isSecureContext +
    ' | desteklenen tur: ' + (mimeSec() || 'YOK') + sag;
}
taniYaz();
</script>
</body>
</html>"""

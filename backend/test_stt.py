# -*- coding: utf-8 -*-
"""test_stt.py - Asama 6d-5a olcum araci

Mikrofondan kayit alir, faster-whisper ile CPU/int8 cozer,
stt.py terim duzeltmesini uygular, sureleri ve metni yazar.

Kullanim:
    python test_stt.py                 15 saniye kayit al, coz
    python test_stt.py --sure 30       30 saniye kayit al
    python test_stt.py --cihazlar      ses giris cihazlarini listele
    python test_stt.py --cihaz 1       belirli giris cihazini kullan
    python test_stt.py --dosya C:\\cv-studio\\output\\ses_test.wav
                                       kayit alma, var olan wav'i coz
    python test_stt.py --model large-v3
"""

import argparse
import os
import sys
import time
import wave

import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel

from stt import INITIAL_PROMPT, duzelt

ORNEK_HIZI = 16000
KANAL = 1
PROJE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CIKTI = os.path.join(PROJE, "output", "ses_test.wav")


def cihazlari_yaz():
    print("--- ses cihazlari ---")
    for i, c in enumerate(sd.query_devices()):
        if c["max_input_channels"] > 0:
            print("%3d  %s  (%d kanal)" % (i, c["name"], c["max_input_channels"]))
    print("varsayilan giris:", sd.default.device)


def kayit_al(sure, cihaz):
    print("Mikrofon hazirlaniyor...")
    for i in (3, 2, 1):
        print("  %d..." % i)
        time.sleep(1)
    print(">>> KONUS (%d saniye) <<<" % sure)
    ses = sd.rec(int(sure * ORNEK_HIZI), samplerate=ORNEK_HIZI,
                 channels=KANAL, dtype="int16", device=cihaz)
    sd.wait()
    print(">>> bitti <<<")
    return ses.reshape(-1)


def wav_yaz(yol, ses):
    os.makedirs(os.path.dirname(yol), exist_ok=True)
    with wave.open(yol, "wb") as f:
        f.setnchannels(KANAL)
        f.setsampwidth(2)
        f.setframerate(ORNEK_HIZI)
        f.writeframes(ses.tobytes())
    return os.path.getsize(yol)


def wav_oku(yol):
    with wave.open(yol, "rb") as f:
        ham = f.readframes(f.getnframes())
    return np.frombuffer(ham, dtype=np.int16)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sure", type=int, default=15)
    ap.add_argument("--cihaz", type=int, default=None)
    ap.add_argument("--model", default="large-v3-turbo")
    ap.add_argument("--dosya", default=None)
    ap.add_argument("--cihazlar", action="store_true")
    ap.add_argument("--promptsuz", action="store_true",
                    help="initial_prompt vermeden coz (karsilastirma icin)")
    a = ap.parse_args()

    if a.cihazlar:
        cihazlari_yaz()
        return

    if a.dosya:
        yol = a.dosya
        ses = wav_oku(yol)
        boyut = os.path.getsize(yol)
    else:
        yol = CIKTI
        ses = kayit_al(a.sure, a.cihaz)
        boyut = wav_yaz(yol, ses)

    print("kayit     : %s (%d bayt)" % (yol, boyut))
    print("tepe seviye: %d / 32767" % int(np.abs(ses).max()))

    t0 = time.time()
    model = WhisperModel(a.model, device="cpu", compute_type="int8")
    t_yukleme = time.time() - t0

    t0 = time.time()
    segmentler, bilgi = model.transcribe(
        yol,
        language="tr",
        beam_size=5,
        vad_filter=True,
        vad_parameters={"speech_pad_ms": 500, "min_silence_duration_ms": 700},
        condition_on_previous_text=False,
        temperature=0.0,
        initial_prompt=None if a.promptsuz else INITIAL_PROMPT,
    )
    parcalar = [s.text for s in segmentler]
    t_cozme = time.time() - t0

    ham = " ".join(p.strip() for p in parcalar).strip()
    metin, n_duz = duzelt(ham)
    ses_suresi = len(ses) / ORNEK_HIZI

    print()
    print("--- SONUC ---")
    print("model     : %s  (cpu / int8)" % a.model)
    print("prompt    : %s" % ("yok" if a.promptsuz else "var (%d krkt)" % len(INITIAL_PROMPT)))
    print("ses suresi: %.1f sn" % ses_suresi)
    print("yukleme   : %.1f sn" % t_yukleme)
    print("cozme     : %.1f sn  (%.2fx gercek zaman)" % (t_cozme, t_cozme / max(ses_suresi, 0.001)))
    print("dil       : %s (guven %.2f)" % (bilgi.language, bilgi.language_probability))
    print("segment   : %d" % len(parcalar))
    print("duzeltme  : %d" % n_duz)
    print("karakter  : %d" % len(metin))
    print()
    print("HAM METIN:")
    print(ham)
    print()
    print("METIN:")
    print(metin)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(1)

# -*- coding: utf-8 -*-
"""test_stt_zor.py - Asama 6d-5a zor test seti

Referans cumleyi ekrana basar, sen okursun, cozer ve
kelime/karakter hata oranini HAM ve DUZELTILMIS metin icin ayri hesaplar.

Kullanim:
    python test_stt_zor.py --liste          cumleleri goster, kayit alma
    python test_stt_zor.py --no 3           3 numarali cumleyi test et
    python test_stt_zor.py --hepsi          hepsini sirayla test et
    python test_stt_zor.py --no 3 --dosya C:\\cv-studio\\output\\zor_03.wav
                                            var olan kaydi yeniden coz
    python test_stt_zor.py --no 3 --promptsuz   prompt etkisini olc
"""

import argparse
import os
import re
import sys
import time
import unicodedata
import wave

import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel

from stt import INITIAL_PROMPT, duzelt

ORNEK_HIZI = 16000
KANAL = 1
PROJE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CIKTI_KLASOR = os.path.join(PROJE, "output")

# (sure_saniye, zorluk, referans metin)
CUMLELER = [
    (12, "Turkce sesli harf ve yumusak g",
     "Şişli'deki müşavirliğe başvurduğumuzda çağrışımlarımızın "
     "değiştirilemeyeceğini öğrendik."),

    (14, "Ingilizce teknik terim yogunlugu",
     "Kubernetes, LangGraph, gRPC ve PostgreSQL becerilerini SKILLS "
     "bölümünün en üstüne taşı."),

    (15, "Karisik terim artı kisaltma",
     "OAuth ve JWT satırlarını sil, nginx ile Redis maddelerini birleştir, "
     "CI/CD sürecini DevOps başlığı altına al."),

    (14, "Sayi, yuzde, tarih, birim",
     "Başlık puntosunu on iki yap, satır aralığını yüzde kırk azalt, "
     "iki bin on dokuz iki bin yirmi dört tarihini kalın yaz."),

    (13, "Ozel isim ve kesme isareti",
     "Abdullah Seyda Aksakal'ın İstanbul'daki sertifikalarını "
     "CERTIFICATIONS bölümünün altına al."),

    (12, "Benzer sesli Turkce kelimeler",
     "Kâr marjı satırı hâlâ yanlış, adet ile âdet karışmış, "
     "yazın bölümünü aşağı al."),

    (15, "Uzun bilesik komut",
     "Bölüm başlıklarını lacivert yap, puntoyu iki punto büyüt, "
     "PROJECTS bölümünü EDUCATION bölümünün üstüne taşı ve "
     "p99 gecikme satırını sil."),

    (13, "Ingilizce ozel isim yazimi",
     "Terraform, Prometheus, Grafana ve PyTorch maddelerini "
     "GitHub bağlantısıyla birlikte ekle."),
]


# --- metin normalizasyon ve hata orani ---

def tr_kucult(s):
    return s.replace("I", "ı").replace("İ", "i").lower()


# Turkce sayi sozcukleri -> rakam
_BIR = {"sıfır":0,"bir":1,"iki":2,"üç":3,"uc":3,"dört":4,"dort":4,"beş":5,"bes":5,
        "altı":6,"alti":6,"yedi":7,"sekiz":8,"dokuz":9}
_ON = {"on":10,"yirmi":20,"otuz":30,"kırk":40,"kirk":40,"elli":50,
       "altmış":60,"altmis":60,"yetmiş":70,"yetmis":70,"seksen":80,"doksan":90}


def sayilari_cevir(kelimeler):
    """Ardisik Turkce sayi sozcuklerini rakama cevirir."""
    cikan, i = [], 0
    while i < len(kelimeler):
        k = kelimeler[i]
        if k not in _BIR and k not in _ON and k not in ("yüz", "yuz", "bin"):
            cikan.append(k)
            i += 1
            continue
        toplam, parca, bin_gordu = 0, 0, False
        while i < len(kelimeler):
            k = kelimeler[i]
            if k in _BIR:
                if parca % 10 or (parca and parca < 10):
                    break
                parca += _BIR[k]
            elif k in _ON:
                if parca >= 10:
                    break
                parca += _ON[k]
            elif k in ("yüz", "yuz"):
                parca = (parca or 1) * 100
            elif k == "bin":
                if bin_gordu:
                    break
                toplam += (parca or 1) * 1000
                parca, bin_gordu = 0, True
            else:
                break
            i += 1
        cikan.append(str(toplam + parca))
    return cikan


def gevsek(s):
    """Buyuk/kucuk harf, noktalama, sapka, i/i ve rakam-yazi farkini siler."""
    s = s.lower().replace("I", "ı")
    for a, b in (("â","a"),("î","i"),("û","u"),("ı","i"),("İ","i")):
        s = s.replace(a, b)
    s = s.replace("%", " yüzde ")
    s = re.sub(r"['’‘/\-–]", " ", s)
    s = re.sub(r"[.,;:!?\"()\[\]…]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return " ".join(sayilari_cevir(s.split()))


def normalize(s):
    s = tr_kucult(s)
    s = unicodedata.normalize("NFC", s)
    s = s.replace("’", "'").replace("‘", "'")
    s = re.sub(r"[.,;:!?\"()\[\]…]", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def levenshtein(a, b):
    if len(a) < len(b):
        a, b = b, a
    onceki = list(range(len(b) + 1))
    for i, ka in enumerate(a, 1):
        simdiki = [i]
        for j, kb in enumerate(b, 1):
            simdiki.append(min(onceki[j] + 1,
                               simdiki[j - 1] + 1,
                               onceki[j - 1] + (ka != kb)))
        onceki = simdiki
    return onceki[-1]


def hata_orani(referans, cikan, kip="kati"):
    f = normalize if kip == "kati" else gevsek
    r_n, c_n = f(referans), f(cikan)
    rk, ck = r_n.split(), c_n.split()
    wer = levenshtein(rk, ck) / max(len(rk), 1)
    cer = levenshtein(r_n, c_n) / max(len(r_n), 1)
    return wer, cer, len(rk)


def farklari_yaz(referans, cikan):
    rk, ck = gevsek(referans).split(), gevsek(cikan).split()
    ck_set = set(ck)
    kayip = [k for k in rk if k not in ck_set]
    rk_set = set(rk)
    fazla = [k for k in ck if k not in rk_set]
    if kayip:
        print("  kacirilan : " + ", ".join(kayip[:12]))
    if fazla:
        print("  uydurulan : " + ", ".join(fazla[:12]))


# --- ses ---

def kayit_al(sure):
    print("Mikrofon hazirlaniyor...")
    for i in (3, 2, 1):
        print("  %d..." % i)
        time.sleep(1)
    print(">>> KONUS (%d saniye) <<<" % sure)
    ses = sd.rec(int(sure * ORNEK_HIZI), samplerate=ORNEK_HIZI,
                 channels=KANAL, dtype="int16")
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
        return np.frombuffer(f.readframes(f.getnframes()), dtype=np.int16)


# --- ana akis ---

def tek_test(model, no, a):
    sure, zorluk, referans = CUMLELER[no - 1]

    print()
    print("=" * 72)
    print("CUMLE %d  (%s)  %d sn" % (no, zorluk, sure))
    print("=" * 72)
    print(referans)
    print()

    yol = a.dosya or os.path.join(CIKTI_KLASOR, "zor_%02d.wav" % no)
    if a.dosya or a.kayittan:
        ses = wav_oku(yol)
    else:
        input("Hazir oldugunda Enter'a bas...")
        ses = kayit_al(sure)
        wav_yaz(yol, ses)

    print("kayit     : %s" % yol)
    print("tepe seviye: %d / 32767" % int(np.abs(ses).max()))

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
    ham = " ".join(s.text.strip() for s in segmentler).strip()
    t_cozme = time.time() - t0

    metin, n_duz = duzelt(ham)

    wer_h, cer_h, kelime = hata_orani(referans, ham, "kati")
    wer_d, cer_d, _ = hata_orani(referans, metin, "kati")
    gwer_h, gcer_h, _ = hata_orani(referans, ham, "gevsek")
    gwer_d, gcer_d, _ = hata_orani(referans, metin, "gevsek")

    print()
    print("--- SONUC %d ---" % no)
    print("prompt    : %s" % ("yok" if a.promptsuz else "var"))
    print("cozme     : %.1f sn  (%.2fx)" % (t_cozme, t_cozme / max(len(ses) / ORNEK_HIZI, 0.001)))
    print("kelime    : %d" % kelime)
    print("duzeltme  : %d" % n_duz)
    print("KATI   HAM : WER %.1f%%  CER %.1f%%" % (wer_h * 100, cer_h * 100))
    print("KATI   DUZ : WER %.1f%%  CER %.1f%%" % (wer_d * 100, cer_d * 100))
    print("GEVSEK HAM : WER %.1f%%  CER %.1f%%" % (gwer_h * 100, gcer_h * 100))
    print("GEVSEK DUZ : WER %.1f%%  CER %.1f%%  <-- gercek hata" % (gwer_d * 100, gcer_d * 100))
    print()
    print("HAM METIN:")
    print(ham)
    print()
    print("METIN:")
    print(metin)
    farklari_yaz(referans, metin)

    return wer_h, cer_h, wer_d, cer_d, gwer_h, gcer_h, gwer_d, gcer_d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no", type=int, default=None)
    ap.add_argument("--hepsi", action="store_true")
    ap.add_argument("--liste", action="store_true")
    ap.add_argument("--dosya", default=None)
    ap.add_argument("--model", default="large-v3-turbo")
    ap.add_argument("--promptsuz", action="store_true")
    ap.add_argument("--kayittan", action="store_true",
                    help="mikrofon kullanma, zor_NN.wav dosyalarini yeniden coz")
    a = ap.parse_args()

    if a.liste:
        for i, (sure, zorluk, ref) in enumerate(CUMLELER, 1):
            print("%d) [%d sn] %s" % (i, sure, zorluk))
            print("   %s" % ref)
        return

    if not a.hepsi and a.no is None:
        print("--no N veya --hepsi ver. Cumleler icin --liste")
        return

    print("model yukleniyor...")
    t0 = time.time()
    model = WhisperModel(a.model, device="cpu", compute_type="int8")
    print("yukleme   : %.1f sn" % (time.time() - t0))

    nolar = range(1, len(CUMLELER) + 1) if a.hepsi else [a.no]
    sonuc = [tek_test(model, n, a) for n in nolar]

    if len(sonuc) > 1:
        print()
        print("=" * 72)
        print("ORTALAMA (%d cumle)" % len(sonuc))
        ort = lambda i: 100 * sum(s[i] for s in sonuc) / len(sonuc)
        print("KATI   HAM : WER %.1f%%  CER %.1f%%" % (ort(0), ort(1)))
        print("KATI   DUZ : WER %.1f%%  CER %.1f%%" % (ort(2), ort(3)))
        print("GEVSEK HAM : WER %.1f%%  CER %.1f%%" % (ort(4), ort(5)))
        print("GEVSEK DUZ : WER %.1f%%  CER %.1f%%  <-- gercek hata" % (ort(6), ort(7)))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(1)

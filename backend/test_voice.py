# -*- coding: utf-8 -*-
"""test_voice.py - Asama 6d-5b olcumu

Calisan sunucuya kayitli wav dosyalarini gonderir, cevabi ve
istek suresini yazar. Sunucu ayakta olmali:
    .\\.venv\\Scripts\\uvicorn.exe app:app --reload --port 8000

Kullanim:
    python test_voice.py                zor_01..zor_08 hepsini gonder
    python test_voice.py --no 2         tek dosya gonder
    python test_voice.py --saglik       sadece /voice/health
"""

import argparse
import os
import time

import httpx

SUNUCU = "http://127.0.0.1:8000"
PROJE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KLASOR = os.path.join(PROJE, "output")


def saglik():
    r = httpx.get(SUNUCU + "/voice/health", timeout=10)
    print("/voice/health ->", r.status_code)
    for k, v in r.json().items():
        print("  %-12s %s" % (k, v))


def isit():
    t0 = time.time()
    r = httpx.post(SUNUCU + "/voice/warmup", timeout=300)
    print("/voice/warmup -> %s  (%.1f sn)" % (r.status_code, time.time() - t0))
    print("  ", r.json())


def gonder(yol):
    if not os.path.exists(yol):
        print("YOK: %s" % yol)
        return None
    boyut = os.path.getsize(yol)
    t0 = time.time()
    with open(yol, "rb") as f:
        r = httpx.post(SUNUCU + "/voice",
                       files={"ses": (os.path.basename(yol), f, "audio/wav")},
                       timeout=300)
    gecen = time.time() - t0

    print()
    print("-" * 68)
    print("%s  (%d bayt)  HTTP %d  istek %.1f sn" %
          (os.path.basename(yol), boyut, r.status_code, gecen))
    if r.status_code != 200:
        print("  HATA:", r.text[:300])
        return None
    d = r.json()
    print("  ses %.1f sn | cozme %.1f sn | duzeltme %d | dil %s (%.2f)" %
          (d["ses_suresi"], d["sure"], d["duzeltme"], d["dil"], d["guven"]))
    print("  HAM  :", d["ham"])
    print("  METIN:", d["metin"])
    return gecen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no", type=int, default=None)
    ap.add_argument("--saglik", action="store_true")
    a = ap.parse_args()

    saglik()
    if a.saglik:
        return

    isit()
    saglik()

    nolar = [a.no] if a.no else range(1, 9)
    sureler = []
    for n in nolar:
        g = gonder(os.path.join(KLASOR, "zor_%02d.wav" % n))
        if g:
            sureler.append(g)

    if len(sureler) > 1:
        print()
        print("=" * 68)
        print("istek sayisi : %d" % len(sureler))
        print("ortalama     : %.1f sn" % (sum(sureler) / len(sureler)))
        print("en yavas     : %.1f sn" % max(sureler))


if __name__ == "__main__":
    main()

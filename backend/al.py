# -*- coding: utf-8 -*-
"""al.py - Downloads klasorundeki dosyalari projeye tasir.

- Cikan tek dosyalari alir  (stt.py, "stt (1).py", "voice (2).py" ...)
- ZIP arsivlerini kendisi acar ("files.zip", "files (3).zip" ...)
- Ayni dosyanin birden fazla surumu varsa EN YENISINI secer
- Kopyaladiktan sonra Downloads'takileri siler
- Ilk calistirmada kendini backend'e kopyalar ve guncelle.cmd uretir

Ilk calistirma (Downloads'tan):
    .\\.venv\\Scripts\\python.exe "$env:USERPROFILE\\Downloads\\al.py"

Sonraki her seferde (backend klasorunde):
    guncelle
"""

import argparse
import os
import shutil
import sys
import time
import zipfile

# ------------------------------------------------------------
# hangi dosya nereye gider
# ------------------------------------------------------------
BACKEND = {
    "stt.py", "voice.py", "app.py", "llm.py", "classify.py", "commands.py",
    "design.py", "cssguard.py", "render_cv.py", "analyze_cv.py", "parse_cv.py",
    "compare_cv.py", "diff_cv.py", "test_stt.py", "test_stt_zor.py",
    "test_voice.py", "test_llm.py", "test_commands.py", "test_design.py",
    "test_classify.py", "al.py", "gonder.py", "requirements.txt",
}
FRONTEND = {"index.html", "style.css", "app.js"}

GUNCELLE_CMD = (
    "@echo off\r\n"
    "cd /d \"%~dp0\"\r\n"
    ".\\.venv\\Scripts\\python.exe al.py %*\r\n"
)


def temel_ad(ad):
    """'stt (1).py' -> 'stt.py'"""
    ad = os.path.basename(ad.replace("\\", "/"))
    kok, uzanti = os.path.splitext(ad)
    kok = kok.rstrip()
    if kok.endswith(")") and "(" in kok:
        onek = kok[:kok.rfind("(")].rstrip()
        icerik = kok[kok.rfind("(") + 1:-1]
        if icerik.isdigit() and onek:
            kok = onek
    return kok + uzanti


def hedef_klasor(ad, backend, frontend):
    if ad in BACKEND:
        return backend
    if ad in FRONTEND:
        return frontend
    return None


def proje_bul(betik):
    """Proje kokunu bulur (icinde backend klasoru olan dizin)."""
    adaylar = []
    ev = os.path.expanduser("~")
    d = os.path.dirname(os.path.abspath(betik))
    adaylar.append(os.path.dirname(d))          # betik backend icindeyse
    adaylar.append(os.environ.get("CV_STUDIO", ""))
    adaylar.append(os.path.join(ev, "Downloads", "cv-studio"))
    adaylar.append(os.path.join(ev, "cv-studio"))
    adaylar.append(r"C:\cv-studio")
    for a in adaylar:
        if a and os.path.isdir(os.path.join(a, "backend")):
            return a
    return None


def indirilenler():
    ev = os.path.expanduser("~")
    for ad in ("Downloads", "İndirilenler", "Indirilenler"):
        y = os.path.join(ev, ad)
        if os.path.isdir(y):
            return y
    return None


def zip_topla(yol, aday):
    """ZIP icindeki taninan dosyalari aday sozlugune ekler."""
    try:
        z = zipfile.ZipFile(yol)
    except (zipfile.BadZipFile, OSError):
        return False, []

    girdiler = [b for b in z.infolist() if not b.is_dir()]
    adlar = [temel_ad(b.filename) for b in girdiler]
    if not any(a in BACKEND or a in FRONTEND for a in adlar):
        z.close()
        return False, []

    eklenen = []
    for bilgi, ad in zip(girdiler, adlar):
        if ad not in BACKEND and ad not in FRONTEND:
            continue
        try:
            zaman = time.mktime(bilgi.date_time + (0, 0, -1))
        except (ValueError, OverflowError):
            zaman = 0.0
        veri = z.read(bilgi)
        onceki = aday.get(ad)
        if onceki is None or zaman > onceki["zaman"]:
            aday[ad] = {"veri": veri, "zaman": zaman,
                        "kaynak": "%s > %s" % (os.path.basename(yol),
                                               bilgi.filename)}
            eklenen.append(ad)
    z.close()
    return True, eklenen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sakla", action="store_true",
                    help="Downloads'taki dosyalari silme")
    ap.add_argument("--liste", action="store_true",
                    help="sadece ne yapacagini goster")
    ap.add_argument("--zorla", action="store_true",
                    help="hedef daha yeni olsa bile uzerine yaz")
    a = ap.parse_args()

    indir = indirilenler()
    if not indir:
        print("Downloads klasoru bulunamadi.")
        return 1

    proje = proje_bul(sys.argv[0] if sys.argv[0] else __file__)
    if not proje:
        print("cv-studio klasoru bulunamadi.")
        print("CV_STUDIO ortam degiskenini proje koku olarak ayarla.")
        return 1

    backend = os.path.join(proje, "backend")
    frontend = os.path.join(proje, "frontend")
    os.makedirs(frontend, exist_ok=True)

    # ---- adaylari topla ----
    aday = {}          # temel ad -> {veri|yol, zaman, kaynak}
    tuketilecek = []   # silinecek Downloads dosyalari

    for giris in sorted(os.listdir(indir)):
        yol = os.path.join(indir, giris)
        if not os.path.isfile(yol):
            continue

        if giris.lower().endswith(".zip"):
            bizim, eklenen = zip_topla(yol, aday)
            if bizim:
                tuketilecek.append(yol)
                print("zip acildi: %-22s (%d dosya)" % (giris, len(eklenen)))
            continue

        ad = temel_ad(giris)
        if ad not in BACKEND and ad not in FRONTEND:
            continue
        zaman = os.path.getmtime(yol)
        onceki = aday.get(ad)
        if onceki is None or zaman > onceki["zaman"]:
            aday[ad] = {"yol": yol, "zaman": zaman, "kaynak": giris}
        tuketilecek.append(yol)

    if not aday:
        print("Downloads'ta kopyalanacak dosya yok.")
        return 0

    # ---- kopyala ----
    sayac, atlanan = 0, 0
    print()
    print("%-18s %8s %8s  %s" % ("dosya", "eski", "yeni", "kaynak"))
    print("-" * 72)

    for ad in sorted(aday):
        klasor = hedef_klasor(ad, backend, frontend)
        hedef = os.path.join(klasor, ad)
        varsa = os.path.exists(hedef)
        eski = os.path.getsize(hedef) if varsa else 0

        # TARIH KORUMASI: hedef kaynaktan yeniyse dokunma
        if varsa and not a.zorla:
            hedef_zaman = os.path.getmtime(hedef)
            if aday[ad]["zaman"] < hedef_zaman - 2:
                atlanan += 1
                print("%-18s %8d %8s  ATLANDI (hedef daha yeni)  %s" %
                      (ad, eski, "-", aday[ad]["kaynak"]))
                continue

        if a.liste:
            print("%-18s %8d %8s  %s" % (ad, eski, "-", aday[ad]["kaynak"]))
            continue

        # YEDEK: uzerine yazmadan once .onceki
        if varsa:
            shutil.copyfile(hedef, hedef + ".onceki")

        if "veri" in aday[ad]:
            with open(hedef, "wb") as f:
                f.write(aday[ad]["veri"])
        else:
            shutil.copyfile(aday[ad]["yol"], hedef)

        yeni = os.path.getsize(hedef)
        sayac += 1
        isaret = "  <-- KUCULDU" if varsa and yeni < eski * 0.8 else ""
        print("%-18s %8d %8d  %s%s" % (ad, eski, yeni,
                                       aday[ad]["kaynak"], isaret))

    if a.liste:
        return 0

    # ---- guncelle.cmd ----
    cmd_yol = os.path.join(backend, "guncelle.cmd")
    if not os.path.exists(cmd_yol):
        with open(cmd_yol, "w", encoding="ascii") as f:
            f.write(GUNCELLE_CMD)
        print("uretildi          guncelle.cmd")

    # ---- Downloads temizligi ----
    silinen = 0
    if not a.sakla:
        for yol in tuketilecek:
            try:
                os.remove(yol)
                silinen += 1
            except OSError:
                pass
        # ayni temel ada sahip artik kopyalar
        for giris in os.listdir(indir):
            yol = os.path.join(indir, giris)
            if os.path.isfile(yol) and temel_ad(giris) in aday:
                try:
                    os.remove(yol)
                    silinen += 1
                except OSError:
                    pass

    print()
    print("kopyalanan : %d" % sayac)
    print("atlanan    : %d  (hedef daha yeniydi)" % atlanan)
    print("silinen    : %d" % silinen)
    print("yedek      : her degisen dosyanin yaninda .onceki")
    print("proje      : %s" % proje)
    print("sonraki sefer backend klasorunde:  guncelle")
    return 0


if __name__ == "__main__":
    sys.exit(main())

# -*- coding: utf-8 -*-
"""gonder.py - projeyi GitHub'a gonderir.

Ilk kurulum (bir kez):
    .\\.venv\\Scripts\\python.exe gonder.py --kur https://github.com/KULLANICI/cv-studio.git

Sonraki her seferde:
    .\\gonder

Sadece kod gider. output/, uploads/, .venv/, PDF ve CV verisi .gitignore'da.
"""

import argparse
import os
import subprocess
import sys
import time

GITIGNORE = """# uretilen ve kisisel dosyalar
.venv/
__pycache__/
*.pyc
output/
uploads/
*.pdf
*.docx
*.wav
*.png
*.jpg
*.zip
*.onceki
cv_layout.json
cv_structured.json
"""

GONDER_CMD = (
    "@echo off\r\n"
    "cd /d \"%~dp0\"\r\n"
    ".\\.venv\\Scripts\\python.exe gonder.py %*\r\n"
)


def proje_bul(betik):
    ev = os.path.expanduser("~")
    adaylar = [
        os.path.dirname(os.path.dirname(os.path.abspath(betik))),
        os.environ.get("CV_STUDIO", ""),
        os.path.join(ev, "Downloads", "cv-studio"),
        os.path.join(ev, "cv-studio"),
        r"C:\cv-studio",
    ]
    for a in adaylar:
        if a and os.path.isdir(os.path.join(a, "backend")):
            return a
    return None


def git(proje, *arg, **kw):
    """git komutu calistirir. (cikis_kodu, cikti) doner."""
    p = subprocess.run(["git"] + list(arg), cwd=proje,
                       capture_output=True, text=True, encoding="utf-8",
                       errors="replace")
    if kw.get("goster") and p.stdout.strip():
        print(p.stdout.strip())
    return p.returncode, (p.stdout + p.stderr).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kur", metavar="URL",
                    help="depo adresini ayarla (ilk kurulum)")
    ap.add_argument("--mesaj", default="", help="commit mesaji")
    ap.add_argument("--dal", default="main", help="dal adi")
    a = ap.parse_args()

    proje = proje_bul(sys.argv[0] if sys.argv[0] else __file__)
    if not proje:
        print("cv-studio klasoru bulunamadi.")
        return 1
    backend = os.path.join(proje, "backend")

    # gonder.cmd
    cmd_yol = os.path.join(backend, "gonder.cmd")
    if not os.path.exists(cmd_yol):
        with open(cmd_yol, "w", encoding="ascii") as f:
            f.write(GONDER_CMD)
        print("uretildi: gonder.cmd")

    # .gitignore
    gi = os.path.join(proje, ".gitignore")
    if not os.path.exists(gi):
        with open(gi, "w", encoding="utf-8") as f:
            f.write(GITIGNORE)
        print("uretildi: .gitignore")

    if subprocess.run(["git", "--version"], capture_output=True).returncode != 0:
        print("git bulunamadi. https://git-scm.com/download/win")
        return 1

    # depo
    if not os.path.isdir(os.path.join(proje, ".git")):
        git(proje, "init")
        git(proje, "branch", "-M", a.dal)
        print("depo olusturuldu:", proje)

    kod, ad = git(proje, "config", "user.name")
    if kod != 0 or not ad:
        git(proje, "config", "user.name", "cv-studio")
        git(proje, "config", "user.email", "cv-studio@local")

    # uzak adres
    if a.kur:
        git(proje, "remote", "remove", "origin")
        kod, cikti = git(proje, "remote", "add", "origin", a.kur)
        if kod != 0:
            print("uzak adres eklenemedi:", cikti)
            return 1
        print("uzak adres:", a.kur)

    kod, uzak = git(proje, "remote", "get-url", "origin")
    if kod != 0:
        print("Uzak adres yok. Once su komutu calistir:")
        print("  .\\gonder --kur https://github.com/KULLANICI/cv-studio.git")
        return 1
    uzak = uzak.strip()

    # commit
    git(proje, "add", "-A")
    kod, durum = git(proje, "status", "--porcelain")
    degisen = [s for s in durum.splitlines() if s.strip()]

    if degisen:
        mesaj = a.mesaj or time.strftime("guncelleme %Y-%m-%d %H:%M")
        kod, cikti = git(proje, "commit", "-m", mesaj)
        if kod != 0:
            print("commit hatasi:", cikti)
            return 1
        print("commit: %s  (%d dosya)" % (mesaj, len(degisen)))
    else:
        print("degisiklik yok, mevcut hal gonderiliyor.")

    # push
    kod, cikti = git(proje, "push", "-u", "origin", a.dal)
    if kod != 0:
        print()
        print("PUSH BASARISIZ")
        print(cikti[:800])
        print()
        print("Depo GitHub'da olusturulmus ve PUBLIC olmali.")
        return 1

    kod, sha = git(proje, "rev-parse", "--short", "HEAD")
    kod, sayi = git(proje, "ls-files")
    dosya_sayisi = len([s for s in sayi.splitlines() if s.strip()])

    ham = uzak
    if ham.endswith(".git"):
        ham = ham[:-4]
    ham = ham.replace("https://github.com/", "https://raw.githubusercontent.com/")

    print()
    print("gonderildi : %s" % sha.strip())
    print("dosya      : %d" % dosya_sayisi)
    print("depo       : %s" % uzak)
    print("ham adres  : %s/%s/" % (ham, a.dal))
    return 0


if __name__ == "__main__":
    sys.exit(main())

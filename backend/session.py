"""Oturum yonetimi: her CV kendi klasorunde yasar.

output\\oturum\\<id>\\ altinda o CV'ye ait cv_structured.json,
cv_layout.json, cv_overrides.css, cv_generated.html ve history\\ durur.
Aktif oturum output\\oturum\\aktif.json icinde yazilidir.

commands.py ve render_cv.py yol sabitlerini modul duzeyinde tutuyor.
baglan() bu sabitleri calisma aninda oturum klasorune cevirir; iki dosyaya
da dokunmak gerekmez. test_commands.py zaten ayni yontemi kullaniyor.

Kullanim:
    import session
    oid = session.yeni(ad="Seyda CV", kaynak="cv.pdf")
    session.sec(oid)              # aktif yapar + yollari baglar
    session.baglan(oid)           # sadece yollari baglar
"""

import json
import re
import shutil
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output"
KOK = OUT / "oturum"                 # test gecici klasore yonlendirebilir

ID_DESEN = re.compile(r"^\d{4}$")
DOSYALAR = ("cv_structured.json", "cv_layout.json",
            "cv_overrides.css", "cv_generated.html")

_baglanan = ""


# --- yollar -----------------------------------------------------------

def kok():
    p = Path(KOK)
    p.mkdir(parents=True, exist_ok=True)
    return p


def gecerli(oid):
    """Sadece dort hane. Klasor disina cikan id kabul edilmez."""
    return bool(ID_DESEN.match(str(oid or "")))


def yol(oid):
    if not gecerli(oid):
        raise ValueError("Gecersiz oturum kimligi: {!r}".format(oid))
    return kok() / str(oid)


def var(oid):
    return gecerli(oid) and (kok() / str(oid)).is_dir()


def _idler():
    return sorted(p.name for p in kok().iterdir()
                  if p.is_dir() and gecerli(p.name))


def _yeni_id():
    mevcut = [int(i) for i in _idler()]
    return "{:04d}".format((max(mevcut) + 1) if mevcut else 1)


# --- meta -------------------------------------------------------------

def meta(oid):
    p = yol(oid) / "meta.json"
    if not p.exists():
        return {"id": str(oid), "ad": str(oid), "kaynak": "",
                "olusturma": 0, "guncelleme": 0}
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        d = {}
    d.setdefault("id", str(oid))
    d.setdefault("ad", str(oid))
    d.setdefault("kaynak", "")
    d.setdefault("olusturma", 0)
    d.setdefault("guncelleme", d.get("olusturma", 0))
    return d


def meta_yaz(oid, **alanlar):
    d = meta(oid)
    d.update({k: v for k, v in alanlar.items() if v is not None})
    d["id"] = str(oid)
    (yol(oid) / "meta.json").write_text(
        json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    return d


def dokun(oid):
    return meta_yaz(oid, guncelleme=int(time.time()))


def ad_ver(oid, ad):
    return meta_yaz(oid, ad=(str(ad).strip() or str(oid))[:80])


# --- olustur / sil / listele ------------------------------------------

def yeni(ad="", kaynak=""):
    oid = _yeni_id()
    d = kok() / oid
    (d / "history").mkdir(parents=True, exist_ok=True)
    simdi = int(time.time())
    meta_yaz(oid, ad=(str(ad).strip() or "CV {}".format(oid))[:80],
             kaynak=str(kaynak or ""), olusturma=simdi, guncelleme=simdi)
    return oid


def sil(oid):
    if not var(oid):
        return False
    shutil.rmtree(yol(oid), ignore_errors=True)
    if aktif() == str(oid):
        kalan = _idler()
        _aktif_yaz(kalan[-1] if kalan else "")
    return True


def ozet(oid):
    """Liste icin: ad, kaynak, bolum sayisi, geri alma derinligi."""
    d = meta(oid)
    yapi = yol(oid) / "cv_structured.json"
    bolum = 0
    if yapi.exists():
        try:
            cv = json.loads(yapi.read_text(encoding="utf-8"))
            bolum = len(cv.get("sections", []))
            d["ad"] = d.get("ad") or cv.get("name", "") or str(oid)
        except (json.JSONDecodeError, OSError):
            pass
    d["hazir"] = yapi.exists()
    d["bolum"] = bolum
    d["gecmis"] = len(list((yol(oid) / "history").glob("*.json"))) \
        if (yol(oid) / "history").is_dir() else 0
    return d


def liste():
    return [ozet(i) for i in _idler()]


# --- aktif oturum -----------------------------------------------------

def _aktif_yaz(oid):
    (kok() / "aktif.json").write_text(
        json.dumps({"id": str(oid or "")}, ensure_ascii=False),
        encoding="utf-8")


def aktif():
    """Aktif oturum kimligi. Yoksa ya da silinmisse bos dize."""
    p = kok() / "aktif.json"
    if p.exists():
        try:
            oid = str(json.loads(p.read_text(encoding="utf-8")).get("id", ""))
        except (json.JSONDecodeError, OSError):
            oid = ""
        if var(oid):
            return oid
    kalan = _idler()
    return kalan[-1] if kalan else ""


def sec(oid):
    if not var(oid):
        raise ValueError("Oturum yok: {!r}".format(oid))
    _aktif_yaz(oid)
    baglan(oid)
    return str(oid)


# --- yol baglama ------------------------------------------------------

def baglanan():
    return _baglanan


def baglan(oid):
    """commands.py ve render_cv.py yollarini bu oturuma cevirir."""
    global _baglanan

    import commands
    import render_cv

    d = yol(oid)
    (d / "history").mkdir(parents=True, exist_ok=True)

    commands.OUT = d
    commands.STRUCT = d / "cv_structured.json"
    commands.HIST = d / "history"

    render_cv.OUT = d
    render_cv.STRUCT = d / "cv_structured.json"
    render_cv.LAYOUT = d / "cv_layout.json"
    render_cv.HTML_OUT = d / "cv_generated.html"

    _baglanan = str(oid)
    return {"id": str(oid), "dizin": d,
            "struct": commands.STRUCT, "hist": commands.HIST,
            "layout": render_cv.LAYOUT, "html": render_cv.HTML_OUT,
            "css": d / "cv_overrides.css"}


def hazirla(oid=""):
    """Aktif (ya da verilen) oturumu baglar. Hic oturum yoksa bos dize."""
    oid = str(oid or aktif())
    if not var(oid):
        return ""
    if _baglanan != oid:
        baglan(oid)
    return oid


# --- eski duzenden devir ----------------------------------------------

def devral():
    """output\\ kokundeki tek CV'yi ilk oturuma tasir. Bir kez calisir.

    Eski dosyalar yerinde birakilir; oturum klasorune kopyalanir.
    """
    if _idler():
        return ""
    if not (OUT / "cv_structured.json").exists():
        return ""

    oid = yeni(ad="CV 1", kaynak="cv.pdf")
    hedef = yol(oid)
    for ad in DOSYALAR:
        kaynak = OUT / ad
        if kaynak.exists():
            shutil.copy2(kaynak, hedef / ad)
    eski_hist = OUT / "history"
    if eski_hist.is_dir():
        for p in sorted(eski_hist.glob("*.json")):
            shutil.copy2(p, hedef / "history" / p.name)
    _aktif_yaz(oid)
    return oid

r"""classify.py testi.

Iki bolum:
  1) pre()  - model cagrilmaz, saniyeler surer.
  2) ZOR    - 16 gercek komut, modele gider, KATI ve GEVSEK skor uretir.

Beklenen bicim artik bir ADIM LISTESI'dir. Tek eylemli komut tek elemanli
liste demektir. Boylece 6d-6 oncesi ve sonrasi ayni test ile olculur.

Calistirma:
    .\.venv\Scripts\python.exe test_classify.py
    .\.venv\Scripts\python.exe test_classify.py --model
    .\.venv\Scripts\python.exe test_classify.py --model --tek 1
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path

import classify

OUT = Path(__file__).resolve().parent.parent / "output"
STRUCT = OUT / "cv_structured.json"

# Gercek CV yoksa bu kullanilir; bolum ve kayit adlari gercegiyle ayni.
YEDEK_CV = {
    "sections": [
        {"heading": "WORK EXPERIENCE", "items": [
            {"title": "Cloud Platform & Cost Engineer",
             "subtitle": "Turkcell", "date": "2023 - 2025"},
            {"title": "Backend Developer",
             "subtitle": "Vodafone", "date": "2021 - 2023"},
        ]},
        {"heading": "SKILLS", "items": [
            {"title": "Python, FastAPI, Docker, Kubernetes"},
            {"title": "CI/CD, Grafana, Prometheus"},
        ]},
        {"heading": "PROJECTS", "items": [
            {"title": "CV Studio", "subtitle": "Yerel LLM ile CV duzenleme"},
            {"title": "LangGraph Agent", "subtitle": "Otonom ajan denemesi"},
        ]},
        {"heading": "CERTIFICATIONS", "items": [
            {"title": "AWS Solutions Architect", "date": "2024"},
        ]},
        {"heading": "EDUCATION", "items": [
            {"title": "Anadolu University",
             "subtitle": "Yapay Zeka Destekli Kodlama", "date": "2024 - 2028"},
            {"title": "\u0130stanbul \u00dcniversitesi",
             "subtitle": "\u0130\u015fletme", "date": "2016 - 2020"},
        ]},
        {"heading": "LANGUAGES", "items": [
            {"title": "T\u00fcrk\u00e7e - Ana dil"},
            {"title": "English - C1"},
        ]},
    ]
}


# --- pre() durumlari ---------------------------------------------------

PRE_DURUMLAR = [
    ("tasarimi sifirla", "tasarim_sifirla"),
    ("tasar\u0131m\u0131 s\u0131f\u0131rla", "tasarim_sifirla"),
    ("TASARIMI SIFIRLA", "tasarim_sifirla"),
    ("tasarimi resetle", "tasarim_sifirla"),
    ("tasar\u0131m\u0131 eski haline getir", "tasarim_sifirla"),
    ("tasarim degisikliklerini geri al", "tasarim_sifirla"),
    ("gorunumu sifirla", "tasarim_sifirla"),
    ("g\u00f6r\u00fcn\u00fcm\u00fc varsayilana dondur", "tasarim_sifirla"),
    ("stil ayarlarini temizle", "tasarim_sifirla"),
    ("css'i kaldir", "tasarim_sifirla"),
    ("css i sifirla", "tasarim_sifirla"),
    ("lutfen tasarimi iptal et", "tasarim_sifirla"),
    ("tum tasarimi sifirla artik", "tasarim_sifirla"),
    ("basliklari lacivert yap", None),
    ("ba\u015fl\u0131k rengini siyaha d\u00f6nd\u00fcr", None),
    ("puntoyu biraz buyut", None),
    ("bolum cizgilerini kaldir", None),
    ("kenar bosluklarini sifirla", None),
    ("baslik rengini varsayilana dondur", None),
    ("SKILLS bolumunu kaldir", None),
    ("son degisikligi geri al", None),
    ("EDUCATION'i en uste al", None),
    ("iki sutun yap", None),
    ("yaz\u0131 tipini kucult", None),
    ("", None),
    ("   ", None),
]


# --- zor komutlar ------------------------------------------------------
# (etiket, metin, [(eylem, hedef_parcasi, deger_parcasi), ...])
# hedef/deger parcasi None ise bakilmaz.

ZOR = [
    ("6d-5 basarisiz komutu",
     "Anadolu \u00dcniversitesi'nin alt\u0131na Yapay Zeka Destekli Kodlama "
     "adl\u0131 b\u00f6l\u00fcm\u00fcn\u00fcn \u0130ngilizcesini yaz ve "
     "ayn\u0131 formatta ay\u0131r. Yani Anadolu \u00fcniversitesinin "
     "yan\u0131na tire yaz ya da ekle, sonra onun yan\u0131na "
     "\u0130ngilizce'sini yaz, sonra ekle, ondan sonra onun yan\u0131na "
     "expected 2028 yaz.",
     [("kayit_duzenle", "anadolu", "2028")]),

    ("kayit silme, bolum belirtilmis",
     "EDUCATION alt\u0131ndaki Anadolu University sat\u0131r\u0131n\u0131 sil",
     [("kayit_sil", "anadolu", None)]),

    ("iki adim, sil + tasi",
     "SKILLS b\u00f6l\u00fcm\u00fcn\u00fc kald\u0131r, sonra EDUCATION'\u0131 "
     "en \u00fcste al",
     [("bolum_sil", "skills", None),
      ("bolum_tasi", "education", "en_uste")]),

    ("kayit alanina ekleme",
     "Anadolu University'nin yan\u0131na parantez i\u00e7inde Expected 2028 yaz",
     [("kayit_duzenle", "anadolu", "2028")]),

    ("iki adim, ad + tasi",
     "EDUCATION ba\u015fl\u0131\u011f\u0131n\u0131 E\u011eiTiM yap ve en alta "
     "ta\u015f\u0131",
     [("bolum_adi", "education", "itim"),
      ("bolum_tasi", "education", "en_alta")]),

    ("kayit ekleme",
     "PROJECTS b\u00f6l\u00fcm\u00fcne yeni bir kay\u0131t ekle, ad\u0131 "
     "Portfolio Website olsun",
     [("kayit_ekle", "projects", "portfolio")]),

    ("konusma dili, tekrarli",
     "\u015eey yapal\u0131m, LANGUAGES b\u00f6l\u00fcm\u00fcn\u00fc yani dil "
     "b\u00f6l\u00fcm\u00fcn\u00fc en alta al, evet en alta.",
     [("bolum_tasi", "languages", "en_alta")]),

    ("tasarim + icerik karisik",
     "Ba\u015fl\u0131klar\u0131 lacivert yap ve CERTIFICATIONS "
     "b\u00f6l\u00fcm\u00fcn\u00fc sil",
     [("tasarim", None, None),
      ("bolum_sil", "certifications", None)]),

    ("yanlis bolum verilmis, kayit gercek",
     "SKILLS alt\u0131ndaki Anadolu University kayd\u0131n\u0131 sil",
     [("kayit_sil", "anadolu", None)]),

    ("olmayan kayit, uydurmamali",
     "EDUCATION alt\u0131ndaki Harvard University kayd\u0131n\u0131 sil",
     [("belirsiz", None, None)]),

    ("uc adim",
     "WORK EXPERIENCE'\u0131 en \u00fcste al, LANGUAGES'i en alta al, "
     "CERTIFICATIONS'\u0131 sil",
     [("bolum_tasi", "work experience", "en_uste"),
      ("bolum_tasi", "languages", "en_alta"),
      ("bolum_sil", "certifications", None)]),

    ("tarih duzeltme",
     "Anadolu University sat\u0131r\u0131n\u0131n tarihini 2021 - 2025 olarak "
     "d\u00fczelt",
     [("kayit_duzenle", "anadolu", "2025")]),

    ("ayni bolum, iki adim",
     "EDUCATION b\u00f6l\u00fcm\u00fcn\u00fc en \u00fcste al ve ad\u0131n\u0131 "
     "E\u011fitim Bilgileri yap",
     [("bolum_tasi", "education", "en_uste"),
      ("bolum_adi", "education", "itim")]),

    ("olumsuzlama, tek adim",
     "Hi\u00e7bir \u015feyi silme, sadece SKILLS'i en \u00fcste al",
     [("bolum_tasi", "skills", "en_uste")]),

    ("sifirlama + silme",
     "Tasar\u0131m\u0131 s\u0131f\u0131rla ve LANGUAGES "
     "b\u00f6l\u00fcm\u00fcn\u00fc sil",
     [("tasarim_sifirla", None, None),
      ("bolum_sil", "languages", None)]),

    ("ingilizce komut",
     "Add Expected 2028 next to Anadolu University",
     [("kayit_duzenle", "anadolu", "2028")]),
]


# --- yardimcilar -------------------------------------------------------

def nrm(s):
    s = str(s or "")
    for a, b in (("\u0130", "i"), ("I", "\u0131"), ("\u0131", "i")):
        s = s.replace(a, b)
    return re.sub(r"\s+", " ", s.casefold()).strip()


def cv_yukle():
    if STRUCT.exists():
        try:
            return json.loads(STRUCT.read_text(encoding="utf-8")), "gercek"
        except Exception:
            pass
    return YEDEK_CV, "yedek"


def adimlar(text, cv):
    """classify ne dondururse donsun adim listesine cevirir."""
    r = classify.pre(text)
    if r is not None and not isinstance(r, list):
        r = [r]
    if r is None:
        r, _ = classify.classify(text, cv)
    if isinstance(r, dict):
        r = r.get("adimlar") or [r]
    if not isinstance(r, list):
        r = []
    return [a for a in r if isinstance(a, dict)]


def puanla(alinan, beklenen):
    """(kati, gevsek) dondurur. Ikisi de 0 veya 1."""
    a_eylem = [nrm(a.get("eylem")) for a in alinan]
    b_eylem = [nrm(e[0]) for e in beklenen]

    # GEVSEK: beklenen eylem kumesi karsilandi mi, hedefler bir yerde geciyor mu
    gevsek = set(b_eylem) <= set(a_eylem)
    if gevsek:
        blob = nrm(" ".join(
            "{} {} {}".format(a.get("hedef", ""), a.get("bolum", ""),
                              a.get("deger", "")) for a in alinan))
        for _, hed, deg in beklenen:
            if hed and nrm(hed) not in blob:
                gevsek = False
            if deg and nrm(deg) not in blob:
                gevsek = False

    # KATI: adim sayisi, sira, eylem, hedef ve deger birlikte
    kati = len(alinan) == len(beklenen) and a_eylem == b_eylem
    if kati:
        for a, (_, hed, deg) in zip(alinan, beklenen):
            alan = nrm("{} {}".format(a.get("hedef", ""), a.get("bolum", "")))
            if hed and nrm(hed) not in alan:
                kati = False
            if deg and nrm(deg) not in nrm(a.get("deger", "")):
                kati = False

    return int(kati), int(gevsek)


def ozet(a):
    return "{}:{}{}{}".format(
        a.get("eylem", "?"),
        a.get("hedef", "") or "-",
        "/" + a["bolum"] if a.get("bolum") else "",
        "=" + a["deger"] if a.get("deger") else "")


# --- kosucular ---------------------------------------------------------

def pre_testi():
    gecen = 0
    for metin, beklenen in PRE_DURUMLAR:
        r = classify.pre(metin)
        if isinstance(r, list):
            r = r[0] if r else None
        alinan = r["eylem"] if r else None
        ok = alinan == beklenen
        gecen += ok
        if not ok:
            print("PRE FAIL  {!r:40} beklenen={} alinan={}".format(
                metin, beklenen, alinan))
    print("pre testi: {}/{}".format(gecen, len(PRE_DURUMLAR)))
    return gecen == len(PRE_DURUMLAR)


def zor_testi(tek=None):
    cv, kaynak = cv_yukle()
    print("CV kaynagi: {} ({} bolum)".format(kaynak, len(cv.get("sections", []))))
    print("-" * 70)

    liste = ZOR if tek is None else [ZOR[tek - 1]]
    k_top = g_top = 0
    sure_top = 0.0

    for i, (etiket, metin, beklenen) in enumerate(liste, 1):
        no = i if tek is None else tek
        t0 = time.time()
        try:
            alinan = adimlar(metin, cv)
            hata = ""
        except Exception as e:
            alinan, hata = [], "{}: {}".format(type(e).__name__, e)
        sure = time.time() - t0
        sure_top += sure

        k, g = (0, 0) if hata else puanla(alinan, beklenen)
        k_top += k
        g_top += g

        isaret = "OK  " if k else ("~   " if g else "FAIL")
        print("{} {:02d} {:<28} {:.1f} sn".format(isaret, no, etiket[:28], sure))
        if not k:
            print("     beklenen: {}".format(
                " | ".join("{}:{}".format(e[0], e[1] or "-")
                           for e in beklenen)))
            print("     alinan  : {}".format(
                hata or (" | ".join(ozet(a) for a in alinan) or "(bos)")))

    n = len(liste)
    print("-" * 70)
    print("ZOR {} komut".format(n))
    print("KATI  : {}/{}  (%{:.0f})".format(k_top, n, 100.0 * k_top / n))
    print("GEVSEK: {}/{}  (%{:.0f})".format(g_top, n, 100.0 * g_top / n))
    print("ortalama sure: {:.1f} sn".format(sure_top / n))
    return k_top, g_top, n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", action="store_true",
                    help="zor komutlari modele sorar")
    ap.add_argument("--tek", type=int, default=None,
                    help="sadece bu numarali zor komutu calistirir")
    a = ap.parse_args()

    tamam = pre_testi()
    if not (a.model or a.tek):
        print("(zor komutlar icin: --model)")
        return 0 if tamam else 1

    print()
    k, g, n = zor_testi(a.tek)
    return 0 if (tamam and k == n) else 1


if __name__ == "__main__":
    sys.exit(main())

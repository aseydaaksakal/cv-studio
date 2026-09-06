"""Modelin urettigi CSS'i denetler.

Devir notu 4. tuzak: model CV'yi bozacak CSS onerebiliyor. Cozum modele
daha iyi talimat vermek degil, ciktiyi beyaz listeden gecirmek. Listede
olmayan secici veya ozellik atilir ve atildigi raporlanir; sessiz gecis yok.

Iki yasak ozellikle onemli:
  content  -> modelin CV'ye metin yazmasinin yolu. Bu projede yasak.
  display  -> display:none icerik gizlemektir, tasarim degil. Icerik
              komutlarinin ve geri almanin alani.
"""

import re

# render_cv.py'nin urettigi HTML'de gercekten bulunan siniflar
SECICILER = {
    ".page", "header", "h1", ".role", ".meta", ".sep",
    "h2", ".sdate", ".cv-section",
    ".item", ".sub", ".date", "b",
}

OZELLIKLER = {
    "color", "background", "background-color",
    "font-size", "font-weight", "font-style", "font-family",
    "font-variant", "letter-spacing", "word-spacing", "line-height",
    "text-align", "text-transform", "text-decoration", "text-indent",
    "margin", "margin-top", "margin-bottom", "margin-left", "margin-right",
    "padding", "padding-top", "padding-bottom", "padding-left", "padding-right",
    "border", "border-top", "border-bottom", "border-left", "border-right",
    "border-color", "border-width", "border-style", "border-radius",
    "columns", "column-count", "column-gap", "column-rule",
    "opacity", "white-space",
}

# bunlardan biri gecerse CSS tumuyle reddedilir
YASAK = ["@import", "@charset", "url(", "expression(", "javascript:",
         "<script", "</", "behavior:", "-moz-binding"]

MAX_UZUNLUK = 2000
MAX_KURAL = 20


def parse(css):
    """[(secici_listesi, [(ozellik, deger), ...]), ...]"""
    kurallar = []
    for blok in re.finditer(r"([^{}]+)\{([^{}]*)\}", css):
        sec = [s.strip() for s in blok.group(1).split(",") if s.strip()]
        decls = []
        for d in blok.group(2).split(";"):
            if ":" in d:
                k, v = d.split(":", 1)
                decls.append((k.strip().lower(), v.strip()))
        if sec:
            kurallar.append((sec, decls))
    return kurallar


def temizle(css):
    """(guvenli_css, atilanlar) dondurur. Guvenli CSS bos olabilir."""
    css = (css or "").strip()
    if not css:
        return "", ["CSS bos geldi"]
    if len(css) > MAX_UZUNLUK:
        return "", ["CSS cok uzun ({} karakter, sinir {})".format(
            len(css), MAX_UZUNLUK)]

    low = css.lower()
    for y in YASAK:
        if y in low:
            return "", ["yasakli ifade: {}".format(y)]

    kurallar = parse(css)
    if not kurallar:
        return "", ["CSS kurali bulunamadi"]
    if len(kurallar) > MAX_KURAL:
        return "", ["cok fazla kural ({}, sinir {})".format(
            len(kurallar), MAX_KURAL)]

    atilan = []
    cikti = []
    for sec, decls in kurallar:
        iyi_sec = []
        for s in sec:
            (iyi_sec if s in SECICILER else atilan).append(
                s if s in SECICILER else "secici atildi: {}".format(s))
        if not iyi_sec:
            continue

        iyi = []
        for k, v in decls:
            v = v.replace("!important", "").strip()
            if not v:
                atilan.append("bos deger: {}".format(k))
            elif k in OZELLIKLER:
                iyi.append("{}: {};".format(k, v))
            else:
                atilan.append("ozellik atildi: {}".format(k))
        if iyi:
            cikti.append("{} {{ {} }}".format(", ".join(iyi_sec), " ".join(iyi)))

    if not cikti:
        atilan.append("geriye uygulanabilir kural kalmadi")
    return "\n".join(cikti), atilan

"""DOCX -> layout sozlugu. parse_cv.py'nin PDF icin urettigi semanin aynisi.

Word'de mutlak koordinat yok; konum burada punto, girinti ve satir
yuksekliginden hesaplanir. Amac piksel dogrulugu degil, analyze_cv.py'nin
okudugu "y=... x=... Npt KALIN | metin" satirinin dogru siralanmasi.

Kullanim:
    import parse_docx
    data = parse_docx.parse("cv.docx", out_dir)      # sozluk doner, JSON yazar
"""

import json
from pathlib import Path

import docx

A4 = (595.28, 841.89)          # pt
VARSAYILAN_PUNTO = 11.0
VARSAYILAN_FONT = "Calibri"
SATIR_ARALIGI = 1.35           # punto carpani
PARAGRAF_BOSLUGU = 4.0         # pt
KARAKTER_ORANI = 0.5           # genislik tahmini: punto * oran
BASLIK_PUNTO = {0: 22.0, 1: 16.0, 2: 14.0, 3: 12.0}


def _pt(v, yedek):
    """python-docx Length -> pt. None ya da tanimsizsa yedek doner."""
    try:
        return round(v.pt, 2)
    except AttributeError:
        return yedek


def _sayfa(document):
    try:
        s = document.sections[0]
        w = _pt(s.page_width, A4[0])
        h = _pt(s.page_height, A4[1])
        sol = _pt(s.left_margin, 72.0)
        ust = _pt(s.top_margin, 72.0)
    except (IndexError, AttributeError):
        w, h, sol, ust = A4[0], A4[1], 72.0, 72.0
    return w, h, sol, ust


def _stil_adi(p):
    try:
        return (p.style.name or "").lower()
    except AttributeError:
        return ""


def _baslik_seviyesi(stil):
    if stil.startswith("title"):
        return 0
    if stil.startswith("heading"):
        son = stil.split()[-1]
        return int(son) if son.isdigit() else 1
    return None


def _punto(run, p, stil):
    for kaynak in (run.font.size, getattr(p.style.font, "size", None)):
        if kaynak is not None:
            return round(kaynak.pt, 2)
    seviye = _baslik_seviyesi(stil)
    if seviye is not None:
        return BASLIK_PUNTO.get(seviye, 12.0)
    return VARSAYILAN_PUNTO


def _font(run, p):
    for ad in (run.font.name, getattr(p.style.font, "name", None)):
        if ad:
            return ad
    return VARSAYILAN_FONT


def _renk(run):
    try:
        rgb = run.font.color.rgb
    except (AttributeError, ValueError):
        rgb = None
    return "#" + str(rgb).lower() if rgb else "#000000"


def _kalin(run, p, stil):
    if run.bold is not None:
        return bool(run.bold)
    if _baslik_seviyesi(stil) is not None:
        return True
    try:
        return bool(p.style.font.bold)
    except AttributeError:
        return False


def _girinti(p, stil, sol):
    x = sol
    try:
        ek = p.paragraph_format.left_indent
        if ek is not None:
            x += _pt(ek, 0.0)
    except AttributeError:
        pass
    if "list" in stil and x <= sol:
        x += 18.0
    return round(x, 1)


def _paragraflar(document):
    """Govde paragraflari + tablo hucreleri, belge sirasiyla."""
    for p in document.paragraphs:
        yield p
    for t in document.tables:
        for satir in t.rows:
            for hucre in satir.cells:
                for p in hucre.paragraphs:
                    yield p


def parse(path, out_dir=None, taban=None):
    """taban: cikti JSON'unun govde adi. None ise kaynak dosyanin adi."""
    path = Path(path)
    taban = taban or path.stem
    document = docx.Document(str(path))
    genislik, yukseklik, sol, ust = _sayfa(document)

    spans = []
    fonts, colors = {}, {}
    y = ust

    for p in _paragraflar(document):
        stil = _stil_adi(p)
        parcalar = [r for r in p.runs if r.text.strip()]
        if not parcalar:
            continue

        x = _girinti(p, stil, sol)
        satir_punto = max(_punto(r, p, stil) for r in parcalar)

        for r in parcalar:
            metin = r.text.strip()
            punto = _punto(r, p, stil)
            font = _font(r, p)
            renk = _renk(r)
            genis = max(len(metin) * punto * KARAKTER_ORANI, punto)
            spans.append({
                "text": metin,
                "font": font,
                "size": punto,
                "color": renk,
                "bold": _kalin(r, p, stil),
                "bbox": [round(x, 1), round(y, 1),
                         round(min(x + genis, genislik), 1),
                         round(y + punto, 1)],
            })
            anahtar = "{} {}pt".format(font, punto)
            fonts[anahtar] = fonts.get(anahtar, 0) + 1
            colors[renk] = colors.get(renk, 0) + 1
            x = min(x + genis + punto * 0.4, genislik - 1)

        y += satir_punto * SATIR_ARALIGI + PARAGRAF_BOSLUGU

    data = {
        "file": path.name,
        "pages": [{
            "page": 1,
            "width_pt": round(genislik, 2),
            "height_pt": round(yukseklik, 2),
            "spans": spans,
            "shapes": [],
            "image_file": "",
        }],
        "fonts_used": dict(sorted(fonts.items(), key=lambda kv: -kv[1])),
        "colors_used": dict(sorted(colors.items(), key=lambda kv: -kv[1])),
        "icerik_yuksekligi_pt": round(y - ust, 1),
    }

    if out_dir:
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "{}_layout.json".format(taban)).write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    return data

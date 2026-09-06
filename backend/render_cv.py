"""cv_structured.json  ->  cv_generated.html

Saf Python. Model kullanilmaz; icerigi bu dosya yerlestirir.
Tasarim degerleri (punto, renk, kenar boslugu) PDF'ten olculur, tahmin edilmez.

FastAPI'den:  from render_cv import render;  info = render()
Terminalden:  python render_cv.py            (ozet basar, tarayicida acar)

Import edildiginde hicbir sey calismaz, hicbir dosya yazilmaz.
"""

import html
import json
import re
import webbrowser
from copy import deepcopy
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "output"
STRUCT = OUT / "cv_structured.json"
LAYOUT = OUT / "cv_layout.json"
HTML_OUT = OUT / "cv_generated.html"

W_MM, H_MM = 210, 297
PAD_FALLBACK = (11.7, 14.0)          # ust, sol

E = html.escape


def esc(t):
    return E(str(t or "").strip())


# --- tasarim degerleri ------------------------------------------------

def sizes_from(fonts):
    """PDF'ten gelen font listesinden govde / baslik / ad puntosunu coz."""
    vals = sorted({float(m.group(1)) for f in fonts
                   if (m := re.search(r"([\d.]+)pt", f))})
    if not vals:
        return 8.0, 9.0, 18.0
    body = vals[0]
    name = vals[-1]
    head = vals[1] if len(vals) > 2 else body
    return body, head, name


def measure_padding():
    """Ilk metin parcasinin konumundan gercek kenar bosluklarini olc."""
    try:
        lay = json.loads(LAYOUT.read_text(encoding="utf-8"))
        sp = lay["pages"][0]["spans"]
        top = round(min(s["bbox"][1] for s in sp) / 72 * 25.4, 1)
        left = round(min(s["bbox"][0] for s in sp) / 72 * 25.4, 1)
        return top, left
    except Exception:
        return PAD_FALLBACK


# --- govde ------------------------------------------------------------

def lift_section_dates(cv):
    """Bolum tarihini basliga tasi (tum kayitlarda ayniysa)."""
    for sec in cv.get("sections", []):
        dates = {i.get("date", "") for i in sec.get("items", []) if i.get("date")}
        if len(dates) == 1 and len(sec.get("items", [])) > 1:
            sec["section_date"] = dates.pop()
            for i in sec["items"]:
                i["date"] = ""


def join_title(t, sub):
    """Orijinaldeki ayraci koru: '/' ve '—' varsa dokunma, yoksa ':' ekle."""
    if not sub:
        return t, ""
    if t.endswith((":", "-", "\u2014", ".")) or sub[:1] in "\u2014-/\u00b7":
        return t, sub
    return t + ":", sub


def is_compact(items):
    """Kisa kayitlar (diller gibi) tek satirda birlestirilir."""
    if len(items) < 4:
        return False
    return all(len((i.get("title") or "") + (i.get("subtitle") or "")) < 60
               and not i.get("bullets") for i in items)


def build_header(cv):
    c = cv.get("contact") or {}
    line = [c.get("location"), c.get("phone"), c.get("email")] + (c.get("links") or [])
    line = '<span class="sep">|</span>'.join(esc(x) for x in line if x)
    return ('<header><h1>{}</h1><p class="role">{}</p><p class="meta">{}</p></header>'
            .format(esc(cv.get("name")), esc(cv.get("title")), line))


def build_section(sec):
    h = esc(sec.get("heading"))
    sd = esc(sec.get("section_date", ""))
    head = '<h2>{}{}</h2>'.format(
        h, ' <span class="sdate">/ {}</span>'.format(sd) if sd else "")
    items = sec.get("items", [])
    rows = []

    if is_compact(items):
        bits = []
        for it in items:
            t, sub = join_title(it.get("title") or "", (it.get("subtitle") or "").strip())
            sub = sub.rstrip(" \u00b7").strip()
            bits.append("<b>{}</b> {}".format(esc(t), esc(sub)).strip())
        rows.append('<p class="item">' + '<span class="sep">&middot;</span>'.join(bits) + "</p>")
    else:
        for it in items:
            t, sub = join_title(it.get("title") or "", (it.get("subtitle") or "").strip())
            t, sb, d = esc(t), esc(sub), esc(it.get("date"))
            bl = [esc(b) for b in (it.get("bullets") or []) if b]
            row = '<p class="item"><b>{}</b>{}{}</p>'.format(
                t, " " + sb if sb else "",
                ' <span class="date">{}</span>'.format(d) if d else "")
            extra = [b for b in bl if b not in sb]
            if extra:
                row += '<p class="sub">' + '<span class="sep">&middot;</span>'.join(extra) + "</p>"
            rows.append(row)
    return '<section class="cv-section">{}{}</section>'.format(head, "".join(rows))


# --- sablonlar --------------------------------------------------------

CSS_TPL = """
@page {{ size: A4; margin: 0; }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; background: #e9e9ec; }}
.page {{
  width: {w}mm; min-height: {h}mm; padding: {pt}mm {pl}mm; margin: 0 auto;
  background: #fff; color: {ink};
  font-family: "Liberation Sans", Arial, Helvetica, sans-serif;
  font-size: {body}pt; line-height: 1.38;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}}
h1 {{ font-size: {name}pt; font-weight: 400; margin: 0 0 1.6mm; line-height: 1; }}
.role {{ font-size: {body}pt; font-weight: 700; margin: 0 0 1.8mm; }}
.meta {{ font-size: {body}pt; margin: 0 0 3.5mm; }}
.sep {{ padding: 0 2.2mm; }}
h2 {{
  font-size: {head}pt; font-weight: 700; margin: 4mm 0 1.4mm;
  padding-bottom: .9mm; border-bottom: 1px solid {ink};
}}
.sdate {{ font-weight: 400; color: {muted}; }}
.item {{ margin: 0 0 2.0mm; }}
.sub {{ margin: -1.2mm 0 1.8mm; }}
.date {{ color: {muted}; }}
@media print {{ body {{ background: #fff; }} .page {{ margin: 0; }} }}
"""

DOC_TPL = ('<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
           '<title>{}</title>\n<style>{}</style>\n</head>\n<body>\n'
           '<div class="page">\n{}\n</div>\n</body>\n</html>\n')


def read_overrides():
    """Tasarim komutlarinin urettigi CSS katmani.

    Ayri dosyada durur ve temel CSS'ten SONRA eklenir. Boylece modelin
    urettigi bir kural dogrulanmis sablonu bozamaz ve "tasarimi sifirla"
    tek dosya silmek olur. Dosya yoksa cikti bit bit eski haliyle ayni.
    """
    try:
        return (OUT / "cv_overrides.css").read_text(encoding="utf-8").strip()
    except (FileNotFoundError, OSError):
        return ""


# --- giris noktasi ----------------------------------------------------

def render(cv=None, write=True):
    """CV sozlugunden HTML uretir.

    cv    : None ise cv_structured.json diskten okunur.
    write : False ise dosyaya yazmaz, sadece dondurur (onizleme icin).

    Verilen sozluk degistirilmez; kopyasi uzerinde calisilir.
    """
    if cv is None:
        cv = json.loads(STRUCT.read_text(encoding="utf-8"))
    cv = deepcopy(cv)

    design = cv.get("design", {})
    body_pt, head_pt, name_pt = sizes_from(design.get("fonts", []))
    pad_t, pad_l = measure_padding()
    cols = design.get("colors", []) + ["#000000", "#444444", "#ffffff"]
    ink, muted = cols[0], cols[1]

    lift_section_dates(cv)

    parts = [build_header(cv)]
    for sec in cv.get("sections", []):
        parts.append(build_section(sec))

    css = CSS_TPL.format(w=W_MM, h=H_MM, ink=ink, muted=muted,
                         pt=pad_t, pl=pad_l,
                         body=body_pt, head=head_pt, name=name_pt)
    ov = read_overrides()
    if ov:
        css = "{}\n/* --- cv_overrides.css --- */\n{}\n".format(css, ov)
    doc = DOC_TPL.format(esc(cv.get("name")), css, "\n".join(parts))

    if write:
        HTML_OUT.write_text(doc, encoding="utf-8")

    return {
        "html": doc,
        "path": HTML_OUT,
        "length": len(doc),
        "sections": len(cv.get("sections", [])),
        "items": sum(len(s.get("items", [])) for s in cv.get("sections", [])),
        "body_pt": body_pt, "head_pt": head_pt, "name_pt": name_pt,
        "ink": ink, "muted": muted, "pad_t": pad_t, "pad_l": pad_l,
        "overrides": bool(ov),
    }


def summary(info):
    print("=" * 50)
    print("Punto      : govde {}pt / baslik {}pt / ad {}pt".format(
        info["body_pt"], info["head_pt"], info["name_pt"]))
    print("Renk       : {} / {}".format(info["ink"], info["muted"]))
    print("Kenar      : ust {}mm / sol {}mm (PDF'ten olculdu)".format(
        info["pad_t"], info["pad_l"]))
    print("Bolum      :", info["sections"])
    print("Kayit      :", info["items"])
    print("Uzunluk    :", info["length"], "karakter")
    print("=" * 50)
    print("DOSYA:", info["path"])


if __name__ == "__main__":
    summary(info := render())
    webbrowser.open(info["path"].as_uri())

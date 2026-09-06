import json, html, re, webbrowser
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "output"
cv = json.loads((OUT / "cv_structured.json").read_text(encoding="utf-8"))
design = cv.get("design", {})

# --- tasarim degerlerini PDF'ten gelen listeden coz --------------------


def sizes_from(fonts):
    vals = sorted({float(m.group(1)) for f in fonts
                   if (m := re.search(r"([\d.]+)pt", f))})
    if not vals:
        return 8.0, 9.0, 18.0
    body = vals[0]
    name = vals[-1]
    head = vals[1] if len(vals) > 2 else body
    return body, head, name


BODY_PT, HEAD_PT, NAME_PT = sizes_from(design.get("fonts", []))

# ilk metin parcasinin konumundan gercek kenar bosluklarini olc
PAD_T, PAD_L = 11.7, 14.0
try:
    lay = json.loads((OUT / "cv_layout.json").read_text(encoding="utf-8"))
    sp = lay["pages"][0]["spans"]
    PAD_L = round(min(s["bbox"][0] for s in sp) / 72 * 25.4, 1)
    PAD_T = round(min(s["bbox"][1] for s in sp) / 72 * 25.4, 1)
except Exception:
    pass
cols = design.get("colors", []) + ["#000000", "#444444", "#ffffff"]
INK, MUTED = cols[0], cols[1]
W_MM, H_MM = 210, 297

E = html.escape


def esc(t):
    return E(str(t or "").strip())


# --- bolum tarihini basliga tasi (tum kayitlarda ayniysa) --------------

for sec in cv.get("sections", []):
    dates = {i.get("date", "") for i in sec.get("items", []) if i.get("date")}
    if len(dates) == 1 and len(sec.get("items", [])) > 1:
        sec["section_date"] = dates.pop()
        for i in sec["items"]:
            i["date"] = ""

# --- govde ------------------------------------------------------------

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


parts = []
c = cv.get("contact") or {}
line = [c.get("location"), c.get("phone"), c.get("email")] + (c.get("links") or [])
line = '<span class="sep">|</span>'.join(esc(x) for x in line if x)

parts.append('<header><h1>{}</h1><p class="role">{}</p><p class="meta">{}</p></header>'
             .format(esc(cv.get("name")), esc(cv.get("title")), line))

for sec in cv.get("sections", []):
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
    parts.append('<section class="cv-section">{}{}</section>'.format(head, "".join(rows)))

CSS = """
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
.meta {{ font-size: {body}pt; margin: 0 0 5mm; }}
.sep {{ padding: 0 2.2mm; }}
h2 {{
  font-size: {head}pt; font-weight: 700; margin: 4mm 0 1.4mm;
  padding-bottom: .9mm; border-bottom: 1px solid {ink};
}}
.sdate {{ font-weight: 400; color: {muted}; }}
.item {{ margin: 0 0 1.8mm; }}
.sub {{ margin: -1.2mm 0 1.8mm; }}
.date {{ color: {muted}; }}
@media print {{ body {{ background: #fff; }} .page {{ margin: 0; }} }}
""".format(w=W_MM, h=H_MM, ink=INK, muted=MUTED, pt=PAD_T, pl=PAD_L,
           body=BODY_PT, head=HEAD_PT, name=NAME_PT)

doc = ('<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
       '<title>{}</title>\n<style>{}</style>\n</head>\n<body>\n'
       '<div class="page">\n{}\n</div>\n</body>\n</html>\n'
       ).format(esc(cv.get("name")), CSS, "\n".join(parts))

path = OUT / "cv_generated.html"
path.write_text(doc, encoding="utf-8")

print("=" * 50)
print("Punto      : govde {}pt / baslik {}pt / ad {}pt".format(BODY_PT, HEAD_PT, NAME_PT))
print("Renk       : {} / {}".format(INK, MUTED))
print("Kenar      : ust {}mm / sol {}mm (PDF'ten olculdu)".format(PAD_T, PAD_L))
print("Bolum      :", len(cv.get("sections", [])))
print("Kayit      :", sum(len(s.get("items", [])) for s in cv.get("sections", [])))
print("Uzunluk    :", len(doc), "karakter")
print("=" * 50)
print("DOSYA:", path)

webbrowser.open(path.as_uri())

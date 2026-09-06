"""PDF -> layout sozlugu. parse_cv.py'nin yaptigi isin fonksiyon hali.

parse_cv.py komut satiri araci olarak duruyor, dokunulmadi. Bu modul ayni
semayi dondurur; parse_docx.parse() ile alan alan uyumludur, boylece
pipeline.py uzantiya bakip ikisinden birini cagirabilir.

Kullanim:
    import parse_pdf
    data = parse_pdf.parse("cv.pdf", out_dir)     # sozluk doner, JSON yazar
"""

import json
from pathlib import Path

import pymupdf

DPI = 150


def parse(path, out_dir=None, png=True, taban=None):
    """taban: cikti dosyalarinin govde adi. None ise kaynak dosyanin adi."""
    path = Path(path)
    taban = taban or path.stem
    doc = pymupdf.open(str(path))

    data = {"file": path.name, "pages": []}
    fonts, colors = {}, {}
    en_alt = 0.0

    for pno, page in enumerate(doc, start=1):
        spans, shapes = [], []

        for block in page.get_text("dict")["blocks"]:
            if block.get("type") != 0:
                continue
            for line in block["lines"]:
                for sp in line["spans"]:
                    txt = sp["text"].strip()
                    if not txt:
                        continue
                    col = "#{:06x}".format(sp["color"] & 0xFFFFFF)
                    bbox = [round(v, 1) for v in sp["bbox"]]
                    spans.append({
                        "text": txt,
                        "font": sp["font"],
                        "size": round(sp["size"], 2),
                        "color": col,
                        "bold": bool(sp["flags"] & 16),
                        "bbox": bbox,
                    })
                    if pno == 1:
                        en_alt = max(en_alt, bbox[3])
                    key = "{} {}pt".format(sp["font"], round(sp["size"], 2))
                    fonts[key] = fonts.get(key, 0) + 1
                    colors[col] = colors.get(col, 0) + 1

        for d in page.get_drawings():
            fill = d.get("fill")
            if not fill or d.get("rect") is None:
                continue
            hexcol = "#" + "".join("{:02x}".format(int(round(c * 255)))
                                   for c in fill[:3])
            r = d["rect"]
            shapes.append({"fill": hexcol,
                           "rect": [round(v, 1) for v in (r.x0, r.y0, r.x1, r.y1)]})
            colors[hexcol] = colors.get(hexcol, 0) + 1

        image_file = ""
        if png and out_dir:
            out_dir = Path(out_dir)
            out_dir.mkdir(parents=True, exist_ok=True)
            hedef = out_dir / "{}_page{}.png".format(taban, pno)
            page.get_pixmap(dpi=DPI).save(str(hedef))
            image_file = str(hedef)

        data["pages"].append({
            "page": pno,
            "width_pt": round(page.rect.width, 2),
            "height_pt": round(page.rect.height, 2),
            "spans": spans,
            "shapes": shapes,
            "image_file": image_file,
        })

    doc.close()

    data["fonts_used"] = dict(sorted(fonts.items(), key=lambda kv: -kv[1]))
    data["colors_used"] = dict(sorted(colors.items(), key=lambda kv: -kv[1]))
    data["icerik_yuksekligi_pt"] = round(en_alt, 1)

    if out_dir:
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "{}_layout.json".format(taban)).write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    return data

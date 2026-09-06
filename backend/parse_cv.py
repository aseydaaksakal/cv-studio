import sys, json, pymupdf
from pathlib import Path

pdf_path = Path(sys.argv[1] if len(sys.argv) > 1 else "../uploads/cv.pdf")
out_dir = Path(__file__).resolve().parent.parent / "output"
out_dir.mkdir(parents=True, exist_ok=True)

doc = pymupdf.open(pdf_path)
data = {"file": pdf_path.name, "pages": []}
fonts, colors = {}, {}

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
                spans.append({
                    "text": txt,
                    "font": sp["font"],
                    "size": round(sp["size"], 2),
                    "color": col,
                    "bold": bool(sp["flags"] & 16),
                    "bbox": [round(v, 1) for v in sp["bbox"]],
                })
                key = "{} {}pt".format(sp["font"], round(sp["size"], 2))
                fonts[key] = fonts.get(key, 0) + 1
                colors[col] = colors.get(col, 0) + 1

    for d in page.get_drawings():
        fill = d.get("fill")
        if not fill or d.get("rect") is None:
            continue
        hexcol = "#" + "".join("{:02x}".format(int(round(c * 255))) for c in fill[:3])
        r = d["rect"]
        shapes.append({"fill": hexcol, "rect": [round(v, 1) for v in (r.x0, r.y0, r.x1, r.y1)]})
        colors[hexcol] = colors.get(hexcol, 0) + 1

    png = out_dir / "{}_page{}.png".format(pdf_path.stem, pno)
    page.get_pixmap(dpi=150).save(png)

    data["pages"].append({
        "page": pno,
        "width_pt": round(page.rect.width, 2),
        "height_pt": round(page.rect.height, 2),
        "spans": spans,
        "shapes": shapes,
        "image_file": str(png),
    })

doc.close()
data["fonts_used"] = dict(sorted(fonts.items(), key=lambda kv: -kv[1]))
data["colors_used"] = dict(sorted(colors.items(), key=lambda kv: -kv[1]))

json_path = out_dir / "{}_layout.json".format(pdf_path.stem)
json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

print("=" * 50)
print("DOSYA        :", data["file"])
print("SAYFA        :", len(data["pages"]))
print("METIN PARCASI:", sum(len(p["spans"]) for p in data["pages"]))
print("VEKTOR SEKIL :", sum(len(p["shapes"]) for p in data["pages"]))
print("-" * 50)
print("FONTLAR")
for k, v in list(data["fonts_used"].items())[:6]:
    print("  ", k, "->", v)
print("RENKLER")
for k, v in list(data["colors_used"].items())[:6]:
    print("  ", k, "->", v)
print("-" * 50)
for s in data["pages"][0]["spans"][:8]:
    print("  {:>5}pt {} x={} y={} | {}".format(s["size"], s["color"], s["bbox"][0], s["bbox"][1], s["text"][:40]))
print("=" * 50)
print("JSON :", json_path)
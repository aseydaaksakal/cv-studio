import json, httpx
from pathlib import Path

MODEL = "qwen3-vl:8b"
OUT = Path(__file__).resolve().parent.parent / "output"

layout = json.loads((OUT / "cv_layout.json").read_text(encoding="utf-8"))
page = layout["pages"][0]

lines = []
for s in page["spans"]:
    lines.append("y={} x={} {}pt {} | {}".format(
        s["bbox"][1], s["bbox"][0], s["size"],
        "KALIN" if s["bold"] else "normal", s["text"]))
doc_text = "\n".join(lines)

SYSTEM = """Sen bir CV ayristirma motorusun. Sana bir CV'nin metin parcalari
konum (y=ust, x=sol), punto ve kalinlik bilgisiyle birlikte verilir.
Gorevin bunlari anlamli bolumlere ayirmak.

KURALLAR:
- Metinleri ASLA cevirme. Kaynak dilde aynen birak.
- Hicbir bilgi uydurma. Sadece verilen metni kullan.
- Buyuk punto ve KALIN olanlar genelde baslik, kucuk normal olanlar icerik.
- Ayni y degerine sahip parcalar ayni satirdadir, birlestir.
- SADECE JSON dondur. Aciklama, markdown, kod bloklari yazma.

SEMA:
{
  "name": "",
  "title": "",
  "contact": {"email": "", "phone": "", "location": "", "links": []},
  "sections": [
    {"heading": "", "items": [
      {"title": "", "subtitle": "", "date": "", "bullets": []}
    ]}
  ]
}"""

payload = {
    "model": MODEL,
    "format": "json",
    "stream": False,
    "options": {"temperature": 0.1, "num_ctx": 16384},
    "messages": [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": "CV metin parcalari:\n\n" + doc_text},
    ],
}

print("Model calisiyor, bekle...")
r = httpx.post("http://localhost:11434/api/chat", json=payload, timeout=600)
raw = r.json()["message"]["content"]

try:
    cv = json.loads(raw)
except json.JSONDecodeError:
    (OUT / "raw_response.txt").write_text(raw, encoding="utf-8")
    print("JSON parse edilemedi. Ham cikti: output\\raw_response.txt")
    raise SystemExit(1)

cv["design"] = {
    "page": [page["width_pt"], page["height_pt"]],
    "fonts": list(layout["fonts_used"].keys())[:6],
    "colors": list(layout["colors_used"].keys())[:6],
}

path = OUT / "cv_structured.json"
path.write_text(json.dumps(cv, ensure_ascii=False, indent=2), encoding="utf-8")

print("=" * 50)
print("AD    :", cv.get("name", ""))
print("UNVAN :", cv.get("title", ""))
c = cv.get("contact") or {}
print("MAIL  :", c.get("email", ""))
print("KONUM :", c.get("location", ""))
print("-" * 50)
for sec in cv.get("sections", []):
    items = sec.get("items", [])
    print("[{}] {} kayit".format(sec.get("heading", "?"), len(items)))
    for it in items[:2]:
        print("    -", it.get("title", ""), "|", it.get("date", ""))
print("=" * 50)
print("JSON :", path)
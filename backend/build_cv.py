import json, re, httpx, webbrowser
from pathlib import Path

MODEL = "qwen3-vl:8b"
OUT = Path(__file__).resolve().parent.parent / "output"

cv = json.loads((OUT / "cv_structured.json").read_text(encoding="utf-8"))
design = cv.pop("design", {})

SYSTEM = """Sen bir CV sablonu ureticisisin. Sana bir CV'nin icerigi (JSON) ve
orijinal belgenin tasarim degerleri (sayfa boyutu, fontlar, renkler) verilir.
Gorevin bunlari tek dosyalik HTML belgeye donusturmek.

ZORUNLU KURALLAR:
- Ciktin SADECE HTML olsun. Markdown, kod bloklari, aciklama YAZMA.
- <!DOCTYPE html> ile basla, </html> ile bitir.
- CSS'i <style> etiketi icinde goem. Harici dosya veya CDN kullanma.
- Sayfa A4: genislik 210mm, yukseklik 297mm. @page { size: A4; margin: 0; }
- .page sinifli tek bir kapsayici kullan: width:210mm; min-height:297mm;
  padding:12mm 14mm; box-sizing:border-box; background:#fff; margin:0 auto;
- Verilen font puntolarini pt biriminde AYNEN kullan.
- LiberationSans fontunu "Arial, Helvetica, sans-serif" olarak esle.
- Verilen renk kodlarini AYNEN kullan.
- ICERIGI ASLA CEVIRME, kisaltma veya ekleme yapma. Metinler kaynak dilde kalsin.
- Her bolum icin <section class="cv-section"> kullan, basligi <h2> yap.
- Yazdirmaya uygun olsun: gorsel efekt, animasyon, gradyan kullanma."""

user = ("TASARIM DEGERLERI:\n" + json.dumps(design, ensure_ascii=False, indent=1)
        + "\n\nCV ICERIGI:\n" + json.dumps(cv, ensure_ascii=False, indent=1))

payload = {
    "model": MODEL,
    "stream": False,
    "think": False,
    "options": {"temperature": 0.3, "num_ctx": 24576, "num_predict": 12288},
    "messages": [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": user},
    ],
}

print("HTML uretiliyor, bu 1-2 dakika surebilir...")
r = httpx.post("http://localhost:11434/api/chat", json=payload, timeout=1800)
resp = r.json()
(OUT / "last_response.json").write_text(
    json.dumps(resp, ensure_ascii=False, indent=1), encoding="utf-8")

msg = resp.get("message", {})
html = (msg.get("content") or "").strip()
thinking = (msg.get("thinking") or "").strip()

print("  done_reason :", resp.get("done_reason"))
print("  content     :", len(html), "karakter")
print("  thinking    :", len(thinking), "karakter")

if not html and thinking:
    print("  -> content bos, thinking icinden HTML araniyor")
    html = thinking

html = re.sub(r"^```[a-zA-Z]*\s*", "", html)
html = re.sub(r"\s*```$", "", html).strip()

i = html.lower().find("<!doctype")
if i == -1:
    i = html.lower().find("<html")
if i > 0:
    html = html[i:]

path = OUT / "cv_generated.html"
path.write_text(html, encoding="utf-8")

print("=" * 50)
print("Uzunluk    :", len(html), "karakter")
print("DOCTYPE    :", "var" if html.lower().startswith("<!doctype") else "YOK")
print("</html>    :", "var" if html.rstrip().lower().endswith("</html>") else "YOK - cikti kesilmis")
print("<style>    :", "var" if "<style" in html.lower() else "YOK")
print("A4 boyutu  :", "var" if "210mm" in html else "YOK")
print("=" * 50)
print("DOSYA:", path)

webbrowser.open(path.as_uri())
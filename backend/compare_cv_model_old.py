import json, base64, httpx
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

MODEL = "qwen3-vl:8b"
OUT = Path(__file__).resolve().parent.parent / "output"
GEN_HTML = OUT / "cv_generated.html"
GEN_PNG = OUT / "cv_generated.png"
ORIG_PNG = OUT / "cv_page1.png"


def shoot():
    """Uretilen HTML'i A4 boyutunda PNG'ye cevir."""
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 794, "height": 1123},
                        device_scale_factor=1)
        pg.goto(GEN_HTML.as_uri())
        pg.wait_for_timeout(400)
        pg.screenshot(path=str(GEN_PNG), full_page=True)
        b.close()
    return GEN_PNG


MAX_W = 860  # gorsel basina ~1000 token


def prep(src):
    """Gorseli kucultup base64 dondur. Buyuk gorsel = tukenen baglam."""
    im = Image.open(src).convert("RGB")
    before = im.size
    if im.width > MAX_W:
        im = im.resize((MAX_W, int(im.height * MAX_W / im.width)), Image.LANCZOS)
    tmp = OUT / ("_small_" + Path(src).name)
    im.save(tmp, "PNG", optimize=True)
    print("     {}  {}x{} -> {}x{}".format(
        Path(src).name, before[0], before[1], im.width, im.height))
    return base64.b64encode(tmp.read_bytes()).decode()


SYSTEM = """Sen bir belge karsilastirma uzmanisin. Sana iki goruntu verilir:
1. goruntu = ORIJINAL CV
2. goruntu = YENIDEN URETILEN kopya

Gorevin gorsel farklari bulmak. SADECE gorunume bak, icerige degil.

Bakacagin seyler: kenar bosluklari, satir araliklari, bolumler arasi bosluk,
yazi boyutu, kalinlik, cizgilerin kalinligi ve rengi, hizalama, ayrac araliklari.

Her fark icin somut bir CSS onerisi ver.
SADECE JSON dondur, aciklama yazma.

SEMA:
{"farklar": [
  {"nerede": "", "orijinal": "", "kopya": "", "css_onerisi": "", "onem": "yuksek|orta|dusuk"}
]}"""


def main():
    if not ORIG_PNG.exists():
        print("Orijinal sayfa goruntusu yok:", ORIG_PNG)
        print("Once 'python parse_cv.py ..\\uploads\\cv.pdf' calistir.")
        return

    print("1/3  HTML ekran goruntusu aliniyor...")
    shoot()
    print("     ", GEN_PNG)

    print("2/3  Model karsilastiriyor, 1-2 dakika...")
    payload = {
        "model": MODEL,
        "format": "json",
        "stream": False,
        "think": False,
        "options": {"temperature": 0.2, "num_ctx": 32768, "num_predict": 4096},
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user",
             "content": "1. goruntu orijinal, 2. goruntu kopya. Gorsel farklari listele.",
             "images": [prep(ORIG_PNG), prep(GEN_PNG)]},
        ],
    }
    r = httpx.post("http://localhost:11434/api/chat", json=payload, timeout=1800)
    resp = r.json()
    (OUT / "compare_raw.json").write_text(
        json.dumps(resp, ensure_ascii=False, indent=1), encoding="utf-8")

    msg = resp.get("message", {})
    raw = (msg.get("content") or "").strip()
    thinking = (msg.get("thinking") or "").strip()
    print("     done_reason={}  girdi={} token  content={}  thinking={}".format(
        resp.get("done_reason"), resp.get("prompt_eval_count"),
        len(raw), len(thinking)))

    if not raw and thinking:
        i = thinking.find("{")
        if i >= 0:
            raw = thinking[i:]
            print("     -> content bos, thinking icinden JSON alindi")
    if not raw:
        print("Model bos dondu. Ham cikti: output\\compare_raw.json")
        return

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        print("JSON okunamadi. Ham cikti: output\\compare_raw.json")
        return

    print("3/3  Sonuc")
    print("=" * 58)
    farklar = data.get("farklar", [])
    if not farklar:
        print("Fark bulunamadi.")
    for i, f in enumerate(farklar, 1):
        print("{}. [{}] {}".format(i, f.get("onem", "?"), f.get("nerede", "")))
        print("   orijinal : {}".format(f.get("orijinal", "")))
        print("   kopya    : {}".format(f.get("kopya", "")))
        print("   css      : {}".format(f.get("css_onerisi", "")))
    print("=" * 58)
    (OUT / "farklar.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print("JSON:", OUT / "farklar.json")


if __name__ == "__main__":
    main()

"""cv_generated.html -> cv_generated.png  (A4, 150 DPI)

Model KULLANILMAZ. Gorsel karsilastirma diff_cv.py'nin isi (NumPy, piksel).
Bu betik sadece diff_cv.py'ye adil bir girdi hazirlar: referans cv_page1.png
150 DPI oldugu icin kopya da 150 DPI uretilir.
"""

from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent.parent / "output"
HTML = OUT / "cv_generated.html"
PNG = OUT / "cv_generated.png"
REF = OUT / "cv_page1.png"

DPI = 150
SCALE = DPI / 96.0            # 1.5625
VIEW_W, VIEW_H = 794, 1123    # A4, CSS pikseli (96 DPI)


def shoot():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(
            viewport={"width": VIEW_W, "height": VIEW_H},
            device_scale_factor=SCALE,
        )
        page.goto(HTML.as_uri())
        page.wait_for_load_state("load")
        page.emulate_media(media="print")     # PDF ciktisiyla ayni kurallar
        el = page.locator(".page")
        if el.count():
            el.first.screenshot(path=str(PNG))
        else:                                  # .page yoksa tum sayfa
            page.screenshot(path=str(PNG), full_page=True)
        browser.close()


def main():
    if not HTML.exists():
        print("Eksik dosya:", HTML)
        print("Once render_cv.py calistir.")
        return 1

    print("Ekran goruntusu aliniyor ({} DPI, olcek {})...".format(DPI, SCALE))
    shoot()

    w, h = Image.open(PNG).size
    print("  kopya    : {}x{}".format(w, h))
    if REF.exists():
        rw, rh = Image.open(REF).size
        print("  referans : {}x{}".format(rw, rh))
        if abs(w - rw) > 2:
            print("  UYARI: genislikler uyusmuyor, murekkep karsilastirmasi "
                  "yine adil olmaz.")
    else:
        print("  referans : yok ({})".format(REF.name))

    print("DOSYA:", PNG)
    print("Sirada: diff_cv.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

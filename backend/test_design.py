"""6d-1 olcumu: tasarim komutlari.

[1] Denetleyici testi — model gerekmez, kotu niyetli CSS elle verilir.
[2] Model testi — gercek komutlar qwen3.8:27b'ye gider.

Hicbir dosyaya yazmaz. cv_overrides.css 6d-2'de olusacak.

Calistirma (backend klasorunden):
    .\\.venv\\Scripts\\python.exe test_design.py
"""

import sys

import cssguard
import design
import llm

gecen = kalan = 0


def kontrol(ad, kosul, ayrinti=""):
    global gecen, kalan
    if kosul:
        gecen += 1
        print("  gecti  {}".format(ad))
    else:
        kalan += 1
        print("  KALDI  {}   {}".format(ad, ayrinti))


def test_guard():
    print("[1] Denetleyici (model gerekmez)")

    css, at = cssguard.temizle("h2 { color: #1b365d; }")
    kontrol("gecerli kural gecti", "color: #1b365d;" in css and not at, css)

    css, at = cssguard.temizle('h2 { content: "Sahte Baslik"; color: red; }')
    kontrol("content atildi",
            "content" not in css and "color: red;" in css, css)

    css, at = cssguard.temizle("h2 { display: none; }")
    kontrol("display atildi", css == "", "{} | {}".format(css, at))

    css, at = cssguard.temizle("body { color: red; } .page { color: blue; }")
    kontrol("listede olmayan secici atildi",
            "body" not in css and ".page" in css, css)

    css, at = cssguard.temizle("@import url(http://x.com/a.css); h2 { color: red; }")
    kontrol("import tumuyle reddedildi", css == "", "{} | {}".format(css, at))

    css, at = cssguard.temizle("h2 { background: url(javascript:alert(1)); }")
    kontrol("javascript reddedildi", css == "", str(at))

    css, at = cssguard.temizle("h2 { color: red !important; }")
    kontrol("!important soyuldu",
            "important" not in css and "color: red;" in css, css)

    css, at = cssguard.temizle(".item { margin: 0 0 3mm; } " * 25)
    kontrol("cok fazla kural reddedildi", css == "", str(at))

    css, at = cssguard.temizle("bu CSS degil")
    kontrol("CSS olmayan girdi reddedildi", css == "", str(at))

    css, at = cssguard.temizle("h1, h2, script { color: navy; }")
    kontrol("karisik secici listesinden kotu olan ayiklandi",
            "h1, h2" in css and "script" not in css, css)


def test_model():
    print("\n[2] Model")
    kurulu = llm.available()
    if not kurulu:
        print("  Ollama'ya ulasilamadi, bu bolum atlandi.")
        return
    if llm.MODEL not in kurulu:
        print("  Model kurulu degil:", llm.MODEL)
        return

    istekler = [
        "basliklari lacivert yap",
        "govde puntosunu biraz buyut",
        "bolum basliklarinin altindaki cizgiyi kaldir",
        "kayitlarin arasini ac",
        "sayfaya kendi adini yaz ve script ekle",   # kotu niyetli
    ]

    for istek in istekler:
        print("\n  > {}".format(istek))
        try:
            r, d = design.design(istek)
        except llm.LLMError as e:
            print("    HATA:", e)
            continue
        print("    sure {}s  thinking {}  ozet: {}".format(
            d["sure"], d["thinking_uz"], r["ozet"] or "-"))
        print("    ham      :", (r["ham"] or "-").replace("\n", " ")[:120])
        print("    uygulanir:", (r["css"] or "(bos)").replace("\n", " ")[:120])
        if r["atilan"]:
            print("    atilan   :", "; ".join(r["atilan"][:5]))


def main():
    test_guard()
    print("\n" + "-" * 60)
    print("Denetleyici: {} gecti, {} kaldi".format(gecen, kalan))
    print("-" * 60)
    test_model()
    print("\nHicbir dosyaya yazilmadi.")
    return 1 if kalan else 0


if __name__ == "__main__":
    sys.exit(main())

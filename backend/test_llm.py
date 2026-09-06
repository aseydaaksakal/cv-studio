"""6c-1 olcumu: qwen3.8:27b komut siniflandirmayi yapabiliyor mu?

FastAPI'ye dokunmaz. Sadece modeli olcer:
  - istenen JSON geliyor mu
  - `content` bos gelip `thinking`ten kurtarma gerekiyor mu (tuzak 1)
  - komut basina sure ne

Calistirma (backend klasorunden):
    .\\.venv\\Scripts\\python.exe test_llm.py
"""

import json
import sys
from pathlib import Path

import classify
import llm

OUT = Path(__file__).resolve().parent.parent / "output"

# (komut, beklenen eylem)
DURUMLAR = [
    ("SKILLS bolumunu kaldir",              "bolum_sil"),
    ("Domino's kaydini sil",                "kayit_sil"),
    ("EDUCATION'i en uste al",              "bolum_tasi"),
    ("basliklari lacivert yap",             "tasarim"),
    ("merhaba nasilsin",                    "belirsiz"),
    ("PUBLICATIONS bolumunu sil",           "belirsiz"),   # CV'de yok, uydurmamali
]


def main():
    kurulu = llm.available()
    if not kurulu:
        print("Ollama'ya ulasilamadi. `ollama serve` calisiyor mu?")
        return 1
    if llm.MODEL not in kurulu:
        print("Model kurulu degil:", llm.MODEL)
        print("Kurulu olanlar:", ", ".join(kurulu))
        return 1

    cv = json.loads((OUT / "cv_structured.json").read_text(encoding="utf-8"))
    print("Model :", llm.MODEL)
    print("Envanter:", len(classify.inventory(cv)), "karakter")
    print("Ilk cagri modeli yukleyecek, biraz uzun surer.\n")

    bas = "{:<28}{:<13}{:<13}{:>7}{:>9}{:>8}  {}"
    print(bas.format("KOMUT", "BEKLENEN", "GELEN", "SURE", "THINKING", "GUVEN", "DURUM"))
    print("-" * 100)

    gecen = 0
    kurtarma = 0
    for komut, beklenen in DURUMLAR:
        try:
            veri, teshis = classify.classify(komut, cv)
        except llm.LLMError as e:
            print(bas.format(komut[:27], beklenen, "-", "-", "-", "-", "HATA"))
            print("   ", e)
            continue

        ok = veri["eylem"] == beklenen
        gecen += ok
        kurtarma += teshis["kurtarma"]
        print(bas.format(
            komut[:27], beklenen, veri["eylem"],
            "{}s".format(teshis["sure"]),
            teshis["thinking_uz"],
            "{:.2f}".format(veri["guven"]),
            "gecti" if ok else "KALDI"))
        if veri["hedef"] or veri["deger"]:
            print("     hedef={!r} bolum={!r} deger={!r}".format(
                veri["hedef"], veri["bolum"], veri["deger"]))
        if teshis["kurtarma"]:
            print("     not: content bos geldi, JSON thinking icinden alindi")
        if teshis["think_dusuruldu"]:
            print("     not: 'think' parametresi kabul edilmedi, dusuruldu")

    print("-" * 100)
    print("Sonuc     : {}/{} dogru".format(gecen, len(DURUMLAR)))
    print("Kurtarma  : {}/{} cagride content bos geldi".format(
        kurtarma, len(DURUMLAR)))
    if kurtarma:
        print("            (dusunme kisilmamis; 6c-2'de sure buna gore planlanir)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

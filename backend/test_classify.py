r"""classify.pre() testi. Model cagrilmaz, saniyeler surer.

Calistirma:
    .\.venv\Scripts\python.exe test_classify.py
"""

import sys

import classify

# (metin, beklenen)  beklenen None demek: modele gitsin
DURUMLAR = [
    # --- sifirlama sayilmali ---
    ("tasarimi sifirla", "tasarim_sifirla"),
    ("tasar\u0131m\u0131 s\u0131f\u0131rla", "tasarim_sifirla"),
    ("TASARIMI SIFIRLA", "tasarim_sifirla"),
    ("tasarimi resetle", "tasarim_sifirla"),
    ("tasar\u0131m\u0131 eski haline getir", "tasarim_sifirla"),
    ("tasarim degisikliklerini geri al", "tasarim_sifirla"),
    ("gorunumu sifirla", "tasarim_sifirla"),
    ("g\u00f6r\u00fcn\u00fcm\u00fc varsayilana dondur", "tasarim_sifirla"),
    ("stil ayarlarini temizle", "tasarim_sifirla"),
    ("css'i kaldir", "tasarim_sifirla"),
    ("css i sifirla", "tasarim_sifirla"),
    ("lutfen tasarimi iptal et", "tasarim_sifirla"),
    ("tum tasarimi sifirla artik", "tasarim_sifirla"),

    # --- sifirlama SAYILMAMALI, modele gitmeli ---
    ("basliklari lacivert yap", None),
    ("ba\u015fl\u0131k rengini siyaha d\u00f6nd\u00fcr", None),
    ("puntoyu biraz buyut", None),
    ("bolum cizgilerini kaldir", None),
    ("kenar bosluklarini sifirla", None),
    ("baslik rengini varsayilana dondur", None),
    ("SKILLS bolumunu kaldir", None),
    ("son degisikligi geri al", None),
    ("EDUCATION'i en uste al", None),
    ("iki sutun yap", None),
    ("yaz\u0131 tipini kucult", None),
    ("", None),
    ("   ", None),
]


def main():
    gecen = 0
    for metin, beklenen in DURUMLAR:
        r = classify.pre(metin)
        alinan = r["eylem"] if r else None
        ok = alinan == beklenen
        gecen += ok
        if not ok:
            print("FAIL  {!r:40} beklenen={} alinan={}".format(
                metin, beklenen, alinan))
    print("{}/{} gecti".format(gecen, len(DURUMLAR)))
    return 0 if gecen == len(DURUMLAR) else 1


if __name__ == "__main__":
    sys.exit(main())

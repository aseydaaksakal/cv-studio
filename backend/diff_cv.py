import numpy as np
from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "output"
ORIG = OUT / "cv_page1.png"
GEN = OUT / "cv_generated.png"
PAGE_W_MM, PAGE_H_MM = 210.0, 297.0


def load(path):
    im = Image.open(path).convert("L")
    a = np.asarray(im, dtype=np.uint8)
    ink = a < 160                      # koyu pikseller = murekkep
    mm = PAGE_W_MM / im.width          # 1 piksel kac mm
    return ink, mm, im.size


def margins(ink, mm):
    rows = ink.any(axis=1)
    colz = ink.any(axis=0)
    if not rows.any():
        return None
    top = np.argmax(rows) * mm
    bot = (len(rows) - np.argmax(rows[::-1])) * mm
    left = np.argmax(colz) * mm
    right = PAGE_W_MM - (len(colz) - np.argmax(colz[::-1])) * mm
    return dict(ust=top, sol=left, sag=right, icerik_alt=bot)


def rules(ink, mm, min_ratio=0.85):
    """Bolum ayirici cizgileri bul: genis ve yogun satirlar."""
    dens = ink.sum(axis=1) / ink.shape[1]
    hits = np.where(dens > min_ratio)[0]
    out, prev = [], -99
    for y in hits:
        if y - prev > 3:               # bitisik satirlari tek cizgi say
            out.append(round(y * mm, 1))
        prev = y
    return out


def report():
    for p in (ORIG, GEN):
        if not p.exists():
            print("Eksik dosya:", p)
            return

    a, amm, asz = load(ORIG)
    b, bmm, bsz = load(GEN)

    ma, mb = margins(a, amm), margins(b, bmm)
    ra, rb = rules(a, amm), rules(b, bmm)

    print("=" * 60)
    print("{:<14}{:>14}{:>14}{:>14}".format("", "ORIJINAL", "KOPYA", "FARK"))
    print("-" * 60)
    print("{:<14}{:>14}{:>14}{:>14}".format(
        "cozunurluk", "{}x{}".format(*asz), "{}x{}".format(*bsz), ""))
    for k, ad in [("ust", "ust bosluk"), ("sol", "sol bosluk"),
                  ("sag", "sag bosluk"), ("icerik_alt", "icerik biter")]:
        d = mb[k] - ma[k]
        print("{:<14}{:>13.1f}mm{:>13.1f}mm{:>+13.1f}mm".format(
            ad, ma[k], mb[k], d))

    cov_a = a.mean() * 100
    cov_b = b.mean() * 100
    print("{:<14}{:>13.2f}%{:>13.2f}%{:>+13.2f}%".format(
        "murekkep", cov_a, cov_b, cov_b - cov_a))

    print("-" * 60)
    print("BOLUM CIZGILERI  (orijinal {} adet / kopya {} adet)".format(
        len(ra), len(rb)))
    for i in range(max(len(ra), len(rb))):
        x = "{:.1f}mm".format(ra[i]) if i < len(ra) else "  -"
        y = "{:.1f}mm".format(rb[i]) if i < len(rb) else "  -"
        d = "{:+.1f}mm".format(rb[i] - ra[i]) if i < len(ra) and i < len(rb) else ""
        print("  {:>2}.{:>12}{:>12}{:>12}".format(i + 1, x, y, d))
    print("=" * 60)

    # ust uste bindirme goruntusu: kirmizi=orijinal, mavi=kopya
    h = 1600
    ia = Image.open(ORIG).convert("L").resize(
        (int(h * asz[0] / asz[1]), h), Image.LANCZOS)
    ib = Image.open(GEN).convert("L").resize(ia.size, Image.LANCZOS)
    na, nb = np.asarray(ia), np.asarray(ib)
    rgb = np.stack([np.minimum(na, 255), np.minimum(nb, 255),
                    np.minimum(nb, 255)], axis=-1).astype(np.uint8)
    ov = OUT / "overlay.png"
    Image.fromarray(rgb).save(ov)
    print("Bindirme :", ov)
    print("  kirmizi = sadece orijinalde, mavi = sadece kopyada, siyah = ortusuyor")


if __name__ == "__main__":
    report()

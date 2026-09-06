r"""6d-6d olcumu: /command uctan uca.

Sunucu ACIK OLMASINA GEREK YOK; app.py bu surec icinde ayaga kalkar.
Model gercekten cagrilir, komut basina 5-15 sn surer.

cv_structured.json ve cv_overrides.css test sonunda BIREBIR eski haline
dondurulur; test bunu ayrica olcer.

Calistirma (backend klasorunden):
    .\.venv\Scripts\python.exe test_command.py
"""

import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

import app as app_mod
import commands

OUT = Path(__file__).resolve().parent.parent / "output"
STRUCT = OUT / "cv_structured.json"
CSS = OUT / "cv_overrides.css"
HIST = OUT / "history"

gecen = kalan = 0
client = TestClient(app_mod.app)


def kontrol(ad, kosul, ayrinti=""):
    global gecen, kalan
    if kosul:
        gecen += 1
        print("  gecti  {}".format(ad))
    else:
        kalan += 1
        print("  KALDI  {}   {}".format(ad, str(ayrinti)[:160]))


def durum():
    r = client.get("/state").json()
    return [s["heading"] for s in r.get("sections", [])], r.get("depth", 0)


def komut(metin):
    r = client.post("/command", json={"text": metin}).json()
    print("     -> {} | {} sn | {}".format(
        r.get("eylem"), r.get("sure"), (r.get("message") or "")[:110]))
    return r


def geri():
    return client.post("/undo").json()


def imza():
    a = STRUCT.read_text(encoding="utf-8") if STRUCT.exists() else ""
    b = CSS.read_text(encoding="utf-8") if CSS.exists() else ""
    return a + "\n---\n" + b


def main():
    if not STRUCT.exists():
        print("Bulunamadi:", STRUCT)
        return 1

    bas_imza = imza()
    bas_bol, bas_depth = durum()
    print("Baslangic: {} bolum, gecmis {}".format(len(bas_bol), bas_depth))

    print("\n[1] Saglik")
    h = client.get("/health").json()
    kontrol("health ok", h.get("ok") and h.get("struct"), h)
    kontrol("model kurulu", h.get("model_kurulu"), h.get("model"))

    print("\n[2] Tek adim")
    r = komut("SKILLS bolumunu kaldir")
    bol, dep = durum()
    kontrol("uygulandi", r.get("applied"), r.get("message"))
    kontrol("bir bolum eksildi", len(bol) == len(bas_bol) - 1, bol)
    kontrol("gecmis bir arttti", dep == bas_depth + 1, dep)
    geri()
    bol, dep = durum()
    kontrol("geri alindi", bol == bas_bol and dep == bas_depth, bol)

    print("\n[3] Iki adim, tek geri al")
    r = komut("SKILLS b\u00f6l\u00fcm\u00fcn\u00fc kald\u0131r ve "
              "EDUCATION'\u0131 en \u00fcste al")
    bol, dep = durum()
    kontrol("iki adim dondu", len(r.get("sonuclar", [])) == 2, r.get("adimlar"))
    kontrol("ikisi de uygulandi",
            all(s["applied"] for s in r.get("sonuclar", [])), r.get("message"))
    kontrol("SKILLS gitti", "SKILLS" not in bol, bol)
    kontrol("EDUCATION en uste geldi", bol and bol[0] == "EDUCATION", bol)
    kontrol("TEK snapshot", dep == bas_depth + 1, dep)
    geri()
    bol, dep = durum()
    kontrol("tek geri al ikisini de dondurdu",
            bol == bas_bol and dep == bas_depth, bol)

    print("\n[4] 6d-5'te basarisiz olan komut")
    r = komut("Anadolu \u00dcniversitesi'nin yan\u0131na tire koy, sonra "
              "b\u00f6l\u00fcm\u00fcn \u0130ngilizcesini yaz, ondan sonra "
              "Expected 2028 ekle.")
    bol, dep = durum()
    kontrol("uygulandi", r.get("applied"), r.get("message"))
    kontrol("belirsiz degil", "belirsiz" not in (r.get("adimlar") or []),
            r.get("adimlar"))
    kontrol("gecmis bir artti", dep == bas_depth + 1, dep)
    yeni = json.loads(STRUCT.read_text(encoding="utf-8"))
    hit = commands.find_items(yeni, "Anadolu")
    metin = json.dumps(yeni["sections"][hit[0][0]]["items"][hit[0][1]],
                       ensure_ascii=False) if hit else ""
    kontrol("2028 kayda yazildi", "2028" in metin, metin[:120])
    geri()
    bol, dep = durum()
    kontrol("geri alindi", dep == bas_depth, dep)

    print("\n[5] Tasarim + icerik ayni komutta")
    r = komut("Ba\u015fl\u0131klar\u0131 lacivert yap ve CERTIFICATIONS "
              "b\u00f6l\u00fcm\u00fcn\u00fc sil")
    bol, dep = durum()
    kontrol("uygulandi", r.get("applied"), r.get("message"))
    kontrol("CERTIFICATIONS gitti", "CERTIFICATIONS" not in bol, bol)
    kontrol("css yazildi", CSS.exists() and CSS.read_text(encoding="utf-8").strip(),
            r.get("css", "")[:80])
    kontrol("TEK snapshot", dep == bas_depth + 1, dep)
    geri()
    bol, dep = durum()
    kontrol("icerik geri geldi", bol == bas_bol, bol)

    print("\n[6] Dosyalar eski haline dondu mu")
    kontrol("cv_structured.json + cv_overrides.css birebir ayni",
            imza() == bas_imza)
    kontrol("gecmis derinligi baslangictaki gibi", durum()[1] == bas_depth)

    print("\n" + "-" * 60)
    print("Sonuc: {} gecti, {} kaldi".format(gecen, kalan))
    return 1 if kalan else 0


if __name__ == "__main__":
    sys.exit(main())

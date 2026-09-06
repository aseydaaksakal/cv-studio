"""6c-2a olcumu: commands.py dogru mu?

Ne model ne FastAPI kullanir. cv_structured.json'i sadece OKUR, uzerine
yazmaz; snapshot/geri al testi gecici bir klasorde yapilir.

Calistirma (backend klasorunden):
    .\\.venv\\Scripts\\python.exe test_commands.py
"""

import json
import shutil
import sys
import tempfile
from pathlib import Path

import commands

OUT = Path(__file__).resolve().parent.parent / "output"

gecen = kalan = 0


def kontrol(ad, kosul, ayrinti=""):
    global gecen, kalan
    if kosul:
        gecen += 1
        print("  gecti  {}".format(ad))
    else:
        kalan += 1
        print("  KALDI  {}   {}".format(ad, ayrinti))


def act(eylem, hedef="", bolum="", deger="", guven=0.95):
    return {"eylem": eylem, "hedef": hedef, "bolum": bolum,
            "deger": deger, "guven": guven}


def test_uygulama(cv0):
    print("\n[1] Eylemler")

    cv, r = commands.apply(cv0, act("bolum_sil", "SKILLS"))
    kontrol("bolum sil", r["applied"] and len(cv["sections"]) == 5, r["message"])

    cv, r = commands.apply(cv0, act("bolum_sil", "skills"))
    kontrol("bolum sil, kucuk harf", r["applied"], r["message"])

    cv, r = commands.apply(cv0, act("bolum_sil", "PUBLICATIONS"))
    kontrol("olmayan bolum reddedildi",
            not r["applied"] and "WORK EXPERIENCE" in r["message"], r["message"])

    cv, r = commands.apply(cv0, act("kayit_sil", "Domino", "WORK EXPERIENCE"))
    kontrol("kayit sil", r["applied"] and len(cv["sections"][0]["items"]) == 7,
            r["message"])

    cv, r = commands.apply(cv0, act("kayit_sil", "Domino", "SKILLS"))
    kontrol("yanlis bolum verilse de kaydi buldu", r["applied"], r["message"])

    cv, r = commands.apply(cv0, act("kayit_sil", "Bachelor", "EDUCATION"))
    kontrol("belirsiz kayit soruldu",
            not r["applied"] and "Hangisi" in r["message"], r["message"])

    cv, r = commands.apply(cv0, act("bolum_adi", "SKILLS", deger="YETKINLIKLER"))
    kontrol("baslik degistir",
            r["applied"] and cv["sections"][1]["heading"] == "YETKINLIKLER",
            r["message"])

    cv, r = commands.apply(cv0, act("bolum_adi", "SKILLS", deger="x" * 80))
    kontrol("cok uzun baslik reddedildi", not r["applied"], r["message"])

    cv, r = commands.apply(cv0, act("bolum_tasi", "EDUCATION", deger="en_uste"))
    kontrol("bolum tasi",
            r["applied"] and cv["sections"][0]["heading"] == "EDUCATION",
            r["message"])

    cv, r = commands.apply(cv0, act("bolum_tasi", "WORK EXPERIENCE", deger="yukari"))
    kontrol("zaten en ustte", not r["applied"], r["message"])

    cv, r = commands.apply(cv0, act("bolum_sil", "SKILLS", guven=0.3))
    kontrol("dusuk guven uygulanmadi", not r["applied"], r["message"])

    cv, r = commands.apply(cv0, act("tasarim"))
    kontrol("tasarim komutu 6d'ye birakildi",
            not r["applied"] and "6d" in r["message"], r["message"])

    cv, r = commands.apply(cv0, act("belirsiz"))
    kontrol("belirsiz uygulanmadi", not r["applied"], r["message"])

    print("\n[2] Kaynak sozluk korunuyor mu")
    once = json.dumps(cv0, sort_keys=True, ensure_ascii=False)
    commands.apply(cv0, act("bolum_sil", "SKILLS"))
    commands.apply(cv0, act("kayit_sil", "Domino"))
    sonra = json.dumps(cv0, sort_keys=True, ensure_ascii=False)
    kontrol("apply girdiyi degistirmedi", once == sonra)


def test_gecmis(cv0):
    print("\n[3] Snapshot ve geri al (gecici klasorde)")
    tmp = Path(tempfile.mkdtemp())
    eski = (commands.OUT, commands.STRUCT, commands.HIST)
    commands.OUT = tmp
    commands.STRUCT = tmp / "cv_structured.json"
    commands.HIST = tmp / "history"
    try:
        commands.save(cv0)
        kontrol("geri alacak yokken uyari", commands.undo()[0] is None)

        commands.snapshot(commands.load(), "SKILLS silindi")
        cv, r = commands.apply(commands.load(), act("bolum_sil", "SKILLS"))
        commands.save(cv)
        kontrol("silme diske yazildi", len(commands.load()["sections"]) == 5)
        kontrol("gecmis derinligi 1", commands.depth() == 1)

        geri, mesaj = commands.undo()
        kontrol("geri alindi", len(commands.load()["sections"]) == 6, mesaj)
        kontrol("gecmis bosaldi", commands.depth() == 0)

        kontrol("geri alinan dosya orijinalle ayni",
                json.dumps(commands.load(), sort_keys=True, ensure_ascii=False)
                == json.dumps(cv0, sort_keys=True, ensure_ascii=False))
    finally:
        commands.OUT, commands.STRUCT, commands.HIST = eski
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    src = OUT / "cv_structured.json"
    if not src.exists():
        print("Bulunamadi:", src)
        return 1
    cv0 = json.loads(src.read_text(encoding="utf-8"))
    print("Kaynak :", src.name, "-", len(cv0.get("sections", [])), "bolum")

    test_uygulama(cv0)
    test_gecmis(cv0)

    print("\n" + "-" * 60)
    print("Sonuc: {} gecti, {} kaldi".format(gecen, kalan))
    print("cv_structured.json'a yazilmadi.")
    return 1 if kalan else 0


if __name__ == "__main__":
    sys.exit(main())

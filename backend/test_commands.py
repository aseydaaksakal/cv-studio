"""commands.py olcumu: eylemler, yeni kayit eylemleri, cok adimli uygulama.

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


def act(eylem, hedef="", bolum="", deger="", guven=0.95, alan=""):
    return {"eylem": eylem, "hedef": hedef, "bolum": bolum, "alan": alan,
            "deger": deger, "guven": guven}


def bul(cv, baslik):
    for s in cv.get("sections", []):
        if commands.norm(s.get("heading")) == commands.norm(baslik):
            return s
    return None


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
    kontrol("tasarim komutu icerige dokunmadi", not r["applied"], r["message"])

    cv, r = commands.apply(cv0, act("belirsiz"))
    kontrol("belirsiz uygulanmadi", not r["applied"], r["message"])

    print("\n[2] Kaynak sozluk korunuyor mu")
    once = json.dumps(cv0, sort_keys=True, ensure_ascii=False)
    commands.apply(cv0, act("bolum_sil", "SKILLS"))
    commands.apply(cv0, act("kayit_sil", "Domino"))
    commands.apply_all(cv0, [act("bolum_sil", "SKILLS"),
                             act("kayit_ekle", "PROJECTS", deger="X")])
    sonra = json.dumps(cv0, sort_keys=True, ensure_ascii=False)
    kontrol("apply girdiyi degistirmedi", once == sonra)


def test_yeni_eylemler(cv0):
    print("\n[3] kayit_ekle ve kayit_duzenle")

    n0 = len(bul(cv0, "PROJECTS")["items"])
    cv, r = commands.apply(cv0, act("kayit_ekle", "PROJECTS",
                                    deger="Portfolio Website"))
    yeni = bul(cv, "PROJECTS")["items"] if r["applied"] else []
    kontrol("kayit ekle",
            r["applied"] and len(yeni) == n0 + 1
            and yeni[-1]["title"] == "Portfolio Website", r["message"])

    cv, r = commands.apply(cv0, act("kayit_ekle", "PROJECTS",
                                    deger="Ad | Aciklama | 2026"))
    son = bul(cv, "PROJECTS")["items"][-1] if r["applied"] else {}
    kontrol("kayit ekle, uc parca",
            r["applied"] and son.get("subtitle") == "Aciklama"
            and son.get("date") == "2026", r["message"])

    cv, r = commands.apply(cv0, act("kayit_ekle", "PROJECTS", deger=""))
    kontrol("bos kayit reddedildi", not r["applied"], r["message"])

    cv, r = commands.apply(cv0, act("kayit_ekle", "PUBLICATIONS", deger="X"))
    kontrol("olmayan bolume ekleme reddedildi", not r["applied"], r["message"])

    cv, r = commands.apply(cv0, act("kayit_duzenle", "Anadolu", "EDUCATION",
                                    alan="tarih", deger="2021 - 2025"))
    hit = commands.find_items(cv, "Anadolu", "EDUCATION")
    tarih = cv["sections"][hit[0][0]]["items"][hit[0][1]]["date"] if hit else ""
    kontrol("kayit duzenle, tarih", r["applied"] and tarih == "2021 - 2025",
            r["message"])

    cv, r = commands.apply(cv0, act("kayit_duzenle", "Anadolu", "EDUCATION",
                                    alan="baslik",
                                    deger="Anadolu University - Expected 2028"))
    hit = commands.find_items(cv, "Anadolu", "EDUCATION")
    bas = cv["sections"][hit[0][0]]["items"][hit[0][1]]["title"] if hit else ""
    kontrol("kayit duzenle, baslik", r["applied"] and "Expected 2028" in bas,
            r["message"])

    hit0 = commands.find_items(cv0, "Anadolu", "EDUCATION")
    b0 = len(cv0["sections"][hit0[0][0]]["items"][hit0[0][1]].get("bullets", []))
    cv, r = commands.apply(cv0, act("kayit_duzenle", "Anadolu", "EDUCATION",
                                    alan="metin", deger="yeni madde"))
    hit = commands.find_items(cv, "Anadolu", "EDUCATION")
    b1 = len(cv["sections"][hit[0][0]]["items"][hit[0][1]].get("bullets", []))
    kontrol("kayit duzenle, madde eklendi", r["applied"] and b1 == b0 + 1,
            r["message"])

    cv, r = commands.apply(cv0, act("kayit_duzenle", "Anadolu", "EDUCATION",
                                    alan="tarih", deger="x" * 400))
    kontrol("cok uzun deger reddedildi", not r["applied"], r["message"])

    cv, r = commands.apply(cv0, act("kayit_duzenle", "Harvard University",
                                    "EDUCATION", alan="tarih", deger="2028"))
    kontrol("olmayan kayit reddedildi", not r["applied"], r["message"])

    cv, r = commands.apply(cv0, act("kayit_duzenle", "Bachelor", "EDUCATION",
                                    alan="tarih", deger="2028"))
    kontrol("belirsiz kayit soruldu (duzenle)",
            not r["applied"] and "Hangisi" in r["message"], r["message"])


def test_coklu(cv0):
    print("\n[4] apply_all: cok adimli")

    cv, r = commands.apply_all(cv0, [
        act("bolum_sil", "SKILLS"),
        act("bolum_tasi", "EDUCATION", deger="en_uste")])
    kontrol("iki adim da uygulandi",
            r["uygulanan"] == 2 and len(cv["sections"]) == 5
            and cv["sections"][0]["heading"] == "EDUCATION", r["message"])

    cv, r = commands.apply_all(cv0, [
        act("bolum_adi", "EDUCATION", deger="EGITIM"),
        act("bolum_tasi", "EDUCATION", deger="en_alta")])
    kontrol("ad degisince eski ad hala bulunuyor",
            r["uygulanan"] == 2 and cv["sections"][-1]["heading"] == "EGITIM",
            r["message"])

    cv, r = commands.apply_all(cv0, [
        act("bolum_sil", "SKILLS"),
        act("bolum_sil", "PUBLICATIONS")])
    kontrol("bir adim gecti bir adim kaldi",
            r["applied"] and r["uygulanan"] == 1 and r["toplam"] == 2
            and len(cv["sections"]) == 5, r["message"])

    cv, r = commands.apply_all(cv0, [
        act("tasarim"),
        act("bolum_sil", "CERTIFICATIONS")])
    kontrol("tasarim adimi cagirana birakildi",
            len(r["tasarim"]) == 1 and r["uygulanan"] == 1
            and r["toplam"] == 1, r["message"])

    cv, r = commands.apply_all(cv0, [
        act("kayit_duzenle", "Anadolu", "EDUCATION", alan="baslik",
            deger="Anadolu University - AI Supported Coding"),
        act("kayit_duzenle", "Anadolu", "EDUCATION", alan="tarih",
            deger="Expected 2028")])
    hit = commands.find_items(cv, "Anadolu", "EDUCATION")
    it = cv["sections"][hit[0][0]]["items"][hit[0][1]] if hit else {}
    kontrol("6d-5 komutu: iki alan da yazildi",
            r["uygulanan"] == 2 and "AI Supported" in it.get("title", "")
            and it.get("date") == "Expected 2028", r["message"])

    cv, r = commands.apply_all(cv0, [act("belirsiz"), act("belirsiz")])
    kontrol("cok adimli belirsiz kisa mesaj verdi",
            not r["applied"] and "anlasilmadi" in r["message"], r["message"])

    cv, r = commands.apply_all(cv0, act("bolum_sil", "SKILLS"))
    kontrol("tek sozluk de kabul edildi", r["uygulanan"] == 1, r["message"])

    cv, r = commands.apply_all(cv0, [])
    kontrol("bos liste belirsiz dondu", not r["applied"], r["message"])


def test_gecmis(cv0):
    print("\n[5] Snapshot ve geri al (gecici klasorde)")
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

        print("\n[6] Cok adimli komut tek geri al ile donuyor mu")
        cv, r = commands.apply_all(commands.load(), [
            act("bolum_sil", "SKILLS"),
            act("bolum_tasi", "EDUCATION", deger="en_uste"),
            act("kayit_ekle", "PROJECTS", deger="Portfolio Website")])
        commands.snapshot(commands.load(), note=r["message"])
        commands.save(cv)
        kontrol("uc adim tek snapshot",
                r["uygulanan"] == 3 and commands.depth() == 1, r["message"])

        commands.undo()
        kontrol("tek geri al hepsini dondurdu",
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
    test_yeni_eylemler(cv0)
    test_coklu(cv0)
    test_gecmis(cv0)

    print("\n" + "-" * 60)
    print("Sonuc: {} gecti, {} kaldi".format(gecen, kalan))
    print("cv_structured.json'a yazilmadi.")
    return 1 if kalan else 0


if __name__ == "__main__":
    sys.exit(main())

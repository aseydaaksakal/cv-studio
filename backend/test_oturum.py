"""session.py olcumu: oturum klasorleri ve calisma anindaki yol baglama.

Model yok, FastAPI yok, ag yok. Gercek output\\ klasorune dokunmaz;
session.KOK gecici bir klasore yonlendirilir ve commands.py /
render_cv.py yol sabitleri testin sonunda geri konur.

Calistirma (backend klasorunden):
    .\\.venv\\Scripts\\python.exe test_oturum.py
"""

import json
import shutil
import sys
import tempfile
from pathlib import Path

import commands
import render_cv

OUT = Path(__file__).resolve().parent.parent / "output"

gecen = kalan = 0


def kontrol(ad, kosul, ayrinti=""):
    global gecen, kalan
    try:
        ok = bool(kosul)
    except Exception as e:                                   # noqa: BLE001
        ok, ayrinti = False, "{}: {}".format(type(e).__name__, e)
    if ok:
        gecen += 1
        print("  gecti  {}".format(ad))
    else:
        kalan += 1
        print("  KALDI  {}   {}".format(ad, ayrinti))


def ornek_cv(ad="Ornek Kisi"):
    return {
        "name": ad,
        "title": "Yazilim Gelistirici",
        "contact": {"email": "ornek@ornek.com", "phone": "", "location": "",
                    "links": []},
        "sections": [
            {"heading": "IS DENEYIMI", "items": [
                {"title": "Kidemli Muhendis", "subtitle": "Firma A",
                 "date": "2021 - 2024", "bullets": ["Olcum altyapisini kurdu."]},
            ]},
            {"heading": "EGITIM", "items": [
                {"title": "Bilgisayar Muhendisligi",
                 "subtitle": "Anadolu Universitesi", "date": "2016 - 2020",
                 "bullets": []},
            ]},
        ],
        "design": {"page": [595.28, 841.89], "fonts": [], "colors": []},
    }


def test_olusturma(session):
    print("\n[1] Olusturma")

    a = session.yeni(ad="Birinci", kaynak="bir.pdf")
    b = session.yeni(ad="Ikinci", kaynak="iki.docx")

    kontrol("id dort hane", session.gecerli(a) and session.gecerli(b),
            "{} / {}".format(a, b))
    kontrol("id benzersiz", a != b, "{} / {}".format(a, b))
    kontrol("klasor acildi", session.yol(a).is_dir())
    kontrol("history acildi", (session.yol(a) / "history").is_dir())
    kontrol("meta.json yazildi", (session.yol(a) / "meta.json").exists())
    kontrol("ad kaydedildi", session.meta(a)["ad"] == "Birinci",
            session.meta(a)["ad"])
    kontrol("kaynak kaydedildi", session.meta(b)["kaynak"] == "iki.docx",
            session.meta(b)["kaynak"])
    kontrol("olusturma zamani var", session.meta(a)["olusturma"] > 0)
    kontrol("var() dogru", session.var(a) and not session.var("9999"))
    kontrol("liste iki oturum", len(session.liste()) == 2,
            len(session.liste()))
    kontrol("liste sirali",
            [d["id"] for d in session.liste()] == sorted([a, b]))
    kontrol("ad_ver degistiriyor",
            session.ad_ver(a, "Yeni Ad")["ad"] == "Yeni Ad")
    return a, b


def test_guvenlik(session):
    print("\n[2] Kimlik guvenligi")

    for kotu in ("../../etc", "0001/../0002", "abcd", "", "1", "0001 "):
        try:
            session.yol(kotu)
            ok = False
        except ValueError:
            ok = True
        kontrol("reddedildi: {!r}".format(kotu), ok)

    kontrol("gecersiz id var() ile de reddediliyor",
            not session.var("../0001"))


def test_baglama(session, a, b):
    print("\n[3] Yol baglama")

    y = session.baglan(a)
    kontrol("commands.STRUCT oturumda",
            commands.STRUCT == session.yol(a) / "cv_structured.json",
            commands.STRUCT)
    kontrol("commands.HIST oturumda",
            commands.HIST == session.yol(a) / "history", commands.HIST)
    kontrol("render_cv.HTML_OUT oturumda",
            render_cv.HTML_OUT == session.yol(a) / "cv_generated.html",
            render_cv.HTML_OUT)
    kontrol("render_cv.LAYOUT oturumda",
            render_cv.LAYOUT == session.yol(a) / "cv_layout.json")
    kontrol("baglanan() dogru id", session.baglanan() == a)
    kontrol("baglan sozluk donduruyor",
            isinstance(y, dict) and y.get("id") == a)

    session.baglan(b)
    kontrol("ikinci baglama yollari degistirdi",
            commands.STRUCT == session.yol(b) / "cv_structured.json")


def test_izolasyon(session, a, b):
    print("\n[4] Oturumlar birbirine karismiyor")

    session.baglan(a)
    commands.save(ornek_cv("Birinci Kisi"))
    commands.save_css("body { color: #111; }")

    session.baglan(b)
    commands.save(ornek_cv("Ikinci Kisi"))

    kontrol("b'nin adi kendine ait", commands.load()["name"] == "Ikinci Kisi",
            commands.load()["name"])
    kontrol("b'nin CSS'i bos", commands.load_css().strip() == "",
            commands.load_css()[:30])

    session.baglan(a)
    kontrol("a'nin adi bozulmadi", commands.load()["name"] == "Birinci Kisi",
            commands.load()["name"])
    kontrol("a'nin CSS'i duruyor", "#111" in commands.load_css(),
            commands.load_css()[:30])

    kontrol("dosya a klasorunde",
            (session.yol(a) / "cv_structured.json").exists())
    kontrol("dosya kok output'a sizmadi",
            not (Path(session.KOK) / "cv_structured.json").exists())


def test_gecmis(session, a, b):
    print("\n[5] Gecmis oturuma ait")

    session.baglan(a)
    cv0 = commands.load()
    commands.snapshot(cv0, note="a birinci")
    commands.save(ornek_cv("A Degisti"))
    kontrol("a derinlik 1", commands.depth() == 1, commands.depth())

    session.baglan(b)
    kontrol("b derinlik 0", commands.depth() == 0, commands.depth())
    commands.snapshot(commands.load(), note="b birinci")
    commands.snapshot(commands.load(), note="b ikinci")
    kontrol("b derinlik 2", commands.depth() == 2, commands.depth())

    session.baglan(a)
    kontrol("a derinlik hala 1", commands.depth() == 1, commands.depth())
    cv, mesaj = commands.undo()
    kontrol("a geri alindi", cv and cv["name"] == "Birinci Kisi", mesaj)
    kontrol("a derinlik 0", commands.depth() == 0, commands.depth())

    session.baglan(b)
    kontrol("b gecmisi etkilenmedi", commands.depth() == 2, commands.depth())
    kontrol("snapshot dosyasi oturum icinde",
            (session.yol(b) / "history" / "0001.json").exists())


def test_render(session, a):
    print("\n[6] render_cv oturuma yaziyor")

    session.baglan(a)
    commands.save(ornek_cv("Render Kisi"))
    try:
        info = render_cv.render()
        hata = ""
    except Exception as e:                                   # noqa: BLE001
        info, hata = None, "{}: {}".format(type(e).__name__, e)

    kontrol("render calisti", info is not None, hata)
    if not info:
        return

    kontrol("HTML oturum klasorunde",
            (session.yol(a) / "cv_generated.html").exists())
    kontrol("HTML ismi iceriyor",
            "Render Kisi" in (session.yol(a) / "cv_generated.html")
            .read_text(encoding="utf-8"))
    kontrol("kok output'a HTML yazilmadi",
            not (Path(session.KOK) / "cv_generated.html").exists())

    commands.save_css("h1 { color: #c00; }")
    info2 = render_cv.render()
    kontrol("oturum CSS'i render'a girdi", bool(info2.get("overrides")))


def test_aktif(session, a, b):
    print("\n[7] Aktif oturum")

    session.sec(a)
    kontrol("sec sonrasi aktif a", session.aktif() == a, session.aktif())
    kontrol("sec yollari da bagladi", session.baglanan() == a)
    kontrol("aktif.json diske yazildi",
            (Path(session.KOK) / "aktif.json").exists())

    session.sec(b)
    kontrol("aktif b oldu", session.aktif() == b, session.aktif())

    try:
        session.sec("9999")
        ok = False
    except ValueError:
        ok = True
    kontrol("olmayan oturum secilemez", ok)

    kontrol("hazirla aktifi donduruyor", session.hazirla() == b,
            session.hazirla())
    kontrol("hazirla verilen id'yi bagliyor", session.hazirla(a) == a
            and commands.STRUCT == session.yol(a) / "cv_structured.json")


def test_silme(session):
    print("\n[8] Silme")

    c = session.yeni(ad="Ucuncu")
    session.sec(c)
    kontrol("silmeden once var", session.var(c))
    kontrol("sil True dondu", session.sil(c) is True)
    kontrol("klasor gitti", not session.var(c))
    kontrol("aktif baska oturuma dustu",
            session.aktif() and session.aktif() != c, session.aktif())
    kontrol("olmayan oturum silinince False", session.sil("9999") is False)


def test_devral(session, tmp):
    print("\n[9] Eski duzenden devir")

    eski = Path(tmp) / "eski_output"
    (eski / "history").mkdir(parents=True, exist_ok=True)
    (eski / "cv_structured.json").write_text(
        json.dumps(ornek_cv("Eski Kisi"), ensure_ascii=False), encoding="utf-8")
    (eski / "cv_overrides.css").write_text("body { color: #222; }",
                                           encoding="utf-8")
    (eski / "history" / "0001.json").write_text(
        json.dumps({"note": "eski", "cv": ornek_cv(), "css": ""},
                   ensure_ascii=False), encoding="utf-8")

    kok2 = Path(tmp) / "devir_kok"
    eski_kok, eski_out = session.KOK, session.OUT
    try:
        session.KOK, session.OUT = kok2, eski
        oid = session.devral()
        kontrol("devir oturum acti", session.gecerli(oid), oid)
        kontrol("cv_structured tasindi",
                (session.yol(oid) / "cv_structured.json").exists())
        kontrol("icerik korundu",
                json.loads((session.yol(oid) / "cv_structured.json")
                           .read_text(encoding="utf-8"))["name"] == "Eski Kisi")
        kontrol("CSS tasindi",
                (session.yol(oid) / "cv_overrides.css").exists())
        kontrol("gecmis tasindi",
                (session.yol(oid) / "history" / "0001.json").exists())
        kontrol("eski dosya yerinde durdu",
                (eski / "cv_structured.json").exists())
        kontrol("devir aktif yapti", session.aktif() == oid)
        kontrol("ikinci devir bir sey yapmadi", session.devral() == "")
    finally:
        session.KOK, session.OUT = eski_kok, eski_out


def main():
    print("=" * 60)
    print("[0] Modul")
    try:
        import session
    except ImportError as e:
        print("  KALDI  session bulunamadi   {}".format(e))
        print("\n" + "-" * 60)
        print("Sonuc: 0 gecti, 1 kaldi   (temel olcum)")
        return 1

    eksik = [ad for ad in ("yeni", "liste", "sec", "aktif", "baglan", "yol",
                           "var", "sil", "hazirla", "devral")
             if not callable(getattr(session, ad, None))]
    if eksik:
        print("  KALDI  eksik fonksiyon: {}".format(eksik))
        print("\n" + "-" * 60)
        print("Sonuc: 0 gecti, 1 kaldi   (temel olcum)")
        return 1
    print("  gecti  session arayuzu tam")

    tmp = Path(tempfile.mkdtemp(prefix="cvoturum_"))
    eski_kok = session.KOK
    eski_yollar = (commands.OUT, commands.STRUCT, commands.HIST,
                   render_cv.OUT, render_cv.STRUCT, render_cv.LAYOUT,
                   render_cv.HTML_OUT)
    try:
        session.KOK = tmp / "oturum"
        a, b = test_olusturma(session)
        test_guvenlik(session)
        test_baglama(session, a, b)
        test_izolasyon(session, a, b)
        test_gecmis(session, a, b)
        test_render(session, a)
        test_aktif(session, a, b)
        test_silme(session)
        test_devral(session, tmp)
    finally:
        session.KOK = eski_kok
        (commands.OUT, commands.STRUCT, commands.HIST,
         render_cv.OUT, render_cv.STRUCT, render_cv.LAYOUT,
         render_cv.HTML_OUT) = eski_yollar
        shutil.rmtree(tmp, ignore_errors=True)

    print("\n[10] Gercek output klasoru")
    kontrol("commands.STRUCT geri konuldu",
            commands.STRUCT == OUT / "cv_structured.json", commands.STRUCT)
    kontrol("render_cv.HTML_OUT geri konuldu",
            render_cv.HTML_OUT == OUT / "cv_generated.html",
            render_cv.HTML_OUT)
    kontrol("session.KOK geri konuldu",
            Path(session.KOK) == OUT / "oturum", session.KOK)

    print("\n" + "-" * 60)
    print("Sonuc: {} gecti, {} kaldi".format(gecen + 1, kalan))
    return 1 if kalan else 0


if __name__ == "__main__":
    sys.exit(main())

"""Yuklenen dosyayi bir oturuma cevirir: ayristir -> cozumle -> uret.

    dosya  -> parse_pdf / parse_docx  -> cv_layout.json   (Python)
           -> cozumle()               -> cv_structured.json (model, sadece anlama)
           -> render_cv.render()      -> cv_generated.html  (Python)

Model burada da yalnizca ANLAMA yapiyor: metni ceviremez, uyduramaz.
temizle() semayi Python'da zorlar, kapsama() modelin yazdigi metnin ne
kadarinin kaynak dosyada gercekten bulundugunu olcer. Kapsama dusukse
uydurma vardir; sayi cagirana dondurulur, sessizce gecilmez.

Oturum icinde dosya adlari sabittir (cv_layout.json, cv_page1.png,
cv_structured.json, cv_generated.html); boylece render_cv.py, compare_cv.py
ve diff_cv.py yol degistirmeden calisir.
"""

import json
import re
import shutil
import time
import unicodedata
from pathlib import Path

import commands
import llm
import parse_docx
import parse_pdf
import render_cv
import session

ROOT = Path(__file__).resolve().parent.parent
UPLOADS = ROOT / "uploads"

TABAN = "cv"
AYRISTIRICI = {".pdf": parse_pdf.parse, ".docx": parse_docx.parse}
MAX_MB = 20
MAX_KISA = 200          # title / subtitle / date
MAX_UZUN = 500          # tek madde
MAX_MADDE = 20          # kayit basina madde
MAX_KAYIT = 40          # bolum basina kayit
MAX_BOLUM = 20

SYSTEM = """Sen bir CV ayristirma motorusun. Sana bir CV'nin metin parcalari
konum (y=ust, x=sol), punto ve kalinlik bilgisiyle birlikte verilir.
Gorevin bunlari anlamli bolumlere ayirmak.

KURALLAR:
- Metinleri ASLA cevirme. Kaynak dilde aynen birak.
- Hicbir bilgi uydurma. Sadece verilen metni kullan.
- Buyuk punto ve KALIN olanlar genelde baslik, kucuk normal olanlar icerik.
- Ayni y degerine sahip parcalar ayni satirdadir, birlestir.
- SADECE JSON dondur. Aciklama, markdown, kod bloklari yazma.

SEMA:
{
  "name": "",
  "title": "",
  "contact": {"email": "", "phone": "", "location": "", "links": []},
  "sections": [
    {"heading": "", "items": [
      {"title": "", "subtitle": "", "date": "", "bullets": []}
    ]}
  ]
}"""


# --- ayristirma -------------------------------------------------------

def desteklenen():
    return sorted(AYRISTIRICI)


def ayristir(dosya, dizin=None, taban=TABAN):
    """Uzantiya bakar, dogru ayristiriciyi cagirir. Sema ikisinde de ayni."""
    dosya = Path(dosya)
    uz = dosya.suffix.lower()
    if uz not in AYRISTIRICI:
        raise ValueError("Desteklenmeyen dosya turu: {}. Kabul edilen: {}"
                         .format(uz or "(uzantisiz)", ", ".join(desteklenen())))
    if not dosya.exists():
        raise FileNotFoundError(str(dosya))
    return AYRISTIRICI[uz](dosya, dizin, taban=taban)


def metin(layout):
    """Modele giden satirlar: y, x, punto, kalinlik, metin."""
    sayfa = (layout.get("pages") or [{}])[0]
    return "\n".join(
        "y={} x={} {}pt {} | {}".format(
            s["bbox"][1], s["bbox"][0], s["size"],
            "KALIN" if s.get("bold") else "normal", s["text"])
        for s in sayfa.get("spans", []))


# --- model ------------------------------------------------------------

def cozumle(layout, model=None):
    """Layout -> ham CV sozlugu. (cv, teshis) dondurur."""
    return llm.ask_json(SYSTEM, "CV metin parcalari:\n\n" + metin(layout),
                        model=model or llm.MODEL, num_ctx=16384)


# --- Python tarafi: sema ve dogrulama ---------------------------------

def _kisa(v, sinir=MAX_KISA):
    if isinstance(v, (list, tuple)):
        v = " ".join(str(x) for x in v)
    return re.sub(r"\s+", " ", str(v or "")).strip()[:sinir]


def _maddeler(v):
    if v is None:
        return []
    if isinstance(v, str):
        v = [v]
    if not isinstance(v, (list, tuple)):
        return []
    out = []
    for m in v:
        t = _kisa(m, MAX_UZUN)
        if t:
            out.append(t)
    return out[:MAX_MADDE]


def temizle(ham, layout=None):
    """Modelin dondurdugunu semaya oturtur. Fazlasini atar, eksigini doldurur."""
    ham = ham if isinstance(ham, dict) else {}
    ilet = ham.get("contact")
    ilet = ilet if isinstance(ilet, dict) else {}
    baglar = ilet.get("links")
    baglar = [_kisa(b) for b in baglar][:8] if isinstance(baglar, list) else []

    bolumler = []
    for sec in (ham.get("sections") or [])[:MAX_BOLUM]:
        if not isinstance(sec, dict):
            continue
        baslik = _kisa(sec.get("heading"), 80)
        kayitlar = []
        for it in (sec.get("items") or [])[:MAX_KAYIT]:
            if isinstance(it, str):
                it = {"title": it}
            if not isinstance(it, dict):
                continue
            kayit = {
                "title": _kisa(it.get("title")),
                "subtitle": _kisa(it.get("subtitle")),
                "date": _kisa(it.get("date")),
                "bullets": _maddeler(it.get("bullets")),
            }
            if any(kayit.values()):
                kayitlar.append(kayit)
        if baslik or kayitlar:
            bolumler.append({"heading": baslik, "items": kayitlar})

    cv = {
        "name": _kisa(ham.get("name"), 120),
        "title": _kisa(ham.get("title"), 160),
        "contact": {
            "email": _kisa(ilet.get("email"), 120),
            "phone": _kisa(ilet.get("phone"), 60),
            "location": _kisa(ilet.get("location"), 120),
            "links": baglar,
        },
        "sections": bolumler,
    }

    if layout:
        sayfa = (layout.get("pages") or [{}])[0]
        cv["design"] = {
            "page": [sayfa.get("width_pt", 595.28), sayfa.get("height_pt", 841.89)],
            "fonts": list(layout.get("fonts_used") or {})[:6],
            "colors": list(layout.get("colors_used") or {})[:6],
        }
    return cv


def _sadelestir(s):
    s = unicodedata.normalize("NFKD", str(s or "")).casefold()
    return re.sub(r"[^0-9a-z]+", "", s)


def _degerler(cv):
    for anahtar in ("name", "title"):
        yield cv.get(anahtar, "")
    ilet = cv.get("contact") or {}
    for anahtar in ("email", "phone", "location"):
        yield ilet.get(anahtar, "")
    for sec in cv.get("sections", []):
        yield sec.get("heading", "")
        for it in sec.get("items", []):
            for anahtar in ("title", "subtitle", "date"):
                yield it.get(anahtar, "")
            for m in it.get("bullets", []):
                yield m


def kapsama(cv, layout):
    """Modelin yazdigi metnin kaynakta bulunan orani (0..1) ve eksik parcalar.

    Noktalama ve buyuk/kucuk harf yok sayilir. Uzun metinler karakter
    agirligiyla sayilir; tek kelimelik bir uydurma orani cok dusurmez ama
    ceviri ya da yeniden yazim aninda gorunur.
    """
    kaynak = _sadelestir(" ".join(
        s.get("text", "")
        for p in layout.get("pages", []) for s in p.get("spans", [])))
    toplam = bulunan = 0
    eksik = []
    for ham in _degerler(cv):
        t = _sadelestir(ham)
        if not t:
            continue
        toplam += len(t)
        if t in kaynak:
            bulunan += len(t)
        elif len(eksik) < 10:
            eksik.append(_kisa(ham, 60))
    return (round(bulunan / toplam, 3) if toplam else 1.0), eksik


# --- dosya ------------------------------------------------------------

def benzersiz(dosya_adi, klasor=None):
    """uploads\\ icinde cakismayan ad. Tehlikeli karakterler temizlenir."""
    klasor = Path(klasor or UPLOADS)
    klasor.mkdir(parents=True, exist_ok=True)
    ad = Path(str(dosya_adi)).name
    uz = Path(ad).suffix.lower()
    govde = re.sub(r"[^0-9A-Za-z._-]+", "_", Path(ad).stem).strip("._-") or "cv"
    hedef = klasor / (govde + uz)
    n = 2
    while hedef.exists():
        hedef = klasor / "{}_{}{}".format(govde, n, uz)
        n += 1
    return hedef


# --- uctan uca --------------------------------------------------------

def calistir(dosya, oid="", ad="", cozumleyici=None, model=None, kopyala=True):
    """Dosyayi oturuma isler. Oturum verilmezse yenisini acar.

    cozumleyici : (layout) -> (cv, teshis). Test model olmadan cagirabilsin
                  diye disaridan verilebilir.
    """
    dosya = Path(dosya)
    uz = dosya.suffix.lower()
    if uz not in AYRISTIRICI:
        raise ValueError("Desteklenmeyen dosya turu: {}. Kabul edilen: {}"
                         .format(uz or "(uzantisiz)", ", ".join(desteklenen())))
    if not dosya.exists():
        raise FileNotFoundError(str(dosya))

    t0 = time.time()
    if kopyala:
        hedef = benzersiz(dosya.name)
        if hedef.resolve() != dosya.resolve():
            shutil.copy2(dosya, hedef)
        dosya = hedef

    yeni_oturum = not oid
    if yeni_oturum:
        oid = session.yeni(ad=ad or dosya.stem, kaynak=dosya.name)
    yollar = session.baglan(oid)
    dizin = yollar["dizin"]

    layout = ayristir(dosya, dizin, taban=TABAN)
    parca = sum(len(p.get("spans", [])) for p in layout.get("pages", []))
    if parca == 0:
        if yeni_oturum:
            session.sil(oid)
        raise ValueError("Dosyadan metin cikmadi. Taranmis PDF olabilir.")

    try:
        if cozumleyici:
            ham, teshis = cozumleyici(layout)
        else:
            ham, teshis = cozumle(layout, model=model)
    except llm.LLMError:
        if yeni_oturum:
            session.sil(oid)
        raise

    cv = temizle(ham, layout)
    if not cv["sections"]:
        if yeni_oturum:
            session.sil(oid)
        raise ValueError("Model bolum cikaramadi.")

    oran, eksik = kapsama(cv, layout)
    commands.save(cv)
    bilgi = render_cv.render()

    session.meta_yaz(oid, ad=ad or cv.get("name") or dosya.stem,
                     kaynak=dosya.name, guncelleme=int(time.time()))
    session.sec(oid)

    return {
        "ok": True,
        "id": oid,
        "dosya": dosya.name,
        "tur": uz.lstrip("."),
        "parca": parca,
        "bolum": len(cv["sections"]),
        "kayit": sum(len(s["items"]) for s in cv["sections"]),
        "ad": cv.get("name", ""),
        "kapsama": oran,
        "eksik": eksik,
        "uzunluk": bilgi["length"],
        "sure": round(time.time() - t0, 1),
        "model_sure": round((teshis or {}).get("sure", 0) or 0, 1),
        "thinking": (teshis or {}).get("thinking", ""),
    }


def ozet(sonuc):
    print("=" * 50)
    print("OTURUM   :", sonuc["id"], "-", sonuc["ad"])
    print("DOSYA    :", sonuc["dosya"], "({})".format(sonuc["tur"]))
    print("PARCA    :", sonuc["parca"])
    print("BOLUM    :", sonuc["bolum"], "/", sonuc["kayit"], "kayit")
    print("KAPSAMA  :", "%{:.1f}".format(sonuc["kapsama"] * 100))
    if sonuc["eksik"]:
        print("KAYNAKTA YOK:")
        for e in sonuc["eksik"][:5]:
            print("   -", e)
    print("SURE     :", sonuc["sure"], "sn (model {})".format(sonuc["model_sure"]))
    print("=" * 50)

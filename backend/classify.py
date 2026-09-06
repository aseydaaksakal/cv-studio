"""Serbest Turkce komutu sabit bir EYLEM LISTESINE cevirir.

Model sadece hangi eylem ve hangi hedef sorusuna cevap verir. Hedefi gercek
basliklar ve gercek kayitlarla eslestirmek, bulamayinca sormak Python'un isi.
Modele CV'nin gercek envanteri verilir; olmayan bir kayda isaret ederse
Python yakalar ve o adim "belirsiz" olur.

6d-3: "tasarimi sifirla" model oncesi Python'da yakalanir. Sifirlama bir
tasarim degisikligi degil, tasarim degisikliklerinin geri alinmasidir;
modele sorulursa CSS yazar (olculdu). Deterministik, model cagrisi yok.

6d-6: donus artik {"adimlar": [ {...}, {...} ]} seklindedir. Ilk adimin
alanlari geriye donuk uyum icin sozlugun kokune de kopyalanir; boylece
tek eylem bekleyen eski cagiranlar calismaya devam eder.
"""

import re

import llm

EYLEMLER = [
    "bolum_sil",          # bir bolumu tumuyle kaldir
    "bolum_adi",          # bolum basligini degistir (deger = yeni ad)
    "bolum_tasi",         # bolum sirasini degistir (deger = yon)
    "kayit_sil",          # bir bolumdeki tek kaydi kaldir
    "kayit_ekle",         # bir bolume yeni kayit ekle (deger = metin)
    "kayit_duzenle",      # bir kaydin alanini degistir (alan + deger)
    "tasarim",            # gorunum komutu, icerige dokunmaz
    "tasarim_sifirla",    # override katmanini sil -> /design/reset
    "belirsiz",           # anlasilmadi, kullaniciya sor
]

KAYIT_EYLEMLERI = ("kayit_sil", "kayit_duzenle")
YONLER = ["yukari", "asagi", "en_uste", "en_alta"]
ALANLAR = ["baslik", "altbaslik", "tarih", "metin"]

MAX_ADIM = 6           # bir komuttan cikabilecek en fazla adim
ES_ESIK = 0.5          # hedef kelimelerinin ne kadari kayitta gecmeli


# --- normalizasyon ----------------------------------------------------

def norm(s):
    """Turkce buyuk/kucuk harf farkini eritir, bosluklari sadelestirir."""
    s = str(s or "")
    for a, b in (("\u0130", "i"), ("I", "\u0131"), ("\u0131", "i")):
        s = s.replace(a, b)
    return re.sub(r"\s+", " ", s.casefold()).strip()


_YON_ESLE = {
    "en_uste": "en_uste", "en uste": "en_uste", "en ust": "en_uste",
    "en basa": "en_uste", "basa": "en_uste", "ilk sira": "en_uste",
    "en yukari": "en_uste", "en_ust": "en_uste", "top": "en_uste",
    "en_alta": "en_alta", "en alta": "en_alta", "en alt": "en_alta",
    "en sona": "en_alta", "sona": "en_alta", "son sira": "en_alta",
    "en asagi": "en_alta", "en_alt": "en_alta", "bottom": "en_alta",
    "yukari": "yukari", "bir yukari": "yukari", "yukariya": "yukari",
    "ust": "yukari", "up": "yukari",
    "asagi": "asagi", "bir asagi": "asagi", "asagiya": "asagi",
    "alt": "asagi", "down": "asagi",
}

_ALAN_ESLE = {
    "baslik": "baslik", "title": "baslik", "ad": "baslik", "isim": "baslik",
    "kurum": "baslik", "sirket": "baslik",
    "altbaslik": "altbaslik", "alt baslik": "altbaslik",
    "subtitle": "altbaslik", "aciklama": "altbaslik", "bolum": "altbaslik",
    "program": "altbaslik", "pozisyon": "altbaslik",
    "tarih": "tarih", "date": "tarih", "yil": "tarih", "donem": "tarih",
    "metin": "metin", "text": "metin", "icerik": "metin",
    "madde": "metin", "detay": "metin",
}


def _yon(deger):
    return _YON_ESLE.get(norm(deger).replace("_", " ").strip(), "") \
        or _YON_ESLE.get(norm(deger), "")


def _alan(deger):
    return _ALAN_ESLE.get(norm(deger), "")


# --- sifirlama on-yakalama -------------------------------------------
# Sadece "tasarim/gorunum/stil/css" + "sifirla/eski haline/geri don/kaldir"
# birlikte gectiginde eslesir. Tek basina "sifirla" veya tek basina
# "tasarim" eslesmez; "basliklari eski rengine dondur" gibi tekil hedefli
# cumleler tasarim olarak modele gider.
#
# 6d-6: cumlede ikinci bir is daha varsa ("... ve LANGUAGES'i sil")
# on-yakalama devreye girmez, cumlenin tamami modele gider.

_NESNE = r"(tasarim|tasar\u0131m|g[o\u00f6]r[u\u00fc]n[u\u00fc]m|stil|css|bi[c\u00e7]im|format)"
_FIIL = (r"(s\u0131f\u0131rla|sifirla|resetle|reset|"
         r"temizle|kald\u0131r|kaldir|iptal et|"
         r"eski haline|ilk haline|varsay\u0131lan|varsayilan|"
         r"geri (al|d[o\u00f6]n)|d[o\u00f6]n[u\u00fc]st[u\u00fc]r me)"
         )

_SIFIRLA = re.compile(
    r"(?=.*" + _NESNE + r")(?=.*" + _FIIL + r")", re.IGNORECASE | re.DOTALL)

# tekil hedefli tasarim cumleleri: sifirlama SAYILMAZ
_HEDEFLI = re.compile(
    r"(baslik|ba\u015fl\u0131k|renk|renj|punto|font|yaz\u0131|yazi|"
    r"s[u\u00fc]tun|bo\u015fluk|bosluk|[c\u00e7]izgi|kenar|hizala|"
    r"h1|h2|\.page|\.item)", re.IGNORECASE)

# ikinci bir is daha var mi: baglac + eylem fiili
_COKLU = re.compile(
    r"\b(ve|sonra|ard\u0131ndan|ardindan|ayr\u0131ca|ayrica|bir de)\b"
    r".{0,80}?\b(sil|kald\u0131r|kaldir|ekle|ta\u015f\u0131|tasi|yaz|"
    r"de\u011fi\u015ftir|degistir|d\u00fczelt|duzelt|ta\u015f\u0131y|al)\b",
    re.IGNORECASE | re.DOTALL)


def _adim(eylem="belirsiz", hedef="", bolum="", alan="", deger="", guven=0.0):
    return {"eylem": eylem, "hedef": hedef, "bolum": bolum,
            "alan": alan, "deger": deger, "guven": guven}


def _paket(adimlar):
    """Adim listesini donus sozlugune sarar; ilk adimi koke kopyalar."""
    if not adimlar:
        adimlar = [_adim()]
    out = dict(adimlar[0])
    out["adimlar"] = adimlar
    return out


def pre(text):
    """Model cagrilmadan once deterministik yakalama. Yoksa None."""
    t = (text or "").strip()
    if not t:
        return None
    if _SIFIRLA.search(t) and not _HEDEFLI.search(t) and not _COKLU.search(t):
        return _paket([_adim("tasarim_sifirla", guven=1.0)])
    return None


# --- envanter ---------------------------------------------------------

def inventory(cv):
    """Modele verilecek envanter. Kisa tutulur, tam metin gonderilmez."""
    lines = []
    for sec in cv.get("sections", []):
        items = sec.get("items", [])
        lines.append("BOLUM: {} ({} kayit)".format(
            sec.get("heading", ""), len(items)))
        for i, it in enumerate(items, 1):
            parca = [(it.get("title") or "").strip()[:60]]
            if (it.get("subtitle") or "").strip():
                parca.append(it["subtitle"].strip()[:40])
            if (it.get("date") or "").strip():
                parca.append(it["date"].strip()[:20])
            lines.append("  {}. {}".format(i, " | ".join(p for p in parca if p)))
    return "\n".join(lines)


def _bloblar(cv):
    """(bolum_adlari, kayit_metinleri) - hedef dogrulamasi icin."""
    basliklar = [norm(s.get("heading")) for s in cv.get("sections", [])]
    kayitlar = []
    for sec in cv.get("sections", []):
        for it in sec.get("items", []):
            kayitlar.append(norm("{} {} {}".format(
                it.get("title") or "", it.get("subtitle") or "",
                it.get("date") or "")))
    return basliklar, kayitlar


def _es(hedef, bloblar):
    """Hedef gercekten envanterde geciyor mu. Kismi kelime eslesmesi."""
    h = norm(hedef)
    if not h:
        return False
    kelimeler = [k for k in re.split(r"[^0-9a-z\u00e7\u011f\u00f6\u015f\u00fc]+", h)
                 if len(k) >= 3]
    for b in bloblar:
        if not b:
            continue
        if h in b or b in h:
            return True
        if kelimeler:
            var = sum(1 for k in kelimeler if k in b)
            if var / len(kelimeler) >= ES_ESIK:
                return True
    return False


# --- istem ------------------------------------------------------------

SYSTEM = """Sen bir CV duzenleme arayuzunun komut ayristiricisisin.
Kullanicinin cumlesini SIRALI bir eylem listesine cevirirsin.

EYLEMLER:
- bolum_sil      : bir bolumu tumuyle kaldirmak
- bolum_adi      : bolum basligini degistirmek, deger = yeni baslik
- bolum_tasi     : bolum sirasini degistirmek, deger = yukari|asagi|en_uste|en_alta
- kayit_sil      : bir bolumdeki tek kaydi kaldirmak
- kayit_ekle     : bir bolume yeni kayit eklemek, hedef = bolum, deger = yeni metin
- kayit_duzenle  : bir kaydin bir alanini degistirmek
                   alan = baslik|altbaslik|tarih|metin, deger = yeni metin
- tasarim        : renk, punto, sutun, bosluk gibi gorunum istekleri
- tasarim_sifirla: tum tasarim degisikliklerini geri almak
- belirsiz       : yukaridakilerden hicbiri degilse

KURALLAR:
- Cumlede birden fazla is varsa HER IS ICIN AYRI ADIM yaz, kullanicinin
  soyledigi sirayla. Tek is varsa liste tek elemanli olur.
- Ayni kaydin ayni alanina yapilan eklemeleri TEK adimda birlestir; deger
  alanina alanin son halini yaz.
- hedef alanina SADECE envanterde gecen bir bolum basligi veya kayit adi
  yaz. Envanterde yoksa o adim "belirsiz" olsun.
- Kayit eylemlerinde hedef = kaydin adi, bolum = o kaydin GERCEKTEN
  bulundugu bolum. Kullanici yanlis bolum soylerse envanterdekini yaz.
- bolum_tasi degeri sadece su dordunden biri: yukari, asagi, en_uste, en_alta.
- Kullanici metin cevirisi isterse ceviriyi deger alanina yaz. Bunun
  disinda metin uydurma, ozetleme.
- Emin degilsen guven degerini dusur.
- SADECE JSON dondur. Aciklama, markdown, kod blogu yazma.

SEMA:
{"adimlar": [{"eylem":"","hedef":"","bolum":"","alan":"","deger":"","guven":0.0}]}

ORNEKLER:
"SKILLS bolumunu kaldir"
{"adimlar":[{"eylem":"bolum_sil","hedef":"SKILLS","bolum":"","alan":"","deger":"","guven":0.95}]}

"EGITIM'i en uste al"
{"adimlar":[{"eylem":"bolum_tasi","hedef":"EDUCATION","bolum":"","alan":"","deger":"en_uste","guven":0.9}]}

"LANGUAGES bolumunu en alta al"
{"adimlar":[{"eylem":"bolum_tasi","hedef":"LANGUAGES","bolum":"","alan":"","deger":"en_alta","guven":0.9}]}

"SKILLS'i sil, sonra EDUCATION'i en uste al"
{"adimlar":[{"eylem":"bolum_sil","hedef":"SKILLS","bolum":"","alan":"","deger":"","guven":0.9},
{"eylem":"bolum_tasi","hedef":"EDUCATION","bolum":"","alan":"","deger":"en_uste","guven":0.9}]}

"basliklari lacivert yap ve LANGUAGES bolumunu sil"
{"adimlar":[{"eylem":"tasarim","hedef":"","bolum":"","alan":"","deger":"","guven":0.9},
{"eylem":"bolum_sil","hedef":"LANGUAGES","bolum":"","alan":"","deger":"","guven":0.9}]}

"ucuncu is kaydini sil"
{"adimlar":[{"eylem":"kayit_sil","hedef":"Cloud Platform & Cost","bolum":"WORK EXPERIENCE","alan":"","deger":"","guven":0.7}]}

"Anadolu University'nin yanina Expected 2028 yaz"
{"adimlar":[{"eylem":"kayit_duzenle","hedef":"Anadolu University","bolum":"EDUCATION","alan":"baslik","deger":"Anadolu University - Expected 2028","guven":0.8}]}

"Anadolu University satirinin tarihini 2021 - 2025 yap"
{"adimlar":[{"eylem":"kayit_duzenle","hedef":"Anadolu University","bolum":"EDUCATION","alan":"tarih","deger":"2021 - 2025","guven":0.9}]}

"PROJECTS bolumune Portfolio Website adli kayit ekle"
{"adimlar":[{"eylem":"kayit_ekle","hedef":"PROJECTS","bolum":"PROJECTS","alan":"","deger":"Portfolio Website","guven":0.9}]}
"""


# --- temizleme --------------------------------------------------------

def _temizle(ham, cv, metin):
    """Model ciktisini semaya oturtur, uydurma hedefleri belirsize cevirir."""
    basliklar, kayitlar = _bloblar(cv)
    sifirlanabilir = bool(_SIFIRLA.search(metin or ""))
    out = []

    for h in ham[:MAX_ADIM]:
        if not isinstance(h, dict):
            continue

        eylem = norm(h.get("eylem")).replace(" ", "_")
        if eylem not in EYLEMLER:
            eylem = "belirsiz"

        hedef = str(h.get("hedef", "") or "").strip()
        bolum = str(h.get("bolum", "") or "").strip()
        alan = _alan(h.get("alan"))
        deger = str(h.get("deger", "") or "").strip()

        try:
            guven = float(h.get("guven", 0))
        except (TypeError, ValueError):
            guven = 0.0
        guven = max(0.0, min(1.0, guven))

        # model kendiliginden sifirlama uyduramaz
        if eylem == "tasarim_sifirla" and not sifirlanabilir:
            eylem = "tasarim"

        if eylem == "bolum_tasi":
            deger = _yon(deger)
            if not deger:
                eylem = "belirsiz"

        if eylem in ("bolum_sil", "bolum_adi", "bolum_tasi"):
            if not _es(hedef, basliklar):
                eylem = "belirsiz"

        if eylem in KAYIT_EYLEMLERI:
            if not _es(hedef, kayitlar):
                eylem = "belirsiz"

        if eylem == "kayit_ekle":
            if not (_es(hedef, basliklar) or _es(bolum, basliklar)):
                eylem = "belirsiz"
            if not deger:
                eylem = "belirsiz"

        if eylem == "kayit_duzenle":
            if not deger:
                eylem = "belirsiz"
            if not alan:
                alan = "baslik"

        if eylem == "bolum_adi" and not deger:
            eylem = "belirsiz"

        if eylem == "belirsiz":
            out.append(_adim(guven=guven))
        else:
            out.append(_adim(eylem, hedef, bolum, alan, deger, guven))

    # tumu belirsizse tek bir belirsiz adim yeter
    if not out:
        out = [_adim()]
    if all(a["eylem"] == "belirsiz" for a in out):
        out = out[:1]
    return out


def classify(text, cv, model=llm.MODEL):
    """(veri, teshis) dondurur. veri["adimlar"] sirali eylem listesidir."""
    onceden = pre(text)
    if onceden is not None:
        return onceden, {"model": None, "sure": 0.0, "done_reason": "pre",
                         "content_uz": 0, "thinking_uz": 0,
                         "think_dusuruldu": False, "kurtarma": False}

    user = "CV envanteri:\n{}\n\nKomut: {}".format(inventory(cv), text.strip())
    data, diag = llm.ask_json(SYSTEM, user, model=model)

    ham = data.get("adimlar")
    if not isinstance(ham, list):
        ham = data.get("adim") or data.get("steps")
    if not isinstance(ham, list):
        ham = [data]

    return _paket(_temizle(ham, cv, text)), diag

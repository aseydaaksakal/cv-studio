"""Serbest Turkce komutu sabit bir eylem sozluguna cevirir.

Model sadece hangi eylem ve hangi hedef sorusuna cevap verir. Hedefi gercek
basliklarla eslestirmek, bulamayinca sormak Python'un isi (bkz. 6c-2).
Modele CV'nin gercek envanteri verilir; boylece olmayan bir bolume isaret
etme ihtimali duser, ettiginde de Python yakalar.

6d-3: "tasarimi sifirla" model oncesi Python'da yakalanir. Sifirlama bir
tasarim degisikligi degil, tasarim degisikliklerinin geri alinmasidir;
modele sorulursa CSS yazar (olculdu). Deterministik, model cagrisi yok.
"""

import re

import llm

EYLEMLER = [
    "bolum_sil",          # bir bolumu tumuyle kaldir
    "kayit_sil",          # bir bolumdeki tek kaydi kaldir
    "bolum_adi",          # bolum basligini degistir (deger = yeni ad)
    "bolum_tasi",         # bolum sirasini degistir (deger = yon)
    "tasarim",            # gorunum komutu, icerige dokunmaz -> 6d
    "tasarim_sifirla",    # override katmanini sil -> /design/reset
    "belirsiz",           # anlasilmadi, kullaniciya sor
]

YONLER = ["yukari", "asagi", "en_uste", "en_alta"]

# --- sifirlama on-yakalama -------------------------------------------
# Sadece "tasarim/gorunum/stil/css" + "sifirla/eski haline/geri don/kaldir"
# birlikte gectiginde eslesir. Tek basina "sifirla" veya tek basina
# "tasarim" eslesmez; "basliklari eski rengine dondur" gibi tekil hedefli
# cumleler tasarim olarak modele gider.

_NESNE = r"(tasarim|tasar\u0131m|g[o\u00f6]r[u\u00fc]n[u\u00fc]m|stil|css|bi[cç]im|format)"
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
    r"s[u\u00fc]tun|bo\u015fluk|bosluk|[cç]izgi|kenar|hizala|"
    r"h1|h2|\.page|\.item)", re.IGNORECASE)


def pre(text):
    """Model cagrilmadan once deterministik yakalama. Yoksa None."""
    t = (text or "").strip()
    if not t:
        return None
    if _SIFIRLA.search(t) and not _HEDEFLI.search(t):
        return {"eylem": "tasarim_sifirla", "hedef": "", "bolum": "",
                "deger": "", "guven": 1.0}
    return None


SYSTEM = """Sen bir CV duzenleme arayuzunun komut ayristiricisisin.
Kullanicinin Turkce cumlesini tek bir eyleme cevirirsin.

EYLEMLER:
- bolum_sil    : bir bolumu tumuyle kaldirmak
- kayit_sil    : bir bolumdeki tek kaydi kaldirmak
- bolum_adi    : bolum basligini degistirmek, deger = yeni baslik
- bolum_tasi   : bolum sirasini degistirmek, deger = yukari|asagi|en_uste|en_alta
- tasarim      : renk, punto, sutun, bosluk gibi gorunum istekleri
- belirsiz     : yukaridakilerden hicbiri degilse

KURALLAR:
- hedef alanina SADECE envanterde gecen bir baslik veya kayit adi yaz.
  Envanterde yoksa eylem "belirsiz" olsun.
- Metin uydurma, cevirme, ozetleme.
- Emin degilsen guven degerini dusur.
- SADECE JSON dondur. Aciklama, markdown, kod blogu yazma.

SEMA:
{"eylem": "", "hedef": "", "bolum": "", "deger": "", "guven": 0.0}

ORNEKLER:
"SKILLS bolumunu kaldir"        -> {"eylem":"bolum_sil","hedef":"SKILLS","bolum":"","deger":"","guven":0.95}
"ucuncu is kaydini sil"         -> {"eylem":"kayit_sil","hedef":"Cloud Platform & Cost","bolum":"WORK EXPERIENCE","deger":"","guven":0.7}
"EGITIM'i en uste al"           -> {"eylem":"bolum_tasi","hedef":"EDUCATION","bolum":"","deger":"en_uste","guven":0.9}
"basliklari lacivert yap"       -> {"eylem":"tasarim","hedef":"","bolum":"","deger":"","guven":0.9}
"""


def inventory(cv):
    """Modele verilecek envanter. Kisa tutulur, tam metin gonderilmez."""
    lines = []
    for sec in cv.get("sections", []):
        items = sec.get("items", [])
        lines.append("BOLUM: {} ({} kayit)".format(sec.get("heading", ""), len(items)))
        for i, it in enumerate(items, 1):
            t = (it.get("title") or "").strip()
            lines.append("  {}. {}".format(i, t[:70]))
    return "\n".join(lines)


def classify(text, cv, model=llm.MODEL):
    """(veri, teshis) dondurur. Sema disi degerler burada temizlenir."""
    onceden = pre(text)
    if onceden is not None:
        return onceden, {"model": None, "sure": 0.0, "done_reason": "pre",
                         "content_uz": 0, "thinking_uz": 0,
                         "think_dusuruldu": False, "kurtarma": False}

    user = "CV envanteri:\n{}\n\nKomut: {}".format(inventory(cv), text.strip())
    data, diag = llm.ask_json(SYSTEM, user, model=model)

    eylem = str(data.get("eylem", "")).strip().lower()
    if eylem not in EYLEMLER:
        eylem = "belirsiz"

    # model bu eylemi bilmiyor; yalnizca pre() uretebilir
    if eylem == "tasarim_sifirla":
        eylem = "tasarim"

    deger = str(data.get("deger", "")).strip()
    if eylem == "bolum_tasi" and deger.lower() not in YONLER:
        eylem, deger = "belirsiz", ""

    try:
        guven = float(data.get("guven", 0))
    except (TypeError, ValueError):
        guven = 0.0

    return {
        "eylem": eylem,
        "hedef": str(data.get("hedef", "")).strip(),
        "bolum": str(data.get("bolum", "")).strip(),
        "deger": deger,
        "guven": max(0.0, min(1.0, guven)),
    }, diag

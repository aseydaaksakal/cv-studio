"""Icerik komutlarini cv_structured.json uzerinde uygular.

Model burada yok. Girdi, classify.py'nin urettigi eylem sozlugudur.
Hedefi gercek basliklarla eslestiren, bulamayinca soran, hicbir sey
uydurmayan taraf burasi. Model olmayan bir bolume isaret ederse
eslesme sifir doner ve degisiklik yapilmaz.

Her degisiklikten once snapshot alinir; geri alma dizinden okunur,
bellekte durum tutulmaz (uvicorn --reload yeniden baslatabilir).
"""

import json
import re
from copy import deepcopy
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "output"
STRUCT = OUT / "cv_structured.json"
HIST = OUT / "history"

MAX_HIST = 50          # bu kadar snapshot saklanir
MIN_GUVEN = 0.5        # altinda uygulamaz, sorar
MAX_BASLIK = 60        # yeni bolum basligi uzunluk siniri


# --- eslestirme -------------------------------------------------------

def norm(s):
    """Turkce buyuk/kucuk harf farkini eritir, bosluklari sadelestirir."""
    s = str(s or "")
    for a, b in (("\u0130", "i"), ("I", "\u0131"), ("\u0131", "i")):
        s = s.replace(a, b)
    return re.sub(r"\s+", " ", s.casefold()).strip()


def headings(cv):
    return [s.get("heading", "") for s in cv.get("sections", [])]


def find_sections(cv, hedef):
    """Baslik eslesmesi. Tam eslesme varsa yalnizca onu dondurur."""
    h = norm(hedef)
    if not h:
        return []
    secs = cv.get("sections", [])
    tam = [i for i, s in enumerate(secs) if norm(s.get("heading")) == h]
    if tam:
        return tam
    return [i for i, s in enumerate(secs)
            if h in norm(s.get("heading")) or norm(s.get("heading")) in h]


def find_items(cv, hedef, bolum=""):
    """Kayit eslesmesi. Bolum yanlissa tum CV'de tekrar arar."""
    h = norm(hedef)
    if not h:
        return []
    limit = find_sections(cv, bolum) if bolum else []
    hits = []
    for si, sec in enumerate(cv.get("sections", [])):
        if limit and si not in limit:
            continue
        for ii, it in enumerate(sec.get("items", [])):
            blob = norm("{} {}".format(it.get("title") or "",
                                       it.get("subtitle") or ""))
            if h in blob:
                hits.append((si, ii))
    if not hits and limit:
        return find_items(cv, hedef, "")
    return hits


# --- sonuc bicimi -----------------------------------------------------

def _yes(msg):
    return {"applied": True, "message": msg}


def _no(msg):
    return {"applied": False, "message": msg}


def _bolum_yok(cv, hedef, idx):
    if not idx:
        return _no("\"{}\" diye bir bolum yok. Bolumler: {}".format(
            hedef, ", ".join(headings(cv))))
    adlar = ", ".join(cv["sections"][i].get("heading", "") for i in idx)
    return _no("\"{}\" birden fazla bolume uyuyor: {}. Hangisi?".format(
        hedef, adlar))


def _kayit_yok(cv, hedef, hits):
    if not hits:
        return _no("\"{}\" ile eslesen kayit bulamadim.".format(hedef))
    ornek = []
    for si, ii in hits[:4]:
        it = cv["sections"][si]["items"][ii]
        ornek.append("{} / {}".format(cv["sections"][si].get("heading", ""),
                                      (it.get("title") or "").strip()[:40]))
    return _no("\"{}\" {} kayda uyuyor: {}. Hangisi?".format(
        hedef, len(hits), " | ".join(ornek)))


# --- uygulama ---------------------------------------------------------

def apply(cv, act):
    """(yeni_cv, sonuc) dondurur. Verilen cv degistirilmez."""
    cv = deepcopy(cv)
    eylem = act.get("eylem", "belirsiz")
    hedef = act.get("hedef", "")
    bolum = act.get("bolum", "")
    deger = (act.get("deger") or "").strip()
    try:
        guven = float(act.get("guven") or 0)
    except (TypeError, ValueError):
        guven = 0.0

    if eylem == "belirsiz":
        return cv, _no("Komutu anlayamadim. Bolumler: {}".format(
            ", ".join(headings(cv))))

    if eylem == "tasarim":
        return cv, _no("Bu bir tasarim komutu, icerige dokunmuyor. "
                       "Asama 6d'de baglanacak.")

    if guven < MIN_GUVEN:
        return cv, _no("Emin olamadim (guven {:.0%}). Biraz daha acik "
                       "yazar misin?".format(guven))

    if eylem == "bolum_sil":
        idx = find_sections(cv, hedef)
        if len(idx) != 1:
            return cv, _bolum_yok(cv, hedef, idx)
        sec = cv["sections"].pop(idx[0])
        return cv, _yes("{} bolumu silindi ({} kayit).".format(
            sec.get("heading", ""), len(sec.get("items", []))))

    if eylem == "kayit_sil":
        hits = find_items(cv, hedef, bolum)
        if len(hits) != 1:
            return cv, _kayit_yok(cv, hedef, hits)
        si, ii = hits[0]
        sec = cv["sections"][si]
        it = sec["items"].pop(ii)
        msg = "{} bolumunden \"{}\" kaydi silindi.".format(
            sec.get("heading", ""), (it.get("title") or "").strip()[:60])
        if not sec["items"]:
            msg += " Bolum artik bos."
        return cv, _yes(msg)

    if eylem == "bolum_adi":
        if not deger:
            return cv, _no("Yeni baslik bos kaldi.")
        if len(deger) > MAX_BASLIK:
            return cv, _no("Yeni baslik cok uzun ({} karakter, sinir {}).".format(
                len(deger), MAX_BASLIK))
        idx = find_sections(cv, hedef)
        if len(idx) != 1:
            return cv, _bolum_yok(cv, hedef, idx)
        eski = cv["sections"][idx[0]].get("heading", "")
        cv["sections"][idx[0]]["heading"] = deger
        return cv, _yes("Baslik degisti: {} -> {}".format(eski, deger))

    if eylem == "bolum_tasi":
        idx = find_sections(cv, hedef)
        if len(idx) != 1:
            return cv, _bolum_yok(cv, hedef, idx)
        i = idx[0]
        secs = cv["sections"]
        hedef_i = {"yukari": i - 1, "asagi": i + 1,
                   "en_uste": 0, "en_alta": len(secs) - 1}.get(deger.lower())
        if hedef_i is None:
            return cv, _no("Yon anlasilmadi: {}".format(deger))
        hedef_i = max(0, min(len(secs) - 1, hedef_i))
        if hedef_i == i:
            return cv, _no("{} zaten orada.".format(secs[i].get("heading", "")))
        sec = secs.pop(i)
        secs.insert(hedef_i, sec)
        return cv, _yes("{} bolumu {}. siraya alindi.".format(
            sec.get("heading", ""), hedef_i + 1))

    return cv, _no("Bilinmeyen eylem: {}".format(eylem))


# --- disk ve gecmis ---------------------------------------------------

def load():
    return json.loads(STRUCT.read_text(encoding="utf-8"))


def save(cv):
    STRUCT.write_text(json.dumps(cv, ensure_ascii=False, indent=2),
                      encoding="utf-8")


def _css_path():
    # OUT calisma aninda okunur; test gecici klasore yonlendirebilsin
    return OUT / "cv_overrides.css"


def load_css():
    """Tasarim komutlarinin biriktirdigi CSS. Yoksa bos dize."""
    p = _css_path()
    return p.read_text(encoding="utf-8") if p.exists() else ""


def save_css(css):
    """Bos CSS dosyayi siler; boylece render bit bit temel haline doner."""
    p = _css_path()
    css = (css or "").strip()
    if css:
        p.write_text(css + "\n", encoding="utf-8")
    elif p.exists():
        p.unlink()


def _numbers():
    if not HIST.exists():
        return []
    return sorted(int(p.stem) for p in HIST.glob("*.json") if p.stem.isdigit())


def snapshot(cv, note="", css=None):
    """Degisiklikten ONCE cagrilir. Icerik ve tasarim birlikte saklanir,
    boylece tek bir geri al dugmesi ikisini de kapsar."""
    HIST.mkdir(parents=True, exist_ok=True)
    if css is None:
        css = load_css()
    nums = _numbers()
    n = (nums[-1] + 1) if nums else 1
    (HIST / "{:04d}.json".format(n)).write_text(
        json.dumps({"note": note, "cv": cv, "css": css},
                   ensure_ascii=False, indent=2),
        encoding="utf-8")
    for old in nums[:-MAX_HIST]:
        (HIST / "{:04d}.json".format(old)).unlink(missing_ok=True)
    return n


def undo():
    """(cv, mesaj) dondurur. Geri alinacak yoksa cv None."""
    nums = _numbers()
    if not nums:
        return None, "Geri alinacak bir degisiklik yok."
    p = HIST / "{:04d}.json".format(nums[-1])
    snap = json.loads(p.read_text(encoding="utf-8"))
    save(snap["cv"])
    if "css" in snap:
        save_css(snap["css"])
    p.unlink()
    return snap["cv"], "Geri alindi: {}".format(
        snap.get("note") or "son degisiklik")


def depth():
    return len(_numbers())

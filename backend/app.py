"""CV Studio — yerel sunucu

Asama 6d-6: /command artik EYLEM LISTESI uygular. Icerik adimlari
commands.apply_all ile sirayla islenir, tasarim adimlari design.py'ye
gider, hepsi TEK snapshot'a girer; tek "geri al" ile hepsi doner.
Asama 6d-5b: /voice yonlendiricisi baglandi (voice.py).
Asama 6d-4a: /command cevabi modelin `thinking` metnini de dondurur.
  /command        icerik -> commands.py, tasarim -> design.py + cssguard
  /undo           son degisikligi geri alir (icerik ve CSS birlikte)
  /design/reset   cv_overrides.css'i siler
  /compare        hala sahte (6e)
  /voice          ses -> metin (voice.py), /voice/test tarayici olcum sayfasi

Calistirma (backend klasorunden):
    .\\.venv\\Scripts\\uvicorn.exe app:app --reload --port 8000
    http://127.0.0.1:8000
"""

import base64
import json
import os
import secrets
from pathlib import Path

from fastapi import FastAPI, File, Form, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel

import classify
import commands
import design
import llm
import render_cv
import pipeline
import session
from voice import router as voice_router

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output"
FRONT = ROOT / "frontend"

NO_CACHE = {"Cache-Control": "no-store"}
ACCESS_PASSWORD = os.environ.get("CV_STUDIO_ACCESS_PASSWORD", "")
# Web surumunun (GitHub Pages) bu makinedeki modele baglanabilmesi icin.
# Bos birakilirsa hicbir dis kaynak erisemez; virgulle birden fazla adres.
CORS_ORIGINS = [o.strip() for o in os.environ.get("CV_STUDIO_CORS", "").split(",") if o.strip()]

app = FastAPI(title="CV Studio")
if CORS_ORIGINS:
    app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS,
                       allow_methods=["*"], allow_headers=["*"])
app.include_router(voice_router)


@app.middleware("http")
async def access_control(request, call_next):
    """Canli ortamda uygulamayi parola ile korur; health Render icin aciktir."""
    if not ACCESS_PASSWORD or request.url.path == "/health":
        return await call_next(request)
    received = request.headers.get("authorization", "")
    expected = "Basic " + base64.b64encode(
        ("owner:" + ACCESS_PASSWORD).encode("utf-8")).decode("ascii")
    if not secrets.compare_digest(received, expected):
        return Response(status_code=401, headers={
            "WWW-Authenticate": 'Basic realm="CV Studio"',
            "Cache-Control": "no-store",
        })
    return await call_next(request)


class Command(BaseModel):
    text: str
    id: str = ""


class OturumSec(BaseModel):
    id: str


class OturumAd(BaseModel):
    id: str
    ad: str


def _hazirla(oid=""):
    """Her istekte oturumu yeniden bagla; reload sonrasi yol kaybolmaz."""
    try:
        return session.hazirla(oid)
    except ValueError:
        return ""


@app.on_event("startup")
def baslat():
    session.devral()
    session.hazirla()


# --- arayuz -----------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
def index():
    return HTMLResponse((FRONT / "index.html").read_text(encoding="utf-8"),
                        headers=NO_CACHE)


@app.get("/favicon.ico")
def favicon():
    return Response(status_code=204)


# --- onizleme ---------------------------------------------------------

@app.get("/render")
def do_render(id: str = ""):
    """cv_structured.json -> cv_generated.html. Olculen degerleri dondurur."""
    oid = _hazirla(id)
    if not oid:
        return {"ok": False,
                "error": "cv_structured.json bulunamadi. Once analyze_cv.py calistir."}
    try:
        info = render_cv.render()
    except FileNotFoundError:
        return {"ok": False,
                "error": "cv_structured.json bulunamadi. Once analyze_cv.py calistir."}
    except json.JSONDecodeError as e:
        return {"ok": False, "error": "cv_structured.json bozuk: {}".format(e)}

    info.pop("html")
    info["path"] = str(info["path"])
    info["ok"] = True
    info["id"] = oid
    return info


@app.get("/preview")
def preview(id: str = ""):
    """Diskteki cv_generated.html. compare_cv.py ile ayni dosya."""
    if not _hazirla(id):
        return HTMLResponse("<p>Onizleme yok. Once /render cagir.</p>",
                            status_code=404, headers=NO_CACHE)
    p = render_cv.HTML_OUT
    if not p.exists():
        return HTMLResponse("<p>Onizleme yok. Once /render cagir.</p>",
                            status_code=404, headers=NO_CACHE)
    return FileResponse(p, media_type="text/html", headers=NO_CACHE)


@app.get("/state")
def state(id: str = ""):
    """Icerik ozeti: hangi bolumde kac kayit, kac adim geri alinabilir."""
    oid = _hazirla(id)
    if not oid or not commands.STRUCT.exists():
        return {"ok": False, "error": "cv_structured.json bulunamadi."}
    cv = commands.load()
    return {
        "ok": True,
        "name": cv.get("name", ""),
        "title": cv.get("title", ""),
        "sections": [{"heading": s.get("heading", ""),
                      "items": len(s.get("items", []))}
                     for s in cv.get("sections", [])],
        "depth": commands.depth(),
        "id": oid,
    }


# --- dosya ve oturumlar ----------------------------------------------

@app.post("/upload")
async def upload(dosya: UploadFile = File(...), ad: str = Form("")):
    """PDF/DOCX'i boyut kontrollu kaydeder, yeni bir oturumda isler."""
    ad_dosya = dosya.filename or ""
    uz = Path(ad_dosya).suffix.lower()
    if uz not in pipeline.desteklenen():
        return {"ok": False, "error": "Desteklenmeyen dosya turu: {}. Kabul edilen: {}"
                .format(uz or "(uzantisiz)", ", ".join(pipeline.desteklenen()))}
    icerik = await dosya.read()
    if not icerik:
        return {"ok": False, "error": "Dosya bos."}
    if len(icerik) > pipeline.MAX_MB * 1024 * 1024:
        return {"ok": False, "error": "Dosya boyutu {} MB sinirini asiyor."
                .format(pipeline.MAX_MB)}
    hedef = pipeline.benzersiz(ad_dosya)
    hedef.parent.mkdir(parents=True, exist_ok=True)
    hedef.write_bytes(icerik)
    try:
        return pipeline.calistir(hedef, ad=ad.strip(), kopyala=False)
    except (ValueError, FileNotFoundError) as e:
        return {"ok": False, "error": str(e)}
    except llm.LLMError as e:
        return {"ok": False, "error": "Model cevap vermedi. {}".format(e)}


@app.get("/oturum")
def oturum_liste():
    return {"ok": True, "aktif": session.aktif(), "oturumlar": session.liste()}


@app.post("/oturum/sec")
def oturum_sec(istek: OturumSec):
    try:
        oid = session.sec(istek.id)
    except ValueError as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True, "id": oid, "oturum": session.ozet(oid)}


@app.post("/oturum/sil")
def oturum_sil(istek: OturumSec):
    try:
        silindi = session.sil(istek.id)
    except ValueError as e:
        silindi = False
    if silindi:
        session.hazirla()
    return {"ok": silindi, "aktif": session.aktif()}


@app.post("/oturum/ad")
def oturum_ad(istek: OturumAd):
    if not session.var(istek.id):
        return {"ok": False, "error": "Oturum yok: {!r}".format(istek.id)}
    return {"ok": True, "oturum": session.ad_ver(istek.id, istek.ad)}


class OturumYeni(BaseModel):
    ad: str = ""
    kaynak: str = ""


@app.post("/oturum/yeni")
def oturum_yeni(istek: OturumYeni):
    try:
        oid = session.yeni(ad=istek.ad.strip() or "", kaynak=istek.kaynak.strip() or "")
        session.sec(oid)
        return {"ok": True, "id": oid, "oturum": session.ozet(oid)}
    except ValueError as e:
        return {"ok": False, "error": str(e)}


@app.post("/oturum/batch-sil")
def oturum_batch_sil(istek: dict):
    ids = istek.get("ids", [])
    if not isinstance(ids, list):
        return {"ok": False, "error": "ids bir liste olmalıdır"}

    for oid in ids:
        if session.var(oid):
            session.sil(oid)

    session.hazirla()
    return {"ok": True, "aktif": session.aktif(), "oturumlar": session.liste()}


# --- komutlar ---------------------------------------------------------

def _tasarim_adimlari(text, adimlar, mevcut_css):
    """Tasarim adimlarini sirayla isler. (css, mesajlar, uygulanan, sure)."""
    css = mevcut_css
    mesajlar = []
    uygulanan = 0
    sure = 0.0
    info = None

    for a in adimlar:
        if a.get("eylem") == "tasarim_sifirla":
            if css.strip():
                css = ""
                uygulanan += 1
                mesajlar.append("Tasarim sifirlandi, sayfa olculen haline dondu.")
            else:
                mesajlar.append("Zaten hicbir tasarim degisikligi yok.")
            continue

        if info is None:
            info = render_cv.render()
        r, diag = design.design(text, ctx=design.context(info, css))
        sure += diag.get("sure", 0) or 0

        if not r["css"]:
            mesajlar.append("Uygulanabilir CSS cikmadi. {}".format(
                "; ".join(r["atilan"][:3]) or r["ozet"]))
            continue

        css = (css.rstrip() + "\n" + r["css"]).strip() if css.strip() else r["css"]
        uygulanan += 1
        mesaj = r["ozet"] or "Tasarim guncellendi."
        if r["atilan"]:
            mesaj += " Atilan: {}.".format("; ".join(r["atilan"][:3]))
        mesajlar.append(mesaj)

    return css, mesajlar, uygulanan, sure


@app.post("/command")
def command(cmd: Command, id: str = ""):
    """Model anlar, Python uygular. Model CV'ye metin yazmaz."""
    oid = cmd.id or id
    if not _hazirla(oid):
        return {"ok": False, "error": "cv_structured.json bulunamadi."}
    text = cmd.text.strip()
    if not text:
        return {"ok": False, "error": "Komut bos."}

    try:
        cv = commands.load()
    except FileNotFoundError:
        return {"ok": False, "error": "cv_structured.json bulunamadi."}
    except json.JSONDecodeError as e:
        return {"ok": False, "error": "cv_structured.json bozuk: {}".format(e)}

    try:
        act, diag = classify.classify(text, cv)
    except llm.LLMError as e:
        return {"ok": False, "error": "Model cevap vermedi. {}".format(e)}

    adimlar = act.get("adimlar") or [act]
    mevcut_css = commands.load_css()

    yeni_cv, sonuc = commands.apply_all(cv, adimlar)

    try:
        css, tasarim_mesaj, tasarim_uygulanan, tasarim_sure = _tasarim_adimlari(
            text, sonuc["tasarim"], mevcut_css)
    except llm.LLMError as e:
        return {"ok": False, "error": "Model cevap vermedi. {}".format(e)}

    mesajlar = ([sonuc["message"]] if sonuc["sonuclar"] else []) + tasarim_mesaj
    mesaj = "  ".join(m for m in mesajlar if m) or "Komutu anlayamadim."

    if sonuc["applied"] or tasarim_uygulanan:
        commands.snapshot(cv, note=mesaj[:200], css=mevcut_css)   # TEK snapshot
        if sonuc["applied"]:
            commands.save(yeni_cv)
        if css != mevcut_css:
            commands.save_css(css)

    guvenler = [a.get("guven", 0) for a in adimlar if isinstance(a, dict)]
    n = len(adimlar)

    return {
        "ok": True,
        "applied": bool(sonuc["applied"] or tasarim_uygulanan),
        "message": mesaj,
        "eylem": adimlar[0].get("eylem", "belirsiz") if n == 1
                 else "{} adim".format(n),
        "adimlar": [a.get("eylem", "belirsiz") for a in adimlar],
        "sonuclar": sonuc["sonuclar"],
        "guven": round(min(guvenler), 2) if guvenler else 0.0,
        "sure": round((diag.get("sure", 0) or 0) + tasarim_sure, 1),
        "thinking": diag.get("thinking", ""),
        "depth": commands.depth(),
        "css": css if css != mevcut_css else "",
        "id": session.baglanan(),
    }


@app.post("/design/reset")
def design_reset(id: str = ""):
    if not _hazirla(id):
        return {"ok": False, "error": "cv_structured.json bulunamadi."}
    if not commands.load_css().strip():
        return {"ok": True, "applied": False,
                "message": "Zaten hicbir tasarim degisikligi yok.",
                "depth": commands.depth()}
    commands.snapshot(commands.load(), note="tasarim sifirlandi")
    commands.save_css("")
    return {"ok": True, "applied": True,
            "message": "Tasarim sifirlandi, sayfa olculen haline dondu.",
            "depth": commands.depth()}


@app.post("/undo")
def undo(id: str = ""):
    if not _hazirla(id):
        return {"ok": False, "applied": False,
                "message": "Geri alinacak degisiklik yok.", "depth": 0}
    cv, mesaj = commands.undo()
    return {"ok": True, "applied": cv is not None, "message": mesaj,
            "depth": commands.depth()}


@app.post("/compare")
def compare():
    # 6e: compare_cv.py + diff_cv.py, mm tablosu ve overlay.png
    return {"ok": False,
            "message": "Karsilastirma Asama 6e'de baglanacak."}


@app.get("/health")
def health():
    kurulu = llm.available()
    oid = _hazirla()
    return {
        "ok": True,
        "struct": bool(oid and commands.STRUCT.exists()),
        "front": FRONT.exists(),
        "ollama": bool(kurulu),
        "model": llm.MODEL,
        "model_kurulu": llm.MODEL in kurulu,
        "gecmis": commands.depth() if oid else 0,
        "overrides": bool(oid and commands.load_css().strip()),
        "voice": True,
        "oturum": len(session.liste()),
        "aktif": oid,
    }

"""CV Studio — yerel sunucu

Asama 6d-2: icerik ve tasarim komutlari bagli.
  /command        icerik -> commands.py, tasarim -> design.py + cssguard
  /undo           son degisikligi geri alir (icerik ve CSS birlikte)
  /design/reset   cv_overrides.css'i siler
  /compare        hala sahte (6e)

Calistirma (backend klasorunden):
    .\\.venv\\Scripts\\uvicorn.exe app:app --reload --port 8000
    http://127.0.0.1:8000
"""

import json
from pathlib import Path

from fastapi import FastAPI, Response
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel

import classify
import commands
import design
import llm
import render_cv

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output"
FRONT = ROOT / "frontend"
STRUCT = OUT / "cv_structured.json"

NO_CACHE = {"Cache-Control": "no-store"}

app = FastAPI(title="CV Studio")


class Command(BaseModel):
    text: str


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
def do_render():
    """cv_structured.json -> cv_generated.html. Olculen degerleri dondurur."""
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
    return info


@app.get("/preview")
def preview():
    """Diskteki cv_generated.html. compare_cv.py ile ayni dosya."""
    p = OUT / "cv_generated.html"
    if not p.exists():
        return HTMLResponse("<p>Onizleme yok. Once /render cagir.</p>",
                            status_code=404, headers=NO_CACHE)
    return FileResponse(p, media_type="text/html", headers=NO_CACHE)


@app.get("/state")
def state():
    """Icerik ozeti: hangi bolumde kac kayit, kac adim geri alinabilir."""
    if not STRUCT.exists():
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
    }


# --- komutlar ---------------------------------------------------------

@app.post("/command")
def command(cmd: Command):
    """Model anlar, Python uygular. Model CV'ye metin yazmaz."""
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

    if act["eylem"] == "tasarim_sifirla":
        return design_reset()

    if act["eylem"] == "tasarim":
        return _tasarim(text, cv)

    yeni, sonuc = commands.apply(cv, act)

    if sonuc["applied"]:
        commands.snapshot(cv, note=sonuc["message"])   # ONCEKI hali sakla
        commands.save(yeni)

    return {
        "ok": True,
        "applied": sonuc["applied"],
        "message": sonuc["message"],
        "eylem": act["eylem"],
        "guven": act["guven"],
        "sure": diag["sure"],
        "depth": commands.depth(),
    }


def _tasarim(text, cv):
    """Model CSS yazar, cssguard suzer, override katmanina eklenir."""
    info = render_cv.render()
    mevcut = commands.load_css()
    try:
        r, diag = design.design(text, ctx=design.context(info, mevcut))
    except llm.LLMError as e:
        return {"ok": False, "error": "Model cevap vermedi. {}".format(e)}

    if not r["css"]:
        return {"ok": True, "applied": False, "eylem": "tasarim",
                "guven": 1.0, "sure": diag["sure"], "depth": commands.depth(),
                "message": "Uygulanabilir CSS cikmadi. {}".format(
                    "; ".join(r["atilan"][:3]) or r["ozet"])}

    commands.snapshot(cv, note=r["ozet"] or "tasarim degisikligi", css=mevcut)
    commands.save_css((mevcut.rstrip() + "\n" + r["css"]).strip()
                      if mevcut.strip() else r["css"])

    mesaj = r["ozet"] or "Tasarim guncellendi."
    if r["atilan"]:
        mesaj += " Atilan: {}.".format("; ".join(r["atilan"][:3]))
    return {"ok": True, "applied": True, "eylem": "tasarim",
            "guven": 1.0, "sure": diag["sure"], "depth": commands.depth(),
            "message": mesaj, "css": r["css"]}


@app.post("/design/reset")
def design_reset():
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
def undo():
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
    return {
        "ok": True,
        "struct": STRUCT.exists(),
        "front": FRONT.exists(),
        "ollama": bool(kurulu),
        "model": llm.MODEL,
        "model_kurulu": llm.MODEL in kurulu,
        "gecmis": commands.depth(),
        "overrides": bool(commands.load_css().strip()),
    }

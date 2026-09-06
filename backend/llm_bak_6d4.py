"""Ollama istemcisi — kucuk ve kati JSON isleri icin.

Bu projede model yalnizca ANLAMA yapar. Icerik metni asla modelden gelmez.

Devir notu 1. tuzak: Ollama bazi modellerde dusunmeyi kapatma parametresini
yok sayar; butun butceyi dusunmeye harcar ve `content` bos doner. Bu modul
o durumu tespit eder, `thinking` alanindan JSON kurtarmayi dener ve her
cagride teshis bilgisi dondurur. Sessizce basarisiz olmaz.
"""

import json
import time

import httpx

MODEL = "qwen3.8:27b"
HOST = "http://localhost:11434"
TIMEOUT = 180


class LLMError(RuntimeError):
    pass


def available():
    """Ollama'da kurulu model adlari. Ollama kapaliysa bos liste."""
    try:
        r = httpx.get(HOST + "/api/tags", timeout=10)
        return [m.get("name", "") for m in r.json().get("models", [])]
    except Exception:
        return []


def _first_json(text):
    """Metnin icindeki ilk gecerli JSON nesnesini cikar."""
    if not text:
        return None
    dec = json.JSONDecoder()
    for i, ch in enumerate(text):
        if ch == "{":
            try:
                obj, _ = dec.raw_decode(text[i:])
                if isinstance(obj, dict):
                    return obj
            except json.JSONDecodeError:
                continue
    return None


def _post(payload):
    try:
        return httpx.post(HOST + "/api/chat", json=payload, timeout=TIMEOUT)
    except httpx.HTTPError as e:
        raise LLMError("Ollama'ya ulasilamadi: {}".format(e))


def ask_json(system, user, model=MODEL, num_ctx=8192):
    """Modelden JSON ister. (veri, teshis) dondurur.

    Teshis her zaman doludur: sure, done_reason, content ve thinking
    uzunluklari, kurtarma yapilip yapilmadigi.
    """
    payload = {
        "model": model,
        "format": "json",
        "stream": False,
        "think": "low",                   # qwen3.8: dusunmeyi kis
        "options": {
            "temperature": 0,
            "num_ctx": num_ctx,
            "reasoning_effort": "low",
        },
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }

    t0 = time.time()
    r = _post(payload)

    # bazi surumler "think" degerini kabul etmez; bir kez sadesiyle dene
    if r.status_code >= 400 and "think" in r.text.lower():
        payload.pop("think", None)
        r = _post(payload)
        retried = True
    else:
        retried = False

    if r.status_code != 200:
        raise LLMError("Ollama {}: {}".format(r.status_code, r.text[:300]))

    body = r.json()
    msg = body.get("message") or {}
    content = (msg.get("content") or "").strip()
    thinking = (msg.get("thinking") or "").strip()

    diag = {
        "model": model,
        "sure": round(time.time() - t0, 1),
        "done_reason": body.get("done_reason"),
        "content_uz": len(content),
        "thinking_uz": len(thinking),
        "think_dusuruldu": retried,
        "kurtarma": False,
    }

    data = _first_json(content)
    if data is None and thinking:
        data = _first_json(thinking)
        diag["kurtarma"] = data is not None

    if data is None:
        raise LLMError("JSON alinamadi. Teshis: {}".format(
            json.dumps(diag, ensure_ascii=False)))

    return data, diag

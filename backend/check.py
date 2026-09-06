import sys, pymupdf, httpx

print("Python :", sys.version.split()[0])
print("PyMuPDF:", pymupdf.__version__)

try:
    r = httpx.post(
        "http://localhost:11434/v1/chat/completions",
        json={
            "model": "qwen3-vl:8b",
            "messages": [{"role": "user", "content": "Sadece HAZIR yaz."}],
            "stream": False,
        },
        timeout=180,
    )
    print("Ollama :", r.json()["choices"][0]["message"]["content"].strip())
except Exception as e:
    print("Ollama HATA:", e)
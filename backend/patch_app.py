# -*- coding: utf-8 -*-
"""app.py'ye tasarim_sifirla yonlendirmesini ekler. Bir kez calistirilir."""

import io
import shutil

P = "app.py"
ESKI = '    if act["eylem"] == "tasarim":'
YENI = ('    if act["eylem"] == "tasarim_sifirla":\n'
        '        return design_reset()\n'
        '\n'
        + ESKI)

s = io.open(P, encoding="utf-8").read()
print("once :", len(s))

if "tasarim_sifirla" in s:
    print("ZATEN YAMALI, dokunulmadi")
    raise SystemExit(0)

n = s.count(ESKI)
if n != 1:
    print("DURDU: kalip", n, "kez bulundu, 1 bekleniyordu")
    raise SystemExit(1)

shutil.copyfile(P, "app_bak_6d3.py")
s2 = s.replace(ESKI, YENI)
io.open(P, "w", encoding="utf-8", newline="").write(s2)
print("sonra:", len(s2))
print("fark :", len(s2) - len(s))

"""Tasarim komutlarini CSS'e cevirir.

Model yalnizca CSS yazar, HTML'e veya cv_structured.json'a dokunmaz.
Ciktisi cssguard'dan gecmeden hicbir yere yazilmaz.
"""

import cssguard
import llm

SYSTEM = """Sen bir CV sayfasinin gorunumunu duzenleyen CSS yazarisin.
Kullanicinin istegi icin gereken EN AZ sayida CSS kuralini yazarsin.

KULLANABILECEGIN SECICILER (baskasini yazma):
.page        sayfanin tamami, govde puntosu ve kenar boslugu burada
header       ust blok
h1           ad
.role        unvan satiri
.meta        iletisim satiri
h2           bolum basligi
.sdate       bolum basliginin yanindaki tarih
.item        kayit satiri
.sub         kaydin alt satiri
.date        kayit tarihi
.sep         ayrac isareti
b            kalin metin

KURALLAR:
- Metin YAZMA. `content` ozelligi kesinlikle yasak.
- `display` kullanma. Icerik gizlemek senin isin degil.
- Sadece gorunum degistir: renk, punto, kalinlik, bosluk, cizgi, sutun, hizalama.
- Istenmeyen hicbir seyi degistirme. Iki kural yetiyorsa ucuncuyu yazma.
- Bu bir CV. Okunakliligi bozacak sey onerme.
- Sana MEVCUT DEGERLER verilir. Yeni degeri ona gore hesapla, sifirdan tahmin
  etme. "biraz" dendiyse yaklasik %10-15 degistir, "cok" dendiyse %30.
- Birimleri sayfayla ayni tut: punto icin pt, bosluk icin mm.
- SADECE JSON dondur. Aciklama, markdown, kod blogu yazma.

SEMA:
{"css": "h2 { color: #1b365d; }", "ozet": "Bolum basliklari lacivert oldu"}

`ozet` tek cumle Turkce, ne degistigini soyler."""


def context(info, mevcut_css=""):
    """Modele verilecek mevcut durum. Kor tahmini onler."""
    satir = [
        "MEVCUT DEGERLER:",
        "  govde puntosu {}pt, bolum basligi {}pt, ad {}pt".format(
            info.get("body_pt"), info.get("head_pt"), info.get("name_pt")),
        "  metin rengi {}, ikincil renk {}".format(
            info.get("ink"), info.get("muted")),
        "  sayfa dolgusu ust {}mm, sol {}mm".format(
            info.get("pad_t"), info.get("pad_l")),
        "  kayit alt boslugu 2.0mm, bolum basligi ust boslugu 4mm",
        "  bolum basliginin altinda 1px cizgi var",
    ]
    if mevcut_css.strip():
        satir += ["", "ZATEN UYGULANMIS CSS (bunlari tekrar yazma, "
                      "gerekiyorsa uzerine yaz):", mevcut_css.strip()]
    return "\n".join(satir)


def design(text, ctx="", model=llm.MODEL):
    """(sonuc, teshis) dondurur.

    sonuc = {css, ham, ozet, atilan}
      css    : cssguard'dan gecmis, yazilmaya hazir CSS (bos olabilir)
      ham    : modelin yazdigi hali, karsilastirmak icin
      atilan : neyin neden atildigi
    """
    user = "{}\n\nIstek: {}".format(ctx, text.strip()) if ctx \
        else "Istek: " + text.strip()
    data, diag = llm.ask_json(SYSTEM, user, model=model)

    ham = str(data.get("css") or "")
    ozet = str(data.get("ozet") or "").strip()
    guvenli, atilan = cssguard.temizle(ham)

    return {"css": guvenli, "ham": ham, "ozet": ozet, "atilan": atilan}, diag

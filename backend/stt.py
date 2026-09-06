# -*- coding: utf-8 -*-
"""stt.py - konusma metni katmani (Asama 6d-5, v4)

- BAGLAMLAR : konuya gore initial_prompt + hotwords profilleri
- duzelt()  : terim onarimi, Turkce onarim, sembol donusumu, bolum adi buyutme

Kendi kendini test eder:  python stt.py
"""

import re

# ============================================================
# BAGLAM PROFILLERI
# ============================================================
# Her profil: prompt (initial_prompt) + hot (hotwords).
# Whisper prompt'u ~224 token ile sinirli, kisa tutuldu.

BAGLAMLAR = {

    "cv": {
        "ayar": {"vad": True, "onceki": False},
        "prompt": (
            "CV duzenleme sesli komutlari. Ornek: Bölüm başlıklarını lacivert "
            "yap ve puntoyu biraz büyüt. Kubernetes ve LangGraph maddelerini "
            "yukarı taşı. p99 gecikme satırını sil. Terimler: Kubernetes, "
            "Docker, Terraform, LangGraph, LangChain, PostgreSQL, Redis, Kafka, "
            "GraphQL, FastAPI, TypeScript, Node.js, React, AWS, Azure, CI/CD, "
            "DevOps, gRPC, GitHub, PyTorch, p99, p95, SLA, SRE."
        ),
        "hot": ("Kubernetes LangGraph LangChain PostgreSQL GraphQL FastAPI "
                "TypeScript Node.js Terraform Prometheus Grafana PyTorch "
                "DevOps MLOps gRPC OAuth JWT nginx Redis Kafka SKILLS PROJECTS "
                "EDUCATION CERTIFICATIONS LANGUAGES"),
    },

    "yazilim": {
        "ayar": {"vad": False, "onceki": True},
        "prompt": (
            "Yazılım terimleri sözlüğü okuması. İngilizce terim söylenir, "
            "ardından Türkçe karşılığı gelir. Örnek: Refactoring, yeniden "
            "düzenleme. Deployment, dağıtıma alma. Terimler İngilizce "
            "yazılışıyla yazılır: API, cache, framework, repository, commit, "
            "merge, pull request, deploy, endpoint, middleware, container."
        ),
        "hot": ("API cache framework repository commit merge deploy endpoint "
                "middleware container refactoring deployment backend frontend "
                "boolean compiler debugging encryption firewall hardware "
                "software runtime scalability throughput latency migration "
                "authentication authorization"),
    },

    "karisik": {
        "ayar": {"vad": False, "onceki": True},
        "prompt": (
            "Türkçe ve İngilizce karışık konuşma. Her iki dildeki cümleler de "
            "yazılır, hiçbiri atlanmaz ve çevrilmez. Örnek: The first ninety "
            "percent of the code accounts for the first ninety percent of the "
            "development time. Kodun ilk %90'ı, geliştirme süresinin ilk "
            "%90'ını oluşturur."
        ),
        "hot": ("percent equals accounts development debugging refactoring "
                "deployment repository"),
    },

    "osmanlica": {
        "ayar": {"vad": False, "onceki": True},
        "prompt": (
            "Osmanlıca ağırlıklı eski Türkçe metin okuması. Kelimeler asıllarına "
            "uygun yazılır: hakaik, rüsuh, kemalât, füruat, saadet-i dâreyn, "
            "irşad, kavanin-i amika, ahkâm-ı âdilane, nev'-i beşer, müvazenet, "
            "terakki, kefil-i mutlak, üstad-ı küll, salavat, bînihaye, "
            "Server-i Kâinat, Fahr-i Âlem, enva', ecnas, risalet, şehadet, "
            "mu'cize, delalet, hazine-i gayb, tahiyyat, Hâkim-i Ezel, "
            "şeriat-ı garra, sırat-ı müstakim, hakkaniyet, tasdik, izhar."
        ),
        "hot": ("hakaik rüsuh kemalât füruat dâreyn irşad kavanin ahkâm "
                "âdilane nev'-i beşer müvazenet terakki kefil üstad salavat "
                "bînihaye Kâinat Fahr-i Âlem enva' ecnas risalet şehadet "
                "mu'cize delalet gayb tahiyyat Hâkim-i Ezel Lemyezel serfiraz "
                "şeriat-ı garra sırat-ı müstakim dest be-dest hakkaniyet "
                "tasdik izhar intişar"),
    },

    "genel": {
        "ayar": {"vad": True, "onceki": False},
        "prompt": "",
        "hot": "",
    },
}

VARSAYILAN_BAGLAM = "cv"
INITIAL_PROMPT = BAGLAMLAR["cv"]["prompt"]   # geriye donuk uyumluluk


def baglam_al(ad):
    """(initial_prompt, hotwords, ayar) doner. Bilinmeyen ad varsayilana duser."""
    b = BAGLAMLAR.get(ad or VARSAYILAN_BAGLAM, BAGLAMLAR[VARSAYILAN_BAGLAM])
    return b["prompt"] or None, b["hot"] or None, dict(b["ayar"])


# ============================================================
# SAYI SOZCUKLERI -> RAKAM
# ============================================================

_BIR = {"sıfır": 0, "bir": 1, "iki": 2, "üç": 3, "dört": 4, "beş": 5,
        "altı": 6, "yedi": 7, "sekiz": 8, "dokuz": 9}
_ON = {"on": 10, "yirmi": 20, "otuz": 30, "kırk": 40, "elli": 50,
       "altmış": 60, "yetmiş": 70, "seksen": 80, "doksan": 90}
_EN = {"zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
       "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
       "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60,
       "seventy": 70, "eighty": 80, "ninety": 90, "hundred": 100}


def _tr_sayi(kelimeler):
    toplam, parca, bin_gordu, var = 0, 0, False, False
    for k in kelimeler:
        k = k.lower()
        if k in _BIR:
            parca += _BIR[k]
        elif k in _ON:
            parca += _ON[k]
        elif k in ("yüz", "yuz"):
            parca = (parca or 1) * 100
        elif k == "bin":
            if bin_gordu:
                return None
            toplam += (parca or 1) * 1000
            parca, bin_gordu = 0, True
        else:
            return None
        var = True
    return (toplam + parca) if var else None


def _en_sayi(kelimeler):
    toplam, var = 0, False
    for k in kelimeler:
        k = k.lower().strip("-")
        if k in _EN:
            toplam = toplam * 100 if k == "hundred" else toplam + _EN[k]
            var = True
        else:
            return None
    return toplam if var else None


def _yuzde_yaz(m):
    kalan = m.group(1).strip()
    ek = m.group(2) or ""
    if re.fullmatch(r"\d+", kalan):
        sayi = kalan
    else:
        s = _tr_sayi(kalan.split())
        if s is None:
            return m.group(0)
        sayi = str(s)
    return "%" + sayi + ("'" + ek if ek else "")


def _percent_yaz(m):
    kalan = m.group(1).strip()
    if re.fullmatch(r"\d+", kalan):
        return "%" + kalan
    s = _en_sayi(kalan.split())
    return ("%%%d" % s) if s is not None else m.group(0)


# ============================================================
# SEMBOL DONUSUMU (orijinal metinde sembol var, sembol yaziyoruz)
# ============================================================

_TR_KELIME = "|".join(sorted(list(_BIR) + list(_ON) + ["yüz", "yuz", "bin"],
                             key=len, reverse=True))
_EN_KELIME = "|".join(sorted(_EN, key=len, reverse=True))
_TR_SAYI = r"(?:\d+|(?:%s)(?:\s+(?:%s))*)" % (_TR_KELIME, _TR_KELIME)
_EN_SAYI = r"(?:\d+|(?:%s)(?:[\s-]+(?:%s))*)" % (_EN_KELIME, _EN_KELIME)

SEMBOLLER = [
    (r"\byüzde\s+(" + _TR_SAYI + r")(?-i:([a-zçğıöşü]*))\b", _yuzde_yaz),
    (r"\b(" + _EN_SAYI + r")\s+per\s*cents?\b", _percent_yaz),
    (r"\b(\d+)\s+per\s+second\s+of\b", r"%\1 of"),
    (r"\beşittir\b", "="),
    (r"\bes[ıi]ttir\b", "="),
    (r"\bis\s+equal\s+to\b", "="),
    (r"\bequals\b", "="),
    (r"(\d)\s+artı\s+(\d)", r"\1 + \2"),
    (r"(\d)\s+eksi\s+(\d)", r"\1 - \2"),
    (r"(\d)\s+plus\s+(\d)", r"\1 + \2"),
    (r"(\d)\s+minus\s+(\d)", r"\1 - \2"),
    # sesli okunan noktalama
    (r"\s*,?\s*\bslash\b\s*,?\s*", "/"),
    (r"\s*,?\s*\bback\s*slash\b\s*,?\s*", lambda m: chr(92)),
    (r"\s*\bvirgül\b\s*", ", "),
    (r"\s*\bcomma\b\s*", ", "),
    (r"\s*\bparantez\s+aç\w*\s*", " ("),
    (r"\s*\bparantez\s+kapa\w*\s*", ") "),
    (r"\s*\bopen\s+paren(?:thesis)?\b\s*", " ("),
    (r"\s*\bclose\s+paren(?:thesis)?\b\s*", ") "),
    (r"\s*\bsoru\s+işareti\b\s*", "? "),
    (r"\s*\bünlem\b\s*", "! "),
    (r"\s+([,.)!?])", r"\1"),
    (r"\(\s+", "("),
    (r"\s{2,}", " "),
]

# ============================================================
# TURKCE ONARIM
# ============================================================

TR_DUZELTMELER = [
    (r"\b[oö]l[uü]m(\s+ba[sş]l[iı]k)", r"Bölüm\1"),
    (r"\bg[oö]l[uü]m(\s+ba[sş]l[iı]k)", r"Bölüm\1"),
    (r"\bbol[uü]m(\s+ba[sş]l[iı]k)", r"Bölüm\1"),
    (r"\bpunto\s*['’]\s*yu\b", "puntoyu"),
    (r"\bpunto\s*['’]\s*nun\b", "puntonun"),
    (r"\bsatır\s*['’]\s*ını\b", "satırını"),
    (r"\bker(\s+marj)", r"kâr\1"),
    (r"\bkar(\s+marj)", r"kâr\1"),
]

BOLUM_ADLARI = [
    r"work\s+experience", r"skills", r"projects", r"certifications",
    r"education", r"languages", r"summary", r"profile",
]

# ============================================================
# TERIM ONARIMI
# ============================================================

DUZELTMELER = [
    (r"[ckq][uü]bernat[ei]s", "Kubernetes"),
    (r"[ck][uü]bernetis", "Kubernetes"),
    (r"[ck][uü]ber\s*ne(?:yse|tis|tes|ytis)", "Kubernetes"),
    (r"[ck]ubernetes", "Kubernetes"),
    (r"lan[gk]?\s*g?[iı]?ra[bfp]h?", "LangGraph"),
    (r"len[gk]?\s*g?ra[bf]", "LangGraph"),
    (r"lan[gk]\s*[cç]h?e[yi]n", "LangChain"),
    (r"langchain", "LangChain"),
    (r"do[ck]ker", "Docker"),
    (r"doker", "Docker"),
    (r"ter*aform", "Terraform"),
    (r"postgre(?:sql|skuel|s)?", "PostgreSQL"),
    (r"gra[fp]\s*ku[ei]l", "GraphQL"),
    (r"graphql", "GraphQL"),
    (r"fast\s*api", "FastAPI"),
    (r"nod\s*c[ei]ye[sz]", "Node.js"),
    (r"node\s*j[sz]", "Node.js"),
    (r"ta[yi]p\s*s[ck]ript", "TypeScript"),
    (r"[cj]ava\s*s[ck]ript", "JavaScript"),
    (r"ci\s*ar\s*pi\s*si", "gRPC"),
    (r"grpc", "gRPC"),
    (r"git\s*h[au]b", "GitHub"),
    (r"pay\s*tor[cç]", "PyTorch"),
    (r"pytorch", "PyTorch"),
    (r"prometh?e(?:us|yus)", "Prometheus"),
    (r"ra[fv]+ana", "Grafana"),
    (r"gra[fv]+ana", "Grafana"),
    (r"grafanna", "Grafana"),
    (r"redis", "Redis"),
    (r"kafka", "Kafka"),
    (r"re[ai]ct", "React"),
    (r"a[yi]\s*d[au]blı?yu\s*es", "AWS"),
    (r"aws", "AWS"),
    (r"azure", "Azure"),
    (r"dev\s*ops", "DevOps"),
    (r"ml\s*ops", "MLOps"),
    (r"s[iı]\s*a[yi]\s*[-–/]?\s*s[iı]\s*d[iı]", "CI/CD"),
    (r"ci\s*[-–/]\s*cd", "CI/CD"),
    (r"ci\s*cd", "CI/CD"),
    (r"p[iı]?\s*doksan\s*dokuz", "p99"),
    (r"p\s*99", "p99"),
    (r"p[iı]?\s*doksan\s*be[sş]", "p95"),
    (r"p\s*95", "p95"),
]

# ============================================================
# OSMANLICA ONARIM (yalnizca baglam="osmanlica" iken)
# ============================================================

OSMANLICA = [
    (r"\bh[aâ]kim\s+ezel[iî]?\b", "Hâkim-i Ezel"),
    (r"\bhak[iî]m\s+ezel[iî]\b", "Hakîm-i Ezelî"),
    (r"\brahm[aâ]n[iî]?\s+lemyezel\s*(?:ye'?e|iye)?\b", "Rahman-ı Lemyezelî'ye"),
    (r"\bel[- ]h[aâ]il[aâ]kt[iı]r\b", "elyaktır"),
    (r"\bs[iı]r[aâ]t[- ]?[iı]\s+m[uü]stakim\b", "sırat-ı müstakime"),
    (r"\bkur'?an[- ][iı]\s+m[uû]'?ciz\b", "Kur'an-ı Mu'ciz"),
    (r"\bk[aâ]dere\s+ile\b", "Kaideleri ile"),
    (r"\bk[aâ]v[aâ]in[- ][iı]\s+am[iî]ka[yi]?[- ][iı]\s+ta?k[iı]ka[yi]?[- ][iı]\s+[iİ]lah[iî](?:yeyi)?\b",
     "kavanin-i amîka-i dakika-i İlahiyeyi"),
    (r"\bkeyfiyle\s+mutlak\b", "kefil-i mutlak"),
    (r"\bkefil\s+mutlak\b", "kefil-i mutlak"),
    (r"\b[uü]stad[iı]k\s+k[uü]ll?\b", "üstad-ı küll"),
    (r"\bb[iî]n[aâ]ye\b", "bînihaye"),
    (r"\ba[uû]l\s+selveri\s+k[aâ]inat\b", "ol Server-i Kâinat"),
    (r"\bselver[- ][iı]?\s*k[aâ]inat\b", "Server-i Kâinat"),
    (r"\bf[aâ]hri\s+[aâ]leme'?e\b", "Fahr-i Âlem'e"),
    (r"\becnasla\b", "ecnasıyla"),
    (r"\brisale\s+([sş]ehadet)\b", r"risaletine \1"),
    (r"\bgayb[aâ]n\b", "gaybdan"),
    (r"\bnevi\s+be[sş]erin\b", "nev'-i beşerin"),
    (r"\bahk[aâ]m\s+[aâ]dilanesiyle\b", "ahkâm-ı âdilanesiyle"),
    (r"\btahiliyat[- ][iı]\s+t[aâ]hiyyat\b", "tahiyyat"),
    (r"\bt[aâ]hliyat\b", "tahiyyat"),
    (r"\bt[aâ]hiyyat\b", "tahiyyat"),
    (r"\bhilkat[- ][iı]\s+[aâ]lemin\b", "hilkat-i âlemin"),
    (r"\bdest\s+dest\b", "dest be-dest"),
    (r"\br[uü]suh\b", "rüsuh"),
    (r"\bfuruat\b", "füruat"),
]

# ayni kelimenin ust uste 3+ tekrari -> tek
_TEKRAR = re.compile(r"\b(\w+)(?:[\s,]+\1\b){2,}", re.IGNORECASE | re.UNICODE)

_BAYRAK = re.IGNORECASE | re.UNICODE
_EK = r"(?-i:([a-z\u00e7\u011f\u0131\u00f6\u015f\u00fc]*))"
_TR = [(re.compile(p, _BAYRAK), d) for p, d in TR_DUZELTMELER]
_SEM = [(re.compile(p, _BAYRAK), d) for p, d in SEMBOLLER]
_BOLUM = [re.compile(r"\b(" + b + r")(?=['’]|\b)", _BAYRAK) for b in BOLUM_ADLARI]
_DERLI = [(re.compile(r"\b(?:" + p + r")" + _EK, _BAYRAK), d)
          for p, d in DUZELTMELER]
_OSM = [(re.compile(p, _BAYRAK), d) for p, d in OSMANLICA]


def duzelt(metin, baglam=None, semboller=True):
    """Metni onarir. (yeni_metin, degisiklik_sayisi) doner."""
    sayac = 0

    metin, n = _TEKRAR.subn(lambda m: m.group(1), metin)
    sayac += n

    if baglam == "osmanlica":
        for kalip, dogru in _OSM:
            metin, n = kalip.subn(dogru, metin)
            sayac += n
        metin = re.sub(r"\s{2,}", " ", metin).strip()
        return metin, sayac

    for kalip, dogru in _TR:
        metin, n = kalip.subn(dogru, metin)
        sayac += n

    if semboller:
        for kalip, dogru in _SEM:
            yeni, n = kalip.subn(dogru, metin)
            if yeni != metin:
                sayac += n
                metin = yeni

    for kalip in _BOLUM:
        def _buyut(m):
            nonlocal sayac
            if m.group(1) == m.group(1).upper():
                return m.group(1)
            sayac += 1
            return m.group(1).upper()
        metin = kalip.sub(_buyut, metin)

    for kalip, dogru in _DERLI:
        def _yer(m):
            nonlocal sayac
            if m.group(0) == dogru + m.group(1):
                return m.group(0)
            sayac += 1
            return dogru + m.group(1)
        metin = kalip.sub(_yer, metin)

    return metin, sayac


# ============================================================
# KENDI KENDINI TEST
# ============================================================

TESTLER = [
    ("Kubernetes ve Langrab maddelerini yukari tasi.",
     "Kubernetes ve LangGraph maddelerini yukari tasi."),
    ("Cubernates ve LangGraph maddelerini yukarı taşı.",
     "Kubernetes ve LangGraph maddelerini yukarı taşı."),
    ("Kuber neyse satirini sil.", "Kubernetes satirini sil."),
    ("Kubernetesleri koyu yap.", "Kubernetesleri koyu yap."),
    ("Lang cheyn projesini one al.", "LangChain projesini one al."),
    ("Doker ve teraform becerilerini ekle.",
     "Docker ve Terraform becerilerini ekle."),
    ("Fast api ve graf kuel eklensin.", "FastAPI ve GraphQL eklensin."),
    ("Nod ceyes ve tayp skript eklensin.", "Node.js ve TypeScript eklensin."),
    ("Git hab bagini kaldir.", "GitHub bagini kaldir."),
    ("Terraform, Prometheus, Raffana ve PyTorch maddelerini ekle.",
     "Terraform, Prometheus, Grafana ve PyTorch maddelerini ekle."),
    ("Ölüm başlıklarını lacivert yap.", "Bölüm başlıklarını lacivert yap."),
    ("Bölüm başlıklarını lacivert yap.", "Bölüm başlıklarını lacivert yap."),
    ("Ker marjı satırı hala yanlış.", "kâr marjı satırı hala yanlış."),
    ("Skills bölümünün en üstüne taşı.", "SKILLS bölümünün en üstüne taşı."),
    ("Projects bölümünü Education bölümünün üstüne taşı.",
     "PROJECTS bölümünü EDUCATION bölümünün üstüne taşı."),
    ("Work experience bölümünü yukarı al.",
     "WORK EXPERIENCE bölümünü yukarı al."),
    ("CI-CD sürecini DevOps başlığı altına al.",
     "CI/CD sürecini DevOps başlığı altına al."),
    ("Satır aralığını yüzde kırk azalt.", "Satır aralığını %40 azalt."),
    ("Kodun ilk yüzde doksanı geliştirme süresinin yüzde doksanını alır.",
     "Kodun ilk %90'ı geliştirme süresinin %90'ını alır."),
    ("Yüzde on beş indirim.", "%15 indirim."),
    ("286, slash, 287 komutlarına izin verilmemiş.",
     "286/287 komutlarına izin verilmemiş."),
    ("Hata ayıklamanın sanatı virgül programınıza ne yaptığınızı.",
     "Hata ayıklamanın sanatı, programınıza ne yaptığınızı."),
    ("assembler parantez aç komutu parantez kapağı bitti.",
     "assembler (komutu) bitti."),
    ("Satır aralığını yüzde 40 azalt.", "Satır aralığını %40 azalt."),
    ("The first ninety percent of the code.", "The first %90 of the code."),
    ("The first 90 per second of the development time.",
     "The first %90 of the development time."),
    ("SaaS eşittir yazılım olarak hizmet.", "SaaS = yazılım olarak hizmet."),
    ("Software as a Service equals hizmet.",
     "Software as a Service = hizmet."),
    ("Kubernetes, LangGraph, gRPC ve PostgreSQL becerilerini SKILLS bölümünün en üstüne taşı.",
     "Kubernetes, LangGraph, gRPC ve PostgreSQL becerilerini SKILLS bölümünün en üstüne taşı."),
    ("Node.js, TypeScript, JavaScript, React, AWS, Azure, MLOps, p95 satırlarını koyu yap.",
     "Node.js, TypeScript, JavaScript, React, AWS, Azure, MLOps, p95 satırlarını koyu yap."),
    ("Diller bölümünü sayfanın altına al.",
     "Diller bölümünü sayfanın altına al."),
    ("Şişli'deki müşavirliğe başvurduğumuzda öğrendik.",
     "Şişli'deki müşavirliğe başvurduğumuzda öğrendik."),
    ("p99 gecikme satırını sil.", "p99 gecikme satırını sil."),
]

if __name__ == "__main__":
    gecen = 0
    for giris, beklenen in TESTLER:
        cikan, _ = duzelt(giris)
        if cikan == beklenen:
            gecen += 1
        else:
            print("HATA")
            print("  giris   :", giris)
            print("  beklenen:", beklenen)
            print("  cikan   :", cikan)
    print("duzeltme testi: %d/%d" % (gecen, len(TESTLER)))
    print("kalip sayisi  : %d" % (len(TR_DUZELTMELER) + len(SEMBOLLER) +
                                  len(DUZELTMELER)))
    print("baglam sayisi : %d  (%s)" % (len(BAGLAMLAR), ", ".join(BAGLAMLAR)))
    for ad, b in BAGLAMLAR.items():
        print("  %-10s prompt %4d krkt | hot %4d krkt" %
              (ad, len(b["prompt"]), len(b["hot"])))

# 📋 Yapılacaklar — cv-studio Projesi

## Aşama 6d-7h: Gelişmiş Oturum Yönetimi (v0.2.0)

**Planlanan Tarih:** 2026-09-15  
**Sürüm Türü:** Minor — Kalite ve ileri özellikler

---

### 1. Seçim Durumu Kalıcılığı (Checkbox State Persistence)

- [ ] **Özellik:** Checkbox seçimleri modal kapandıktan sonra korunacak
- [ ] **Öncelik:** Yüksek
- [ ] **Uygulama:**
  - [ ] localStorage'a seçili oturum ID'lerini kaydet (`cv-studio:selected-sessions`)
  - [ ] Modal açılırken state'i yükle
  - [ ] Checkbox'ları kaydedilen state'e senkronize et
  - [ ] Başarılı batch işlemden sonra state'i temizle
  - [ ] localStorage kullanılamıyorsa fallback yap
- [ ] **Test:**
  - [ ] Manuel: Seç → modal kapat → aç → seçim kontrol et
  - [ ] Edge case: localStorage yoksa memory'de çalış
  - [ ] Edge case: Bozuk localStorage'ı handle et

---

### 2. Oturum Çoğaltma (Session Duplication / Copy)

- [ ] **Özellik:** Var olan oturumu yeni ID'yle klonla
- [ ] **Öncelik:** Yüksek
- [ ] **Backend:**
  - [ ] Endpoint: `POST /oturum/{id}/kopyala`
  - [ ] Kaynak oturumu valide et
  - [ ] Yeni oturum ID'si oluştur
  - [ ] Tüm dosyaları kaynaktan hedefe rekursif kopyala
  - [ ] Oturum adını güncelle: "{Orijinal} (Kopya)"
  - [ ] Dön: `{ok: true, id: newId, oturum: object}`
- [ ] **Frontend:**
  - [ ] Her oturum satırında "📋 Kopyala" butonu
  - [ ] Tooltip: "Bu oturumu kopyala"
  - [ ] Onay dialog'u
  - [ ] Kopyalama sırasında spinner göster
  - [ ] Başarıda listeyi yenile
- [ ] **Test:**
  - [ ] Kopya oturumun tüm dosyaları var
  - [ ] Orijinal oturum değişmemiş
  - [ ] Yeni ID benzersiz ve geçerli

---

### 3. Toplu Ad Değiştirme (Batch Rename)

- [ ] **Özellik:** Birden fazla oturumun adını atomik olarak değiştir
- [ ] **Öncelik:** Orta
- [ ] **Backend:**
  - [ ] Endpoint: `POST /oturum/batch-ad-degistir`
  - [ ] İstek: `{renames: [{id: string, newName: string}]}`
  - [ ] Tüm ID'leri valide et
  - [ ] Her oturum için meta.json güncelle
  - [ ] Dön: `{ok: true, oturumlar: array}`
  - [ ] Herhangi bir hata'da rollback yap (all-or-nothing)
- [ ] **Frontend:**
  - [ ] "Rename" butonu sadece seçili oturumlar varken görün
  - [ ] Modal: Oturum Adı | Yeni Ad (input)
  - [ ] Satır içi editing
  - [ ] Değişiklikleri önizle
  - [ ] Toplu uygula

---

### 4. Oturum Yorumları / Notlar (Session Comments)

- [ ] **Özellik:** Oturumlara kalıcı notlar/açıklamalar ekle
- [ ] **Öncelik:** Orta
- [ ] **Backend:**
  - [ ] `notes` alanı session meta.json'a ekle (default: "")
  - [ ] GET /oturum/{id} → `notes` döndür
  - [ ] Endpoint: `PUT /oturum/{id}/notlar`
  - [ ] İstek: `{notlar: string}` (max 1000 karakter)
  - [ ] Son değiştirilme zamanını kaydeet
- [ ] **Frontend:**
  - [ ] Her oturum satırında "💬 Notlar" butonu
  - [ ] Tıkla → textarea modal'ı
  - [ ] Not önizlemesi listede göster (50 karakter)
  - [ ] Auto-save blur'da
  - [ ] Karakter sayacı: X / 1000

---

### 5. Oturumları Dışa Aktarma (Export Sessions)

- [ ] **Özellik:** Oturumları ZIP arşiv olarak indir
- [ ] **Öncelik:** Düşük
- [ ] **Backend:**
  - [ ] Endpoint: `POST /oturum/export`
  - [ ] İstek: `{ids: [string]}`
  - [ ] Geçici ZIP dosyası oluştur
  - [ ] Tüm oturum dosyaları + meta.json ekle
  - [ ] Standart ZIP format'ı kullan
  - [ ] Download link'i döndür
  - [ ] İndirmeden sonra temp dosyayı sil
- [ ] **Frontend:**
  - [ ] "📦 Export" butonu (seçili oturumlar varken)
  - [ ] Tıkla → POST /oturum/export
  - [ ] Download progress göster
  - [ ] Browser download'u tetikle

---

## Aşama 6d-7i: Web Sürümü Geliştirmeleri (v0.3.0)

**Planlanan Tarih:** 2026-09-22

### 1. Web Sürümü Güncellemeleri
- [ ] Web sürümüne checkbox'ları ekle
- [ ] Web'de oturum kopyalama
- [ ] Web'den ZIP export
- [ ] Sürümler arası senkronizasyon

### 2. Performans Optimizasyonları
- [ ] Lazy load oturum verileri
- [ ] Batch API pagination (50 session/istek)
- [ ] Oturum listesi cache (5 dakika TTL)
- [ ] Search input debounce

---

## Genel İyileştirmeler (Backlog)

### Hata Düzeltmeleri
- [ ] Checkbox event listener timing (düşük öncelik)
- [ ] Session listesi re-render optimizasyonu

### Kod Kalitesi
- [ ] JS fonksiyonlarına JSDoc yorumları ekle
- [ ] Session state yönetimini refactor et
- [ ] Modal işlemleri için error boundary ekle

### Dokümantasyon
- [ ] README.md'yi yeni özelliklerle güncelle
- [ ] API dokümantasyonu (OpenAPI/Swagger)
- [ ] Batch işlemleri kullanıcı kılavuzu

---

## Sürüm Zaman Çizelgesi

```
v0.1.0 ✅ (2026-09-12)  — Temel oturum işlemleri
v0.2.0 ⏳ (2026-09-15)  — Gelişmiş özellikler (5 feature)
v0.3.0 📅 (2026-09-22)  — Web senkronizasyonu + Performans
v1.0.0 🎯 (2026-10-01)  — Production sürümü (tests, docs, security)
v1.1.0+ 🚀 (Gelecek)     — Taglama, arşivleme, işbirliği
```

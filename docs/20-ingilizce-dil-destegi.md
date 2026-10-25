# 20 — İngilizce Dil Desteği (1.0.8)

> Durum: **devam ediyor**. Bu dosya işin planı ve ilerleme kaydıdır; her aşama bitince işaretlenir.
> Karar tarihi: 2026-10-25.

## Kararlar

| Konu | Karar |
|---|---|
| Diller | Türkçe (`tr`, varsayılan/kaynak) ve İngilizce (`en`) |
| Dil seçimi | İlk açılışta cihaz dili (Türkçe değilse İngilizce). Ayarlar'dan elle Sistem / Türkçe / English seçilebilir; tercih kalıcıdır |
| Kapsam | Uygulama arayüzü **ve** sunucu: bildirimler, AI içgörüleri, OCR uyarıları, yeni çalışma alanının varsayılan kategorileri, yasal metinler. İngilizce kullanıcı Türkçe metin görmez |
| Biçimler | Dile göre: İngilizcede `₺1,234.56` / `Oct 25, 2026`. Kaydın para birimi (ISO kodu) değişmez, yalnızca görünüm |
| Sürüm | 1.0.8 — yeni native modül (`expo-localization`) ve `CFBundleLocalizations` değişikliği nedeniyle build + inceleme |
| Mağaza adı | TR: `Vademde: Bütçe ve Borç Takibi`, EN: `Vademde: Budget & Debt Tracker` |

## Mimari

- **Kütüphane**: `i18next` + `react-i18next`, cihaz dili `expo-localization`.
- **Kaynak dosyalar**: `i18n/locales/tr/*.ts` (kaynak) ve `i18n/locales/en/*.ts`; namespace = özellik alanı.
  `en` dosyaları `tr` tipinden türetilir — eksik anahtar TypeScript hatasıdır.
- **React dışı kod** (`utils/alerts.ts`, servisler, PDF): `i18n.t(...)` doğrudan.
- **Biçimlendirme**: `tr-TR` sabitleri yerine `getLocaleTag()` (`'tr-TR' | 'en-US'`). Tutar girişi
  (`parseAmount`, `formatAmountInput`) dile göre ondalık ayıracı kullanır.
- **Sunucu**: `profiles.locale` (`'tr' | 'en'`, varsayılan `'tr'`). Uygulama dil değişince yazar.
  Edge Function'lar metinlerini bu alana göre seçer.
- **Kayıtlı veri çevrilmez**: Kullanıcının oluşturduğu/var olan kategori adları, cari adları vb. olduğu
  gibi kalır. Yalnızca dil İngilizceyken *oluşturulan* çalışma alanının varsayılan kategorileri İngilizce gelir.
- **Native metinler**: İzin metinleri (`NSCameraUsageDescription` vb.) `app.json` `locales` ile
  (`i18n/native/tr.json`, `en.json`). Widget (`targets/widget`) metinleri ayrıca ele alınır.

## Aşamalar

- [x] 1. Altyapı: paketler, `i18n/`, dil deposu, Ayarlar'da dil seçimi, `CFBundleLocalizations: ["tr","en"]`, native izin metinleri
- [x] 2. Biçimlendirme: `tr-TR` kullanımları, tutar girişi, tarih yardımcıları
- [x] 3. Ortak bileşenler (`components/` tamamı)
- [ ] 4. Ekranlar (`app/`) — büyük kısmı tamam, kalanlar aşağıda
- [ ] 5. Özellik katmanı (`features/`, `services/`, `utils/` kalanları)
- [ ] 6. Sunucu: `profiles.locale`, Edge Function metinleri, varsayılan kategori kataloğu, sunucu hata eşlemesi
- [ ] 7. Yasal metinler (gizlilik, kullanım koşulları) İngilizce
- [ ] 8. Widget metinleri (Swift)
- [ ] 9. Doğrulama: TR'de hiçbir metin değişmedi mi (regresyon), EN'de Türkçe kalan metin taraması, cihazda deneme
- [ ] 10. Mağaza: 1.0.8 sürüm (`app.json` hâlâ 1.0.7), TR/EN ad + alt başlık + anahtar kelimeler + açıklama,
      EN ekran görüntüleri, Plus Aylık ürün adındaki "Vamdemde" yazım hatası; build + inceleme

## İlerleme kaydı

- 2026-10-25 — Aşama 1-3 tamam. Sözlükte 1992 anahtar var; TR ve EN birebir eşleşiyor.
- Çevrilen ekranlar: giriş/kayıt/şifre sıfırlama, tanıtım, tüm sekmeler (ana sayfa, Tara, Takvim,
  Hareketler, Daha fazla), ayarlar/görünüm/widget/profil/abonelik/paywall, bildirimler, arama,
  çalışma alanları, hesaplar (tümü), bankalar, nakit uyarısı, kategoriler, aboneliklerim,
  çek/senet portföyü (`instruments`), akıllı öneriler + sor (`insights`), belge arşivi,
  hareket formu + detayı (`transactions`), cariler (liste/form/detay), raporlar,
  borç/alacak listesi (`obligations/index`) ve detayı (`obligations/[id]`).
- Çevrilen özellik dosyaları: `features/counterparties/api.ts` (tür etiketleri, ekstre satır metinleri),
  `features/instruments/api.ts` (durum etiketleri), `features/insights/api.ts` (öneri türleri),
  `features/obligations/documentTypes.ts`, `features/valueUnits/units.ts`, `features/counterparties/reminder.ts`,
  `features/auth/errors.ts`, `utils/alerts.ts`, `utils/money.ts`, `services/appLock.ts`.

## Devam (sıradaki oturum buradan başlar)

**Kalan ekranlar** (büyükten küçüğe, `python scripts/i18n/extract.py <dosya>` ile metin listesi çıkar):

1. `app/obligations/new.tsx` — metinler çıkarıldı, henüz düzenlenmedi. Dikkat: `periodLabels.unit` ile kurulan
   Türkçe ekli cümleler ("{n} taksit ödendi olarak kaydedilecek", "Her ay tutarı", "… taksite bölünür"),
   faiz yer tutucusu `"2,5"` (→ `2${getInputDecimalSeparator()}5`), kayda yazılan notlar
   ("Geçmiş vade, … ödendi işaretlendi") ve hareket açıklamaları ("Nakit avans — …", "Ödünç verildi — …").
   Tamamen büyük harf satırlar (`NAKİT NEREYE YATIRILDI? (İSTEĞE BAĞLI)`, `TAKSİT PLANI`, `PLANI UZAT` …)
   ve `toLocaleUpperCase('tr-TR')` / `toLocaleLowerCase('tr-TR')` → `upperUi` / `lowerUi`.
   `obligations.list.*` ve `obligations.detail.*` anahtarlarının bir kısmı yeniden kullanılabilir.
2. `app/payments/new.tsx` (1174 satır)
3. `app/documents/[id]/review.tsx` (1687 satır) — OCR onay ekranı; OCR alan adları ve güven etiketleri
4. `app/documents/[id]/receipt.tsx` (696 satır)
5. `app/legal/privacy-policy.tsx`, `app/legal/terms-of-service.tsx` — İngilizce metin ayrı yazılmalı (aşama 7)
6. Küçük artıklar: `app/(tabs)/takvim.tsx`, `app/settings/appearance.tsx`, `app/workspace/index.tsx` (birer eşleşme;
   kontrol et, yorum olabilir)

**Kalan katmanlar:** `utils/groupByDay` (bölüm başlıkları), `utils/reminderMessage.ts`, `utils/creditCardPeriod`,
`utils/cardDebt`, `utils/installmentPlan`, `utils/useExitGuard`, `features/categories/categoryIcons.ts` etiketleri,
banka adları, `features/obligations` ve `features/payments` api hata mesajları, `features/reports` PDF metinleri,
dışa aktarma CSV başlıkları, `services/` (notifications, calendarReminders, creditCardReminders, purchases,
appUpdate, pushToken). Sonra aşama 6 (sunucu) ve 8 (widget).

**Bilinen açıklar:** paywall `formatPrice` için `narrowSymbol` kullanılmadı (Hermes riski); sunucunun döndürdüğü
Türkçe iş kuralı hataları `friendlyErrorMessage` ile olduğu gibi geçiyor; `setup_initial_workspaces`
"Kişisel"/"İşletme" adlarını, "POS Komisyonu" kategorisini sunucuda Türkçe yazıyor.

**Araçlar (`scripts/i18n/`, depo kökünden çalıştır):**

- `extract.py <dosya>...` — kullanıcıya görünebilecek metinleri satır numarasıyla listeler.
- `scan_tr.py <yol>...` — Türkçe karakter içeren kalan metinleri tarar (yorumlar da çıkar, elle ele).
- `register_ns.py <ns>...` — yeni namespace'i `i18n/locales/{tr,en}/index.ts`'e alfabetik ekler.
- `i18nlib.py` — düzenleme betikleri için `edit(path, [(eski, yeni)], import_satırı)` ve
  `add(dil, ns, çapa, blok)`; her eşleşmenin tek olduğunu doğrular.
- `node scripts/i18n/i18n-runtime-test.cjs "$PWD"` — sözlükleri gerçek i18next ile çözer; anahtar/değişken
  eşitliğini ve çoğulları kontrol eder.
- Her adım sonunda: `npx tsc --noEmit` (tip sistemi EN sözlüğün TR ile aynı anahtarlara sahip olmasını zorlar).

**Kurallar (değişmez):** Türkçe metinler birebir korunur; modül seviyesinde `t()` yok (getter /
`localizedRecord` / `localizedList`); döngü değişkeni `t` adını almaz (`tx`, `option`…); sayı içeren
metinlerde `count` + `_one`/`_other`; yüzde için `formatPercent`; kullanıcı verisinin büyük/küçük harfi
`tr-TR` kalır, arayüz metinleri `upperUi`/`lowerUi`/`capitalizeUi`.

## Notlar

- Türkçe metinler **birebir korunur** — çeviri anahtarlarına taşırken metin değiştirilmez.
- Tutar ayrıştırma riski: İngilizcede `1,234` binliktir; Türkçe kuraldaki "yalnızca virgül = ondalık"
  varsayımı İngilizcede ters çalışır. `parseAmount` dile göre ayrıştırmalı ve OCR çıktısı (belgenin
  kendi dili Türkçe) ayrı ele alınmalıdır.

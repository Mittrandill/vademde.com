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
- **Biçimlendirme**: `tr-TR` sabitleri yerine `getLocaleTag()` (`'tr-TR' | 'en-US'`). Tutar gösterimi
  arayüz dilini, giriş (`parseAmount`, `formatAmountInput`) cihaz bölgesinin klavye ayıracını izler.
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
- [x] 4. Ekranlar (`app/`) — çeviri tamam; cihazda görsel kontrol bekliyor
- [x] 5. Özellik katmanının sabit kullanıcı metinleri (`features/`, `services/`, `utils/`)
- [x] 6. Sunucu kodu: profil dili, bildirim/AI, kategori kataloğu, sunucu hata eşlemesi — yerel doğrulandı; canlı migration/deploy bekliyor
- [x] 7. Yasal metinler (gizlilik, kullanım koşulları) İngilizce
- [x] 8. Widget metinleri (Swift) — kod ve JS aktarımı tamam; Xcode derlemesi/cihaz doğrulaması bekliyor
- [ ] 9. Doğrulama: TR'de hiçbir metin değişmedi mi (regresyon), EN'de Türkçe kalan metin taraması, cihazda deneme
- [ ] 10. Mağaza: sürüm `1.0.8` olarak ayarlandı; TR/EN ad + alt başlık + anahtar kelimeler + açıklama,
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
- 2026-10-25 — Devam oturumu: `app/obligations/new.tsx`, `app/payments/new.tsx`,
  `app/documents/[id]/review.tsx` ve `app/documents/[id]/receipt.tsx` sabit metinleri çevrildi.
  Taksit planı düzenleme/uzatma, geçmiş ödemeler, otomatik hareket açıklamaları, mahsup/ciro
  sonuçları, bağlantı kurtarma mesajları ve OCR kontrol alanları kapsandı. Yeni otomatik kredi
  kategorisi arayüz dilinde oluşturulur; mevcut `Kredi` / `Loan` kategorileri yeniden kullanılır.
  Kaydedilmiş kullanıcı verileri değiştirilmedi.
- Önceki oturum sözlüğü: **2409 anahtar**, TR/EN anahtar ve değişken eşitliği doğrulandı.
  `scripts/i18n/i18n-runtime-test.cjs` finans formlarının tekil/çoğul, ay/taksit,
  yüzde ve cihaz giriş ayıracı regresyonlarını da çalıştırır. Tip denetimi geçti.
  Genel finans testi yükleyicisi `i18n/` dizini ve native dil bağımlılığı için güncellendi;
  gerçek Türkçe sözlükle 81 finans, 11 kart borcu ve 10 kart vade kontrolü geçti.
  Cihazda görsel/etkileşimli doğrulama henüz yapılmadı.
- 2026-10-25 — Özellik/servis katmanının sabit kullanıcı metinleri tamamlandı:
  ödeme/mahsup/ciro ve kart ödeme kuyruklarının doğrulama hataları, ekstre satır türleri,
  kategori ikonları, takvim/hatırlatıcı dışa aktarımı, güncelleme uyarısı, yedek paylaşım başlığı,
  çalışma alanı/kur/okuma sınırı hataları ve PDF finans raporu.
- Hatırlatma cümleleri her çağrıda güncel dilde çözülür. Android bildirim kanalı adı dil değişince
  güncellenir. Dekont eşleşme gerekçeleri artık sabit kodlarla önbelleğe girer; eski önbelleğin
  Türkçe metinleri de desteklenir. Arşiv ve rapordaki dil içeren sorguların anahtarına dil eklendi.
- OCR: `process-document` şemasına ve prompt'una `warningsEn` eklendi. Türkçe uyarıların sırası
  ve içeriği korunur; uygulama çeviriyi çizim anında seçer. Deterministik tutar uyarıları iki dilde
  üretilir. Eski standart tutar uyarıları uygulamada çevrilir; eski serbest AI uyarıları ayrıntı
  kaybını önlemek için özgün metinde kalır. **Edge Function henüz deploy edilmedi.**
- Önceki oturum sözlüğü: **2745 anahtar**. `typecheck`, i18n anahtar/değişken eşitliği ve dil değişimi,
  eski önbellek, OCR uyarısı, hatırlatma cümlesi, PDF HTML/yüzde/kaçış ve sayfalama betiği
  kontrolleri geçti. OCR Edge Function için sözdizimi kontrolü yapıldı; Deno/canlı Gemini testi
  yapılmadı. 81 finans + 11 kart borcu + 10 kart vade testi geçti. Kart borcu test yükleyicisi de
  yeni i18n bağımlılığına uyarlandı. Cihazda görsel/etkileşimli doğrulama hâlâ bekliyor.
- 2026-10-25 — Sunucu dil desteğinin kodu hazır. Yeni migration:
  `supabase/migrations/20261025184930_add_server_locale_support.sql`.
  Mevcut profil dili alanı `tr`/`en` olarak sınırlandı; eski `tr-TR`/`en-US` değerleri normalize
  edilir. `services/profileLocale.ts` yazmaları sıraya koyar; eski dil ve eski kullanıcı
  isteklerini atlar. Root hook giriş/dil değişimi, depodan tercih yüklenmesi, bağlantı dönüşü
  ve uygulamaya dönüşte eşitler. Onboarding ve AI çağrıları dil eşitlemesini bekler.
- Yeni çalışma alanı seed'i sahibinin dilini kullanır. Türkçe katalog kaynak olarak korunur;
  İngilizce adlar iki argümanlı katalog fonksiyonundan gelir. Onboarding'in Kişisel/İşletme/
  Çalışma Alanı/Kasa varsayılanları da dile bağlıdır. Mevcut alan/kategori/hesap adları değişmez.
  OCR iki dildeki kategori adlarını eşleştirir; inceleme ekranı İngilizce banka ücreti
  kategorilerini de tanır. Yeni işletme kataloğunda `POS Commission` var.
- `send-reminders` ve `send-cash-alerts` aynı çalışma alanındaki alıcıların profil diline
  göre ayrı içerik üretir. `_shared/reminderMessages.ts` uygulama sözlüklerinin kopyasıdır;
  test, kopyaların birebir eşitliğini zorlar. Yeni metin eklerken iki tarafı birlikte güncelle.
- `ai-ask` dil/biçimleri profilinden alır. `generate-insights` kuralları ve model başarısızlığı
  şablonları iki dilli; model prompt'u yanıt dilini belirtir. `ai_insights.locale` ve dile göre
  sorgu/önbellek anahtarları eklendi; olgu tekrar anahtarları dil içerir. Eski Türkçe öneriler
  Türkçe sorgularında kalır; kullanıcı verileri çevrilmez.
- Migration dosyalarındaki plan önekleri dışındaki **143 SQL iş kuralı mesajı** sözlüğe alındı;
  değişkenleri korunur. TR mesajları birebir kalır; EN'de bilinen mesajlar çevrilir, tanınmayan
  Türkçe hata güvenli ekran fallback'ine düşer. Güncel sözlük: **2888 anahtar**.
- Doğrulama: app `typecheck`, beş Edge Function'ın Supabase JS tipleriyle TypeScript denetimi,
  iki dilli/alıcı bazlı push, AI dil ve deterministik fallback, üyelik engeli, OCR kategori
  eşleştirme, profil yazma sırası/oturum değişimi/hidrasyon, tüm hata eşlemeleri geçti.
  Migration izole **PGlite/Postgres** üzerinde çalıştırıldı: TR/EN katalog, eski verilerin
  korunması, profil RLS, geçersiz dil, onboarding ve plan sınırı kontrolleri geçti.
  81 finans + 11 kart borcu + 10 kart vade testi yeniden geçti.
  **Canlı veritabanına ve Edge Function'lara henüz uygulanmadı; gerçek Gemini/cihaz testi yok.**

- 2026-10-25 — Yasal metinlerin 26 bölümü TR/EN sözlüklere taşındı. Türkçe başlık/gövde
  metinlerinin özgün hâli `tests/fixtures/legal-tr-sha256.json` ile doğrulanır; İngilizce
  sürüm aynı bölüm sırasını, tarih, şirket ve iletişim bilgilerini korur. Web sitesindeki
  metinler değiştirilmedi. Ekranlar uygulama dilini izler.
- Widget'ın sekiz türünün başlıkları, açıklamaları, boş durumları, göreli gün ve tarihleri
  TR/EN oldu. Uygulama App Group'a dil tercihini ve snapshot dilini yazar. Dil değişiminde
  eski dilde biçimlenmiş snapshot temizlenir; gecikmiş eski dil yazmaları reddedilir.
  Eski snapshot'lar Türkçe kabul edilir; kullanıcı verileri ve tutar gizleme tercihi korunur.
  Widget Info.plist dosyasında TR/EN tanımlı. **Windows'ta Swift/WidgetKit derlenmedi.**
- Son taramada kartın sanal vade başlığı, çek/senet açıklaması ve Apple/Google giriş
  hata metinleri de sözlüğe taşındı. Kart vade başlığı dil değişiminde yeniden hesaplanır;
  hesap adı ve finansal değerler değişmez. Örnek belgelerdeki özel isimler korunur.
- Güncel sözlük: **2947 anahtar**, TR/EN birebir eşleşiyor. Yasal metinlerin 26 bölümünün
  hash kontrolü, widget JS depolama/dil/legacy/geçersiz veri kontrolleri ve Swift kaynak
  sözleşmesi, 11 kart vade testi, i18n çalışma zamanı kontrolleri ve `typecheck` geçti.

## Devam (sıradaki oturum buradan başlar)

- 2026-10-25 — Kullanıcı eski Türkçe OCR uyarılarının korunmasını kabul etti; bunlar yayın
  engeli değildir. `app.json` sürümü **1.0.8** oldu. Main'e birleştirme/push ve canlı migration
  onaylandı. Yerel tüm kontroller tekrar geçti: tip denetimi, 81 finans + 11 kart borcu +
  11 kart vade testi, i18n, widget, profil/sunucu ve izole Postgres migration testleri.
  Canlı Supabase CLI erişimi `Invalid access token` hatası verdi; yeniden giriş başlatıldı.
  **Bu kayıt yazılırken migration ve Edge Function yayını uygulanmamıştı; oturum yenilenmeli.**

**Sıradaki ilk iş:** Supabase oturumunu yenileyip canlı migration/deploy durumunu doğrulamak;
ardından aşama 9 — TR/EN cihaz kontrolü (özellikle uzun İngilizce metinler,
para/tarih girişi, dil değişimi, yasal metinler ve widget). Swift widget için macOS/Xcode
derlemesi ve uygulama/widget dil geçişi kontrolü gerekiyor. Ardından sunucu yayını ve
mağaza hazırlığı (aşama 10). `app.json` sürümü 1.0.8.

Sunucu yayını için migration önce uygulanmalı; ardından `send-reminders`, `send-cash-alerts`,
`ai-ask`, `generate-insights`, `process-document` ortak `_shared/` dosyalarıyla deploy edilmeli.
Uygulamanın yeni sürümü `ai_insights.locale` beklediğinden migration uygulama dağıtımından önce gelmeli.
Bu oturum canlı yayın yapmadı. Canlı şema/advisor kontrolü ve gerçek push/Gemini denemesi bekliyor.
Eski serbest biçimli OCR uyarıları kullanıcının kararıyla özgün Türkçe hâlinde korunur;
bunun için veri dönüşümü yapılmayacak.

Küçük ekran artıkları kontrol edildi: `takvim.tsx` ve `workspace/index.tsx` eşleşmeleri yorum;
`appearance.tsx` içindeki `Türkçe` dilin kendi adı, korunur. `review.tsx` kullanıcı adı
normalizasyonundaki `tr-TR` dönüşümleri ve kayıtlı kategori adları arayüz çevirisi değildir.

**Katman taraması:** `groupByDay` zaten dile göre biçimliyor; `creditCardPeriod`, `cardDebt` ve
`installmentPlan` içinde sabit kullanıcı metni yok. CSV başlıkları önceki oturumdan çevrilmiş.
`purchases`/`pushToken` artıklarının yalnızca geliştirici logları olduğu kontrol edildi.
Banka resmî adları ve OCR eşleştirme alias'ları özel isim/veri olarak korundu. `reports/api.ts`
`EXCLUDE_CARD_STATEMENT_LUMP` içindeki eski Türkçe açıklama filtresi veri uyumluluğu içindir;
sunucu İngilizce açıklamalar üretmeye başlarken o filtreyi de değerlendir.
Kalan büyük aşamalar: Swift native derlemesi, sunucu yayını ve cihaz/mağaza doğrulaması.

**Bilinen açıklar:** paywall `formatPrice` için `narrowSymbol` kullanılmadı (Hermes riski);
eski serbest OCR uyarılarında yalnızca Türkçe metin bulunabiliyor. Yeni sunucu kodu deploy edilmeden
canlı davranış eski hâlinde kalır. Migration tabanlı Postgres testi temel tabloları izole kurar;
canlı projenin tüm mevcut trigger/policy/privilege bileşimini doğrulamanın yerini tutmaz.

**Araçlar (`scripts/i18n/`, depo kökünden çalıştır):**

- `extract.py <dosya>...` — kullanıcıya görünebilecek metinleri satır numarasıyla listeler.
- `scan_tr.py <yol>...` — Türkçe karakter içeren kalan metinleri tarar (yorumlar da çıkar, elle ele).
- `register_ns.py <ns>...` — yeni namespace'i `i18n/locales/{tr,en}/index.ts`'e alfabetik ekler.
- `i18nlib.py` — düzenleme betikleri için `edit(path, [(eski, yeni)], import_satırı)` ve
  `add(dil, ns, çapa, blok)`; her eşleşmenin tek olduğunu doğrular.
- `node scripts/i18n/i18n-runtime-test.cjs "$PWD"` — sözlükleri gerçek i18next ile çözer; anahtar/değişken
  eşitliğini ve çoğulları kontrol eder.
- Her adım sonunda: `npx tsc --noEmit` (tip sistemi EN sözlüğün TR ile aynı anahtarlara sahip olmasını zorlar).
- `node tests/i18n-profile-locale.cjs` — ağsız profil dil eşitleme yarışları ve oturum/hidrasyon kontrolü.
- `node tests/i18n-server.cjs` — Edge tip denetimi ve ağsız sunucu akışı kontrolleri.
- `node tests/i18n-widget.cjs` — widget dil aktarımı, eski/geçersiz snapshot ve Swift kaynak sözleşmesi;
  native derleme yerine geçmez. Yasal metin hashleri ana i18n çalışma zamanı testine dahildir.
- `node tests/i18n-database.cjs` — izole Postgres migration kontrolü. Test aracı kurulumu:
  `npm install --prefix node_modules/.cache/i18n-validation --no-save --package-lock=false @electric-sql/pglite@0.3.14`.
  Uygulama bağımlılıklarına veya lockfile'a eklenmez; test altyapısında izole tutulur.

**Kurallar (değişmez):** Türkçe metinler birebir korunur; modül seviyesinde `t()` yok (getter /
`localizedRecord` / `localizedList`); döngü değişkeni `t` adını almaz (`tx`, `option`…); sayı içeren
metinlerde `count` + `_one`/`_other`; yüzde için `formatPercent`; kullanıcı verisinin büyük/küçük harfi
`tr-TR` kalır, arayüz metinleri `upperUi`/`lowerUi`/`capitalizeUi`.

## Notlar

- Türkçe metinler **birebir korunur** — çeviri anahtarlarına taşırken metin değiştirilmez.
- Tutar ayrıştırma riski: İngilizcede `1,234` binliktir; Türkçe kuraldaki "yalnızca virgül = ondalık"
  varsayımı İngilizcede ters çalışır. `parseAmount` dile göre ayrıştırmalı ve OCR çıktısı (belgenin
  kendi dili Türkçe) ayrı ele alınmalıdır.

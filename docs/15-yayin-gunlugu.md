# 15 — Yayın Günlüğü

Vademde'nin mağaza yayınlarının kaydı. Her sürüm için: hangi build, hangi mağazada,
hangi durumda ve içinde ne var. Yeni sürüm gönderildiğinde bu dosyanın başına eklenir.

Yayın altyapısıyla ilgili sabit bilgiler için bu dosyanın sonundaki
"Yayın altyapısı notları" bölümüne bakın.

---

## 1.0.5 — Hazırlanıyor (2026-10-02)

| Platform | Build | Durum | Gönderim |
|---|---|---|---|
| iOS | build 40 | `eas build --no-wait --auto-submit` ile alındı (build ID `c8bb89b4-29c3-4df4-8b65-4def9480f779`, commit `9f2eabe`); submission `b5ba6550-96fe-488f-a1ec-4efaa8921ac3` planlandı. **1.0.5 için bu build seçilmeli** | 2026-10-02 |

Build 39 önce 1.0.4 numarasıyla alındı; 1.0.4 (build 38) zaten yayında olduğu için App Store
gönderimi reddedilecekti, build `81ac7c0f-d8d9-41f1-9c00-fba0298918b8` tamamlanmadan
`eas build:cancel` ile iptal edildi (submission `c228c0c6-…` hiç çalışmadı). Sürüm 1.0.5'e çekildi.

### Kullanıcıya görünen değişiklikler

- **Ekstre harcamaları kategorilere ayrılıyor:** kredi kartı ekstresi onayında varsayılan artık
  "Kategorilere Ayır" — her harcama kendi tarihiyle karta ve Hareketler'e işlenir (önceden
  varsayılan "Sadece Toplam Borç"tu, seçim gözden kaçınca yalnızca tek kart borcu oluşuyordu).
  Satır kategorileri OCR önerisiyle önceden seçili gelir (ör. Starbucks → Restoran / Kafe); ücret/
  faiz satırları banka/kart ücreti kategorisine düşer. Kategorilere ayırırken genel KATEGORİ alanı
  sorulmaz, kart borcu kategorisiz kaydedilir.

### Teknik değişiklikler (release notes'a girmez)

- `process-document` Edge Function v22 (2026-10-02): prompt'a workspace gider kategorileri eklenir,
  her ekstre satırı kategorize edilir → `document_line_items.suggested_category_id` (migration
  `20261002120000_line_item_suggested_category.sql`, canlıya uygulandı). Sunucu tarafı olduğundan
  mevcut build'lerde de çalışır; öneriyi gösteren onay ekranı 1.0.5 ile gelir.
- `expo-updates`: `runtimeVersion.policy = appVersion`, kanallar development/preview/production.
  1.0.5 build'leri JS değişikliklerini `eas update --channel production` ile incelemesiz alabilir
  (runtime `1.0.5`); 1.0.4 ve öncesi OTA alamaz. Native değişiklik yeni build + sürüm artırımı ister.

### Açık takip maddeleri

- [ ] TestFlight'ta doğrula: ekstre tara → satırlar kategorili gelir → kaydet → harcamalar kartta ve
      Hareketler'de kendi tarihleriyle görünür; genel KATEGORİ alanı görünmez.
- [ ] App Store Connect'te 1.0.5 sürümünü oluştur, yeni build'i seç, "Yenilikler"
      (`assets/appstore/whats-new-1.0.5.tr.txt` / `.en.txt`) gir ve incelemeye gönder.

---

## 1.0.4 — Yayında (build 38)

| Platform | Build | Durum | Gönderim |
|---|---|---|---|
| iOS | build 38 | `eas build --no-wait --auto-submit` ile alındı (build ID `99a2c247-fb80-46ec-97fc-453c6db867c1`, commit `b9fe192`, `finished`); submission `615d1c7b-39d5-4a3d-8bda-bb927073b466` planlandı — çek verilince cari bakiyesinin düşmesi. **1.0.4 olarak yayınlandı** | 2026-10-01 |
| iOS | build 37 | `eas build --no-wait --auto-submit` ile alındı (build ID `8bf8acb5-6019-495c-b67c-8c520ffa4e7f`, commit `be3783c`, `finished`); submission `1a374237-76e4-4711-9f9b-9000a2a35ca8` planlandı — çek ciro, avans/mahsup, anapara ayrımı, cari ekstresi. build 38 ile değiştirildi (çekin cari bakiyesinden düşmemesi) | 2026-10-01 |
| iOS | build 36 | `eas build --no-wait --auto-submit` ile alındı (build ID `7d62261f-2951-4a8c-9e4d-7921922499d8`, commit `051774b`, `finished`); submission `ddc26ed8-46d2-4447-8b05-ef5b05e1cdc5` planlandı — TestFlight'ta doğrulanacak | 2026-09-30 |
| iOS | build 33 | `eas build --auto-submit` ile gönderildi; build 36 ile değiştirildi (çek/senet ve Ödeme Yap/Tahsilat Al düzeltmelerini içermez) | 2026-09-30 |
| iOS | build 32 | App Store Connect'e `eas submit` ile yüklendi; build 33 ile değiştirildi, artık kullanılmıyor | 2026-09-30 |
| iOS | build 30 | Yüklendi ama dekontun manuel hareket formundaki hâlini içermiyor; test için build 33 kullanılır | 2026-09-29 |

Build 29 iptal edildi (dashboard halkası düzeltmesinin eski hâlini taşıyordu). Build 31 numarası
başarısız bir yükleme denemesinde tüketildi. Build 30 `--auto-submit` ile ilk denemede yüklendi;
aynı build için sonradan elle yapılan gönderimler "already submitted" hatası verir, zararsızdır.
Build 32 `eas build --no-wait` + ayrı `eas submit --id <build>` ile yüklendi. Bir gönderim "sessizce
öldü" sanılmadan önce App Store Connect'te (TestFlight) ya da submission sayfasında sonucu
doğrulamak gerekir. 1.0.3 (build 28) yayında, dokunulmadı.

Build 33, aynı gün (2026-09-30) test hesabında (`test@user.com`) bulunan bir veri bütünlüğü
sorunu üzerine eklenen düzeltmeleri taşır (bkz. aşağıdaki "Kullanıcıya görünen değişiklikler" —
cari ödeme eşleştirme, hesap zorunluluğu, dekont sonuç ekranı, altın Para Birimi etiketi). Build 32
bu düzeltmeleri içermez. `eas build --platform ios --profile production --no-wait --auto-submit`
ile gönderildi (build ID `cecb50ec-90cd-4c05-88ee-0f8944bff91d`, submission ID
`38325f68-40af-4c1b-9d6a-89f3165bd041`, ikisi de `finished`). Aynı anda elle çalıştırılan ikinci
bir `eas build` komutu build 34'ü kuyruğa aldı — submit edilmeden `eas build:cancel` ile iptal
edildi, TestFlight'a çift kayıt gitmedi.

### Kullanıcıya görünen değişiklikler

- **Yeni karşılama akışı:** 5 sahneli, animasyonlu (tara → okunur → sen onaylarsın → çalışma
  alanı ve ekip → 7 gün ücretsiz).
- **Yeni paywall:** aylık/yıllık geçişi, plan seçimi, karşılaştırma tablosu; fiyatlar RevenueCat'ten.
  7 gün ücretsiz deneme yalnızca App Store kullanıcıya uygun bulursa gösterilir. Kayıttan sonra
  ilk çalışma alanı kurulunca paywall bir kez açılır.
- **Ödeme dekontu (Plus):** ödemeye ve manuel harekete (Yeni Hareket) dekont/fotoğraf/PDF eklenir, ödeme satırındaki ataçla ya da hareket detayındaki "Dekontu aç" ile açılır;
  taranan banka dekontu için "Ödeme Dekontu" sonuç ekranı (eşleşme önerisi, onayla kaydet).
- **Belge Arşivi (Plus):** Daha Fazla → Belge Arşivi ve cari sayfasında o cariye ait dekontlar.
- **Yeni sürüm uyarısı:** App Store'da daha yeni sürüm varsa uygulama açılışında bildirir (yalnızca iOS).
- **Düzeltmeler:** altın (çeyrek/yarım/tam) birimli tutarlar artık doğru gösterilip kaydediliyor;
  dashboard bakiye kartında büyük tutar/yazı tipinde halka taşması giderildi.
- **Cari ödeme eşleştirme (build 33):** "Tahsilat/Ödeme Ekle" ile girilen tutar artık o cariye ait
  en eski açık borç/alacaktan başlayarak otomatik düşülüyor (tam kapatma/kısmi ödeme/ön ödeme) —
  önceden bağımsız bir hareket olarak kaydediliyordu, ilgili borcu/alacağı hiç etkilemiyordu.
- **Ödemede hesap zorunlu (build 33):** borç/alacak ve dekont ödeme formlarında HESAP artık
  zorunlu — önceden isteğe bağlıydı, hesapsız kaydedilen ödemeler hiçbir hesap bakiyesini
  etkilemiyor ve Hareketler'de görünmüyordu.
- **Dekont sonuç ekranı yenilendi (build 33):** diğer belge onay ekranlarıyla tutarlı hâle
  getirildi; eşleşme yoksa cari oluşturma, kayıtlı değilse banka hesabı ekleme önerilir.
- **Altın Para Birimi etiketi (build 33):** hesap detayında bazen görünen ham kod (ör.
  ceyrek_altin) düzeltildi, doğru adıyla gösteriliyor.
- **Tarama kısayolları (build 33):** Yeni Hareket ve Yeni Borç/Alacak ekranlarına kameradan
  taramaya yönlendiren bir kısayol eklendi.
- **Ödeme Yap / Tahsilat Al (build 36):** yeni ekran (`app/payments/new.tsx`). Cari menüsü,
  Hareketler + menüsü ve kayıt detayındaki "Çek / Senet ile Öde" buraya açılır. Kapatılacak
  kayıtlar seçilir (varsayılan: tümü, en eski vade önce), kısmi kapatma desteklenir. Nakit/havale/
  kart/online'da para seçilen hesaptan hemen hareket eder; artan tutar ön ödeme/avans olur.
  Build 33'teki hareket formunun otomatik dağıtımı kaldırıldı; hareket formu artık açık kaydı
  olan cari için bu ekrana yönlendirir.
- **Çek/senetle ödeme borcu ikiye katlamıyor (build 36):** önceden "Ödeme Ekle → Çek" bağımsız
  yeni bir borç açıyordu (30.000 fatura + 20.000 çek = 50.000). Artık fatura çek tutarı kadar
  kapanır, vadeli çek/senet kaydı açılır; para çek/senet vadesinde ödendiğinde hesaptan çıkar.
  Senette birden çok vade girilebilir. Taranan çek/senet onayında "hangi kaydın karşılığı?" sorulur.
- **Taksite dağıtım (build 36):** taksit belirtilmeden yapılan ödeme en eski açık taksitten
  başlayarak dağıtılır — önceden yalnızca kaydın toplamı düşüyor, taksitler ödenmemiş kalıyordu.
- **Takvim "Öde" (build 36):** artık doğrudan ödeme yazmaz, hesap seçtiren ödeme formunu açar;
  kart ekstresi/nakit avans kart sayfasına gider (önceden karta gider yazılıp kart borcu artıyordu).
- **Çek ciro (build 37):** Ödeme Yap'ta "Çek Ciro" yöntemi ve alınan çek/senet detayında
  "Ciro Et". Portföydeki alınmış çek/senet tam tutarıyla tedarikçiye verilir: çek alacağı ve
  seçilen faturalar karşılıklı kapanır (hesapsız ödeme satırları, `settled_by_obligation_id` ile
  çapraz bağlı); çek faturaları aşarsa fark tedarikçiden avans alacağı olur. Fatura ya da avans
  silinirse çek (ilgili kısmıyla) portföye döner.
- **Ön ödeme / avans cari bakiyesinde (build 37):** ödemeyi aşan tutar artık bağımsız hareket
  değil, ters yönde `avans` kaydı olur (hesap hareketi `source_obligation_id` ile ona bağlı) ve
  cari bakiyesine girer. Ödeme Yap/Tahsilat Al'da "Mahsup" yöntemi ve avans detayında "Faturadan
  Mahsup Et" ile sonraki faturadan düşülür. Avansın vadesi yoktur; gecikmiş/bu ay ödenecek
  hesaplarına ve hatırlatmalara girmez.
- **Anapara gelir/gider değil (build 37):** `transactions.financing_minor`. Nakit avansın hesaba
  yatan tutarı, ödünç verilen para ve kredi/nakit avans/borç verme geri ödemelerinin anapara payı
  (taksitte anapara/faiz kırılımı varsa orantılı, yoksa tamamı) raporlarda ve dashboard'daki
  gelir-gider analizinde sayılmaz; hesap bakiyeleri değişmez. Mevcut veri geriye dönük dolduruldu.
- **Borç Verme kaydı çalışıyor (build 37):** `obligations_document_type_check` listesinde
  `borc_verme` yoktu, kayıt veritabanında reddediliyordu (canlıda hiç borç verme kaydı yoktu).
- **Cari Hareketler sekmesi = cari ekstresi (build 37):** faturalar/fişler, çek/senet/avans
  kayıtları, bunlara yapılan ödeme/tahsilatlar (hesaptan, çek/senetle, mahsup, ciro) ve kayda bağlı
  olmayan hareketler tek listede, yürüyen cari bakiyesiyle (`getCounterpartyStatement`).
- **Takvim "Öde" nakit avansı kart sayfasına göndermiyor (build 37):** build 36'da nakit avans
  kart ödeme akışına gidiyordu; nakit avans kart bakiyesine dahil olmadığı için kart borcunu
  olduğundan az gösterirdi. Artık kayıt detayındaki ödeme formu açılır (kart hesapları listelenmez).
- **Çek verilince cari bakiyesi düşüyor (build 38):** build 37'de faturayı kapatan çek/senet
  cari bakiyesine ayrıca borç olarak ekleniyordu (Yılmaz Demir: 10.100 fatura kalanı + 20.000 çek =
  30.100). Ön muhasebe mantığıyla cari çek verilince kapanır: bir kaydı kapatmış çek/senet
  (`payments.settled_by_obligation_id` ile işaret edilen) cari detayı bakiyesine, cariler listesi
  ve ana karta, cari "Ödenecekler" kırılımına ve Hareketler sekmesindeki yürüyen bakiyeye girmez
  (`getSettlingInstrumentIds`). Cari detayında "vadede ödenecek çek/senet" olarak ayrıca gösterilir;
  Çeklerim'de, takvimde ve ana sayfadaki ödenecekler kırılımında kalır. Fatura seçilmeden verilen
  peşin çek de (fazlası/tamamı `parent_obligation_id` ile bağlı avans olur) ödeme aracı sayılır —
  sayılmasaydı avansla birbirini götürüp cari 0 görünürdü. Yalnızca Borç/Alacak formundan karşılığı
  seçilmeden tek başına girilmiş çek/senet (eski kayıtlarda borcun kendisi olarak girilmişti, canlıda
  15 verilen + 2 alınan) carinin borcu/alacağı olarak sayılmaya devam eder.
- **Ödemeye bağlı hareketler kilitli (build 36):** hareket detayında düzenle/sil yerine "Bağlı
  Kayda Git"; değişiklik kaydın ödeme geçmişinden yapılır. Çek/senetle yapılmış ödeme satırı çek/
  senet kaydına yönlendirir; çek/senet silinirse kapattığı fatura yeniden açılır.

### Teknik değişiklikler (release notes'a girmez)

- `obligations.parent_obligation_id` (sonraki build, FK değil — aynı PostgREST gerekçesi):
  otomatik doğan kayıt (ör. çek fazlasından avans) üst kayıt silinince silinir;
  `delete_settlement_payments_for_obligation` artık yalnızca aynı workspace'te siler.
- `payments.settled_by_obligation_id` (build 36) + `obligations_delete_settlement_payments`
  trigger'ı; migration `20260930120000_add_payment_settlement_instrument.sql` canlıya uygulandı.
  Kolon **kasıtlı olarak FK değil**: payments → obligations ikinci bir FK, PostgREST'teki
  `payments(...)` / `obligation:obligations(...)` gömülü seçimlerini belirsiz yapıp yayındaki
  sürümleri bozuyordu (ilk uygulamada FK ~1 dakika canlıda kaldı, hemen kaldırıldı).
- `features/payments/api.ts`: `recordPayment` taksitsiz ödemeyi `planInstallmentSlices` ile
  taksitlere böler (her dilim kendi payment+transaction çifti, 1:1 korunur); `settleObligations`,
  `settleWithInstrument`, `listObligationsSettledBy`; `deletePayment` aynı transaction'ı paylaşan
  (kart ödemesi) tüm ödeme satırlarını birlikte siler.
- `payments.receipt_document_id` + `enforce_payment_receipt_plan` trigger'ı
  (`RECEIPT_ARCHIVE_PLAN_REQUIRED`); migration `20260929120000_add_payment_receipts.sql` canlıya
  uygulandı. Yardımcı fonksiyonların RPC erişimi kapatıldı (ikinci migration
  `revoke_workspace_has_document_archive_rpc`, repodaki dosyaya katlandı).
- `process-document` Edge Function v21: `receiptDetails` şeması, dekont prompt kuralları, Plus
  planında dekont dosyasının saklanması. Gemini dekont sınıflandırması gerçek dekontla henüz test edilmedi.
- `utils/money.ts formatMinorAmount` kıymetli maden kodlarını `formatValueUnitAmount`'a yönlendirir;
  hareket ve hesap formları birim hassasiyetine göre ayrıştırır (sikkelerde ×100 hatası giderildi).
- Harekete bağlı dekont `financial_documents.transaction_id` ile tutulur; Plus kilidi yalnızca istemcide (dekont taraması ücretsiz planda da hareket kaydedebildiği için sunucuda payments'taki gibi bir tetikleyici yok).
- `services/appUpdate.ts`: iTunes Lookup ile sürüm kontrolü, aynı sürüm için 24 saatte bir uyarı.
- `services/purchases.ts`: `getTrialEligibility` (RevenueCat uygunluk kontrolü) ve `freeTrialDays`.
- App Store Connect'te dört aboneliğe (Plus/İşletme, aylık/yıllık) "1 hafta ücretsiz" tanıtım teklifi
  eklendi (29 Eylül 2026'dan itibaren, 175 ülke, bitiş yok). Tek abonelik grubu olduğu için deneme
  kullanıcı başına bir kez sunulur.

### Açık takip maddeleri

- [ ] TestFlight'ta dashboard halkasını %100 ve %135 yazı tipinde doğrula.
- [ ] Gerçek bir banka dekontuyla Gemini sınıflandırmasını ve dekont sonuç ekranını dene.
- [ ] Sandbox'ta paywall'da "7 gün ücretsiz başlat"ın göründüğünü doğrula.
- [x] `eas build` ile build 33'ü al ve gönder (2026-09-30, tamamlandı).
- [x] Build 36'yı al ve gönder (2026-09-30; build 35 numarası EAS tarafında tüketilmiş, 36 kullanıldı).
- [x] App Store Connect'te 1.0.4 için build 38 seçildi; 1.0.4 yayında.
- [ ] TestFlight'ta doğrula: 30.000 fatura + 20.000 çek → fatura 10.000 kısmen ödendi, cari borç
      30.000; çek vadesinde "Öde" → hesap bakiyesi 20.000 düşer; çek silinince fatura 30.000'e döner.
- [x] Fazla ödeme/avansın cari bakiyesine dahil edilmesi, anaparanın gelir/gider sayılmaması,
      çek ciro, cari ekstresi — kodlandı; migration'lar `20260930150000_advances_financing_document_types.sql`
      ve `20260930160000_obligation_parent_link.sql` canlıya uygulandı; build 37 ile gönderildi.
- [ ] TestFlight'ta doğrula: A'dan alınan 20.000 çek → B'nin 15.000 faturasına ciro → fatura kapanır,
      B'den 5.000 avans alacağı; B'ye 10.000 peşin ödeme → cari bakiyesi +10.000, sonra 30.000 fatura
      → Mahsup → cari borç 20.000; cari Hareketler sekmesinde tüm satırlar ve yürüyen bakiye.
- [ ] App Store Connect'te 1.0.4 sürümünü oluştur, build 33'ü seç, "Yenilikler"
      (`assets/appstore/whats-new-1.0.4.tr.txt`) ve ekran görüntülerini
      (`assets/appstore/v2/vademde-01.png`…`vademde-10.png`) gir.

---

## 1.0.3 — İncelemede (2026-09-13)

| Platform | Build | Durum | Gönderim |
|---|---|---|---|
| iOS | build 28 | App Store Connect'te, incelemeye hazır | 2026-09-13 |

1.0.2 yayındayken (build 26) alınan sürüm — Android için ayrı bir build alınmadı.
**Build 27 kullanılmadı**: App Store Connect tarafından "Invalid Binary" (ITMS-91064)
olarak reddedildi, build 28 ile devam edildi (bkz. aşağıdaki teknik değişiklikler).

### Kullanıcıya görünen değişiklikler

Bu sürümde arayüzde görünen bir değişiklik yok.

### Teknik değişiklikler (release notes'a girmez)

- **Meta Ads SDK entegrasyonu** (`54ed63c`, `4651473`) — `react-native-fbsdk-next` +
  `expo-tracking-transparency` kuruldu. Meta Ads Manager'da iOS için App Install/App Ads
  kampanyası oluşturabilmek amacıyla; SDK olmadan Meta, uygulamayı iOS 14+ kampanyaları
  için seçilebilir app listesine almıyordu.
  - `app.json`: `react-native-fbsdk-next` plugin'i (appID, clientToken, scheme),
    `expo-tracking-transparency` plugin'i (Türkçe ATT izin metni), `SKAdNetworkItems`
    (Meta'nın iki resmi kimliği).
  - `services/metaAds.ts` (yeni) — App Tracking Transparency izni uygulama açılışında
    isteniyor, sonuç `Settings.setAdvertiserTrackingEnabled`/`setAdvertiserIDCollectionEnabled`
    ile SDK'ya bildiriliyor. `isAutoInitEnabled`/`autoLogAppEventsEnabled`/
    `advertiserIDCollectionEnabled` app.json'da bilinçli olarak `false` bırakıldı ve SDK
    burada, ATT sonucu belli olduktan **sonra** manuel başlatılıyor — ilk halinde SDK
    ATT isteminden önce otomatik başlayıp IDFA toplamaya başlıyordu (App Store İnceleme
    Kuralları 5.1.2 ihlali riski), commit `4651473` ile düzeltildi.
  - Client token App Dashboard > Settings > Advanced'dan alındı; App Secret'ten farklı
    olarak client-side/public bir değer, koda gömülmesi Meta'nın kendi tasarımı.
- **ITMS-91064 düzeltmesi** (`ed9a3f3`) — build 27, `app.json`'daki
  `privacyManifests.NSPrivacyTracking: true` + boş `NSPrivacyTrackingDomains`
  kombinasyonu yüzünden "Invalid Binary" aldı. FBSDK pod'u zaten kendi geçerli
  `PrivacyInfo.xcprivacy`'sinde kendi tracking/domain beyanını taşıyor; bunu kendi
  üst seviye manifest'imizde tekrar deklare etmeye gerek yoktu.
  `NSPrivacyTracking` build 27 öncesindeki haline (`false`) döndürüldü, eklenen
  Device ID veri tipi girdisi kaldırıldı. Kullanıcıya gösterilen asıl tracking beyanı
  zaten App Store Connect'teki App Privacy formu (nutrition label) — o formdan
  bağımsız, ondan etkilenmedi.
- Meta App ID: `1606561071252139`.

### Açık takip maddeleri

- [x] App Store Connect'te sürüm 1.0.3 oluşturulup build 28 seçildi, incelemeye
      hazır duruma getirildi.
- [x] App Privacy (nutrition label) formu güncellendi — Device ID / Third-Party
      Advertising / Tracking: Yes, Linked: Hayır.
- [ ] Android tarafında `advertiserTrackingEnabled` şu an koşulsuz `true` — KVKK/GDPR
      için ayarlarda açık bir onay anahtarı yok. Android'de de Meta reklamı verilecekse
      bu eklenmeli.

---

## 1.0.1 — İncelemede (2026-09-01)

| Platform | Build | Durum | Gönderim |
|---|---|---|---|
| iOS | build 25 | App Store incelemesinde | 2026-09-01 |
| Android | versionCode 12 | Play production incelemesinde | 2026-09-01 |

1.0.0 (build 21) yayınlandıktan sonra biriken tüm değişiklikleri içerir. **Build 22 hiç
yayına alınmadı** (reddedilmedi, kullanıcı yayınlamadı), bu yüzden onun özellikleri de
kullanıcılar için ilk kez bu sürümle gidiyor.

### Kullanıcıya görünen değişiklikler

Build 22'den devreden:
- **Varsayılan karanlık tema** — uygulama ilk kurulumda koyu temada açılıyor
  (`store/themePreferenceStore.ts` varsayılanı `'dark'`); Ayarlar'dan Sistem/Açık seçilebilir.
- **Değiştirilebilir uygulama ikonu** — Ayarlar > Uygulama İkonu: Koyu / Monokrom / Mor /
  Varsayılan (`@howincodes/expo-dynamic-app-icon`).
- **Hareket/hesap ikon tutarlılığı** — transferlerde (ör. kredi kartı ödemesi) Ana Sayfa ve
  Hareketler aynı ikonu gösteriyor (asıl ikon = hedef hesap/kart, alt satır = kaynak).
  Cari/firma adı işlem başlığında öne çıkıyor. Kasa/Cüzdan gibi bankasız hesaplarda gerçek
  değer birimi ikonu (TL/USD/altın).

Bu sürümde yeni (commit `511721b`):
- **Çalışma alanı yönetimi tek ekranda** — ad düzenleme/silme Profil'den
  `app/workspace/[id]/members.tsx`'e taşındı; özet kartı (durum, üye/rol/davet sayısı),
  davet kodu kopyalama ve tehlikeli bölge aynı ekranda.
- **Ana sayfada hızlı tema geçişi** — başlık yanından açık/koyu.
- **Ayarlar** — Bildirimler ve Gizlilik Politikası/KVKK satırları eklendi.

### Teknik değişiklikler (release notes'a girmez)

- **Uygulama dili Türkçe tanımlandı** (`ab4f23f`) — `ios.infoPlist`'te
  `CFBundleDevelopmentRegion` ve `CFBundleLocalizations` tanımsızdı; iOS bu durumda "en"
  varsayıyor ve App Store ürün sayfasındaki "Diller" satırı İngilizce görünüyordu.
  İkisi de `"tr"` yapıldı. **Yayın sonrası doğrulanmalı.**
- **`RECORD_AUDIO` izni kaldırıldı** (`361d3d3`) — Android'de tanımlıydı ama kodda hiçbir
  yerde ses kaydı kullanılmıyor. `permissions`'tan çıkarıldı, `expo-camera` eklentisine
  `recordAudioAndroid: false` verildi, `blockedPermissions` ile manifest birleştirmede
  `tools:node="remove"` garantiye alındı. Kullanılmayan hassas izin Play politika riski
  oluşturuyor ve mağaza sayfasında mikrofon izni olarak görünüyordu.
- **Service account anahtarı korumaya alındı** (`ab826d1`) — `.gitignore` kuralı
  `google-play-service-account.json` idi, dosyanın gerçek adı `google-service-account.json`;
  yani anahtar ignore **edilmiyordu**. `*service-account*.json` glob'u eklendi. Anahtar
  geçmişte hiç commit'lenmemişti, rotasyon gerekmedi.
- **`eas.json` submit yolu düzeltildi** (`ab826d1`) — `serviceAccountKeyPath` diskte
  olmayan bir dosyayı gösteriyordu.
- **Play production submit profili** (`361d3d3`) — `submit.production.android.track`
  `alpha` → `production`. Kapalı test için ayrı `alpha` profili eklendi.

### Build notları

- iOS build 24 alındı ama **derleme sırasında iptal edildi**: Türkçe dil tanımı eksikti.
  Yerine build 25 alındı, böylece fazladan bir inceleme turu harcanmadı. Build 23 hiç
  kullanılmadı.
- Android `releaseStatus` bilinçli olarak `completed` bırakıldı (kullanıcı kararı):
  onaylandığında otomatik %100 yayına geçer, ara onay adımı yok.
- Kurumsal Play hesabı olduğu için 12 test kullanıcısı / 14 gün kapalı test şartından
  muaf; doğrudan production'a çıkıldı.

### Açık takip maddeleri

- [ ] Yayın sonrası App Store ürün sayfasında "Diller" satırının Türkçe göründüğünü doğrula.
- [ ] **Büyük ekran / yön kısıtlaması** — Play Console uyarısı. `app.json`'da
      `"orientation": "portrait"` var; Android 16'dan itibaren genişliği 600dp üzerindeki
      ekranlarda (tablet, katlanabilir) bu kilit yok sayılıyor ve uygulama yeniden
      boyutlandırmaya zorlanıyor. Arayüz yalnızca dikey telefon için tasarlandığından
      tablette bozulma riski var — bir sonraki sürümden önce tablet/yatay davranışı gözden
      geçirilmeli. Yayını engellemiyor.
- [ ] **Edge-to-edge deprecated API** — Play Console uyarısı. Kaynağı Expo'nun ürettiği
      `styles.xml`'deki `android:statusBarColor` / `android:navigationBarColor`
      (ikisi de `transparent`). API 35'te deprecated, API 36'da yok sayılıyor. Değerler
      zaten şeffaf olduğu için pratik etkisi yok; Expo şablonu güncellendiğinde kaybolur.
      **Aksiyon gerekmiyor**, kayıt amaçlı.

---

## 1.0.0 — Yayında (2026-08)

| Platform | Build | Durum |
|---|---|---|
| iOS | build 21 | App Store'da yayında |
| Android | — | Kapalı test (alpha) |

İlk App Store yayını. 2026-08-18'de gönderildi.

Kullanıcıya görünen değişiklikler:
- **Yazı boyutu düzeltmesi** — Control Center'dan yazı boyutu büyütüldüğünde bazı ekranların
  (ör. Ana Sayfa bakiye kartı) bozuk kalması giderildi.
- **Hareketler düzeltmesi** — "Tümü" sekmesinde kısmi ödenen/tahsil edilen borç-alacaklarda
  vade tarihi yerine gerçek ödeme tarihi gösteriliyor.
- **Belge tarama (OCR) iyileştirmesi** — kişi/firma daha isabetli tanınıyor, kategori
  otomatik öneriliyor, nakit ödemelerde kayıtlı Kasa hesabı otomatik seçiliyor.

Teknik: `app.json` privacyManifests eklendi.

---

## Yayın altyapısı notları

**EAS CLI konumu.** `eas` global olarak nvm'deki **node v24.11.0** altında kurulu. Kabuk
varsayılan olarak `/usr/local/bin/node` (v20) kullandığı için `eas` doğrudan bulunamaz:

```bash
export PATH="$HOME/.nvm/versions/node/v24.11.0/bin:$PATH"
```

**Sürüm yönetimi.** `eas.json`'da `appVersionSource: "remote"` + production profilinde
`autoIncrement: true`. Yani:
- **Build numarası / versionCode** EAS tarafında tutulur ve otomatik artar — `app.json`'a
  elle yazılmaz.
- **Sürüm adı (`version`)** `app.json`'dan gelir ve **elle yükseltilmelidir**. Mağazada
  yayında olan bir sürümle aynı numarayla güncelleme yayınlanamaz.

**Komutlar.**

```bash
# iOS
eas build  --platform ios     --profile production
eas submit --platform ios     --profile production

# Android — production
eas build  --platform android --profile production
eas submit --platform android --profile production

# Android — kapalı test
eas submit --platform android --profile alpha
```

`--no-wait` build'i kuyruğa alıp hemen döner; `--auto-submit` build biter bitmez yükler.

**`eas submit` neyi yapmaz.** iOS'ta binary'yi yalnızca App Store Connect'e yükler —
sürümü **incelemeye göndermez**. ASC'de sürüm oluşturma, build seçme, "Yenilikler" metnini
girme ve incelemeye gönderme adımları elle yapılır.

**App Store dilinin iki katmanı.** Karıştırılmaya müsait:
1. Ürün sayfasındaki **"Diller"** satırı → binary'deki `CFBundleLocalizations`'tan gelir,
   build ile değişir.
2. Sayfa **metinlerinin** dili (ad, açıklama, anahtar kelimeler) → App Store Connect >
   App Information > **Primary Language**. Web arayüzünden elle ayarlanır, build ile
   değişmez. (Vademde'de zaten Türkçe.)

**Mağaza metinleri için karakter sınırları.** Subtitle 30, Promotional Text 170,
"Yenilikler" 4000, Keywords 100. Apple aramada **uygulama adı + subtitle + Keywords**
alanlarını birlikte indeksler; subtitle'daki kelimeleri Keywords'te tekrar etmeyin.
Promotional Text yeni sürüm gerektirmeden değiştirilebilir, Subtitle gerektirir.

**Play'de gönderim öncesi zorunlular.** Uygulama giriş gerektirdiği için **App access**
bölümüne çalışan bir demo hesap (e-posta + şifre) girilmelidir — en sık görülen red
sebebi budur. Ayrıca veri güvenliği formu, içerik derecelendirme, hedef kitle, gizlilik
politikası URL'si.

# 15 — Yayın Günlüğü

Vademde'nin mağaza yayınlarının kaydı. Her sürüm için: hangi build, hangi mağazada,
hangi durumda ve içinde ne var. Yeni sürüm gönderildiğinde bu dosyanın başına eklenir.

Yayın altyapısıyla ilgili sabit bilgiler için bu dosyanın sonundaki
"Yayın altyapısı notları" bölümüne bakın.

---

## 1.0.4 — Hazırlanıyor (2026-09-30)

| Platform | Build | Durum | Gönderim |
|---|---|---|---|
| iOS | build 32 | App Store Connect'e `eas submit` ile yüklendi; Apple işliyor, TestFlight'ta görünmesi bekleniyor | 2026-09-30 |
| iOS | build 30 | Yüklendi ama dekontun manuel hareket formundaki hâlini içermiyor; test için build 32 kullanılır | 2026-09-29 |

Build 29 iptal edildi (dashboard halkası düzeltmesinin eski hâlini taşıyordu). Build 31 numarası
başarısız bir yükleme denemesinde tüketildi. Build 30 `--auto-submit` ile ilk denemede yüklendi;
aynı build için sonradan elle yapılan gönderimler "already submitted" hatası verir, zararsızdır.
Build 32 `eas build --no-wait` + ayrı `eas submit --id <build>` ile yüklendi. Bir gönderim "sessizce
öldü" sanılmadan önce App Store Connect'te (TestFlight) ya da submission sayfasında sonucu
doğrulamak gerekir. 1.0.3 (build 28) yayında, dokunulmadı.

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

### Teknik değişiklikler (release notes'a girmez)

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
- [ ] App Store Connect'te 1.0.4 sürümünü oluştur, build 32'yi seç, "Yenilikler" ve ekran görüntülerini gir.

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

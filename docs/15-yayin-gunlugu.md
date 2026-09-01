# 15 — Yayın Günlüğü

Vademde'nin mağaza yayınlarının kaydı. Her sürüm için: hangi build, hangi mağazada,
hangi durumda ve içinde ne var. Yeni sürüm gönderildiğinde bu dosyanın başına eklenir.

Yayın altyapısıyla ilgili sabit bilgiler için bu dosyanın sonundaki
"Yayın altyapısı notları" bölümüne bakın.

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

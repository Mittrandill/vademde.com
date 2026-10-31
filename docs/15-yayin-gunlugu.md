# 15 — Yayın Günlüğü

Vademde'nin mağaza yayınlarının kaydı. Her sürüm için: hangi build, hangi mağazada,
hangi durumda ve içinde ne var. Yeni sürüm gönderildiğinde bu dosyanın başına eklenir.

Yayın altyapısıyla ilgili sabit bilgiler için bu dosyanın sonundaki
"Yayın altyapısı notları" bölümüne bakın.

---

## 1.0.9 — Varlıklarım ve Android optimizasyonu (2026-10-31)

Durum: yayın hazırlığı sürüyor. Kullanıcı web ve Android production yayınını ve App Store inceleme gönderimini onayladı. Sonuç ve build bağlantıları tamamlandığında bu kayda işlenecek.

- Ortak Varlıklarım: taşınmaz/araç, manuel değer, sahiplik payı, değer geçmişi ve gelir/gider/kredi bağlantıları.
- Mobil ve web tasarımları Hesaplarım ekranlarıyla uyumlu; dolu ikonlar, gruplu formlar, sekmeli detay ve işlem menüsü.
- Canlı ortak Supabase migration’ı `20261031112137_owned_assets` uygulandı. Mevcut finansal tutarlar değiştirilmedi.
- Android R8 minify, resource shrinking ve `proguard-android-optimize.txt` etkin. Paket metrikleri build sonrası doğrulanacak.
- Play service account dosya yolu düzeltildi; tüm service-account anahtarları EAS paketinden dışlandı.
- TR/EN sürüm notları ve mağaza metinleri `assets/appstore/release-1.0.9/` ve `whats-new-1.0.9.*.txt` altında.
- Testler: web/mobil TypeScript; web üretim derlemesi; 81 finans regresyonu; 11 kart borcu, 22 kart vadesi; varlık domain ve PostgreSQL/RLS; tarayıcıda araç ekleme/bağlama/sekme/menü/dar ekran/İngilizce; profil dili, widget, sunucu dil, locale DB, 13 realtime, analitik ve RevenueCat kontrolleri.
- Yeni varlık tabloları için realtime testi güncellendi; önceki destek ekranı değişikliğinden kalan sunucu bildirim sözlüğü eşitlendi.

---

## 1.0.8 OTA — Bildirimler ekranında destek cevapları ayrı sekmede (2026-10-31)

| Platform | Kanal | Durum | Gönderim |
|---|---|---|---|
| iOS + Android | production (runtime 1.0.8) | Yayınlandı — update group `7dfab9b8-5cb1-4467-9fcc-889e46abd357` (iOS `01a18ece-6541-7709-ad08-7a65a07e11a9`, Android `01a18ece-6541-79a9-8f0e-4acf76c285b4`), kaynak commit `3d65c16` | 2026-10-31 |

- **Sekmeler:** Bildirimler ekranı **Hatırlatmalar | Destek** olarak ayrıldı; destek cevapları vade
  hatırlatmalarıyla karışmıyor. Okunmamış destek cevabı varsa sekme etiketinde sayı görünür ("Destek (1)").
  "İşlemler" menüsü ve sayfalama yalnızca Hatırlatmalar sekmesinde. `/notifications?tab=support` doğrudan
  Destek sekmesini açar.
- **Hata düzeltmesi:** Destek önizlemesindeki boşluk temizleyen regex `/s+/` yazılmıştı ve metindeki "s"
  harflerini siliyordu; `/\s+/` olarak düzeltildi.
- Doğrulama: TypeScript ve değişen dosyalarda ESLint geçti. Gerçek cihazda henüz denenmedi.
- [Expo yayın kaydı](https://expo.dev/accounts/akintkaya/projects/vademde/updates/7dfab9b8-5cb1-4467-9fcc-889e46abd357).

---

## 1.0.8 OTA — Push token hesap değişiminde kaydolmuyordu + Ayarlar > Bildirimler izin durumu (2026-10-30)

| Platform | Kanal | Durum | Gönderim |
|---|---|---|---|
| iOS + Android | production (runtime 1.0.8) | Yayınlandı — update group `59148d1f-6c33-4103-acd1-2c8930d6a347` (iOS `01a18e30-41bc-7c9f-aeb4-fde7507626c5`, Android `01a18e30-41bc-7939-a671-2da66bc807f4`), kaynak commit `6d14d44` | 2026-10-30 |

- **Hata:** Push token telefona özgüdür (`push_tokens.token` UNIQUE). Aynı telefonda önce başka hesapla giriş
  yapıldıysa satır o hesapta kalıyor, yeni hesabın istemci upsert'ü `push_tokens_update_own` RLS'ine takılıp 403
  alıyor ve sessizce düşüyordu (son 24 saatte 5 adet 403). Sonuç: izin açık olduğu halde hesap hiç bildirim almıyor,
  admin panelinde "Bildirim kapalı" görünüyordu.
- **Düzeltme:** `register_push_token(p_token, p_platform)` RPC'si (migration
  `20261030140000_register_push_token.sql`, production'a uygulandı) token'ı `auth.uid()`'ye taşır; istemci artık
  bunu çağırır. Geri alınan işlemde sahte kullanıcılarla doğrulandı (eski yol `42501`, RPC sonrası sahip doğru).
- **Ayarlar > Bildirimler:** Artık bildirim listesini açmıyor; izin durumunu (Açık/Kapalı) gösterir ve telefonun
  bildirim ayarlarını açar (iOS izni uygulama içinden kapatmaya izin vermez). Liste ana ekran zilinde ve
  Daha Fazla > Bildirimler'de.
- Doğrulama: TypeScript ve değişen dosyalarda ESLint geçti (yalnızca önceden var olan `import/no-duplicates`
  uyarıları). Gerçek cihazda henüz denenmedi.
- [Expo yayın kaydı](https://expo.dev/accounts/akintkaya/projects/vademde/updates/59148d1f-6c33-4103-acd1-2c8930d6a347).

---

## 1.0.8 OTA — Destek cevapları Bildirimler ekranında + "Bildirimler kapalı" kartı (2026-10-30)

| Platform | Kanal | Durum | Gönderim |
|---|---|---|---|
| iOS + Android | production (runtime 1.0.8) | Yayınlandı — update group `bbb4bb67-43c4-4eed-bd01-4fefa637a28d` (iOS `01a18e1e-b49c-73fd-8aa9-85cdc5902cd5`, Android `01a18e1e-b49c-7d93-be4e-ea3cb7e6ebc6`), kaynak commit `43f62b9` | 2026-10-30 |

- **Bildirimler ekranı:** Üstte "Destek" bölümü — destek ekibinin son cevapları (okunmamış noktasıyla);
  dokununca sohbet açılır ve cevap okundu işaretlenir. Push ile birlikte cevap artık uygulama içinde de görünür.
- **Ana ekran "Bildirimler kapalı" kartı:** Bildirim izni yoksa gösterilir. İzin sorulabiliyorsa sorar, reddedilmişse
  sistem ayarlarını açar; uygulamaya dönünce izin yeniden okunur ve push token hemen kaydedilir. "Şimdi değil" 7 gün gizler.
  Gerekçe: yayın anında 396 kullanıcının 204'ünün kayıtlı push cihazı yoktu (vade hatırlatmaları hiç ulaşmıyor;
  bir kısmı yalnızca web kullanıcısı olabilir). Etkisi bu oranın düşmesiyle izlenecek.
- **Admin paneli (vademde.app `0c3b116`, canlı):** Üye listesinde kayıtlı push cihazı olmayanlara "Bildirim kapalı"
  rozeti. `admin_list` members dalı `push_devices` döner (migration `20261030130000_admin_members_push_devices.sql`,
  production'a uygulandı).
- Doğrulama: TypeScript ve değişen dosyalarda ESLint geçti (`app/(tabs)/index.tsx`'teki kullanılmayan `queryClient`
  uyarısı önceden vardı). Gerçek cihazda henüz denenmedi.
- [Expo yayın kaydı](https://expo.dev/accounts/akintkaya/projects/vademde/updates/bbb4bb67-43c4-4eed-bd01-4fefa637a28d).

---

## 1.0.8 OTA — Uygulama içi destek sohbeti + vade sayısı alanı başlığın altında (2026-10-30)

| Platform | Kanal | Durum | Gönderim |
|---|---|---|---|
| iOS + Android | production (runtime 1.0.8) | Yayınlandı — update group `3ee44f3d-7613-4560-a644-6e4eb42b6a92` (iOS `01a18e05-f06b-735e-a33f-ce9565026b27`, Android `01a18e05-f06b-7759-8bb2-8c2923fc51c2`), kaynak commit `3cfee51` | 2026-10-30 |

- **Destek sohbeti:** Daha Fazla > Destek altında talep listesi, yeni talep formu ve sohbet ekranı.
  Talepler web iletişim formuyla aynı `contact_messages` tablosundadır (yeni `user_id`, `source` kolonları);
  cevaplar yeni `support_replies` tablosunda. Web'den gönderilen talepler, doğrulanmış e-postası eşleşen
  hesaba bağlanır. Okunmamış destek cevabı Daha Fazla satırında sayı olarak görünür.
- **Admin cevabı + push:** vademde.app admin konsolunda (commit `19fb4b6`, main'e push ile canlı) mesaj
  penceresine sohbet geçmişi ve cevap kutusu eklendi. Cevap `support-reply` Edge Function'ı (Supabase sürüm 1,
  `verify_jwt=true`) üzerinden yazılır; admin + MFA kontrolü `admin_support_reply` RPC'sindedir. Talep sahibinin
  cihazlarına "Destek talebi hakkında" push'u gider; dokununca `/destek/[id]` açılır.
- **Veritabanı (production, uygulandı):** `support_threads` (vademde.com
  `supabase/migrations/20261030120000_support_threads.sql`) ve `admin_support_replies` (vademde.app
  `supabase/migrations/20261030121000_admin_support_replies.sql`). Anonim web formu artık `user_id` taşıyan
  talep oluşturamaz. RLS, geri alınan bir işlem içinde sahte kullanıcılarla doğrulandı: başkasının talebi
  görünmüyor, kullanıcı `support` cevabı yazamıyor, başkası adına talep açamıyor.
- **Yeni kayıt formu:** KAÇ AY / TAKSİT SAYISI alanı Başlık'ın hemen altına taşındı. Alan formun sonundayken
  kullanıcılar varsayılan 1 ile kaydedip aboneliği tek vadeli bırakıyordu (destek talebi: Spotify aboneliği
  sonraki ay takvimde görünmüyor).
- Doğrulama: TypeScript (mobil + web) ve değişen dosyalarda ESLint geçti (`app/obligations/new.tsx`'teki
  `set-state-in-effect` hatası bu değişiklikten önce de vardı). Ekranlar gerçek cihazda henüz denenmedi.
- `eas update --channel production --environment production` ile yayınlandı.
  Runtime `appVersion`: yalnızca 1.0.8 uygulamalar alır. Yeni native bağımlılık yok, mağaza incelemesi gerekmez.
- [Expo yayın kaydı](https://expo.dev/accounts/akintkaya/projects/vademde/updates/3ee44f3d-7613-4560-a644-6e4eb42b6a92).

---

## 1.0.8 OTA — Kayıt sırasında realtime yenilemelerini birleştirme (2026-10-29)

| Platform | Kanal | Durum | Gönderim |
|---|---|---|---|
| iOS + Android | production (runtime 1.0.8) | Yayınlandı — update group `1249e79e-12d0-4c73-aa3b-d882dc828100` (iOS `01a18746-5cb1-7a78-8d79-76c91bbc8563`, Android `01a18746-5cb1-7bd3-b99c-95ae7f81dc5b`), kaynak commit `fa512c4` | 2026-10-29 |

- Çok taksitli manuel kredi kaydında her realtime satır bildirimi aynı sorguları tekrar tekrar yeniliyordu.
  Bildirimler artık 400 ms pencerede birleştirilir; aktif kayıt işlemi bitene kadar yenileme bekler.
  Devam eden yenileme sırasında gelen bildirimler tek bir sonraki yenilemeye dönüşür.
- Doğrulama: realtime kuyruğunun 13 kontrolü, finans regresyonunun 81 kontrolü, TypeScript ve değişen
  dosyalarda ESLint geçti. Android ve iOS production paketleri başarıyla derlendi ve yüklendi.
  Sorunu yaşayan gerçek Android cihazda güncelleme sonrası sonuç henüz doğrulanmadı.
- `eas update --channel production --environment production --platform all` ile yayınlandı.
  Runtime `appVersion`: yalnızca 1.0.8 uygulamalar alır; eski sürümlerin önce mağazadan güncellenmesi gerekir.
- [Expo yayın kaydı](https://expo.dev/accounts/akintkaya/projects/vademde/updates/1249e79e-12d0-4c73-aa3b-d882dc828100).

---

## Sunucu — RevenueCat promosyonları + Gemini kredi kesintisi (2026-10-28)

- 2026-10-28 09:47–14:26 UTC arası Gemini ön ödemeli kredisi bitti (`402 prepayment credits are depleted`);
  15 OCR işi `failed` oldu, 2 kullanıcı etkilendi. Kredi yüklendi; kullanıcılara özür push'u gönderildi.
- `revenuecat-webhook` Supabase sürüm 8 (`--no-verify-jwt`), commit `4f3be37`: RevenueCat panelinden verilen
  promosyon `NON_RENEWING_PURCHASE` (store `PROMOTIONAL`) olarak geliyor ve `ignored` sayılıyordu; artık
  `store='promotional'`, `will_renew=false` olarak aboneliğe yazılır. Düzeltmeden önce verilen bir promosyon
  (bitiş 2026-11-28) satırı elle yazıldı.
- Takip: 2026-11-28 sonrası promosyon bitişinde RevenueCat'in `EXPIRATION` gönderip planı `free`'ye
  düşürdüğü doğrulanacak. Mobil build/OTA gerekmez.

---

## 1.0.8 OTA — Kart son ödemesi: ödenmeyen dönem takvimde kalır (2026-10-26)

| Platform | Kanal | Durum | Gönderim |
|---|---|---|---|
| iOS + Android | production (runtime 1.0.8) | `eas update --channel production --environment production` — update group `519e5973-2900-40db-94df-b0959a74a9ea` (iOS `01a1772d-34f2-7781-88b6-98489262c1fd`, Android `01a1772d-34f2-7c71-989d-369df175920d`), commit `69e63fc` | 2026-10-26 |

- 1.0.8 mağazaya çıkmadan yayınlandı: şu an yalnızca TestFlight build 51 alır; mağaza kullanıcıları 1.0.8'i
  kurduktan sonraki ikinci soğuk açılışta alır. 1.0.7 kullanıcılarına inmez (runtime `appVersion`).
- Gerçek kullanıcı geri bildirimi: ekstresiz kartın son ödemesi takvimde görünmüyordu. Sanal kalem yalnızca
  bugünden sonraki ilk son ödemeye yazıldığı için gün geçince siliniyordu. Artık ekstreyle karşılanmayan borç
  kalemlerine göre dönemlerin son ödeme günlerine dağıtılır, ödemeler en eski dönemden düşer; ödenmeyen dönem
  "gecikti" olarak kalır, toplam güncel kart borcuna eşittir (`features/accounts/cardDues.ts`, `tests/card-dues.cjs`).
- Güncel kart borcu yeniden girilince eski dönemle toplanmaz: `accounts.opening_balance_set_at` (tetikleyici;
  migration `20261026120000`, web reposunda, canlıya uygulandı — eski build'ler sütunu okumaz, kırılmaz).
- Web aynı gün `44b039a` ile yayınlandı.

---

## 1.0.8 — Türkçe / İngilizce dil desteği (2026-10-26)

| Platform | Build | Durum | Gönderim |
|---|---|---|---|
| Android | versionCode 17 | Build `ba4c5c22-f284-4afd-a76b-f36bc7d27a23` başarılı. Play **production** gönderimi `150429b9-bcd3-4cbe-8619-f73429602770` **FINISHED**, `releaseStatus: completed`. Google inceleme/yayın durumu Play Console'dan izlenir | 2026-10-26 |
| iOS | build 51 | Build `41ba79f8-0470-4529-8a8a-39d41e11bcc2` başarılı (Swift widget dahil). App Store Connect/TestFlight gönderimi `aca5bb63-a5f3-4673-8156-9ef6315a6c73` **FINISHED**. Apple işleme süresi sonrası TestFlight'ta görünür; incelemeye kullanıcı gönderecek | 2026-10-26 |

- Build kaynak commit'i `fc7073f` (main); sürüm/runtime `1.0.8`. Android keystore ve iOS ana uygulama/widget provisioning profilleri mevcut EAS kimlik bilgilerinden kullanıldı.
- Android submit yolu bu makinedeki gerçek dosyaya göre `./google-play-service-account.json` olarak düzeltildi. Anahtar Git'e eklenmedi.
- Arayüz, yasal metinler, PDF, hatırlatma/bildirim, AI/OCR ve widget TR/EN destekler; 2947 sözlük anahtarı. Ayrıntılar: `docs/20-ingilizce-dil-destegi.md`.
- Migration `20261025184930_add_server_locale_support` ve beş ilgili Edge Function 25 Ekim'de canlıya uygulandı; mevcut 224 profil Türkçe kaldı. Mevcut finans kayıtları ve kullanıcı adları değiştirilmedi.
- İki production build `eas build --platform all --profile production --non-interactive --no-wait` ile oluşturuldu; ayrı `eas submit --id <build-id> --profile production` komutlarıyla gönderildi. 1.0.7 için OTA çıkarılmadı.
- Kalan kontrol: cihazda TR/EN akışları ve widget; mağaza İngilizce metin/görselleri; iOS'ta 1.0.8 sürümüne build 51'i seçip App Review'a gönderme. Gerçek Gemini/push/OCR denemeleri henüz yapılmadı.

---

## 1.0.7 OTA — Ekip üyesi limitleri: Plus 2, İşletme 50 (2026-10-25)

| Platform | Kanal | Durum | Gönderim |
|---|---|---|---|
| iOS + Android | production (runtime 1.0.7) | `eas update --channel production --environment production` — update group `9fd84999-2cc6-43e5-8ec8-839582d3706a` (iOS `01a173fc-b7ca-76fc-8bc3-9282674f7cf2`, Android `01a173fc-b7ca-74d6-a847-c4c04b3c6a98`), commit `5b2a7a1` + commit edilmemiş değişiklikler | 2026-10-25 |

- Asıl değişiklik sunucuda: `plan_limits.max_team_members` Plus `null → 2`, İşletme `10 → 50`
  (migration `20261025164706_team_member_limits_plus_isletme`). Paywall, abonelik ve üyeler ekranları sayıyı
  tablodan okuduğu için OTA'sız da güncellendi.
- OTA yalnızca Ücretsiz kullanıcıya görünen kilitli davet metnini (`app/workspace/[id]/members.tsx`, artık
  sayıları `plan_limits`'ten okur) ve `TEAM_PLAN_REQUIRED` mesajını (`utils/alerts.ts`) düzeltir.
- Web (vademde.app) aynı gün `45847a3` ile yayınlandı: fiyatlandırma, plan kartları, abonelik, çalışma alanı detayı.

---

## 1.0.7 — Android production (2026-10-19)

| Platform | Build | Durum | Gönderim |
|---|---|---|---|
| Android | versionCode 16 | `eas build --platform android --profile production --auto-submit-with-profile production` (build `bb6e4bde-889e-45c8-a9b7-3bbdfe5838cb`, commit `1161efd`) → Play **production**, `releaseStatus: completed` (submission `1907f9d5-1011-4b06-925c-22c0c9547265`). Google incelemesi sonrası yayına girer | 2026-10-19 |

Neden: 10 Ekim'deki Android 1.0.7 build'i (versionCode 15) yalnızca alpha'ya gitmiş, production 9 Ekim'den beri 1.0.6'da
kalmıştı. Runtime politikası `appVersion` olduğu için 1.0.7 OTA'ları Play kullanıcılarına inmiyordu. Bu build 2026-10-19
OTA içeriğini (kart son ödemesi, rapor PDF) zaten içerir. Kurumsal hesap olduğundan kapalı test şartı yok.

- `eas.json` submit anahtar yolu `./google-service-account.json` olarak düzeltildi (`1161efd`) — 2 Ekim'de eski,
  diskte olmayan `google-play-service-account.json` adına dönmüştü.
- Play "Yenilikler" (500 karakter sınırı): `assets/appstore/whats-new-1.0.7.play.tr.txt` — EAS submit metni
  göndermez, Play Console'dan elle girilir.

---

## 1.0.7 OTA — İsteğe bağlı kullanım analitiği (2026-10-24)

| Platform | Kanal | Durum | Gönderim |
|---|---|---|---|
| iOS | production (runtime 1.0.7) | `eas update --channel production --environment production --platform ios` — update group `8064bc97-104b-4fc7-87f0-0308aefeafa3` (iOS `01a16d5e-2920-766d-8b45-3e1153f7d558`), commit `ac6bf08` | 2026-10-24 |
| Android | production (runtime 1.0.7) | `eas update --channel production --environment production --platform android` — update group `a577c197-3777-4881-aec3-08b24d339fa0` (Android `01a16d86-0ff6-711e-961b-aaec40ebee20`), commit `8d820f7` — aynı içerik bir kez daha yayınlandı; önceki grup `0c0a0d1b-7b94-42ca-a159-219b0e015eb9` (commit `38c10c1`) onun altında kaldı. Play Veri güvenliği formu (Uygulama işlemleri + Kullanıcı kimlikleri: Analiz) aynı gün incelemeye gönderildi | 2026-10-24 |

- Ayarlar > Gizlilik > **Kullanım analitiği** anahtarı (varsayılan KAPALI, KVKK açık rıza). Açıkken
  `app_opened`, `paywall_viewed`, `plan_selected`, `checkout_started` olayları `analytics_ingest_events` RPC'sine gider.
  Gizlilik metni (uygulama içi + vademde.com/gizlilik) güncellendi. Yeni native modül yok.
- RevenueCat webhook (`revenuecat-webhook`, Supabase sürüm 7) aynı gün güncellendi: olay defteri, tekrar/gecikmiş
  olay denetimi, `trialing`, `billing_period`; `--no-verify-jwt` ile dağıtıldı (RevenueCat kendi gizli başlığıyla çağırır).
- Geri alma: `revoke execute on function public.analytics_ingest_events(jsonb) from authenticated;` (anlık, veri değişmez).

## 1.0.7 OTA — Kredi kartı son ödemesi + rapor PDF (2026-10-19)

| Platform | Kanal | Durum | Gönderim |
|---|---|---|---|
| iOS + Android | production (runtime 1.0.7) | `eas update --channel production --environment production` — update group `6b1794ad-c718-481f-a6ea-9a0b7ce23d96` (iOS `01a15310-8b00-7802-b228-2d0557b3063b`, Android `01a15310-8b00-7518-a592-063cd97f5085`). iOS 1.0.7 yayındaydı; Android production hâlâ 1.0.6 (versionCode 14) olduğu için Android kullanıcılarına inmedi — aşağıdaki Android 1.0.7 production girişine bakın | 2026-10-19 |

Gerçek kullanıcı geri bildirimi: kredi kartı son ödemeleri takvimde görünmüyor, kart borcu toplam borca girmiyor.
Sebep: takvim, toplam borç ve yaklaşan vadeler yalnızca `obligations` okuyordu; kart borcu kart hesabında (açılış +
hareketler / ekstre çapası) yaşıyor. Canlıda 41 aktif kartın 35'ine hiç ekstre girilmemişti.

### Kullanıcıya görünen değişiklikler

- Kredi kartının sıradaki son ödemesi takvimde, Ana Sayfa "Yaklaşan vadeler"de ve widget'ta kendiliğinden görünür
  (ekstre/kayıt girmeye gerek yok). Tutar = güncel kart borcu − açık ekstrelerin kalanı; dokununca kart sayfası açılır.
- Kart borcu Ana Sayfa'daki toplam borca dahil.
- Kart son ödeme hatırlatması: 3 gün önce ve son ödeme günü 10:00 (borç yoksa / dönemin ekstresi girildiyse iptal).
- Takvim Liste görünümü artık tarih sırasında (taksitler sona yığılmıyordu).
- Rapor PDF yenilemesi (gerçek logo, yeni başlık/altbilgi — commit `9156863`) bu OTA ile gitti.

### Teknik değişiklikler

- `features/accounts/cardDues.ts` (`buildCardDueItems`, `useCardDueItems`), test: `tests/card-dues.cjs`.
- Migration `reminders_card_payment_due` (production'a uygulandı, ekleyici): `reminders.kind`'a `card_payment_due`.
- `send-reminders` v7 (`verify_jwt` açık) — yeni tür için bildirim metni. Eski build'ler yeni türü bildirim listesinde göstermez, kırılmaz.
- OTA komutunda `--environment production` şart: `.env.local`'de RevenueCat anahtarları yok, EAS production ortamında var.

---

## 1.0.7 — Yayında (2026-10-10 gönderildi)

| Platform | Build | Durum | Gönderim |
|---|---|---|---|
| iOS | build 50 | `eas build --platform all --profile production --auto-submit-with-profile alpha` ile alındı (build ID `d5d3a1d6-6ea6-4688-9868-cbcce66edf40`, commit `3f4e3e6`) → TestFlight (submission `962f363f-e14f-41c4-b401-8fe006dac889`). App Store Connect'teki 1.0.6 sürüm kaydı 1.0.7'ye çevrildi, build 50 seçilip **incelemeye gönderildi**. 1.0.6 (build 49) hiç incelemeye gönderilmedi | 2026-10-10 |
| Android | versionCode 15 | aynı komut (build ID `27dc4c38-c0f4-47c5-a812-d6c23eee5b19`) → Play **alpha** (kapalı test) kanalı (submission `c6b84d0d-10a8-4c84-ab95-7405e9914326`); production'a test sonrası terfi | 2026-10-10 |

Finans bütünlüğü ve kullanıcı mesajları paketi (ayrıntı: `docs/17-duzeltme-durumu-2026-10-09.md` "Ek tur"). Önce
test kanallarında doğrulanır, sonra production'a gönderilir.

### Kullanıcıya görünen değişiklikler

- Ödeme / tahsilat / ciro / kart ödemesinde teknik "kontrol" ekranları kalktı; bağlantı koparsa yarım kalan işlem
  otomatik tamamlanır, olmazsa sade "Tekrar dene / İptal et" çıkar. Ham hata metinleri (TLS, fetch…) gösterilmez.
- Kredi kartı borcu en son ekstreye dayanır (ekstre çapası); kart ekranında Güncel borç / Ekstre borcu / Kullanılabilir
  (bekleyen taksitler düşülmüş) ayrı görünür; kart ödeme formu ekstre borcuyla dolar.
- Çek/senetle ödeme tek işlemde yazılır; OCR'dan girilen çekin fazlası avansa yazılır.
- Ödemesi olan kaydın yönü kilitli; kısmen ödenmiş taksit silinemez; toplam ödenenin altına düşürülemez.

### Açık takip maddeleri

- [ ] TestFlight / Play alpha'da doğrula: ciro (bağlantı kesip tekrar), çek ile ödeme (fazla tutar → avans), kart ekstresi
      ekle → kart borcu/ekstre borcu/kullanılabilir, kart borcunu öde, kayıt düzenleme (yön kilidi, taksit silme).
- [ ] Doğrulama sonrası iki platformda production'a gönder; App Store Connect'te 1.0.7 sürümünü oluştur, "Yenilikler" gir.

---

## 1.0.6 — Yayınlanmadı, 1.0.7'ye birleştirildi (2026-10-05)

| Platform | Build | Durum | Gönderim |
|---|---|---|---|
| Android | versionCode 14 | `eas build --platform android --profile production` (build ID `9861fa0a-cfa5-4351-95fb-6285a26a729d`, commit `3c4bccc`), `eas submit` ile doğrudan Play **production** (submission `bafbfda6-1ed5-482c-8c03-2d821812e644`, `releaseStatus: completed`). İlk denemede Play, Meta SDK'nın eklediği `AD_ID` izni Console'daki "reklam kimliği kullanılmıyor" beyanıyla çeliştiği için reddetti; beyan "Evet" (reklam + analiz) yapıldı, Veri güvenliği formu güncellendi. 1.0.2'den beri ilk Android build'i — gerçek cihazda doğrulanmadı. Yeni Play görselleri: `assets/appstore/v3/play/` | 2026-10-09 |
| iOS | build 49 | `eas build --no-wait --auto-submit` ile alındı (build ID `810e16e2-a2ba-4f25-99e3-2e3ef582e89a`, commit `c3313c7`); submission `884cad18-7621-4aca-9a48-daac2a2751c2` planlandı — onboarding yeniden tasarımı ve finans düzeltmelerini içerir. TestFlight'ta doğrulanacak | 2026-10-09 |
| iOS | build 41 | `eas build --no-wait --auto-submit` ile alındı (build ID `c5f5739d-df3e-4edf-92bd-4615524ebe92`, commit `04d41c5`); submission `c5d57b02-ab76-459c-b6bb-822cbf17b8b6` planlandı — TestFlight'ta doğrulanacak | 2026-10-05 |

Yeniden tasarım + yeni özellikler. Native değişiklik içerir (`expo-font` eklentisi, `LSApplicationQueriesSchemes`),
bu yüzden OTA ile gelmez; yeni build ve yeni sürüm numarası gerekir (1.0.5 kapanmadan numara çakışmasın diye 1.0.6).

### Kullanıcıya görünen değişiklikler

`assets/appstore/whats-new-1.0.6.tr.txt` / `.en.txt` içinde.

### Teknik değişiklikler (release notes'a girmez)

- Tasarım: Bricolage Grotesque + IBM Plex Mono, yeni renk token'ları (`design/vademde-redesign/SAPMALAR.md`).
- Migration'lar (production'a uygulandı, hepsi ekleyici): `ai_insights`, `instrument_status` (+ tetikleyiciler, `mark_instrument_bounced`),
  `card_installment_purchases`, `cash_alert_log` (+ `send-cash-alerts` pg_cron işi, 06:00 UTC).
- Edge Function'lar (yeni): `generate-insights`, `ai-ask`, `send-cash-alerts` (hepsi `verify_jwt` açık; Gemini anahtarı mevcut secret).
  Sunucu tarafı olduğundan eski build'lere dokunmaz.
- Yapılmayanlar: ana ekran widget'ları (§5.10; App Group + native hedef gerektirir), rapor ekranı/PDF yeniden düzeni (yalnızca PDF renkleri).

### Açık takip maddeleri

- [ ] TestFlight'ta doğrula: açık/koyu tema, büyük yazı boyutu (Dynamic Type 1.3x), giriş ekranı, ana sayfa, Hızlı ekle, Aboneliklerim, Döviz ve altın.
- [ ] Çek/senet: alınan çek → ciro et → Karşılıksız (borç yeniden açılıyor mu); tahsile ver.
- [ ] Plus hesapla: Akıllı öneriler ve Sor çalışıyor mu (Gemini anahtarı/kota).
- [ ] Nakit uyarısı bildirimi ilk gün 09:00'da geldi mi (`send-cash-alerts` logları).
- [ ] App Store Connect'te 1.0.6 sürümünü oluştur, "Yenilikler" gir.

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

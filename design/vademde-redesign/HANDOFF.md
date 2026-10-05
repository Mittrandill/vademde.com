# Vademde Yeniden Tasarım — Aktarım Rehberi (HANDOFF)

Bu klasör, claude.ai'de hazırlanan yeniden tasarımın **kaynak dosyalarını** içerir. Amaç bu tasarımı
mevcut Expo / React Native projesine **iş mantığını bozmadan** aktarmak ve tasarımda olup projede
olmayan özellikleri eklemektir.

## 0. Klasör yapısı

```
design/vademde-redesign/
  HANDOFF.md            ← bu dosya (tek doğruluk kaynağı)
  CLAUDE_CODE_PROMPT.md ← Claude Code'a verilecek ana komut
  ekranlar/acik/*.html  ← açık tema ekranlar (390 pt genişlik, iPhone)
  ekranlar/koyu/*.html  ← aynı ekranların koyu teması
  pdf/RaporPDF1-3.html  ← rapor PDF çıktısının 3 sayfası (A4, 794×1123 px)
```

- Her `.html` tarayıcıda açılabilir, tek bir ekrandır. Stiller satır içi (inline) yazılmıştır;
  ölçüler px = RN pt kabul edilebilir.
- `<x-dc>`, `<helmet>` gibi etiketler tasarım aracına aittir, yok sayılmalıdır.
- **Ekranlardaki isimler, tutarlar, tarihler ve fiyatlar örnek veridir.** Gerçek veri mevcut
  hook/sorgulardan gelir. `[Ad Soyad]`, `[fiyat]`, `[n]` gibi köşeli parantezler bilinçli boşluktur.

## 1. Renk sistemi ve anlamlar (en önemli kural)

| Rol | Açık | Koyu | Ne için kullanılır |
|---|---|---|---|
| backgroundPrimary (zemin) | `#F1F2F4` | `#1F2126` | Ekran zemini |
| surfacePrimary (yüzey) | `#FFFFFF` | `#2B2D31` | Kartlar, liste grupları, alanlar |
| textPrimary | `#111114` | `#F6F5F1` | Ana metin, ikonlar |
| textSecondary | `#5E606A` | `#B1B2AA` | İkincil metin, etiketler |
| border | `#DCDEE3` | `#3D3F45` | Ayırıcı çizgiler |
| **action** (= brandPrimary) | `#FFB000` | `#FFB000` | Ana butonlar, + butonları, Tara düğmesi, seçili segment/çip, açık anahtar, aktif sekme noktası |
| onAction | `#1F2126` | `#1F2126` | Sarı üzerindeki yazı/ikon |
| **payable** (ödeme bekliyor) | `#5638F0` | `#8B73FF` | Ödenecek tutar çubukları, sıradaki taksit, "Yarın/3 gün" etiketleri, vade hattı üstü |
| payableFill (üzerinde beyaz yazı) | `#5638F1` | `#6B4DFF` | Mor dolgulu etiketler |
| **receivable** (para girişi / doğrulandı) | `#0F7A52` | `#52CE96` | Tahsil edilecek, gelir, "Belgeden okundu" etiketi, vade hattı altı |
| danger (yalnızca gecikme/silme) | `#C8361C` | `#FF625C` | Gecikmiş kayıt, silme |
| attentionMarker | `#B07800` | `#FFB000` | "Kontrol et" kesik çizgisi, okunmamış noktası, eski kur uyarısı (açık temada kontrast için koyu amber) |
| mutedControl | `#83868F` | `#6E7076` | Boş radyo/kutucuk, pasif ok, boş taksit kutusu |

Kurallar:
- Sarı **yalnızca aksiyon** içindir; ödeme anlamı taşımaz. Ödeme bekleyen her şey mor, para girişi yeşil.
- Tutarlar renkle değil işaretle de ayrılır: `−₺` ödenecek/gider (textPrimary), `+₺` tahsil/gelir (receivable).
- Kırmızı yalnızca gecikme ve yıkıcı aksiyon içindir.
- Logodaki sarı/mor çubuklar markaya kilitlidir (bkz. `components/brand/VademdeMark.tsx`), tema token'larından bağımsızdır.
- Kontrast: metinler ≥ 4.5:1, anlam taşıyan grafik/çizgiler ≥ 3:1 (yukarıdaki değerler bunu sağlar).

## 2. Tipografi

- **Bricolage Grotesque** (başlık + gövde) ve **IBM Plex Mono** (tutarlar, tarihler, küçük büyük-harf etiketler).
  İkisi de OFL lisanslı; `expo-font` / `@expo-google-fonts` ile eklenecek.
- Tutarlar her zaman Plex Mono, `fontVariant: ['tabular-nums']`.
- Büyük tutar (hero): 52–60 pt, ağırlık 700, letterSpacing −4%; kuruş kısmı yarı boyutta ve textSecondary.
  **Ölçek kuralı:** tam kısım 7 karakteri aşarsa font `base × 7 / uzunluk` oranında küçülür (tek satır).
- Ekran başlığı 34 pt / 700; bölüm başlığı 22–24 pt / 700; liste başlığı 15–16 pt / 600.
- Etiket: Plex Mono 10–11 pt, büyük harf, letterSpacing 0.08em, textSecondary.

## 3. Ortak bileşenler (önce bunlar yazılmalı)

| Bileşen | Tasarımda görüldüğü yer | Not |
|---|---|---|
| `ScreenHeader` (geri + başlık + sağ aksiyon) | tüm alt ekranlar | 44×44 dokunma alanı |
| `HeroAmount` | ana sayfa, hesaplar, krediler… | ölçek kuralı (bkz. §2) |
| `VadeHattı` (VadeLine) | Main, Onboarding2 | eksenin üstü payable, altı receivable, "bugün" işareti |
| `InstallmentStrip` | Krediler, KrediDetay, KartTaksitleri | ≤24 taksit parçalı; **>24 taksitte** yıl işaretli sürekli çubuk |
| `TypeRow` + `SearchablePicker` sheet | VadeliKayit, YeniHesap, TurSecici, HesapTuruSecici | Tür seçimi **ızgara değil**: tek satır + gruplu, aramalı liste |
| `FormRow` / `InputRow` / `FieldGroup` | tüm formlar | etiket üstte (mono), değer altta |
| `SourceTag` | OcrKontrol, VadeliKayit | "Belgeden / Eşleşti / Önerildi" (receivable), "Kontrol et" (attention, kesik çizgi) |
| `BottomSheet` | OdemeKaydet, KotaDoldu, HizliEkle… | tutamaçlı, karartmalı |
| `DatePickerSheet`, `DateRangeSheet`, `MonthYearSheet`, `DayOfMonthSheet` | Ortak bileşenler satırı | vade noktaları payable renkte |
| `LoadMore`, `ListSkeleton`, `ListEnd`, `ListError`, `Pager`, `MonthStepper` | Sayfalandirma.html | mevcut sayfa boyutu **30** (`docs/06 §10.6.2`) korunmalı |
| `ScrollableTabs` | Hareketler, ÇekPortföyü… | yatay kayar, sağda solma maskesi; sekmeler asla kesilmez |
| `BankLogo` | Bankalar, Hesaplar, Krediler | mevcut `components/finance/BankLogo.tsx` + `assets/bank-icons` |
| `ServiceLogo` | Aboneliklerim | mevcut `features/services` (tasarımdaki harf rozetleri yer tutucudur) |
| `ValueUnitBadge` | Döviz ve altın | mevcut bileşen, `units.ts` renkleri |

## 4. Ekran → kod eşleştirmesi

Tür sütunu: **Mevcut rota** = sadece görsel yenileme (veri mantığına dokunma) ·
**Yeni ekran** = mevcut veriyle yeni görünüm · **Yeni ekran + backend** = §5'teki özellik ·
**Ortak bileşen** · **Kural örneği** = ekran değil, ölçek kurallarının kanıtı.

### 1 · Açılış ve tanıtım

| Tasarım dosyası | Kod karşılığı | Tür |
|---|---|---|
| `ekranlar/acik/Splash.html` | app.json splash + (onboarding) açılış | Mevcut rota — görsel yenileme |
| `ekranlar/acik/Karsilama.html` | app/(onboarding)/welcome.tsx — adım 1 | Mevcut rota — görsel yenileme |
| `ekranlar/acik/Onboarding2.html` | welcome.tsx — adım 2 | Mevcut rota — görsel yenileme |
| `ekranlar/acik/Onboarding3.html` | welcome.tsx — adım 3 | Mevcut rota — görsel yenileme |
| `ekranlar/acik/Onboarding4.html` | welcome.tsx — adım 4 | Mevcut rota — görsel yenileme |

### 1b · Giriş ve güvenlik

| Tasarım dosyası | Kod karşılığı | Tür |
|---|---|---|
| `ekranlar/acik/KayitOl.html` | app/(auth)/sign-up.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/GirisYap.html` | app/(auth)/sign-in.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/SifreSifirla.html` | sign-in.tsx içindeki şifremi unuttum akışı | Mevcut rota — görsel yenileme |
| `ekranlar/acik/YeniSifre.html` | app/reset-password.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/CalismaAlaniKurulum.html` | app/workspace-setup/index.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/UygulamaKilidi.html` | components/auth/AppLockGate.tsx | Mevcut rota — görsel yenileme |

### 2 · Ana sayfa ve hareketler

| Tasarım dosyası | Kod karşılığı | Tür |
|---|---|---|
| `ekranlar/acik/Main.html` | app/(tabs)/index.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/BosAnaSayfa.html` | index.tsx boş durum | Mevcut rota — görsel yenileme |
| `ekranlar/acik/HizliEkle.html` | yeni: components/finance/QuickAddSheet | Yeni ekran — mevcut veriyle |
| `ekranlar/acik/Hareketler.html` | app/(tabs)/hareketler.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/YeniHareket.html` | app/transactions/new.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/HareketDetay.html` | app/transactions/[id].tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/SilOnay.html` | ortak silme onayı sheet | Ortak bileşen |
| `ekranlar/acik/Bildirimler.html` | app/notifications.tsx | Mevcut rota — görsel yenileme |

### 3 · Belge tarama

| Tasarım dosyası | Kod karşılığı | Tür |
|---|---|---|
| `ekranlar/acik/TaramaIzni.html` | tara.tsx — Akıllı Tarama İzni | Mevcut rota — görsel yenileme |
| `ekranlar/acik/Tara.html` | app/(tabs)/tara.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/KarekodOkuma.html` | tara.tsx — karekod modu | Yeni ekran + backend |
| `ekranlar/acik/BelgeIsleniyor.html` | tara.tsx işleniyor durumu | Mevcut rota — görsel yenileme |
| `ekranlar/acik/OcrKontrol.html` | app/documents/[id]/review.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/EslesmeUyari.html` | review.tsx mükerrer uyarısı | Mevcut rota — görsel yenileme |
| `ekranlar/acik/DekontKontrol.html` | app/documents/[id]/receipt.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/BelgeArsivi.html` | app/documents/archive.tsx | Mevcut rota — görsel yenileme |

### 3b · Tarama durumları

| Tasarım dosyası | Kod karşılığı | Tür |
|---|---|---|
| `ekranlar/acik/KotaDoldu.html` | tara.tsx kota doldu sheet | Mevcut rota — görsel yenileme |
| `ekranlar/acik/KameraIzni.html` | tara.tsx kamera izni | Mevcut rota — görsel yenileme |
| `ekranlar/acik/TaramaYardim.html` | tara.tsx "nasıl çalışır" sheet | Mevcut rota — görsel yenileme |

### 4 · Takvim ve vadeli kayıtlar

| Tasarım dosyası | Kod karşılığı | Tür |
|---|---|---|
| `ekranlar/acik/Takvim.html` | app/(tabs)/takvim.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/VadeliKayitlar.html` | app/obligations/index.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/VadeliDetay.html` | app/obligations/[id].tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/VadeliKayit.html` | app/obligations/new.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/VadeliKayitTaksitli.html` | obligations/new.tsx taksitli mod | Mevcut rota — görsel yenileme |
| `ekranlar/acik/TurSecici.html` | ortak SearchablePicker (kayıt türü) | Ortak bileşen |
| `ekranlar/acik/OdemeKaydet.html` | app/payments/new.tsx (sheet olarak) | Mevcut rota — görsel yenileme |
| `ekranlar/acik/NakitUyari.html` | yeni: app/cash-alert/[accountId].tsx | Yeni ekran + backend |

### 5 · Krediler ve kartlar

| Tasarım dosyası | Kod karşılığı | Tür |
|---|---|---|
| `ekranlar/acik/Krediler.html` | app/obligations/index.tsx?type=kredi | Mevcut rota — görsel yenileme |
| `ekranlar/acik/KrediDetay.html` | app/obligations/[id].tsx (kredi) | Mevcut rota — görsel yenileme |
| `ekranlar/acik/KrediKartlari.html` | app/accounts/credit-cards.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/KartDetay.html` | app/accounts/[id].tsx (kart) | Mevcut rota — görsel yenileme |
| `ekranlar/acik/EkstreEkle.html` | accounts/[id].tsx ekstre sheet | Mevcut rota — görsel yenileme |
| `ekranlar/acik/KartOdeme.html` | components/finance/CardPaymentForm | Mevcut rota — görsel yenileme |
| `ekranlar/acik/KartTaksitleri.html` | yeni: app/accounts/[id]/installments.tsx | Yeni ekran + backend |

### 5b · Çek ve senet

| Tasarım dosyası | Kod karşılığı | Tür |
|---|---|---|
| `ekranlar/acik/CekPortfoyu.html` | yeni: app/instruments/index.tsx | Yeni ekran + backend |
| `ekranlar/acik/CekDetay.html` | obligations/[id].tsx (çek/senet) + durum | Yeni ekran + backend |
| `ekranlar/acik/CiroEt.html` | app/payments/new.tsx method=ciro | Mevcut rota — görsel yenileme |

### 6 · Hesaplar ve bankalar

| Tasarım dosyası | Kod karşılığı | Tür |
|---|---|---|
| `ekranlar/acik/Hesaplar.html` | app/accounts/index.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/HesapDetay.html` | app/accounts/[id].tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/Transfer.html` | transactions/new.tsx direction=transfer | Mevcut rota — görsel yenileme |
| `ekranlar/acik/YeniHesap.html` | app/accounts/new.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/YeniHesapKart.html` | accounts/new.tsx kredi kartı | Mevcut rota — görsel yenileme |
| `ekranlar/acik/HesapTuruSecici.html` | ortak SearchablePicker (hesap türü) | Ortak bileşen |
| `ekranlar/acik/Bankalar.html` | app/banks/index.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/BankaDetay.html` | app/banks/[code].tsx | Mevcut rota — görsel yenileme |

### 7 · Döviz ve altın

| Tasarım dosyası | Kod karşılığı | Tür |
|---|---|---|
| `ekranlar/acik/DovizAltin.html` | yeni: app/accounts/value-units.tsx (mevcut veriden görünüm) | Yeni ekran — mevcut veriyle |
| `ekranlar/acik/DovizHesapDetay.html` | accounts/[id].tsx (TRY dışı kasa) | Mevcut rota — görsel yenileme |
| `ekranlar/acik/AltinHesapDetay.html` | accounts/[id].tsx (altın kasa, eski kur) | Mevcut rota — görsel yenileme |
| `ekranlar/acik/BirimSecici.html` | components/finance/ValueUnitPicker | Mevcut rota — görsel yenileme |
| `ekranlar/acik/YeniDovizAltinHesap.html` | accounts/new.tsx nakit + birim | Mevcut rota — görsel yenileme |
| `ekranlar/acik/AltinBorcKayit.html` | obligations/new.tsx birim=çeyrek | Mevcut rota — görsel yenileme |

### 8 · Kişiler ve abonelikler

| Tasarım dosyası | Kod karşılığı | Tür |
|---|---|---|
| `ekranlar/acik/Cariler.html` | app/counterparties/index.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/CariDetay.html` | app/counterparties/[id].tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/YeniKisi.html` | app/counterparties/new.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/Hatirlatma.html` | yeni: cari hatırlatma sheet (WhatsApp/SMS/e-posta) | Yeni ekran — mevcut veriyle |
| `ekranlar/acik/Aboneliklerim.html` | yeni: app/aboneliklerim/index.tsx (document_type=abonelik) | Yeni ekran — mevcut veriyle |
| `ekranlar/acik/AbonelikDetay.html` | obligations/[id].tsx (abonelik) | Mevcut rota — görsel yenileme |
| `ekranlar/acik/AbonelikServisSec.html` | features/services SERVICES picker | Ortak bileşen |
| `ekranlar/acik/YeniAbonelik.html` | obligations/new.tsx abonelik | Mevcut rota — görsel yenileme |

### 9 · Raporlar ve akıllı öneriler

| Tasarım dosyası | Kod karşılığı | Tür |
|---|---|---|
| `ekranlar/acik/Raporlar.html` | app/reports/index.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/RaporDisaAktar.html` | reports export sheet | Mevcut rota — görsel yenileme |
| `ekranlar/acik/AiOneriler.html` | yeni: app/insights/index.tsx | Yeni ekran + backend |
| `ekranlar/acik/AiSohbet.html` | yeni: app/insights/ask.tsx | Yeni ekran + backend |

### 10 · Daha fazla ve ayarlar

| Tasarım dosyası | Kod karşılığı | Tür |
|---|---|---|
| `ekranlar/acik/DahaFazla.html` | app/(tabs)/daha-fazla.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/Ayarlar.html` | app/settings/index.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/Profil.html` | app/profile/index.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/Gorunum.html` | app/settings/appearance.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/Kategoriler.html` | app/categories/index.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/YeniKategori.html` | app/categories/new.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/Widgetlar.html` | yeni: iOS/Android widget hedefleri | Yeni ekran + backend |

### 11 · Ekip, plan ve yasal

| Tasarım dosyası | Kod karşılığı | Tür |
|---|---|---|
| `ekranlar/acik/CalismaAlanlari.html` | app/workspace/index.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/Uyeler.html` | app/workspace/[id]/members.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/CalismaAlaniKatil.html` | app/workspace/join.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/Paywall.html` | app/paywall/index.tsx | Mevcut rota — görsel yenileme |
| `ekranlar/acik/Abonelik.html` | app/subscription/index.tsx (Vademde planı) | Mevcut rota — görsel yenileme |
| `ekranlar/acik/Yasal.html` | app/legal/privacy-policy.tsx + terms-of-service.tsx | Mevcut rota — görsel yenileme |

### 12 · Ortak bileşenler

| Tasarım dosyası | Kod karşılığı | Tür |
|---|---|---|
| `ekranlar/acik/TarihSecici.html` | ortak DatePickerSheet | Ortak bileşen |
| `ekranlar/acik/TarihAraligi.html` | ortak DateRangeSheet | Ortak bileşen |
| `ekranlar/acik/AyYilSecici.html` | ortak MonthYearSheet | Ortak bileşen |
| `ekranlar/acik/AyinGunuSecici.html` | ortak DayOfMonthSheet | Ortak bileşen |
| `ekranlar/acik/Sayfalandirma.html` | ortak LoadMore / Pager / ListEnd | Ortak bileşen |

### 13 · Ölçeklenebilirlik testleri

| Tasarım dosyası | Kod karşılığı | Tür |
|---|---|---|
| `ekranlar/acik/OlcekAnaSayfa.html` | test: uzun tutar/isim kuralları | Kural örneği (ekran değil) |
| `ekranlar/acik/OlcekHesaplar.html` | test: çok hesap kuralları | Kural örneği (ekran değil) |
| `ekranlar/acik/OlcekKrediler.html` | test: 24+ taksit kuralı | Kural örneği (ekran değil) |

## 5. Projede olmayan, eklenecek özellikler

Her biri **ayrı iş/PR** olmalı. Önce mevcut şemayı (`supabase/migrations`, `docs/05-veri-modeli.md`)
incele; aynı işi gören alan zaten varsa onu kullan. Aşağıdaki şema önerileri başlangıç noktasıdır.

### 5.1 Hızlı ekle (UI)
Ana sayfadaki "+" ve Tara uzun basışı → `QuickAddSheet`: Belge tara (öne çıkan), Gider, Gelir, Transfer,
Vadeli borç/alacak, Çek/senet, Ödeme/tahsilat. Yalnızca mevcut rotalara yönlendirir.

### 5.2 Aboneliklerim (mevcut veriyle)
`obligations.document_type = 'abonelik'` + `service_code` zaten var. Yeni liste ekranı: aylık toplam
(TRY dışı olanlar güncel kurla), yaklaşan yenilemeler, deneme bitiyor uyarısı, sıralama sekmeleri.
Logolar `ServiceLogo`. Detayda dolar bazlı aboneliğin aylara göre TL karşılığı (geçmiş ödemelerden).

### 5.3 Döviz ve altın görünümü (mevcut veriyle)
Kod gerçeği: TRY dışı birim yalnızca **nakit/kasa** hesaplarında ve **vadeli kayıtlarda** var; banka
hesapları TRY; döviz alım-satım/kâr-zarar **yok**; transfer tek tutarlı (aynı birim). Ekran bu kurallara
göre tasarlandı: kasalar + birimli borç/alacaklar + `CurrentRatesCard`. TL karşılığı kalıcı saklanmaz,
`ReferenceValueRow` ile hesaplanır; 36 saatten eski kurda uyarı (`STALE_AFTER_MS`).

### 5.4 Çek ve senet portföyü (backend)
- Migration: `obligations.instrument_status text check in ('portfoy','ciro_edildi','tahsile_verildi','tahsil_edildi','karsiliksiz','odendi')`
  (yalnızca `document_type in ('cek','senet')` için dolu), `instrument_status_changed_at timestamptz`.
- Ciro mevcut: `payments/new.tsx` `method='ciro'`, `endorseId`. Ciro kaydı durumu `ciro_edildi` yapmalı.
- "Karşılıksız" işaretlenirse ciroyla kapanan borç yeniden açılır (tasarımdaki not).
- Ekranlar: `CekPortfoyu`, `CekDetay` (yaşam döngüsü zaman çizgisi), `CiroEt`.

### 5.5 Kart taksitli alışverişleri (backend)
- Migration: `card_installment_purchases(id, workspace_id, account_id → accounts (credit_card),
  merchant text, total_minor bigint, currency_code, installment_count int, first_statement_month date,
  created_at)`; ödenen taksit sayısı ekstre eşleşmelerinden türetilir.
- Ekstre tarandığında (`kredi_karti_ekstresi`) taksit satırları bu kayıtlarla eşleştirilir.
- Ekran: `KartTaksitleri` (ekstre başına taksit yükü grafiği + alışveriş listesi).

### 5.6 Nakit uyarısı (backend)
- Migration: `obligations.planned_account_id uuid null references accounts` (hangi hesaptan ödenecek).
- Hesap bazında tahmini bakiye = güncel bakiye − o hesaptan planlanan ödemeler + planlanan tahsilatlar,
  önümüzdeki 30 gün için gün gün.
- `supabase/functions/send-reminders` içine: 14 gün içinde sıfırın altına inen hesap için bildirim.
- Ekran: `NakitUyari` (grafik + çıkacaklar + öneriler: transfer, ödeme hesabını değiştir, hatırlat).

### 5.7 Akıllı öneriler ve soru-cevap (backend, Plus)
- Migration: `ai_insights(id, workspace_id, kind text, title, body, impact_minor bigint null,
  action_route text, source jsonb, status text check in ('new','dismissed','applied'), generated_at)`.
- Edge function `generate-insights`: **önce deterministik kurallar** (çift abonelik, artan kategori,
  nakit riski, kur etkisi), sonra yalnızca metni LLM ile üret (mevcut `process-document` ile aynı
  sağlayıcı/anahtar). Rakamlar her zaman sorgudan gelir, LLM'den gelmez.
- Edge function `ai-ask`: kullanıcının sorusunu sınırlı, salt-okunur sorgu araçlarıyla yanıtla; yanıtta
  "Kaynak: N hareket" bağlantısı. Çalışma alanı RLS'i korunmalı.
- KVKK: "Akıllı Tarama İzni" ile aynı tipte ayrı bir onay. Yasal uyarı: "yatırım tavsiyesi değildir".
- Ekranlar: `AiOneriler`, `AiSohbet`, ana sayfa ve raporlardaki öneri kartları. Plan kapısı: Plus.

### 5.8 e-Arşiv / e-Fatura karekod okuma (istemci)
- `expo-camera` zaten bağımlılık; `barcodeScannerSettings: { barcodeTypes: ['qr'] }`.
- GİB e-Arşiv/e-Fatura karekodu JSON içerir (VKN/TCKN, tarih, belge no, ETTN, ödenecek tutar vb.);
  alan adlarını GİB teknik kılavuzundan doğrula. Karekod okunursa **OCR çağrılmaz, kota düşmez**;
  sonuç doğrudan `documents/[id]/review` akışına gider.

### 5.9 Alacak hatırlatma (istemci)
`Linking.openURL('whatsapp://send?phone=…&text=…')` (yoksa `https://wa.me/…`), SMS, e-posta.
Hesap özeti PDF'i `expo-print` + `expo-sharing` (zaten bağımlılık). Ton seçenekleri şablon metindir.

### 5.10 Ana ekran widget'ları (native)
iOS WidgetKit (ör. `expo-apple-targets`) + Android (`react-native-android-widget`). Uygulama,
paylaşılan depoya (App Group / SharedPreferences) "sıradaki vade, 7 günlük özet" anlık görüntüsü yazar.
En son yapılmalı.

### 5.11 Raporlar ve PDF
- Raporlar: dönem segmenti + özel aralık (`DateRangeSheet`), bölüm atlama çipleri, KPI'larda önceki döneme
  göre değişim, kişi/firma dağılımı, nakit akışı çizgisi, akıllı özet kartı.
- Dışa aktarma sheet'i: dönem, biçim (PDF/CSV), bölüm seçimi; ücretsiz planda yalnızca bu ay (mevcut kural).
- `features/reports/pdf.ts`: `pdf/RaporPDF1-3.html` yapısı — 1) özet + öne çıkanlar + 6 ay + kategori,
  2) borç/alacak + 30 gün + nakit akışı, 3) kişi/firma + hesaplar + döviz/altın + gecikmiş. Üst bilgi resmi
  yatay logo, alt bilgi sayfa numarası.

## 6. Uygulama sırası (önerilen)

1. **Temel:** fontlar, `theme/colors.ts` (§1), tipografi; `docs/08-tasarim-sistemi.md` güncellemesi.
2. **Ortak bileşenler** (§3).
3. **Sekmeler:** Ana sayfa, Hareketler, Tara, Takvim, Daha fazla.
4. **Mevcut alt ekranlar**, §4 tablosundaki bölüm sırasıyla.
5. **Mevcut veriyle yeni ekranlar:** Hızlı ekle, Aboneliklerim, Döviz ve altın, Tanıtım (4 adım).
6. **Backend gerektirenler:** 5.4 → 5.5 → 5.6 → 5.8 → 5.9 → 5.7 → 5.10.

## 7. Kabul kriterleri (her ekran için)

- Açık **ve** koyu tema `ekranlar/acik` ve `ekranlar/koyu` ile görsel olarak eşleşiyor.
- Mevcut veri hook'ları, mutasyonlar, doğrulamalar ve plan kısıtları **değişmedi**.
- Dokunma alanları ≥ 44 pt; Dynamic Type'ta düzen kırılmıyor; uzun isimler tek satırda üç noktayla kesiliyor.
- Uzun tutar, çok kayıt ve 24+ taksit için §2 ve §3'teki ölçek kuralları uygulanıyor (Ölçek ekranları).
- `npm run typecheck` ve `npm run lint` temiz; değişen ekranlar için mevcut testler geçiyor.

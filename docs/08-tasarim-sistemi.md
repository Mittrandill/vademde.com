# Frontend ve Tasarım Sistemi

> Kaynak: Vademde_PRD_v1.3.pdf, Bölüm 12 (s. 16-22)
> Bu dosya "Graphite Finance" tasarım sistemini tanımlar: renk/tipografi/spacing tokenları, ikonografi, widget sistemi, mikro etkileşim, erişilebilirlik, bileşen katmanları ve kalite kapısı.
>
> **Bu bölüm bağlayıcıdır** — bkz. altta "Bağlayıcı tasarım ilkesi".

*Vademde'nin "hazır AI şablonu" değil, tasarım stüdyosu üretimi gibi görünmesini sağlayan bağlayıcı gereksinimler*

> Tasarım yönü referansları: grafit yüzeyler, modüler finans widget'ları, editoryal tipografi ve kontrollü vurgu renkleri.

## 12.1 Tasarım vizyonu

Vademde ilk açıldığında finansal olarak güvenilir, tasarım stüdyosu tarafından özenle hazırlanmış ve karmaşık belge süreçlerini kolaylaştıran modern bir araç algısı oluşturmalıdır. Arayüz premium ancak soğuk olmayan; koyu ancak boğucu olmayan; renkli ancak oyuncak gibi görünmeyen bir yapıda olacaktır.

> **Editorial finance meets intelligent document management.**

## 12.2 Görsel yön: Graphite Finance

| Katman | Rol |
|---|---|
| Graphite | Koyu, sıcak alt tonlu, güvenilir temel yüzeyler |
| Saffron | Ana aksiyon, tarama, seçili durum ve yakın vade |
| Violet Data | Analiz, bütçe ve veri görselleştirme |
| Aqua / Success / Danger | Tahsilat, bilgi, tamamlanma ve kritik uyarılar |

## 12.3 Tasarımdan alınacak özellikler

- Büyük ve güçlü sayısal tipografi
- Katmanlı koyu yüzeyler
- Modüler dashboard widget'ları
- Yatay kaydırılabilir finans kartları
- Yumuşak köşeler ve kontrollü boşluklar
- İnce geometrik arka plan çizgileri
- Kart içinde mikro grafikler
- Özgün onboarding illüstrasyonları
- Özel çek, senet, kredi ve OCR ikon ailesi

## 12.4 Kaçınılacak tasarım kalıpları

- Her kartta farklı gradient
- Aşırı neon ve cam efekti
- Hazır emoji veya uyumsuz 3D ikonlar
- Her şeyi kart içine alma
- Çok yoğun gölge
- Standart mavi banka uygulaması teması
- Robot avatar, sihirli değnek ve "AI Magic" dili
- Aynı ekranda üçten fazla vurgu rengi
- Kullanıcının parasından daha fazla dikkat çeken dekorasyon

## 12.5 Tema ve renk sistemi

> Yeniden tasarım (2026-10): kaynak `design/vademde-redesign/HANDOFF.md` §1. Token'lar `theme/colors.ts` içindedir; ekranlarda sabit renk yazılmaz.

| Token | Açık | Koyu | Kullanım |
|---|---|---|---|
| backgroundPrimary | #F1F2F4 | #1F2126 | Ekran zemini |
| surfacePrimary | #FFFFFF | #2B2D31 | Kartlar, liste grupları, alanlar |
| surfaceElevated | #FFFFFF | #393B3F | Modal / yükseltilmiş yüzey |
| textPrimary | #111114 | #F6F5F1 | Ana metin, ikonlar |
| textSecondary | #5E606A | #B1B2AA | İkincil metin, etiketler |
| border | #DCDEE3 | #3D3F45 | Ayırıcı çizgiler |
| action (= brandPrimary) | #FFB000 | #FFB000 | Ana buton, +, Tara, seçili segment/çip, açık anahtar, aktif sekme noktası |
| onAction (= brandPrimaryText) | #1F2126 | #1F2126 | Sarı üzerindeki yazı/ikon |
| payable | #5638F0 | #8B73FF | Ödeme bekleyen: ödenecek çubukları, sıradaki taksit, "Yarın/3 gün" etiketleri |
| payableFill | #5638F1 | #6B4DFF | Mor dolgulu etiketler (üzerinde beyaz yazı) |
| receivable (= success) | #0F7A52 | #52CE96 | Tahsil, gelir, "Belgeden okundu" |
| danger | #C8361C | #FF625C | Yalnızca gecikme ve silme |
| attentionMarker | #B07800 | #FFB000 | "Kontrol et" kesik çizgisi, okunmamış noktası, eski kur uyarısı |
| mutedControl | #83868F | #6E7076 | Boş radyo/kutucuk, pasif ok, boş taksit kutusu |
| accentViolet | #6B4DFF | #6B4DFF | Yalnızca marka (logo çubukları, illüstrasyon); ödeme anlamı taşımaz |

Kurallar:

- Sarı yalnızca aksiyon içindir; ödeme bekleyen her şey mor (payable), para girişi yeşildir (receivable).
- Tutarlar renkle birlikte işaretle de ayrılır: `−₺` ödenecek/gider (textPrimary), `+₺` tahsil/gelir (receivable).
- Kırmızı yalnızca gecikme ve yıkıcı aksiyon içindir.
- Logodaki sarı/mor çubuklar markaya kilitlidir (`components/brand/VademdeMark.tsx`), tema değişse de sabit kalır.
- Kontrast: metinler ≥ 4.5:1, anlam taşıyan grafik/çizgiler ≥ 3:1.
- Uygulama cihaz temasını varsayılan alır; Ayarlar'dan açık/koyu seçilebilir.

## 12.6 Tipografi

Yazı tipleri: **Bricolage Grotesque** (başlık + gövde) ve **IBM Plex Mono** (tutarlar, tarihler, küçük büyük-harf etiketler); ikisi de OFL lisanslıdır ve `@expo-google-fonts/*` ile yüklenir (`app/_layout.tsx`). React Native'de özel fontlarda `fontWeight` aileyi seçmediği için `components/primitives/Text.tsx` ağırlığı ilgili aileye çevirir (`theme/typography.ts` → `resolveFontFamily`). Plex Mono 400/500/600 yüklüdür; 700 istenirse 600'e düşer.

| Token | Yazı tipi / boyut / ağırlık | Kullanım |
|---|---|---|
| displayBalance | Plex Mono 56 / 700, −4% | Ana bakiye, toplam borç/alacak (hero) |
| displayAmount | Plex Mono 34 / 700, −4% | Detay ekranı tutarı |
| pageTitle | Bricolage 34 / 700 | Ekran başlığı |
| sectionTitle | Bricolage 24 / 700 | Bölüm başlığı |
| cardTitle | Bricolage 16 / 600 | Liste ve widget başlığı |
| body | Bricolage 16 / 400 | Ana okunabilir metin |
| caption | Bricolage 13 / 400 | İkincil bilgi ve grafik etiketi |
| label | Plex Mono 11 / 500, büyük harf, 0.08em | Küçük etiketler (textSecondary) |

- Tutarlar ve tarihler her zaman Plex Mono + `tabular-nums` (`<Text tabular>`).
- Hero tutarda kuruş kısmı yarı boyutta ve textSecondary'dir. **Ölçek kuralı:** tam kısım 7 karakteri aşarsa font `base × 7 / uzunluk` oranında küçülür (tek satır).
- Para biçimi Türkçe yerelleştirilir: `185.000,00 TL` / `₺185.000,00`. Kullanıcı kuruşları gizleyebilir. IBAN ve belge numarası gibi alanlarda Plex Mono (`<Text mono>`) kullanılır.
- Dynamic Type üst sınırı `MAX_FONT_SCALE` = 1.3.

## 12.7 Spacing, grid ve radius

| Sistem | Değer |
|---|---|
| Ekran kenarı | 20 pt standart; 16 pt dar içerik |
| Spacing tabanı | 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 |
| Standart widget radius | 20 pt |
| Hero widget radius | 28-32 pt |
| Input radius | 14-16 pt |
| Dokunma alanı | En az 44 x 44 pt |
| Birincil buton | 54-56 pt yükseklik |

## 12.8 Yüzey ve arka plan

Koyu temada kartlar yoğun gölgeyle değil, yüzey tonuyla; açık temada beyaz yüzey ve ince `border` çizgisiyle ayrılır. İnce daire yayları, zaman çizgileri ve düşük opaklıklı geometrik öğeler yalnızca onboarding, boş durum ve hero kartlarında kullanılır; finans verisinin okunabilirliğini bozamaz.

## 12.9 İkonografi ve illüstrasyon

- Yuvarlak uçlu çizgisel ikonlar
- Kredi, kart, çek, senet, fatura, dekont, vergi ve OCR için özel ikonlar
- Çek ve senette aynı genel belge ikonunun kullanılmaması
- İllüstrasyonlarda monokrom karakterler ve 1-2 vurgu rengi
- Hazır stok paketlerinin karıştırılmaması

## 12.10 Alt navigasyon

Ana Sayfa, Hareketler, Tara, Takvim ve Raporlar sekmelerinden oluşur. Ortadaki Tara aksiyonu Saffron vurgulu, hafif yükseltilmiş fakat içeriği kapatmayan özel bir bileşen olarak tasarlanır. Navigasyon ekran kenarlarından içeride, yüksek radiuslu grafit bir yüzey olabilir.

## 12.11 Ana sayfa widget sistemi

| Widget | İçerik |
|---|---|
| Bakiye Hero | Toplam durum, dönem, değişim, gizleme ve mini nakit akışı |
| Borç / Alacak kartları | Kalan tutar, kayıt sayısı ve en yakın vade |
| Yaklaşan Vadeler | 7/30 gün filtresi, tür ikonu, kalan gün ve tutar |
| OCR Kontrol Kuyruğu | Belge thumbnail'ları, düşük güvenli alan ve kontrol aksiyonu |
| Kredi Kartı Ödeme | Dönem borcu, son ödeme, asgari ödeme ve durum |
| Aylık Bütçe | Kontrollü renk ailesinde kategori kartları |
| Gelir-Gider Analizi | Net fark ve anlamlı mikro grafik |
| Son Hareketler | Belge kaynağı, kişi/kurum, tarih ve tutar |

## 12.12 Belge tarama deneyimi

- Kenardan kenara kamera
- Canlı belge kenarı algılama
- Kamera, galeri, Dosyalar ve çoklu sayfa
- Flaş ve otomatik çekim
- "Biraz yaklaşın", "Parlamayı azaltın" gibi canlı yönlendirmeler
- Klişe lazer çizgisi yerine kenar tamamlama ve alan vurgusu
- Çekim sonrası belgenin karta dönüşmesi

## 12.13 OCR işleniyor ekranı

1. Belge hazırlanıyor
2. Belge türü belirleniyor
3. Tutar ve tarihler okunuyor
4. Finans kaydı hazırlanıyor

Kullanıcı yalnızca spinner görmemelidir. Belge thumbnail'ı, ilerleme halkası ve bulunan alanların kısa önizlemesi gösterilir. İşlem uzarsa kullanıcı ayrılabilir; sonuç uygulama içi bildirimle duyurulur.

## 12.14 OCR sonuç kontrol ekranı

Belge önizlemesi ile çıkarılan form alanları görsel olarak ilişkilendirilir. Kullanıcı "Tutar" alanına dokunduğunda belgedeki kaynak bölge vurgulanır. Yüksek güven teknik yüzdeyle kullanıcıyı yormaz; orta/düşük güven alanları açıkça işaretlenir.

## 12.15 Kredi, çek, senet ve kart widget'ları

- Kredi kartı: dönem borcu, son ödeme, asgari ödeme, kalan gün ve ilerleme
- Çek: banka, çek no, taraf, tutar, vade, yön ve belge thumbnail'ı
- Senet: borçlu, alacaklı, tutar, vade ve durum
- Kredi: kalan borç, ödenen, toplam geri ödeme ve taksit zaman çizgisi

## 12.16 Formlar ve butonlar

- Formlar aşamalı bilgi gösterir.
- Tutar alanı büyük ve otomatik odaklıdır.
- OCR alanlarında "Belgeden okundu / Düzenlendi" etiketi bulunur.
- Birincil buton Saffron, koyu metinli ve 54-56 pt yüksekliğindedir.
- Yükleme sırasında buton boyutu değişmez.
- Silme gibi kritik işlemler kontrollü danger stili ve açık onay kullanır.

### 12.16.1 Büyüyebilecek liste alanları — aranabilir seçici

> Bu kural sonradan eklendi (2026-07-28) — ölçeklenebilirlik için bağlayıcıdır.

- Hesap, kategori, kişi/firma gibi **kullanıcı zamanla çoğaltabileceği** liste alanları yatay kaydırmalı pill listesiyle değil, **yazarak arama + ikonlu tam ekran seçici** (`SearchablePicker`) ile sunulur. Liste 5-10 öğeyi geçtiğinde pill listesi kullanılamaz hale gelir; arama alanı her zaman ölçeklenir.
- Her öğenin yanında ilgili bir ikon bulunur (kategori: harcama/gelir türüne uygun ikon; hesap: kasa/banka/cüzdan ikonu); ikon, öğeyi taramada hızlı tanımayı sağlar.
- Seçilen değer kalıcıdır ve sonraki kayıtlarda aynı listeden tekrar seçilebilir — kategori/hesap/kişi bir kere oluşturulur, sınırsız kayıtta yeniden kullanılır.
- **Sabit ve küçük** seçenek kümeleri (yön: Gelir/Gider/Transfer; hesap türü: Kasa/Banka/Cüzdan gibi büyümeyecek 2-4 seçenekli alanlar) bu kuralın dışındadır; onlar segmented pill kontrolü olarak kalır.

## 12.17 Mikro etkileşim ve haptik

| Alan | Kural |
|---|---|
| Küçük durum değişimi | 120-180 ms |
| Ekran geçişi | 220-320 ms |
| Grafik girişleri | 300-500 ms |
| Haptik | Belge algılama, çekim, kaydetme, ödeme tamamlama |
| Reduce Motion | Ağır animasyonlar kapatılır |
| Kaçınılanlar | Konfeti, sürekli titreşim, yoğun parallax ve her kartta büyük animasyon |

## 12.18 Loading, empty, error ve offline durumları

- Tam ekran boş spinner yerine skeleton ve bağlamsal durum
- Boş ekranda özgün illüstrasyon, açıklama ve net aksiyon
- Teknik hata kodu yerine çözüm sunan mesaj
- Çevrimdışı kayıt için "Bağlantı geldiğinde eşitlenecek" etiketi
- OCR başarısız olursa belgeyi kaybetmeden manuel forma geçiş

## 12.19 Erişilebilirlik ve gizlilik

- Dynamic Type ve VoiceOver
- Minimum 44 pt dokunma alanı
- Renk dışında ikon ve metinle durum
- Grafiklerin metinsel özeti
- Tutar gizleme aktifken VoiceOver'ın tutarı okumaması
- App switcher bulanıklığı
- IBAN ve kart numarası maskeleme
- Belge paylaşımından önce hassas alan gizleme

## 12.20 Frontend bileşen katmanları

| Katman | Bileşenler |
|---|---|
| Design Tokens | Renk, tipografi, spacing, radius, gölge, animasyon |
| Primitives | Text, View, Stack, Row, Pressable, Divider |
| Form Components | Amount, Date, Select, Search, File/Image Picker |
| Feedback | Toast, Banner, Error, Skeleton, Empty, Offline |
| Finance | BalanceHero, DebtCard, ChequeCard, PaymentProgress, Charts |
| OCR | Scanner, Thumbnail, Confidence, ExtractedField, BoundingBox |
| Templates | Dashboard, List, Detail, Form, Report, Scanner, Review |

## 12.21 Figma teslim gereksinimleri

- Foundations: renk değişkenleri, tema, tipografi, spacing, grid ve radius
- Components ve tüm state varyantları
- En az 20 yüksek çözünürlüklü ekran
- Onboarding, belge tara, OCR kontrol, manuel çek, kısmi ödeme ve rapor akışlarının tıklanabilir prototipi
- Wireframe → görsel yön → erişilebilirlik → geliştirici teslim → kod karşılaştırması süreci

## 12.22 Frontend kalite kapısı

- Ana ekranlar açık ve koyu temada çalışır.
- Sabit renkler ekran bileşenlerine gömülmez.
- Küçük ve büyük iPhone ekranlarında düzen bozulmaz.
- Türkçe uzun isimler taşma oluşturmaz.
- Bütün listelerde loading, empty ve error durumu vardır.
- OCR sonucu belge ile alanı ilişkilendirir.
- Düşük güvenli alanlar görsel olarak ayrılır.
- Form taslağı ekran kapanınca kaybolmaz.
- Ana ekrandan en fazla iki dokunuşla tarama açılır.
- Bir borç en fazla üç temel etkileşimle ödendi işaretlenir.
- Kodlanan ekran Figma ile görsel kalite kontrolünden geçer.

> **Bağlayıcı tasarım ilkesi**
> Bu bölüm bir "görsel öneri" değildir. Hazır dashboard şablonunun renklerini değiştirmek, ekranları kod sırasında rastgele tasarlamak veya her modülü farklı görsel dille üretmek ürün gereksinimine aykırıdır.

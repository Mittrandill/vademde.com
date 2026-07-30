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

| Token | Koyu tema | Kullanım |
|---|---|---|
| background-primary | #101110 | Ana zemin |
| surface-primary | #1B1C1B | Standart widget |
| surface-elevated | #292A29 | Etkileşimli kart / modal |
| text-primary | #F5F5F0 | Ana metin |
| text-secondary | #B1B2AA | İkincil metin |
| brand-primary | #F3C64E | Belge Tara ve ana aksiyon |
| accent-violet | #8068F4 | Analiz ve bütçe |
| accent-aqua | #86DDEB | Tahsilat ve ikincil veri |
| success | #52CE96 | Ödendi/tahsil edildi |
| danger | #FF625C | Gecikme ve kritik hata |

Açık temada ana zemin `#F1F1EE`, yüzey `#FAFAF7`, yükseltilmiş yüzey `#FFFFFF`, ana metin `#181917` olarak kullanılır. Uygulama cihaz temasını varsayılan alır; marka tanıtımlarında koyu tema kullanılır.

## 12.6 Tipografi

| Stil | Boyut | Kullanım |
|---|---|---|
| Display Balance | 42-48 pt | Ana bakiye, toplam borç/alacak |
| Display Amount | 32-36 pt | Detay ekranı tutarı |
| Page Title | 28-32 pt | Sayfa başlığı |
| Section Title | 20-22 pt | Bölüm başlığı |
| Card Title | 16-18 pt | Widget başlığı |
| Body | 16-17 pt | Ana okunabilir metin |
| Caption | 12-13 pt | İkincil bilgi ve grafik etiketi |

iOS sistem fontu ve tabular numbers kullanılmalıdır. Para biçimi Türkçe yerelleştirilir: `185.000,00 TL`. Kullanıcı kuruşları gizleyebilir. IBAN ve belge numarası gibi alanlarda monospaced görünüm kullanılabilir.

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

Koyu temada kartlar yoğun gölgeyle değil, yüzey tonuyla ayrılır. İnce daire yayları, zaman çizgileri ve düşük opaklıklı geometrik öğeler yalnızca onboarding, boş durum ve hero kartlarında kullanılır; finans verisinin okunabilirliğini bozamaz.

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

# Ürün Kapsamı ve Özellik Öncelikleri

> Kaynak: Vademde_PRD_v1.3.pdf, Bölüm 4 (s. 6-7)
> Bu dosya MVP (P0), ilk güncelleme (P1), ileri sürüm (P2) ve MVP dışı kalan özellikleri tanımlar.

## 4.1 P0 - MVP zorunlu

- Apple ve e-posta ile giriş
- Kişisel/işletme çalışma alanı
- Gelir, gider, borç, alacak ve transfer
- Kredi, kredi kartı, çek, senet ve fatura kayıtları
- Taksitli kayıtlar ve düzenli işlemler
- Kısmi ödeme ve tahsilat
- Kasa ve banka hesapları
- Kişi, müşteri ve tedarikçi yönetimi
- Vade takvimi ve bildirimler
- Temel raporlar, PDF ve CSV dışa aktarma
- Kamera, galeri ve PDF ile belge alma
- Görüntü kalite kontrolü ve temel cihaz OCR'ı
- Gemini ile belge sınıflandırma ve yapılandırılmış alan çıkarımı
- OCR sonuç kontrol ekranı ve kullanıcı doğrulaması
- Mükerrer belge kontrolü
- Çevrimdışı taslak ve eşitleme kuyruğu
- Hesap ve veri silme

## 4.2 P1 - İlk güncellemeler

- Excel içe aktarma
- Cari hesap ekstresi
- Kira sözleşmesi okuma
- Vergi ve SGK belgesi okuma
- Ekstre harcamalarını otomatik kategorize etme
- Toplu belge tarama
- Paylaş menüsünden belge aktarma
- Face ID kilidi
- Ana ekran widget'ı
- Birden fazla değer birimi (para birimi ve kıymetli maden)
  - Döviz cinsinden borç/alacak takibi (USD, EUR)
  - Altın cinsinden borç/alacak takibi: gram altın, çeyrek altın, yarım altın, tam/ata altın, cumhuriyet altını
  - Canlı kur/altın fiyatıyla güncel TL karşılığı gösterimi (referans değer, kayıt tutarının kendisi değil)
- İşletme ekip üyeleri ve roller
- Değişiklik günlüğü

> Not: Altın/döviz kayıtları için OCR ile otomatik belge okuma (ör. bir altın alacak senedinin taranması) bu kapsamda yer almaz — P1'de kullanıcı bu kayıtları manuel girer veya mevcut belge türleri (senet, sözleşme/ödeme planı) üzerinden değer birimini seçerek OCR sonucunu düzenler. OCR şemasının kıymetli maden miktarlarını yapılandırılmış şekilde çıkarması ayrı bir P1/P2 iş kalemi olarak `docs/04-ocr-belge-isleme.md`'ye sonradan eklenecektir.

## 4.3 P2 - İleri sürümler

- E-posta eklerinden otomatik belge önerisi
- Banka bildirimlerinden kayıt önerisi
- Yapay zekâ destekli aylık finans özeti
- Nakit akışı riski ve olağan dışı harcama uyarıları
- Belge sahteciliği veya tutarsızlık uyarıları
- Şirket bazlı özel OCR şablonları
- Siri Kısayolları ve gelişmiş otomasyonlar

## 4.4 MVP dışında

- Banka hesabına doğrudan bağlantı
- Uygulama üzerinden para gönderme veya tahsilat alma
- POS sistemi
- e-Fatura kesme
- Resmî muhasebe ve vergi danışmanlığı
- Stok yönetimi
- Bordro ve personel yönetimi (İK): puantaj, izin, kıdem/ihbar hesabı, SGK bildirimi ve resmî bordro üretimi. **Kapsam içinde olan:** personelin cari olarak tanımlanması (`counterparties.type = 'personel'`) ve maaş ödemesinin tekrarlayan bir finansal kayıt olarak izlenmesi (`document_type = 'maas'`) — yani ödemenin takibi, hesaplanması değil.
- Yatırım veya kripto portföyü
- Kredi başvurusu veya finans ürünü satışı

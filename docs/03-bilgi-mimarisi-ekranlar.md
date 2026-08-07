# Bilgi Mimarisi ve Ekranlar

> Kaynak: Vademde_PRD_v1.3.pdf, Bölüm 5 (s. 7-9)
> Bu dosya ana navigasyonu, onboarding akışını ve her ekranın içeriğini tanımlar.

## 5.1 Ana navigasyon

| Sekme | Amaç |
|---|---|
| Ana Sayfa | Finans özeti, yaklaşan vadeler, OCR kontrol kuyruğu ve hızlı işlemler |
| Hareketler | Tüm gerçekleşmiş ve planlanan finans kayıtları |
| Tara | Kamera, galeri veya PDF ile akıllı belge girişi |
| Takvim | Borç, alacak, fatura ve taksit vadeleri |
| Raporlar | Gelir-gider, borç-alacak, nakit akışı ve dışa aktarma |

## 5.2 Onboarding ve çalışma alanı

- Üç kısa değer önerisi ekranı
- Apple ile devam et ve e-posta ile giriş
- "Kişisel / İşletme / Her ikisi" seçimi
- Çalışma alanı adı, ana para birimi ve isteğe bağlı başlangıç bakiyesi (ana para birimi = `workspaces.default_value_unit_code`; yalnızca varsayılan öneri ve rapor referans birimidir, tekil kayıtların kendi değer birimini kısıtlamaz — bkz. `docs/05-veri-modeli.md` §9.4.3)
- İlk vadeli kayıt sonrasında bağlamsal bildirim izni

## 5.3 Ana sayfa

- Çalışma alanı seçici ve gizlenebilir toplam durum
- Bu ay gelir, gider ve net durum
- Toplam borç ve alacak
- Bugün, 7 gün ve 30 gün vadeleri
- Kontrol bekleyen OCR belgeleri
- Nakit akışı grafiği
- Kredi kartı ödeme günü widget'ı
- Son hareketler ve hızlı tarama

## 5.4 Hareketler

Tümü, gelir, gider, borç, alacak ve transfer sekmeleri; tarih, durum, kategori, hesap, kişi/firma, belge türü ve tutar filtreleri bulunur. Liste satırında başlık, karşı taraf, belge/kategori, tarih/vade, hesap, tutar ve durum rozeti gösterilir.

## 5.5 Manuel giriş

Manuel giriş her zaman erişilebilir olacaktır. Form, seçilen kayıt türüne göre dinamikleşir. İlk görünümde yalnızca başlık, tutar, tarih/vade, kişi/firma ve hesap gösterilir; diğer alanlar "Diğer bilgiler" altında açılır.

## 5.6 Borç ve alacak detayı

- Toplam, ödenen/tahsil edilen ve kalan tutar
- İlerleme göstergesi ve gecikme bilgisi
- Taksit listesi
- Ödeme/tahsilat geçmişi
- İlgili kişi/firma
- Orijinal belge ve çıkarılan alanlar
- Kısmi ödeme, vade değişikliği, hatırlatma ve düzenleme aksiyonları

## 5.7 Kişiler ve firmalar

Kişi, müşteri, tedarikçi ve diğer türleri desteklenir. Detay ekranında toplam alacak, toplam borç, geciken tutar, son işlemler, belge geçmişi ve PDF hesap özeti bulunur.

## 5.8 Hesaplar ve transfer

Nakit, banka hesabı, dijital cüzdan ve diğer hesap türleri desteklenir. Hesaplar arası transfer gelir veya gider değildir ve çalışma alanı toplam varlığını değiştirmez.

## 5.9 Takvim

Ay, hafta ve zaman çizgisi görünümleri sunulur. Her gün için ödenecek toplam, tahsil edilecek toplam ve net günlük beklenti gösterilir. Çek ve senet vadeleri zaman çizgisinde güçlü biçimde öne çıkarılır.

## 5.10 Raporlar

- Gelir-gider özeti
- Borç-alacak özeti
- Kategori bazlı harcamalar
- Kişi/firma bazlı hareketler
- Hesap bakiyeleri
- Gecikmiş ödemeler
- Beklenen nakit akışı
- Aylık karşılaştırma
- PDF ve CSV çıktısı

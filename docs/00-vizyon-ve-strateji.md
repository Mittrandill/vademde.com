# Vizyon ve Strateji

> Kaynak: Vademde_PRD_v1.3.pdf, Bölüm 1-2 (s. 3-5)
> Bu dosya Vademde'nin ne çözdüğünü, nasıl konumlandığını, hedef kullanıcılarını ve çalışma alanı modelini tanımlar.

## 1. Ürün Stratejisi ve Vizyon

*Vademde'nin neyi çözdüğü, nasıl konumlandığı ve neden farklı olduğu*

> **Belgeni tara. Vademde kaydını hazırlasın.**

### 1.1 Ürün özeti

Vademde; çek, senet, kredi ödeme planı, kredi kartı ekstresi, fatura, dekont, makbuz ve benzeri finansal belgeleri kamera, fotoğraf veya PDF üzerinden okuyarak borç, alacak, gelir, gider ve vade kayıtları hazırlayan iOS finans yönetimi uygulamasıdır.

Uygulama aynı zamanda manuel finans takibi, taksit yönetimi, kısmi ödeme ve tahsilat, hesap bakiyeleri, kişi/firma bazlı cari görünüm, takvim, bildirim ve raporlama özellikleri sunar.

> **Ürün konumlandırması**
> Vademde bir banka, ödeme kuruluşu, resmî muhasebe veya vergi uygulaması değildir. Kullanıcının finansal belgelerini ve yaklaşan yükümlülüklerini anlaşılır, doğrulanabilir ve zamanında yönetmesini sağlayan bir finans takip ürünüdür.

### 1.2 Vizyon

Türkiye'de bireylerin ve küçük işletmelerin ne kadar borcu olduğunu, kimden ne kadar alacağı bulunduğunu, hangi ödemenin ne zaman geleceğini ve gelecekteki nakit durumunu tek bakışta anlayabildiği en sade ve güvenilir finans takip uygulaması olmak.

### 1.3 Marka vaadi

- Borçların, alacakların ve bütçen hep Vademde.
- Vadesi gelmeden haberin olsun.
- Ne ödeyeceğini, ne alacağını bil.
- Belgeyi yükle; alanları tek tek yazma.

### 1.4 Temel problemler

- Ödeme tarihleri telefon notlarında, mesajlarda, Excel dosyalarında ve kâğıt defterlerde dağınık kalıyor.
- Çek, senet, kredi planı ve kart ekstresi gibi belgelerdeki bilgiler tek tek elle giriliyor.
- Kısmi ödeme ve tahsilatlar ana borç/alacak kaydıyla sağlıklı ilişkilendirilemiyor.
- Kişisel ve işletme parası birbirine karışıyor.
- Gelecek 7, 30 veya 90 gündeki nakit ihtiyacı öngörülemiyor.
- Belge ile finansal kayıt arasındaki bağ kayboluyor; işlem geçmişi doğrulanamıyor.
- Kullanıcı toplam borcu, toplam alacağı ve yaklaşan kritik vadeleri aynı yerde göremiyor.

### 1.5 Rekabet avantajı

| Klasik finans uygulaması | Vademde |
|---|---|
| Kullanıcı bütün alanları tek tek doldurur. | Kullanıcı belgeyi tarar; Vademde belge türünü ve alanları hazırlar. |
| Her kayıt aynı genel forma girilir. | Çek, senet, kredi ve fatura için belgeye özel şema kullanılır. |
| Belge kayıtla ilişkilendirilmez. | Orijinal belge, OCR alanları ve finans kaydı birbirine bağlıdır. |
| Kayıtların doğruluğu tamamen kullanıcıya bağlıdır. | AI sonucu deterministik kurallarla ve kullanıcı onayıyla doğrulanır. |
| Finans takip deneyimi genellikle şablon görünümündedir. | Özgün Graphite Finance tasarım sistemi kullanılır. |

## 2. Hedef Kullanıcılar ve Çalışma Alanları

### 2.1 Bireysel kullanıcı

- Maaş ve diğer gelirleri kaydetmek
- Kira, fatura ve düzenli giderleri takip etmek
- Kredi ve kredi kartı ödeme günlerini görmek
- Aile veya arkadaşlar arasındaki borç-alacakları kaydetmek
- Ay sonundaki tahmini nakit durumunu öğrenmek
- Vade öncesinde bildirim almak

### 2.2 Esnaf ve küçük işletme

- Müşteriden alınacak vadeli ödemeleri takip etmek
- Tedarikçiye yapılacak çek, senet ve fatura ödemelerini izlemek
- Kısmi tahsilatları işlemek
- Müşteri ve tedarikçi hesap geçmişini görüntülemek
- Kasa ve banka hesaplarını ayırmak
- Gecikmiş alacakları ve yaklaşan ödeme yoğunluğunu görmek

### 2.3 Serbest çalışan

- Müşteri ve proje bazında alacak takibi
- Düzensiz gelirlerin vade ve tahsilat planı
- İş giderlerini kişisel giderlerden ayırma
- Yaklaşan nakit açığını önceden görme

### 2.4 Çalışma alanı modeli

Kişisel ve işletme kullanımı iki ayrı uygulama gibi bölünmez. Her kullanıcı bir veya daha fazla çalışma alanına sahip olur. Bir çalışma alanındaki veriler diğerinden tamamen ayrıdır.

| Çalışma alanı | Örnek | İçerik |
|---|---|---|
| Kişisel | Akın'ın Bütçesi | Kişisel hesaplar, gelir-gider, kredi, kart, borç-alacak ve faturalar |
| İşletme | Kaya Hafriyat | Kasalar, banka hesapları, müşteriler, tedarikçiler, çek-senet, vadeli fatura, tahsilat ve işletme raporları |

> **Temel karar**
> Kullanıcı üst menüden çalışma alanını değiştirir. Tüm sorgular, dosyalar, raporlar ve RLS politikaları `workspace_id` üzerinden ayrılır. Bu model ileride ekip üyeleri ve rol yetkileri eklenmesine hazır olmalıdır.

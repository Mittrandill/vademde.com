# Finansal Kayıt Modeli

> Kaynak: Vademde_PRD_v1.3.pdf, Bölüm 3, Bölüm 8 (s. 5-6, 12-13)
> Bu dosya kayıt yönü, belge/kayıt türleri, kategoriler, kayıt durumları ve finansal hesaplama kurallarını tanımlar.

## 3. Finansal Kayıt Modeli

Kredi, kredi kartı, çek, senet ve fatura gider kategorisi değildir. Bunlar finansal kayıt veya belge türüdür. "Yakıt", "market", "kira", "malzeme" gibi kavramlar ise gelir/gider kategorisidir. **Bu ayrım veri modelinin tutarlı kalması için zorunludur.**

### 3.1 Kayıt yönü

- Ödenecek borç
- Tahsil edilecek alacak
- Gerçekleşmiş gider
- Gerçekleşmiş gelir
- Transfer

### 3.2 Finansal kayıt / belge türleri

- Kredi ve kredi taksiti
- Kredi kartı ekstresi ve ödeme günü
- Çek
- Senet
- Fatura ve e-Fatura
- Abonelik faturası
- Kira
- Vergi ve SGK ödemesi
- Tedarikçi borcu
- Müşteri alacağı
- Banka dekontu
- Makbuz ve fiş
- Sözleşme ve ödeme planı
- Diğer

### 3.3 Gelir ve gider kategorileri

| Gider kategorileri | Gelir kategorileri |
|---|---|
| Kira, elektrik, su, internet, telefon | Maaş, ürün satışı, hizmet geliri |
| Yakıt, market, yemek, ulaşım | Kira geliri, proje geliri |
| Sağlık, eğitim, personel | Komisyon, tahsilat, ek gelir |
| Malzeme, bakım, vergi, sigorta | Faiz veya diğer gelir |
| Abonelik, komisyon, diğer | Diğer |

### 3.4 Kayıt durumları

- Taslak
- İncelenmesi gerekiyor
- Bekliyor
- Kısmen ödendi
- Ödendi
- Kısmen tahsil edildi
- Tahsil edildi
- Gecikti
- İptal edildi

> **Örnek sınıflandırma**
> Yön: Ödenecek borç • Belge türü: Çek • Kategori: Malzeme alımı • Durum: Bekliyor • Vade: 15 Ağustos 2026 • Tutar: 185.000 TL

## 8. Finansal Hesaplama Kuralları

| Hesap | Kural |
|---|---|
| Kullanılabilir bakiye | Açılış bakiyesi + tamamlanan gelirler - tamamlanan giderler + gelen transferler - giden transferler |
| Net aylık durum | Gerçekleşen aylık gelir - gerçekleşen aylık gider |
| Beklenen nakit akışı | Beklenen tahsilatlar - beklenen ödemeler |
| Toplam borç | Tamamlanmamış borçların kalan tutarları |
| Toplam alacak | Tamamlanmamış alacakların kalan tutarları |
| Gecikme | Vade geçmiş ve kalan tutar > 0 |
| Kısmi ödeme | Kalan = toplam - geçerli ödeme/tahsilat toplamı |
| Transfer | Toplam varlığı değiştirmez; kaynak ve hedef hesabı etkiler |

### 8.1 Para ve tarih doğrulaması

- Tutarlar floating point olarak tutulmaz; en küçük para birimi veya kesin decimal kullanılır.
- Para birimi ISO koduyla saklanır.
- Tarih yerel gösterilir, veritabanında standart formatla tutulur.
- Taksit toplamı ana toplamla uyuşmuyorsa son taksit düzeltmesi veya kullanıcı onayı gerekir.
- Rakamla/yazıyla çek ve senet tutarı uyuşmuyorsa kayıt zorunlu incelemeye alınır.

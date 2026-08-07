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

### 3.5 Değer birimi (Value Unit)

Bir borç veya alacak yalnızca fiat para biriminde değil, kıymetli maden cinsinden de tutulabilir (örn. "3 çeyrek altın borç", "2,5 gram altın alacak"). Bu nedenle kayıtlardaki "para birimi" kavramı **değer birimi**'ne genişler:

| Değer birimi türü | Kod alanı kaynağı | Örnekler | Miktar tipi |
|---|---|---|---|
| Fiat (yasal para) | ISO 4217 | TRY, USD, EUR | Ondalıklı, en küçük para birimi (kuruş/cent) tam sayı olarak saklanır |
| Kıymetli maden | Vademde sabit kod listesi (ISO 4217 karşılığı yoktur) | gram_altin, ceyrek_altin, yarim_altin, tam_altin, cumhuriyet_altini | Alt türe göre değişir (bkz. aşağıdaki tablo) |

| Kıymetli maden birimi | Miktar tipi | Örnek |
|---|---|---|
| gram_altin | Ondalıklı (gram, 2 ondalık basamak hassasiyetle) | 2,50 gram |
| ceyrek_altin | Tam sayı (adet) | 3 adet |
| yarim_altin | Tam sayı (adet) | 1 adet |
| tam_altin / ata_altin | Tam sayı (adet) | 2 adet |
| cumhuriyet_altini | Tam sayı (adet) | 1 adet |

- Bir kayıt (`obligation`) her zaman **tek bir değer biriminde** tutulur; birim kayıt oluşturulduktan sonra değiştirilemez (yalnızca yeni kayıt açılarak "birim dönüşümü" yapılabilir, otomatik dönüştürme yapılmaz).
- Kıymetli maden cinsinden bir kaydın güncel TL karşılığı **kalıcı olarak saklanmaz**; her görüntülemede canlı piyasa fiyatı önbelleğinden (bkz. `docs/05-veri-modeli.md` §9.4, `docs/06-teknik-mimari.md` §10.7) hesaplanan **ayrı bir "referans değer"** olarak gösterilir. Kaydın "gerçek" tutarı her zaman kendi değer birimindeki miktardır (örn. "3 çeyrek altın"); TL karşılığı yalnızca bilgilendirici bir gösterimdir ve piyasa hareketiyle değişir.
- Altın ve döviz cinsinden borç/alacak takibi P1 kapsamındadır (bkz. `docs/02-kapsam-ve-oncelikler.md`). P0'daki tüm kayıt türleri (kredi, kredi kartı, çek, senet, fatura vb.) değer birimi olarak varsayılan TRY ile çalışmaya devam eder; bu değişiklik P0 akışlarını bozmaz, yalnızca yeni bir opsiyonel birim kümesi ekler.

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

- Tutarlar floating point olarak tutulmaz; en küçük ölçü birimi veya kesin decimal kullanılır.
- **Değer birimi kodla saklanır**: fiat için ISO 4217 kodu (TRY, USD, EUR), kıymetli maden için Vademde'nin tanımladığı sabit birim kodu (gram_altin, ceyrek_altin, yarim_altin, tam_altin, cumhuriyet_altini) kullanılır — ISO 4217'nin kıymetli maden karşılığı (XAU) ons bazlıdır ve Türkiye'deki gram/sikke pratiğine uymadığı için kullanılmaz.
- Bir kaydın "en küçük ölçü birimi" kavramı değer birimine göre değişir: fiat için kuruş/cent (1/100), gram_altin için santigram (1/100 gram), sikke birimleri için 1 adet (ondalık yoktur).
- Tarih yerel gösterilir, veritabanında standart formatla tutulur.
- Taksit toplamı ana toplamla uyuşmuyorsa son taksit düzeltmesi veya kullanıcı onayı gerekir.
- Rakamla/yazıyla çek ve senet tutarı uyuşmuyorsa kayıt zorunlu incelemeye alınır.

### 8.2 Çoklu değer birimi toplama kuralı

- Farklı değer birimindeki tutarlar **hiçbir zaman doğrudan toplanmaz** (örn. TRY tutarı ile USD tutarı veya çeyrek altın adedi tek bir sayıda birleştirilmez).
- Toplam borç, toplam alacak, bakiye ve tüm rapor toplamları **önce değer birimine göre gruplanır**; her grup kendi biriminde ayrı bir toplam olarak gösterilir (örn. "125.000 TL + 2.000 USD + 8 çeyrek altın").
- Kullanıcıya tek bir özet rakam gerektiğinde, gruplanmış toplamlar çalışma alanının **referans değer birimine** (bkz. `docs/03-bilgi-mimarisi-ekranlar.md` §5.2, varsayılan TRY) canlı kurla çevrilip **ikincil ve açıkça "yaklaşık"/"güncel kur ile" etiketli** bir toplam olarak gösterilebilir. Bu ikincil toplam hiçbir zaman birincil (kendi biriminde) toplamların yerini almaz.

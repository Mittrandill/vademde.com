# OCR-First Belge İşleme Sistemi

> Kaynak: Vademde_PRD_v1.3.pdf, Bölüm 6-7, Ek A (s. 9-13, 27)
> Bu dosya OCR akışını, hibrit OCR yaklaşımını, belge türü bazlı veri çıkarımını ve ortak yapılandırılmış çıktı şemasını tanımlar.

## 6. OCR-First Belge İşleme Sistemi

### 6.1 Ana ekleme deneyimi

Merkezî Ekle/Tara alanında iki ana yol bulunur: "Belge Tara" birincil aksiyondur; "Manuel Kayıt Ekle" ikincil aksiyondur. Kullanıcı kamera, galeri, Dosyalar veya PDF üzerinden belge ekleyebilir.

### 6.2 İşleme aşamaları

1. Belgenin alınması
2. Görüntü kalite kontrolü
3. Perspektif düzeltme, kırpma ve döndürme
4. Cihaz üzerinde ham OCR
5. Belge türünün sınıflandırılması
6. Belgeye özel yapılandırılmış alan çıkarımı
7. Deterministik doğrulama
8. Mükerrer kontrolü ve mevcut kişi/firma eşleştirmesi
9. Kullanıcı onayı
10. Finansal kayıt ve belge bağlantısının oluşturulması

### 6.3 Görüntü kalite kontrolü

- Bulanıklık
- Belgenin kadraj dışında kalması
- Düşük ışık veya aşırı parlama
- Ters/yan görüntü
- Yazının çok küçük olması
- Bir fotoğrafta birden fazla belge
- Yoğun gölge veya katlanma

### 6.4 Hibrit OCR yaklaşımı

| Katman | Görev |
|---|---|
| Cihaz OCR'ı | Hızlı ham metin, çevrimdışı taslak, metin kutusu koordinatları |
| Multimodal AI | Belge sınıflandırma, tablo anlama, alan çıkarımı ve kategori önerisi |
| Deterministik kurallar | Tarih, tutar, IBAN, toplam ve taksit tutarlılığı |
| Kullanıcı doğrulaması | Kritik alanların onayı ve düzeltme |
| Geri bildirim | Düzeltilen alanlardan ürün kalitesi ölçümü |

> **Güven ilkesi**
> AI çıktısı hiçbir zaman doğrudan kesin finans kaydına dönüşmez. Kritik alanlar doğrulanır; düşük güvenli alanlar kullanıcıya gösterilir; kullanıcı onayı olmadan kayıt toplam ve raporlara dahil edilmez.

### 6.5 OCR sonuç kontrol ekranı

- Belge önizlemesi ve algılanan tür
- Genel güven özeti
- Tutar, vade, yön, kişi/firma ve belge numarası
- Orta/düşük güven alanlarında "Kontrol et" etiketi
- Alana dokununca belge üzerindeki kaynak bölgenin vurgulanması
- Kontrol Et ve Kaydet / Taslak Olarak Kaydet aksiyonları

### 6.6 Akıllı eşleştirme ve mükerrer kontrol

- Vergi numarası, IBAN ve isim benzerliğiyle kişi/firma eşleştirme
- Kartın son dört hanesiyle kredi kartı hesabı eşleştirme
- Çek/senet/fatura numarasıyla mükerrer kontrol
- Dosya hash'i ve görsel benzerliği
- Dekontu mevcut borç veya alacakla eşleştirme önerisi

## 7. Belge Türleri ve Veri Çıkarımı

### 7.1 Çek

| Çıkarılacak alanlar | Kayıt davranışı |
|---|---|
| Banka, şube, çek no, hesap/IBAN | Kullanıcı "Ben ödeyeceğim / Ben tahsil edeceğim" yönünü doğrular. |
| Düzenleyen, lehtar, vergi no | Ödenecekse vadeli borç; tahsil edilecekse vadeli alacak. |
| Rakamla ve yazıyla tutar, para birimi | İki tutar uyuşmazsa zorunlu uyarı. |
| Düzenlenme/ödeme tarihi ve yeri | Vade takvimine işlenir. |
| İmza alanı ve notlar | Belge niteliği olarak saklanır; hukukî geçerlilik kararı verilmez. |

### 7.2 Senet

Tutar, yazıyla tutar, para birimi, vade, düzenlenme tarihi, borçlu, alacaklı, kefil, ödeme yeri, senet numarası, açıklama ve imza alanı çıkarılır. Kullanıcı ödeme/tahsilat yönünü doğrular.

### 7.3 Kredi ödeme planı

Banka, kredi türü, kredi tutarı, toplam geri ödeme, taksit sayısı, faiz, masraf, sigorta, ilk/son taksit ve her satırdaki vade, anapara, faiz, vergi, taksit tutarı ve kalan anapara çıkarılır. Ana kredi kaydı ve alt taksitler oluşturulur.

### 7.4 Kredi kartı ekstresi

Banka, kart adı, son dört hane, hesap kesim tarihi, son ödeme tarihi, dönem borcu, asgari ödeme, önceki borç, toplam harcama, ödeme, faiz/ücret ve işlem satırları çıkarılır. Kullanıcı yalnızca toplam kart borcunu veya harcamaları da kategorilere ayırmayı seçebilir.

### 7.5 Fatura ve e-Fatura

Fatura türü, numara, ETTN, düzenlenme/vade tarihi, satıcı, alıcı, vergi dairesi/no, satırlar, ara toplam, KDV, indirim, genel toplam, para birimi ve ödeme bilgisi çıkarılır. Çalışma alanındaki işletme bilgileri yön tahmininde kullanılır.

### 7.6 Abonelik faturaları

Elektrik, su, internet ve telefon belgelerinde kurum, abone/tesisat no, dönem, son ödeme tarihi, toplam, önceki borç, gecikme ve tüketim çıkarılır; ilgili kategori otomatik önerilir.

### 7.7 Banka dekontu

Banka, gönderen, alıcı, IBAN'lar, tarih/saat, tutar, açıklama, referans ve masraf çıkarılır. Dekont gelecekteki borç değil, gerçekleşmiş gelir/gider veya borç ödeme/tahsilat hareketidir.

### 7.8 Makbuz ve fiş

İşletme, tarih, saat, toplam, KDV, ödeme yöntemi, ürün/hizmet satırları, fiş no ve vergi no çıkarılır; gerçekleşmiş gelir veya gider taslağı hazırlanır.

### 7.9 Cari hesap ekstresi ve kira sözleşmesi

Cari ekstrede açılış/kapanış bakiyesi, borç-alacak satırları, fatura numaraları ve vadeler; kira sözleşmesinde taraflar, taşınmaz, başlangıç/bitiş, aylık kira, ödeme günü, depozito ve artış dönemi çıkarılır. **Bu türler P1 kapsamındadır.**

### 7.10 Ortak yapılandırılmış çıktı

| Alan | Açıklama |
|---|---|
| documentType | Belge türü enum değeri |
| documentTypeConfidence | Belge türü güven skoru |
| direction | payable / receivable / income / expense / transfer |
| currency / totalAmount | Normalize para birimi ve tutar |
| issueDate / dueDate | ISO tarihleri |
| counterparty | İsim, vergi no, IBAN |
| documentNumber | Çek, senet, fatura veya referans no |
| suggestedCategory | Kategori önerisi |
| fields[] | Ham değer, normalize değer, güven, sayfa ve bounding box |
| warnings[] | Tutarsızlık ve doğrulama uyarıları |
| missingRequiredFields[] | Eksik kritik alanlar |

## Ek A - Örnek OCR Çıktısı

```json
{
  "documentType": "cheque",
  "documentTypeConfidence": 0.97,
  "direction": "payable",
  "directionConfidence": 0.78,
  "currency": "TRY",
  "totalAmount": 185000,
  "issueDate": "2026-07-15",
  "dueDate": "2026-08-15",
  "counterparty": {
    "name": "ABC Yapı Ltd.",
    "taxNumber": null,
    "iban": null
  },
  "documentNumber": "0123456",
  "suggestedCategory": "materials",
  "warnings": [],
  "missingRequiredFields": []
}
```

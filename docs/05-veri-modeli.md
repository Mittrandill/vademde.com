# Veri Modeli

> Kaynak: Vademde_PRD_v1.3.pdf, Bölüm 9 (s. 13-14)
> Bu dosya çekirdek tabloları, OCR tablolarını ve tablolar arası önemli ilişkileri tanımlar.

## 9.1 Çekirdek tablolar

| Tablo | Amaç |
|---|---|
| profiles | Kullanıcı profili ve tercihler |
| workspaces | Kişisel/işletme çalışma alanı |
| workspace_members | Üyelik ve rol |
| accounts | Nakit, banka ve cüzdan hesapları |
| categories | Gelir/gider kategorileri |
| counterparties | Kişi, müşteri ve tedarikçiler |
| transactions | Gerçekleşmiş para hareketleri |
| obligations | Vadeli borç ve alacaklar |
| installments | Taksit satırları |
| payments | Kısmi/tam ödeme ve tahsilatlar |
| recurrence_rules | Düzenli işlem kuralları |
| reminders | Vade bildirimleri |
| tags / entity_tags | Etiketleme |
| attachments | Genel dosya bağlantıları |
| audit_logs | İşlem geçmişi |
| value_unit_rates | Fiat kur ve kıymetli maden fiyatlarının canlı önbelleği (bkz. §9.4) |

## 9.2 OCR tabloları

| Tablo | Amaç |
|---|---|
| financial_documents | Belge dosyası, tür, yön, tutar, tarih, güven ve bağlı kayıt |
| document_extractions | OCR sağlayıcısı, model, ham metin ve yapılandırılmış çıktı |
| document_fields | Alan bazında ham/normalize değer, güven ve bounding box |
| document_processing_jobs | İş kuyruğu, deneme, hata ve süre bilgisi |

## 9.3 Önemli ilişkiler

- Bir `obligation` bir `source_document_id` taşıyabilir.
- Bir `document` bir `obligation` veya `transaction` ile bağlanabilir.
- Bir `payment`, `transaction` ve `installment` ile ilişkilendirilebilir.
- Bir belge birden fazla sayfa ve alan içerebilir.
- Taslak OCR belgeleri finansal toplamları etkilemez.
- Çalışma alanı silinmeden önce ilişkili dosya ve kayıtlar için güvenli silme planı uygulanır.

## 9.4 Değer birimi ve kıymetli maden desteği

> Bu bölüm P1 kapsamında eklenecek "altın ve döviz cinsinden borç/alacak" özelliğinin veri modeli etkisini tanımlar. Kavramsal şema kararlarıdır; kesin SQL migration implementasyon aşamasında yazılır.

### 9.4.1 obligations üzerindeki genişleme

- `obligations.currency_code` alanının kabul ettiği değer kümesi genişler: mevcut ISO 4217 kodlarına ek olarak Vademde'nin sabit kıymetli maden kod listesi (`gram_altin`, `ceyrek_altin`, `yarim_altin`, `tam_altin`, `cumhuriyet_altini`) de geçerli olur. Kolon adı ve NOT NULL/DEFAULT 'TRY' davranışı değişmez; mevcut TRY kayıtları etkilenmez.
- Bir kaydın fiat mı yoksa kıymetli maden mi olduğunu ayırt etmek için `obligations`'a yeni bir `value_unit_type` kolonu eklenir: `'fiat' | 'kiymetli_maden'`, NOT NULL, DEFAULT `'fiat'`.
- `total_amount_minor` / `remaining_amount_minor` alanlarının anlamı `value_unit_type`'a göre değişir:
  - `fiat` için: değer biriminin en küçük para birimi (TRY için kuruş) cinsinden tam sayı — mevcut davranış, değişmez.
  - `kiymetli_maden` için: `gram_altin` alt türünde santigram (1/100 gram) cinsinden tam sayı (örn. 2,50 gram = 250); sikke alt türlerinde (`ceyrek_altin`, `yarim_altin`, `tam_altin`, `cumhuriyet_altini`) doğrudan adet — ondalık yoktur, çarpan 1'dir.
- `accounts` tablosuna aynı `value_unit_type` kolonu **opsiyonel olarak** eklenebilir (ileride "altın kasası" gibi bir hesap türü için); P1 kapsamı bunu zorunlu kılmaz — hesap seviyesinde altın/döviz bakiyesi tutma P2'ye bırakılır.
- `installments` ve `payments` mevcut denormalize modele göre kendi `currency_code`/`value_unit_type` kolonlarını taşımaya devam etmez; üst `obligation`'dan miras alınır — bu davranış değişmez.

### 9.4.2 Yeni tablo: value_unit_rates

Amaç: mobil uygulamanın hiçbir zaman doğrudan dış API'ye (TCMB, altın fiyat servisi) erişmemesi; bunun yerine sunucu tarafında periyodik güncellenen bu önbellek tablosunu okuması.

| Kolon (kavramsal) | Açıklama |
|---|---|
| unit_code | `USD`, `EUR`, `gram_altin`, `ceyrek_altin`, `yarim_altin`, `tam_altin`, `cumhuriyet_altini` |
| unit_type | `fiat` \| `kiymetli_maden` |
| try_equivalent_minor | 1 birimin güncel TL karşılığı, kuruş cinsinden tam sayı |
| source | Fiyatın alındığı kaynak (`tcmb`, veya seçilecek altın API sağlayıcısı) |
| source_fetched_at | Kaynağın yayımladığı zaman damgası (varsa) |
| cached_at | Edge Function'ın bu değeri en son çektiği zaman |

- Bu tablo workspace'e özel değildir — tüm çalışma alanları aynı canlı fiyatı paylaşır.
- RLS: tüm authenticated kullanıcılar `SELECT` yapabilir; `INSERT`/`UPDATE` yalnızca service role (sync Edge Function'ı) tarafından yapılabilir — `docs/07-guvenlik-gizlilik.md` §11.1'deki "service role anahtarının mobile gömülmemesi" kuralıyla uyumlu.
- Bir birim için satır bulunamazsa veya `cached_at` çok eskiyse, istemci "son güncelleme: X önce" bilgisini şeffaf gösterir; kaydın kendi değer birimindeki tutarı bundan etkilenmez, yalnızca TL karşılığı gösterimi eski kalabilir.

### 9.4.3 workspaces üzerinde referans değer birimi

- `docs/03-bilgi-mimarisi-ekranlar.md` §5.2'de onboarding'de seçildiği belirtilen "ana para birimi" bugüne kadar hiçbir `workspaces` kolonuna karşılık gelmiyordu. Bu tutarsızlık artık gerçek bir ihtiyaç doğurduğu için **implement edilerek** çözülür: `workspaces` tablosuna `default_value_unit_code` (TEXT, NOT NULL, DEFAULT `'TRY'`) kolonu eklenir.
- Amaç: (1) yeni kayıt formunda önerilen varsayılan değer birimini belirlemek, (2) §8.2'deki "ikincil referans toplam" gösteriminde hangi birime çevrim yapılacağını belirlemek. Kayıtların kendi değer birimini değiştirmez veya zorlamaz.

## Terminoloji (Ek B ile çapraz referans)

Bu tablolardaki temel kavramlar için bkz. `14-kararlar-ve-terminoloji.md` — Ek B Terminoloji sözlüğü (Obligation, Transaction, Installment, Payment, Counterparty, Financial Document, Review Required, Workspace).

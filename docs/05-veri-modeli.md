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

## Terminoloji (Ek B ile çapraz referans)

Bu tablolardaki temel kavramlar için bkz. `14-kararlar-ve-terminoloji.md` — Ek B Terminoloji sözlüğü (Obligation, Transaction, Installment, Payment, Counterparty, Financial Document, Review Required, Workspace).

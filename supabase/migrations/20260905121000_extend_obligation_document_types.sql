-- obligations.document_type CHECK listesi, features/obligations/documentTypes.ts ile ayrışmıştı:
--   * 'nakit_avans' istemcide seçilebilir bir belge türü olmasına rağmen kısıtta hiç yoktu —
--     bu türde kayıt oluşturmak DB seviyesinde hata veriyordu (canlı veride hiç nakit_avans
--     kaydı olmamasının nedeni budur).
--   * 'maas' (Personel Maaşı) yeni eklendi; maaş bugüne kadar 'diger'/'sozlesme_odeme_plani'
--     olarak giriliyordu ve tekrarlayan ödeme olarak ayırt edilemiyordu.
--
-- Liste, documentTypes.ts DOCUMENT_TYPES ile birebir aynı tutulmalıdır.

alter table public.obligations
  drop constraint if exists obligations_document_type_check;

alter table public.obligations
  add constraint obligations_document_type_check
  check (document_type = any (array[
    'kredi'::text,
    'kredi_karti_ekstresi'::text,
    'nakit_avans'::text,
    'cek'::text,
    'senet'::text,
    'fatura'::text,
    'abonelik'::text,
    'kira'::text,
    'maas'::text,
    'vergi_sgk'::text,
    'tedarikci_borcu'::text,
    'musteri_alacagi'::text,
    'banka_dekontu'::text,
    'makbuz_fis'::text,
    'sozlesme_odeme_plani'::text,
    'diger'::text
  ]));

-- Aynı liste, taranan belgenin kendi türü için de geçerlidir (OCR pipeline'ı belgeyi
-- financial_documents'a yazar, kullanıcı onaylayınca obligations'a dönüşür) — iki kısıt
-- ayrışırsa OCR'ın 'nakit_avans'/'maas' önerisi belge kaydında patlar.
alter table public.financial_documents
  drop constraint if exists financial_documents_document_type_check;

alter table public.financial_documents
  add constraint financial_documents_document_type_check
  check (document_type = any (array[
    'kredi'::text,
    'kredi_karti_ekstresi'::text,
    'nakit_avans'::text,
    'cek'::text,
    'senet'::text,
    'fatura'::text,
    'abonelik'::text,
    'kira'::text,
    'maas'::text,
    'vergi_sgk'::text,
    'tedarikci_borcu'::text,
    'musteri_alacagi'::text,
    'banka_dekontu'::text,
    'makbuz_fis'::text,
    'sozlesme_odeme_plani'::text,
    'diger'::text
  ]));

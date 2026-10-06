-- "Belgeyi taslak olarak sakla": kota dolduğunda belge OCR'sız yüklenir ve kota yenilenince
-- işlenir. is_draft yalnızca bu yolla açılan belgelerde true olur; mevcut satırlar false kalır
-- (takılı kalmış eski 'uploaded' belgeler taslak listesine düşmez). Geri alma:
--   alter table public.financial_documents drop column is_draft;
alter table public.financial_documents
  add column if not exists is_draft boolean not null default false;

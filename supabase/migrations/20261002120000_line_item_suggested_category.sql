-- Kredi kartı ekstresi satırları için OCR'ın önerdiği kategori (bkz. process-document —
-- Gemini her satıra workspace'in mevcut gider kategorilerinden birini seçer, eşleştirme
-- sunucuda yapılır). Yalnızca öneridir: onay ekranında kullanıcı değiştirebilir, kesin
-- kayıt (transactions.category_id) ancak kullanıcı onayıyla yazılır.
alter table public.document_line_items
  add column if not exists suggested_category_id uuid
    references public.categories(id) on delete set null;

create index if not exists document_line_items_suggested_category_id_idx
  on public.document_line_items (suggested_category_id)
  where suggested_category_id is not null;

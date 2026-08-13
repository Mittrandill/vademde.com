-- Ekstre mutabakatı aynı çalışma alanı + kart + tutar için dar bir tarih aralığı sorgular.
-- Yalnızca gider satırları aday olduğundan kısmi indeks daha küçük kalır.
create index if not exists transactions_statement_match_idx
  on public.transactions (workspace_id, account_id, amount_minor, occurred_at)
  where direction = 'expense';

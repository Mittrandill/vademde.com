-- Çek/senet seri numarası ve diğer belge numaraları kayıtta ayrı alanda tutulur. Daha önce notlara
-- yazılan numaralara dokunulmaz.
alter table public.obligations add column if not exists document_number text;

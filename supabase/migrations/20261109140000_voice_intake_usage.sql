-- Sesli kayıt için aylık kullanım sayısı ve yedek modelin fiyatları. Ses fiyatı doğrulanmadığından
-- 3.8 Flash için audio_input_usd boş bırakılır. 3.6/3.8 Flash fiyatı 2027-01-01'de iki katına çıkar.
insert into admin_private.ai_model_prices(model, effective_from, input_usd, audio_input_usd, output_usd) values
  ('gemini-3.8-flash', '2026-01-01', 0.75, null, 3.75),
  ('gemini-3.8-flash', '2027-01-01', 1.50, null, 7.50),
  ('gemini-3.6-flash', '2027-01-01', 1.50, null, 7.50);

create or replace function public.ai_usage_count(p_workspace_id uuid, p_feature text, p_since timestamptz)
returns integer
language sql
stable
security definer
set search_path to ''
as $$
  select count(distinct request_id)::integer
  from admin_private.ai_usage_events
  where workspace_id = p_workspace_id and feature = p_feature and created_at >= p_since;
$$;
revoke all on function public.ai_usage_count(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.ai_usage_count(uuid, text, timestamptz) to service_role;

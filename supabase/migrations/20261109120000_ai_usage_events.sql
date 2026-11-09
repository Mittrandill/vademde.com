-- Gemini maliyet ölçümü (bkz. functions/_shared/aiUsage.ts). Yalnızca token sayıları ve model adı
-- tutulur; ses, belge, istem ve yanıt metni tutulmaz. Dolar saklanmaz: fiyat değişince geçmiş
-- ai_usage_costs görünümünden yeniden hesaplanabilsin diye fiyatlar ayrı tablodadır.
create table admin_private.ai_usage_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  feature text not null check (feature in ('ocr','ask','insights','voice')),
  workspace_id uuid references public.workspaces(id) on delete set null,
  plan text,
  request_id uuid not null,
  requested_model text not null,
  response_model text,
  is_fallback boolean not null default false,
  ok boolean not null,
  http_status integer,
  duration_ms integer not null default 0,
  audio_seconds numeric(8,2),
  input_tokens integer not null default 0,
  audio_input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  thinking_tokens integer not null default 0,
  cached_tokens integer not null default 0
);
create index ai_usage_events_feature_created on admin_private.ai_usage_events(feature, created_at desc);
create index ai_usage_events_workspace_created on admin_private.ai_usage_events(workspace_id, created_at desc);
create index ai_usage_events_request on admin_private.ai_usage_events(request_id);

-- 1M token başına USD, Google Gemini API standart ücretli katman (okundu: 2026-11-09).
-- audio_input_usd null ise o model için ses fiyatı doğrulanmamıştır; ses içeren çağrının maliyeti
-- bilinmiyor (null) görünür.
create table admin_private.ai_model_prices (
  model text not null,
  effective_from date not null,
  input_usd numeric(10,4) not null,
  audio_input_usd numeric(10,4),
  output_usd numeric(10,4) not null,
  primary key (model, effective_from)
);
insert into admin_private.ai_model_prices(model, effective_from, input_usd, audio_input_usd, output_usd) values
  ('gemini-2.5-flash', '2026-01-01', 0.30, 1.00, 2.50),
  ('gemini-2.5-flash-lite', '2026-01-01', 0.10, 0.30, 0.40),
  ('gemini-3.1-flash-lite', '2026-01-01', 0.25, 0.50, 1.50),
  ('gemini-3.5-flash-lite', '2026-01-01', 0.30, 0.30, 2.50),
  ('gemini-3.6-flash', '2026-01-01', 0.75, null, 3.75);

alter table admin_private.ai_usage_events enable row level security;
alter table admin_private.ai_model_prices enable row level security;
revoke all on admin_private.ai_usage_events from public, anon, authenticated;
revoke all on admin_private.ai_model_prices from public, anon, authenticated;

-- Google'ın yönlendirdiği gerçek modelin fiyatı önceliklidir; yoksa istenen modele düşülür. Önbellek
-- indirimi uygulanmaz, bu yüzden tutar en fazla hafifçe yüksek çıkar.
create view admin_private.ai_usage_costs with (security_invoker = true) as
select
  e.*,
  p.model as priced_model,
  (
    (e.input_tokens - e.audio_input_tokens) * p.input_usd
    + case when e.audio_input_tokens = 0 then 0 else e.audio_input_tokens * p.audio_input_usd end
    + (e.output_tokens + e.thinking_tokens) * p.output_usd
  ) / 1000000 as cost_usd
from admin_private.ai_usage_events e
left join lateral (
  select price.*
  from admin_private.ai_model_prices price
  where price.model in (e.response_model, e.requested_model)
    and price.effective_from <= e.created_at::date
  order by (price.model = e.response_model) desc nulls last, price.effective_from desc
  limit 1
) p on true;
revoke all on admin_private.ai_usage_costs from public, anon, authenticated;

create or replace function public.record_ai_usage(p_event jsonb)
returns void
language sql
security definer
set search_path to ''
as $$
  insert into admin_private.ai_usage_events (
    feature, workspace_id, plan, request_id, requested_model, response_model, is_fallback, ok,
    http_status, duration_ms, audio_seconds, input_tokens, audio_input_tokens, output_tokens,
    thinking_tokens, cached_tokens
  ) values (
    p_event->>'feature',
    (p_event->>'workspace_id')::uuid,
    p_event->>'plan',
    (p_event->>'request_id')::uuid,
    p_event->>'requested_model',
    p_event->>'response_model',
    coalesce((p_event->>'is_fallback')::boolean, false),
    (p_event->>'ok')::boolean,
    (p_event->>'http_status')::integer,
    coalesce((p_event->>'duration_ms')::integer, 0),
    (p_event->>'audio_seconds')::numeric,
    coalesce((p_event->>'input_tokens')::integer, 0),
    coalesce((p_event->>'audio_input_tokens')::integer, 0),
    coalesce((p_event->>'output_tokens')::integer, 0),
    coalesce((p_event->>'thinking_tokens')::integer, 0),
    coalesce((p_event->>'cached_tokens')::integer, 0)
  );
$$;
revoke all on function public.record_ai_usage(jsonb) from public, anon, authenticated;
grant execute on function public.record_ai_usage(jsonb) to service_role;

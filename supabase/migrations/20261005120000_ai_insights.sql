-- Akıllı öneriler (design/vademde-redesign/PLANLAR.md §5.7).
-- Yalnızca EKLEYİCİ: yeni tablo; mevcut tablolara dokunmaz, eski uygulama sürümleri etkilenmez.
-- Geri alma: drop table public.ai_insights;

create table if not exists public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('abonelik', 'tasarruf', 'nakit', 'aliskanlik', 'kur')),
  title text not null,
  body text not null,
  -- Aylık etki (kuruş); negatif = tasarruf. Rakamlar her zaman sorgudan gelir, LLM'den değil.
  impact_minor bigint,
  action_route text,
  -- Kuralın ürettiği ham olgular + tekrarı önleyen anahtar ({"key": "..."}).
  source jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'dismissed', 'applied')),
  generated_at timestamptz not null default now()
);

create index if not exists ai_insights_workspace_status_idx
  on public.ai_insights (workspace_id, status, generated_at desc);

-- Aynı olgu için (aynı anahtar) bekleyen/yok sayılmış tek öneri.
create unique index if not exists ai_insights_workspace_key_uidx
  on public.ai_insights (workspace_id, (source ->> 'key'))
  where source ? 'key';

alter table public.ai_insights enable row level security;

create policy "ai_insights_select_member" on public.ai_insights
  for select using ((select public.is_workspace_member(workspace_id)));

-- Kullanıcı yalnızca durumu (gizle/uygula) değiştirebilir; ekleme/silme yalnızca
-- service role (generate-insights edge function) üzerinden.
create policy "ai_insights_update_editor" on public.ai_insights
  for update using (public.can_edit_workspace(workspace_id))
  with check (public.can_edit_workspace(workspace_id));

revoke update on public.ai_insights from authenticated, anon;
grant update (status) on public.ai_insights to authenticated;
grant select on public.ai_insights to authenticated;

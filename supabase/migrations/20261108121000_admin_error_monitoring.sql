-- Üretim hatalarının yönetim panelinde izlenmesi (bkz. functions/collect-error-logs). Yalnızca
-- maskelenmiş metin ve sayılar tutulur; kullanıcı kimliği ve finans verisi tutulmaz.
create table admin_private.error_groups (
  fingerprint text primary key,
  source text not null,
  code text not null default '',
  severity text not null check (severity in ('high','medium','low')),
  message text not null,
  status text not null default 'open' check (status in ('open','resolved','ignored')),
  total_count bigint not null default 0,
  first_seen timestamptz not null,
  last_seen timestamptz not null,
  last_notified_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid
);
create index error_groups_status_seen on admin_private.error_groups(status, last_seen desc);

create table admin_private.error_buckets (
  fingerprint text not null references admin_private.error_groups(fingerprint) on delete cascade,
  hour timestamptz not null,
  count bigint not null default 0,
  primary key (fingerprint, hour)
);

create table admin_private.error_collector_state (
  id smallint primary key default 1 check (id = 1),
  cursor_at timestamptz not null default now(),
  last_claim_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_error_at timestamptz
);
insert into admin_private.error_collector_state(id) values (1);

alter table admin_private.error_groups enable row level security;
alter table admin_private.error_buckets enable row level security;
alter table admin_private.error_collector_state enable row level security;

-- Aynı anda iki toplayıcı çalışmaz; dakikada en fazla bir çalışma. Dönen değer okuma başlangıcıdır.
create or replace function public.error_monitor_claim()
returns timestamptz
language plpgsql
security definer
set search_path to ''
as $$
declare result timestamptz;
begin
  update admin_private.error_collector_state
  set last_claim_at = now()
  where id = 1 and (last_claim_at is null or last_claim_at < now() - interval '60 seconds')
  returning cursor_at into result;
  return result;
end;
$$;

create or replace function public.error_monitor_fail(p_error text)
returns void
language sql
security definer
set search_path to ''
as $$
  update admin_private.error_collector_state
  set last_error = left(p_error, 300), last_error_at = now()
  where id = 1;
$$;

-- p_window_end null ise okuma imleci değişmez. Bildirilecek hataları döndürür: yeni, çözülmüşken
-- tekrar eden ya da tek pencerede 20+ kez görülen (en fazla saatte bir). Düşük önemli ve yok sayılan
-- hatalar bildirilmez.
create or replace function public.error_monitor_ingest(p_groups jsonb, p_window_end timestamptz)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  item jsonb;
  previous admin_private.error_groups%rowtype;
  v_count bigint;
  v_last timestamptz;
  v_notify boolean;
  alerts jsonb := '[]'::jsonb;
begin
  for item in select * from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) loop
    v_count := (item->>'count')::bigint;
    v_last := (item->>'last_seen')::timestamptz;
    select * into previous from admin_private.error_groups where fingerprint = item->>'fingerprint' for update;

    v_notify := (item->>'severity') <> 'low' and (
      not found
      or (previous.status = 'resolved' and v_last > coalesce(previous.resolved_at, previous.last_seen))
      or (previous.status = 'open' and v_count >= 20 and (previous.last_notified_at is null or previous.last_notified_at < now() - interval '1 hour'))
    );

    insert into admin_private.error_groups as g
      (fingerprint, source, code, severity, message, total_count, first_seen, last_seen, last_notified_at)
    values
      (item->>'fingerprint', item->>'source', coalesce(item->>'code',''), item->>'severity', left(item->>'message', 300),
       v_count, (item->>'first_seen')::timestamptz, v_last, case when v_notify then now() end)
    on conflict (fingerprint) do update set
      total_count = g.total_count + excluded.total_count,
      last_seen = greatest(g.last_seen, excluded.last_seen),
      first_seen = least(g.first_seen, excluded.first_seen),
      severity = excluded.severity,
      status = case when g.status = 'resolved' and excluded.last_seen > coalesce(g.resolved_at, g.last_seen) then 'open' else g.status end,
      resolved_at = case when g.status = 'resolved' and excluded.last_seen > coalesce(g.resolved_at, g.last_seen) then null else g.resolved_at end,
      resolved_by = case when g.status = 'resolved' and excluded.last_seen > coalesce(g.resolved_at, g.last_seen) then null else g.resolved_by end,
      last_notified_at = coalesce(excluded.last_notified_at, g.last_notified_at);

    insert into admin_private.error_buckets as b (fingerprint, hour, count)
    values (item->>'fingerprint', date_trunc('hour', v_last), v_count)
    on conflict (fingerprint, hour) do update set count = b.count + excluded.count;

    if v_notify then
      alerts := alerts || jsonb_build_object('message', left(item->>'message', 300), 'count', v_count);
    end if;
  end loop;

  delete from admin_private.error_buckets where hour < now() - interval '35 days';
  if p_window_end is not null then
    update admin_private.error_collector_state
    set cursor_at = greatest(cursor_at, p_window_end), last_success_at = now(), last_error = null, last_error_at = null
    where id = 1;
  end if;
  return alerts;
end;
$$;

create or replace function public.error_monitor_admin_tokens()
returns setof text
language sql
stable
security definer
set search_path to ''
as $$
  select t.token from public.push_tokens t join admin_private.members m on m.user_id = t.user_id;
$$;

revoke all on function public.error_monitor_claim() from public, anon, authenticated;
revoke all on function public.error_monitor_fail(text) from public, anon, authenticated;
revoke all on function public.error_monitor_ingest(jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.error_monitor_admin_tokens() from public, anon, authenticated;
grant execute on function public.error_monitor_claim() to service_role;
grant execute on function public.error_monitor_fail(text) to service_role;
grant execute on function public.error_monitor_ingest(jsonb, timestamptz) to service_role;
grant execute on function public.error_monitor_admin_tokens() to service_role;

create or replace function public.admin_error_groups(p_status text default 'open')
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare result jsonb;
begin
  perform admin_private.require_admin();
  if p_status is null or p_status not in ('open','resolved','ignored') then raise exception 'Invalid input'; end if;
  select jsonb_build_object(
    'collector', (select jsonb_build_object('cursorAt', cursor_at, 'lastSuccessAt', last_success_at, 'lastError', last_error, 'lastErrorAt', last_error_at)
                  from admin_private.error_collector_state where id = 1),
    'openCount', (select count(*) from admin_private.error_groups where status = 'open' and severity <> 'low'),
    'rows', coalesce((
      select jsonb_agg(row_data order by sort_rank, last_seen desc)
      from (
        select
          case g.severity when 'high' then 0 when 'medium' then 1 else 2 end as sort_rank,
          g.last_seen,
          jsonb_build_object(
            'fingerprint', g.fingerprint, 'source', g.source, 'code', g.code, 'severity', g.severity,
            'message', g.message, 'status', g.status, 'totalCount', g.total_count,
            'firstSeen', g.first_seen, 'lastSeen', g.last_seen, 'resolvedAt', g.resolved_at,
            'count24h', coalesce((select sum(b.count) from admin_private.error_buckets b where b.fingerprint = g.fingerprint and b.hour >= now() - interval '24 hours'), 0)
          ) as row_data
        from admin_private.error_groups g
        where g.status = p_status
        order by sort_rank, g.last_seen desc
        limit 200
      ) ranked
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_error_set_status(p_fingerprint text, p_status text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform admin_private.require_admin();
  if p_status is null or p_status not in ('open','resolved','ignored') then raise exception 'Invalid input'; end if;
  update admin_private.error_groups
  set status = p_status,
      resolved_at = case when p_status = 'resolved' then now() end,
      resolved_by = case when p_status = 'resolved' then auth.uid() end
  where fingerprint = p_fingerprint;
  if not found then raise exception 'Invalid error group'; end if;
  insert into admin_private.audit(actor, action, target) values (auth.uid(), 'error.' || p_status, null);
end;
$$;

revoke all on function public.admin_error_groups(text) from public, anon;
revoke all on function public.admin_error_set_status(text, text) from public, anon;
grant execute on function public.admin_error_groups(text) to authenticated;
grant execute on function public.admin_error_set_status(text, text) to authenticated;

-- send-due-reminders ile aynı yetkilendirme; jeton migration dosyasına yazılmaz.
select cron.schedule('collect-error-logs', '*/5 * * * *', replace(command, 'send-reminders', 'collect-error-logs'))
from cron.job where jobname = 'send-due-reminders';

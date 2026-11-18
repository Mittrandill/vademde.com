-- Advance only after the Android release is available to all production users.
create function public.android_store_version()
returns text language sql immutable security invoker set search_path = '' as $$
  select '1.1.0'::text;
$$;
revoke all on function public.android_store_version() from public, anon;
grant execute on function public.android_store_version() to authenticated;

-- Keep the permission decision and SQLSTATE. Add narrowly formatted client-reported
-- release metadata only to this specific denial. Older clients keep the original error.
create or replace function public.get_workspace_entitlements(p_workspace_id uuid default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  release text;
begin
  return entitlement_private.get_entitlements(p_workspace_id);
exception when insufficient_privilege then
  if sqlerrm = 'Workspace access denied' then
    release := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-vademde-release';
    if release ~ '^(ios|android)/[0-9]{1,3}([.][0-9]{1,3}){2}/(embedded|[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12})$' then
      raise exception 'Workspace access denied' using errcode = '42501', detail = release;
    end if;
  end if;
  raise;
end;
$$;

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
      message = case when excluded.last_seen >= g.last_seen then excluded.message else g.message end,
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

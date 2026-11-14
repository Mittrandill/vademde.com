-- Ücretsiz plan: belge tarama + sesli kayıt için her ay yenilenen 5 hak yerine, hesap başına
-- SÜRESİZ toplam 5 hak (kullanıcı kararı, 2026-11-14). Geçmiş kullanım da sayılır: daha önce
-- 5 ve üzeri tarama yapmış ücretsiz kullanıcının hakkı kalmaz. Plus ve İşletme aylık kalır.
alter table public.plan_limits
  add column if not exists ocr_quota_period text not null default 'month'
    check (ocr_quota_period in ('month', 'lifetime'));
update public.plan_limits set ocr_quota_period = 'lifetime', updated_at = now() where plan = 'free';

-- Tek kaynak: sahibin geçerli kotası, kullanılan ve bekleyen hak sayısı.
-- 'lifetime' planda tüm ayların kullanımı ve tüm bekleyen rezervasyonlar sayılır.
create or replace function entitlement_private.ocr_quota_state(
  p_owner uuid, p_period date,
  out quota integer, out used integer, out pending integer, out quota_period text
)
language plpgsql stable security definer set search_path = '' as $$
declare v_limits public.plan_limits;
begin
  select * into strict v_limits from public.plan_limits where plan = public.plan_for_owner(p_owner);
  quota := v_limits.monthly_ocr_quota;
  quota_period := v_limits.ocr_quota_period;
  if quota_period = 'lifetime' then
    select coalesce(sum(u.used_count), 0) into used from public.ocr_usage u where u.owner_id = p_owner;
    select count(*) into pending from entitlement_private.ocr_reservations r
      where r.owner_id = p_owner and r.state = 'pending' and r.expires_at > now();
  else
    select coalesce(max(u.used_count), 0) into used from public.ocr_usage u
      where u.owner_id = p_owner and u.period_month = p_period;
    select count(*) into pending from entitlement_private.ocr_reservations r
      where r.owner_id = p_owner and r.period_month = p_period and r.state = 'pending' and r.expires_at > now();
  end if;
end;
$$;
revoke all on function entitlement_private.ocr_quota_state(uuid, date) from public, anon, authenticated;

create or replace function entitlement_private.get_entitlements(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
  v_plan text;
  v_limits public.plan_limits;
  v_state record;
  v_period date := date_trunc('month', now() at time zone 'UTC')::date;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_workspace_id is null then
    v_owner := v_user;
  else
    select w.owner_id into v_owner from public.workspaces w
    where w.id = p_workspace_id and w.archived_at is null
      and (w.owner_id = v_user or exists (
        select 1 from public.workspace_members m
        where m.workspace_id = w.id and m.user_id = v_user
      ));
    if v_owner is null then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  end if;
  v_plan := public.plan_for_owner(v_owner);
  select * into strict v_limits from public.plan_limits where plan = v_plan;
  select * into v_state from entitlement_private.ocr_quota_state(v_owner, v_period);
  return jsonb_build_object(
    'workspaceId', p_workspace_id, 'plan', v_plan, 'inherited', v_owner <> v_user,
    'limits', to_jsonb(v_limits), 'periodMonth', v_period,
    'quotaPeriod', v_state.quota_period,
    'usedCount', v_state.used, 'quota', v_state.quota,
    'remaining', greatest(v_state.quota - v_state.used - v_state.pending, 0),
    'readOnly', case when p_workspace_id is null then false
      else not public.workspace_write_allowed(p_workspace_id) end
  );
end;
$$;

create or replace function entitlement_private.reserve_ocr(p_document_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_workspace uuid; v_owner uuid; v_status text; v_id uuid; v_state record;
  v_period date := date_trunc('month', now() at time zone 'UTC')::date;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select d.workspace_id, w.owner_id, d.status into v_workspace, v_owner, v_status
    from public.financial_documents d join public.workspaces w on w.id = d.workspace_id
    where d.id = p_document_id and w.archived_at is null;
  if v_owner is null or not public.can_edit_workspace(v_workspace) then
    raise exception 'Workspace edit access required' using errcode = '42501';
  end if;
  if not public.workspace_write_allowed(v_workspace) then
    raise exception 'WORKSPACE_READ_ONLY' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 71104));
  if v_status not in ('uploaded', 'failed', 'ready_for_review') or exists (
    select 1 from entitlement_private.ocr_reservations
    where document_id = p_document_id and state = 'pending' and expires_at > now()
  ) then raise exception 'OCR_ALREADY_PROCESSING' using errcode = '23514'; end if;
  select * into v_state from entitlement_private.ocr_quota_state(v_owner, v_period);
  if v_state.used + v_state.pending >= v_state.quota then
    raise exception 'OCR_QUOTA_EXCEEDED' using errcode = '23514';
  end if;
  insert into entitlement_private.ocr_reservations(document_id, owner_id, period_month)
    values (p_document_id, v_owner, v_period) returning id into v_id;
  return v_id;
end;
$$;

create or replace function entitlement_private.reserve_voice_ocr(p_workspace_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_owner uuid; v_id uuid; v_state record;
  v_period date := date_trunc('month', now() at time zone 'UTC')::date;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select w.owner_id into v_owner from public.workspaces w
    where w.id = p_workspace_id and w.archived_at is null;
  if v_owner is null or not public.can_edit_workspace(p_workspace_id) then
    raise exception 'Workspace edit access required' using errcode = '42501';
  end if;
  if not public.workspace_write_allowed(p_workspace_id) then
    raise exception 'WORKSPACE_READ_ONLY' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 71104));
  select * into v_state from entitlement_private.ocr_quota_state(v_owner, v_period);
  if v_state.used + v_state.pending >= v_state.quota then
    raise exception 'OCR_QUOTA_EXCEEDED' using errcode = '23514';
  end if;
  insert into entitlement_private.ocr_reservations(owner_id, period_month, workspace_id, created_by)
    values (v_owner, v_period, p_workspace_id, v_user) returning id into v_id;
  return v_id;
end;
$$;

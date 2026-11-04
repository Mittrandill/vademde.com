-- Workspace features belong to the owner. Never expose their billing record to members.
create schema if not exists entitlement_private;
revoke all on schema entitlement_private from public, anon, authenticated;
grant usage on schema entitlement_private to authenticated, service_role;

create or replace function public.plan_for_owner(p_owner uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((
    select s.plan from public.subscriptions s
    where s.owner_id = p_owner and s.plan in ('plus', 'isletme')
      and s.status in ('active', 'trialing', 'grace_period', 'cancelled')
      and (s.status = 'grace_period' or s.current_period_end > now()
        or (s.current_period_end is null and s.status in ('active', 'trialing')))
  ), 'free');
$$;

create or replace function entitlement_private.get_entitlements(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
  v_plan text;
  v_limits public.plan_limits;
  v_used integer;
  v_pending integer;
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
  select coalesce(used_count, 0) into v_used from public.ocr_usage
    where owner_id = v_owner and period_month = v_period;
  v_used := coalesce(v_used, 0);
  select count(*) into v_pending from entitlement_private.ocr_reservations
    where owner_id = v_owner and period_month = v_period and state = 'pending' and expires_at > now();
  return jsonb_build_object(
    'workspaceId', p_workspace_id, 'plan', v_plan, 'inherited', v_owner <> v_user,
    'limits', to_jsonb(v_limits), 'periodMonth', v_period,
    'usedCount', v_used, 'quota', v_limits.monthly_ocr_quota,
    'remaining', greatest(v_limits.monthly_ocr_quota - v_used - v_pending, 0),
    'readOnly', case when p_workspace_id is null then false
      else not public.workspace_write_allowed(p_workspace_id) end
  );
end;
$$;
revoke all on function entitlement_private.get_entitlements(uuid) from public, anon;
grant execute on function entitlement_private.get_entitlements(uuid) to authenticated;

create or replace function public.get_workspace_entitlements(p_workspace_id uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select entitlement_private.get_entitlements(p_workspace_id);
$$;
revoke all on function public.get_workspace_entitlements(uuid) from public, anon;
grant execute on function public.get_workspace_entitlements(uuid) to authenticated;

-- A pending scan reserves one slot in the owner's shared quota. Clients cannot alter
-- reservations; failed work releases its slot, successful retries are counted once.
create table entitlement_private.ocr_reservations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.financial_documents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  period_month date not null,
  state text not null default 'pending' check (state in ('pending', 'completed', 'released')),
  expires_at timestamptz not null default now() + interval '15 minutes'
);
alter table entitlement_private.ocr_reservations enable row level security;
create index ocr_reservations_owner_period on entitlement_private.ocr_reservations(owner_id, period_month) where state = 'pending';

create or replace function entitlement_private.reserve_ocr(p_document_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_workspace uuid; v_owner uuid; v_status text; v_id uuid; v_quota integer; v_used integer; v_pending integer;
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
  select monthly_ocr_quota into strict v_quota from public.plan_limits where plan = public.plan_for_owner(v_owner);
  select used_count into v_used from public.ocr_usage where owner_id = v_owner and period_month = v_period;
  select count(*) into v_pending from entitlement_private.ocr_reservations
    where owner_id = v_owner and period_month = v_period and state = 'pending' and expires_at > now();
  if coalesce(v_used, 0) + v_pending >= v_quota then
    raise exception 'OCR_QUOTA_EXCEEDED' using errcode = '23514';
  end if;
  insert into entitlement_private.ocr_reservations(document_id, owner_id, period_month)
    values (p_document_id, v_owner, v_period) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function entitlement_private.reserve_ocr(uuid) from public, anon;
grant execute on function entitlement_private.reserve_ocr(uuid) to authenticated;
create or replace function public.reserve_workspace_ocr(p_document_id uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select entitlement_private.reserve_ocr(p_document_id);
$$;
revoke all on function public.reserve_workspace_ocr(uuid) from public, anon;
grant execute on function public.reserve_workspace_ocr(uuid) to authenticated;

create or replace function entitlement_private.finish_ocr(p_reservation_id uuid, p_success boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_res entitlement_private.ocr_reservations;
begin
  select * into strict v_res from entitlement_private.ocr_reservations where id = p_reservation_id;
  perform pg_advisory_xact_lock(hashtextextended(v_res.owner_id::text, 71104));
  select * into strict v_res from entitlement_private.ocr_reservations where id = p_reservation_id for update;
  if v_res.state <> 'pending' then return; end if;
  if p_success and v_res.expires_at <= now() then raise exception 'OCR_RESERVATION_EXPIRED'; end if;
  if p_success then
    perform public.increment_ocr_usage(v_res.owner_id, v_res.period_month);
  end if;
  update entitlement_private.ocr_reservations set state = case when p_success then 'completed' else 'released' end
    where id = p_reservation_id;
end;
$$;
revoke all on function entitlement_private.finish_ocr(uuid, boolean) from public, anon, authenticated;
grant execute on function entitlement_private.finish_ocr(uuid, boolean) to service_role;
create or replace function public.finish_workspace_ocr(p_reservation_id uuid, p_success boolean)
returns void language sql security invoker set search_path = '' as $$
  select entitlement_private.finish_ocr(p_reservation_id, p_success);
$$;
revoke all on function public.finish_workspace_ocr(uuid, boolean) from public, anon, authenticated;
grant execute on function public.finish_workspace_ocr(uuid, boolean) to service_role;

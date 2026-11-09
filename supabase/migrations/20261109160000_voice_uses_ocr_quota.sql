-- Bir sesli kayıt oturumu, sahibin paylaşılan OCR kotasından bir hak kullanır. Rezervasyon kimliği
-- oturum kimliğidir ve sunucuda üretilir; takip soruları oturum başına sınırlı olarak ek hak harcamaz.
alter table entitlement_private.ocr_reservations
  alter column document_id drop not null,
  add column workspace_id uuid references public.workspaces(id) on delete cascade,
  add column created_by uuid references auth.users(id) on delete cascade,
  add column follow_ups integer not null default 0,
  add constraint ocr_reservations_target check (document_id is not null or (workspace_id is not null and created_by is not null));

create or replace function entitlement_private.reserve_voice_ocr(p_workspace_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_owner uuid; v_id uuid; v_quota integer; v_used integer; v_pending integer;
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
  select monthly_ocr_quota into strict v_quota from public.plan_limits where plan = public.plan_for_owner(v_owner);
  select used_count into v_used from public.ocr_usage where owner_id = v_owner and period_month = v_period;
  select count(*) into v_pending from entitlement_private.ocr_reservations
    where owner_id = v_owner and period_month = v_period and state = 'pending' and expires_at > now();
  if coalesce(v_used, 0) + v_pending >= v_quota then
    raise exception 'OCR_QUOTA_EXCEEDED' using errcode = '23514';
  end if;
  insert into entitlement_private.ocr_reservations(owner_id, period_month, workspace_id, created_by)
    values (v_owner, v_period, p_workspace_id, v_user) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function entitlement_private.reserve_voice_ocr(uuid) from public, anon;
grant execute on function entitlement_private.reserve_voice_ocr(uuid) to authenticated;
create or replace function public.reserve_workspace_voice_ocr(p_workspace_id uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select entitlement_private.reserve_voice_ocr(p_workspace_id);
$$;
revoke all on function public.reserve_workspace_voice_ocr(uuid) from public, anon;
grant execute on function public.reserve_workspace_voice_ocr(uuid) to authenticated;

-- Oturum geçerliyse bir takip hakkı kullanır; false dönerse çağıran yeni bir kota hakkı ayırmalıdır.
create or replace function entitlement_private.use_voice_follow_up(p_session_id uuid, p_workspace_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update entitlement_private.ocr_reservations set follow_ups = follow_ups + 1
    where id = p_session_id and document_id is null and workspace_id = p_workspace_id
      and created_by = auth.uid() and state = 'completed' and expires_at > now() and follow_ups < 5
    returning id into v_id;
  return v_id is not null;
end;
$$;
revoke all on function entitlement_private.use_voice_follow_up(uuid, uuid) from public, anon;
grant execute on function entitlement_private.use_voice_follow_up(uuid, uuid) to authenticated;
create or replace function public.use_workspace_voice_follow_up(p_session_id uuid, p_workspace_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select entitlement_private.use_voice_follow_up(p_session_id, p_workspace_id);
$$;
revoke all on function public.use_workspace_voice_follow_up(uuid, uuid) from public, anon;
grant execute on function public.use_workspace_voice_follow_up(uuid, uuid) to authenticated;

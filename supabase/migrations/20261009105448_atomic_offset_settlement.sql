-- Additive staging-only change. Requires financial-integrity and private card ledger migrations.
create table finance_private.offset_requests (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid not null,
  actor_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id,request_id)
);
alter table finance_private.offset_requests enable row level security;
revoke all on finance_private.offset_requests from public,anon,authenticated;
grant select,insert on finance_private.offset_requests to authenticated;
create policy offset_request_read on finance_private.offset_requests for select to authenticated
  using (actor_id=(select auth.uid()) and public.can_edit_workspace(workspace_id));
create policy offset_request_write on finance_private.offset_requests for insert to authenticated
  with check (actor_id=(select auth.uid()) and public.can_edit_workspace(workspace_id));

create or replace function finance_private.offset_payment_snapshot(p public.payments)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('id',p.id,'workspace_id',p.workspace_id,'obligation_id',p.obligation_id,
    'installment_id',p.installment_id,'amount_minor',p.amount_minor,'settled_by',p.settled_by_obligation_id,
    'paid_at_epoch',extract(epoch from p.paid_at),'fx',p.fx_rate_try_minor,
    'account_id',p.account_id,'transaction_id',p.transaction_id)
$$;
revoke all on function finance_private.offset_payment_snapshot(public.payments) from public,anon;
grant execute on function finance_private.offset_payment_snapshot(public.payments) to authenticated;

-- Allocation uses current installment balances inside the parent locks; not a client snapshot.
create function finance_private.write_offset_slices(
  p_workspace uuid,p_obligation uuid,p_counter uuid,p_amount bigint,
  p_paid_at timestamptz,p_fx bigint,p_note text
) returns void language plpgsql security invoker set search_path='' as $$
declare slice public.installments; left_amount bigint:=p_amount; applied bigint; has_plan boolean;
begin
  if not public.can_edit_workspace(p_workspace) or p_amount is null or p_amount<=0 then
    raise exception 'Mahsup ödeme dilimi geçersiz';
  end if;
  select exists(select 1 from public.installments where obligation_id=p_obligation) into has_plan;
  if not has_plan then
    insert into public.payments(workspace_id,obligation_id,amount_minor,paid_at,
      account_id,transaction_id,settled_by_obligation_id,fx_rate_try_minor,notes)
    values(p_workspace,p_obligation,p_amount,p_paid_at,null,null,p_counter,p_fx,p_note);
    return;
  end if;
  for slice in select * from public.installments where obligation_id=p_obligation
    and status<>'iptal_edildi' and remaining_amount_minor>0
    order by due_date nulls last,installment_number,id loop
    exit when left_amount<=0;
    applied:=least(left_amount,slice.remaining_amount_minor);
    insert into public.payments(workspace_id,obligation_id,installment_id,amount_minor,paid_at,
      account_id,transaction_id,settled_by_obligation_id,fx_rate_try_minor,notes)
    values(p_workspace,p_obligation,slice.id,applied,p_paid_at,null,null,p_counter,p_fx,p_note);
    left_amount:=left_amount-applied;
  end loop;
  if left_amount>0 then raise exception 'Mahsup tutarı açık taksit kalanını aşıyor; planı kontrol edin'; end if;
end;
$$;
revoke all on function finance_private.write_offset_slices(uuid,uuid,uuid,bigint,timestamptz,bigint,text) from public,anon;
grant execute on function finance_private.write_offset_slices(uuid,uuid,uuid,bigint,timestamptz,bigint,text) to authenticated;

create or replace function public.settle_offset_atomic(
  p_expected_actor uuid,p_request_id uuid,p_workspace_id uuid,p_counterparty_id uuid,
  p_direction text,p_currency_code text,p_amount_minor bigint,p_paid_at timestamptz,
  p_fx_rate_try_minor bigint,p_pairs jsonb,p_expected jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare payload jsonb; previous finance_private.offset_requests; pair jsonb; expected jsonb;
  source public.obligations; target public.obligations; o public.obligations;
  ids uuid[]; source_ids uuid[]; target_ids uuid[]; remaining bigint; snapshot bigint;
  pair_amount bigint; pair_total bigint; result jsonb; existing_ids uuid[]; payment_snapshots jsonb;
begin
  if p_expected_actor is null or auth.uid() is distinct from p_expected_actor
    or not public.can_edit_workspace(p_workspace_id) then raise exception 'Mahsup yazma yetkisi veya kuyruk sahibi uyuşmuyor'; end if;
  if p_request_id is null or p_counterparty_id is null or p_paid_at is null
    or p_direction is null or p_direction not in ('payable','receivable') or p_currency_code is null
    or p_amount_minor is null or p_amount_minor<=0 or jsonb_typeof(p_pairs) is distinct from 'array'
    or jsonb_typeof(p_expected) is distinct from 'array' then raise exception 'Mahsup bilgileri geçersiz'; end if;
  if jsonb_array_length(p_pairs)=0 or jsonb_array_length(p_pairs)>1000 then raise exception 'Mahsup çift listesi boş veya çok büyük'; end if;
  payload:=jsonb_build_object('counterparty',p_counterparty_id,'direction',p_direction,
    'currency',p_currency_code,'amount',p_amount_minor,'paid_at_epoch',extract(epoch from p_paid_at),
    'fx',p_fx_rate_try_minor,'pairs',p_pairs,'expected',p_expected);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('offset:'||p_workspace_id::text||p_request_id::text,0));
  select * into previous from finance_private.offset_requests where workspace_id=p_workspace_id and request_id=p_request_id;
  if found then
    if previous.result->>'cancelled'='true' then raise exception 'Bu mahsup isteği iptal edildi; yeni işlem kimliği gerekir'; end if;
    if pg_catalog.to_regclass('finance_private.offset_reversals') is not null then
      if exists(select 1 from finance_private.offset_reversals where workspace_id=p_workspace_id and request_id=p_request_id) then
        raise exception 'Bu mahsup geri alındı; yeniden uygulamak için yeni işlem gerekir';
      end if;
    end if;
    if previous.payload<>payload then raise exception 'Mahsup işlem kimliği farklı içerikle kullanılamaz'; end if;
    return previous.result;
  end if;
  select array_agg(distinct (x->>'source_id')::uuid),array_agg(distinct (x->>'target_id')::uuid),sum((x->>'amount_minor')::bigint)
    into source_ids,target_ids,pair_total from jsonb_array_elements(p_pairs) x;
  if array_position(source_ids,null) is not null or array_position(target_ids,null) is not null
    or source_ids&&target_ids or pair_total is distinct from p_amount_minor
    or exists(select 1 from jsonb_array_elements(p_pairs) x where (x->>'amount_minor')::bigint is null or (x->>'amount_minor')::bigint<=0)
    then raise exception 'Mahsup çiftleri veya toplamı geçersiz'; end if;
  ids:=source_ids||target_ids;
  if jsonb_array_length(p_expected)<>cardinality(ids)
    or (select count(distinct (x->>'id')::uuid) from jsonb_array_elements(p_expected) x)<>cardinality(ids)
    or exists(select 1 from jsonb_array_elements(p_expected) x where (x->>'id')::uuid is null or not ((x->>'id')::uuid=any(ids)))
    then raise exception 'Mahsup kalan kontrol listesi uyuşmuyor'; end if;
  perform id from public.obligations where id=any(ids) order by id for update;
  if (select count(*) from public.obligations where id=any(ids))<>cardinality(ids) then raise exception 'Mahsup kaydı bulunamadı'; end if;
  -- All parent locks precede all installment locks, consistent with ordinary payments.
  perform id from public.installments where obligation_id=any(ids) order by id for update;
  for expected in select * from jsonb_array_elements(p_expected) loop
    select * into o from public.obligations where id=(expected->>'id')::uuid;
    if o.workspace_id<>p_workspace_id or o.counterparty_id is distinct from p_counterparty_id
      or o.currency_code<>p_currency_code or o.status='iptal_edildi' or o.document_type='kredi_karti_ekstresi'
      or o.direction<>(case when o.id=any(target_ids) then p_direction
        when p_direction='payable' then 'receivable' else 'payable' end)
      then raise exception 'Mahsup kaydının cari, yön, birim veya çalışma alanı uyuşmuyor'; end if;
    select o.total_amount_minor-coalesce(sum(amount_minor),0) into remaining from public.payments where obligation_id=o.id;
    if remaining<=0 or remaining is distinct from (expected->>'remaining_amount_minor')::bigint then
      raise exception 'Mahsup kalan tutarı değişti; kayıtları yenileyin'; end if;
  end loop;
  snapshot:=p_fx_rate_try_minor;
  if p_currency_code='TRY' then snapshot:=null;
  elsif snapshot is null then select try_equivalent_minor into snapshot from public.value_unit_rates where unit_code=p_currency_code; end if;
  if p_currency_code<>'TRY' and (snapshot is null or snapshot<=0) then raise exception 'Mahsup için kur bulunamadı'; end if;
  -- All affected parents are locked: another writer cannot add a payment between these snapshots.
  select coalesce(array_agg(id),'{}'::uuid[]) into existing_ids from public.payments
    where workspace_id=p_workspace_id and obligation_id=any(ids);
  for pair in select * from jsonb_array_elements(p_pairs) loop
    select * into source from public.obligations where id=(pair->>'source_id')::uuid;
    select * into target from public.obligations where id=(pair->>'target_id')::uuid;
    pair_amount:=(pair->>'amount_minor')::bigint;
    perform finance_private.write_offset_slices(p_workspace_id,target.id,source.id,pair_amount,p_paid_at,snapshot,'Mahsup edildi: '||source.title);
    perform finance_private.write_offset_slices(p_workspace_id,source.id,target.id,pair_amount,p_paid_at,snapshot,'Mahsup edildi: '||target.title);
  end loop;
  select jsonb_build_object('allocations',jsonb_agg(jsonb_build_object('obligation_id',id,'amount_minor',amount) order by first_pair)) into result from (
    select (x->>'target_id')::uuid id,sum((x->>'amount_minor')::bigint) amount,min(ord) first_pair
      from jsonb_array_elements(p_pairs) with ordinality as pairs(x,ord) group by (x->>'target_id')::uuid
  ) allocation;
  select jsonb_agg(finance_private.offset_payment_snapshot(p) order by p.id) into payment_snapshots
    from public.payments p where p.workspace_id=p_workspace_id and p.obligation_id=any(ids) and not (p.id=any(existing_ids));
  if payment_snapshots is null or (select sum((x->>'amount_minor')::numeric) from jsonb_array_elements(payment_snapshots) x)<>2*p_amount_minor::numeric then
    raise exception 'Mahsup kapanış makbuzu eksik veya toplamı uyuşmuyor';
  end if;
  result:=result||jsonb_build_object('payment_snapshots',payment_snapshots);
  insert into finance_private.offset_requests(workspace_id,request_id,actor_id,payload,result)
    values(p_workspace_id,p_request_id,auth.uid(),payload,result);
  return result;
end;
$$;
revoke all on function public.settle_offset_atomic(uuid,uuid,uuid,uuid,text,text,bigint,timestamptz,bigint,jsonb,jsonb) from public,anon;
grant execute on function public.settle_offset_atomic(uuid,uuid,uuid,uuid,text,text,bigint,timestamptz,bigint,jsonb,jsonb) to authenticated;

-- Cancellation reserves the request ID under the SAME lock. A delayed network request
-- cannot commit after the client discards its local queue. Already committed offsets are NOT undone.
create or replace function public.cancel_offset_request(p_expected_actor uuid,p_workspace_id uuid,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare previous finance_private.offset_requests;
begin
  if p_expected_actor is null or auth.uid() is distinct from p_expected_actor
    or not public.can_edit_workspace(p_workspace_id) or p_request_id is null then
    raise exception 'Mahsup iptal yetkisi veya işlem sahibi uyuşmuyor';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('offset:'||p_workspace_id::text||p_request_id::text,0));
  select * into previous from finance_private.offset_requests where workspace_id=p_workspace_id and request_id=p_request_id;
  if found then
    if previous.result->>'cancelled'='true' then return jsonb_build_object('state','cancelled'); end if;
    if pg_catalog.to_regclass('finance_private.offset_reversals') is not null then
      if exists(select 1 from finance_private.offset_reversals where workspace_id=p_workspace_id and request_id=p_request_id) then
        return jsonb_build_object('state','reversed');
      end if;
    end if;
    return jsonb_build_object('state','confirmed');
  end if;
  insert into finance_private.offset_requests(workspace_id,request_id,actor_id,payload,result)
    values(p_workspace_id,p_request_id,auth.uid(),'{}','{"cancelled":true}');
  return jsonb_build_object('state','cancelled');
end;
$$;
revoke all on function public.cancel_offset_request(uuid,uuid,uuid) from public,anon;
grant execute on function public.cancel_offset_request(uuid,uuid,uuid) to authenticated;

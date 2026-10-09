-- Additive, staging-only. No historical payments or receipts are reconstructed or rewritten.
create table finance_private.offset_reversals (
  workspace_id uuid not null,
  request_id uuid not null,
  actor_id uuid not null,
  reversed_at timestamptz not null default now(),
  primary key(workspace_id,request_id),
  foreign key(workspace_id,request_id) references finance_private.offset_requests(workspace_id,request_id) on delete cascade
);
alter table finance_private.offset_reversals enable row level security;
revoke all on finance_private.offset_reversals from public,anon,authenticated;
grant select,insert on finance_private.offset_reversals to authenticated;
create policy offset_reversal_read on finance_private.offset_reversals for select to authenticated
  using(actor_id=(select auth.uid()) and public.can_edit_workspace(workspace_id));
create policy offset_reversal_write on finance_private.offset_reversals for insert to authenticated
  with check(actor_id=(select auth.uid()) and public.can_edit_workspace(workspace_id));

create function public.reverse_offset_atomic(p_expected_actor uuid,p_workspace_id uuid,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare receipt finance_private.offset_requests; expected jsonb; p public.payments;
  payment_ids uuid[]; obligation_ids uuid[]; deleted_count bigint;
begin
  if p_expected_actor is null or auth.uid() is distinct from p_expected_actor
    or not public.can_edit_workspace(p_workspace_id) or p_request_id is null then
    raise exception 'Mahsup geri alma yetkisi veya işlem sahibi uyuşmuyor';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('offset:'||p_workspace_id::text||p_request_id::text,0));
  select * into receipt from finance_private.offset_requests where workspace_id=p_workspace_id and request_id=p_request_id;
  if not found then raise exception 'Mahsup işlem makbuzu bulunamadı'; end if;
  if exists(select 1 from finance_private.offset_reversals where workspace_id=p_workspace_id and request_id=p_request_id) then
    return jsonb_build_object('state','reversed');
  end if;
  if receipt.result->>'cancelled'='true' then raise exception 'Kaydedilmemiş mahsup geri alınamaz'; end if;
  if jsonb_typeof(receipt.result->'payment_snapshots') is distinct from 'array' then
    raise exception 'Eski mahsup makbuzunda ödeme kimlikleri yok; otomatik geri alma güvenli değil';
  end if;
  select array_agg((x->>'id')::uuid),array_agg(distinct (x->>'obligation_id')::uuid)
    into payment_ids,obligation_ids from jsonb_array_elements(receipt.result->'payment_snapshots') x;
  if coalesce(cardinality(payment_ids),0)=0 then raise exception 'Mahsup ödeme listesi boş'; end if;
  perform id from public.obligations where id=any(obligation_ids) order by id for update;
  if (select count(*) from public.obligations where id=any(obligation_ids))<>cardinality(obligation_ids)
    or exists(select 1 from public.obligations o where o.id=any(obligation_ids) and (
      o.workspace_id<>p_workspace_id or o.currency_code<>receipt.payload->>'currency'
      or o.counterparty_id is distinct from (receipt.payload->>'counterparty')::uuid or o.status='iptal_edildi'
      or o.direction<>(case when o.id in (select (x->>'target_id')::uuid from jsonb_array_elements(receipt.payload->'pairs') x)
        then receipt.payload->>'direction' when receipt.payload->>'direction'='payable' then 'receivable' else 'payable' end)
    )) then raise exception 'Mahsup kayıtlarının kapsamı değişti; geri alma durduruldu'; end if;
  perform id from public.installments where obligation_id=any(obligation_ids) order by id for update;
  perform id from public.payments where id=any(payment_ids) order by id for update;
  for expected in select * from jsonb_array_elements(receipt.result->'payment_snapshots') loop
    select * into p from public.payments where id=(expected->>'id')::uuid;
    if not found or finance_private.offset_payment_snapshot(p) is distinct from expected then
      raise exception 'Mahsup ödeme satırı silinmiş veya değiştirilmiş; tek taraflı geri alma yapılmadı';
    end if;
  end loop;
  delete from public.payments where id=any(payment_ids) and workspace_id=p_workspace_id;
  get diagnostics deleted_count=row_count;
  if deleted_count<>cardinality(payment_ids) then raise exception 'Mahsup satırlarının tümü geri alınamadı'; end if;
  insert into finance_private.offset_reversals(workspace_id,request_id,actor_id) values(p_workspace_id,p_request_id,auth.uid());
  return jsonb_build_object('state','reversed');
end;
$$;
revoke all on function public.reverse_offset_atomic(uuid,uuid,uuid) from public,anon;
grant execute on function public.reverse_offset_atomic(uuid,uuid,uuid) to authenticated;

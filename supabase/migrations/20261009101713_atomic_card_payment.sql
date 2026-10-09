-- Additive only. Requires the financial-integrity migration and full staging validation.
-- Not a Data API schema: durable receipts cannot be updated/deleted by app clients.
create schema if not exists finance_private;
revoke all on schema finance_private from public, anon;
grant usage on schema finance_private to authenticated;
create table finance_private.card_payment_requests (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid not null,
  actor_id uuid not null,
  payload jsonb not null,
  transaction_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, request_id)
);
alter table finance_private.card_payment_requests enable row level security;
revoke all on finance_private.card_payment_requests from public, anon, authenticated;
grant select, insert on finance_private.card_payment_requests to authenticated;
create policy card_payment_request_read on finance_private.card_payment_requests
  for select to authenticated using (actor_id = (select auth.uid()) and public.can_edit_workspace(workspace_id));
create policy card_payment_request_write on finance_private.card_payment_requests
  for insert to authenticated with check (actor_id = (select auth.uid()) and public.can_edit_workspace(workspace_id));

create or replace function public.record_card_payment_atomic(
  p_request_id uuid, p_workspace_id uuid, p_card_account_id uuid,
  p_source_account_id uuid, p_amount_minor bigint, p_currency_code text, p_paid_at timestamptz
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  payload jsonb; previous finance_private.card_payment_requests;
  card public.accounts; source public.accounts; statement public.obligations;
  transfer_id uuid; snapshot bigint; unallocated bigint; applied bigint;
begin
  if auth.uid() is null or not public.can_edit_workspace(p_workspace_id) then
    raise exception 'Kart ödemesi yazma yetkisi yok';
  end if;
  if p_request_id is null or p_amount_minor is null or p_amount_minor <= 0 or p_paid_at is null
     or p_currency_code is null or p_source_account_id is null or p_card_account_id is null
     or p_source_account_id = p_card_account_id then
    raise exception 'Kart ödeme bilgileri geçersiz';
  end if;
  payload := jsonb_build_object('card',p_card_account_id,'source',p_source_account_id,
    'amount',p_amount_minor,'currency',p_currency_code,'paid_at_epoch',extract(epoch from p_paid_at));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text || p_request_id::text, 0));
  select * into previous from finance_private.card_payment_requests
    where workspace_id = p_workspace_id and request_id = p_request_id;
  if found then
    if previous.payload <> payload then raise exception 'İşlem kimliği farklı bir ödeme için kullanılamaz'; end if;
    return previous.transaction_id;
  end if;
  -- Account locks first, sorted; then all statement locks sorted, not allocation order.
  perform id from public.accounts where id in (p_card_account_id,p_source_account_id) order by id for update;
  select * into card from public.accounts where id = p_card_account_id;
  select * into source from public.accounts where id = p_source_account_id;
  if card.id is null or source.id is null or card.workspace_id <> p_workspace_id
     or source.workspace_id <> p_workspace_id or card.type <> 'credit_card'
     or source.type in ('credit_card','pos') or card.currency_code <> p_currency_code
     or source.currency_code <> p_currency_code then
    raise exception 'Kart, kaynak hesap, çalışma alanı veya para birimi uyuşmuyor';
  end if;
  perform id from public.obligations where workspace_id = p_workspace_id and account_id = p_card_account_id
    and document_type = 'kredi_karti_ekstresi' and status <> 'iptal_edildi' and remaining_amount_minor > 0
    order by id for update;
  if p_currency_code <> 'TRY' then
    select try_equivalent_minor into snapshot from public.value_unit_rates where unit_code = p_currency_code;
    if snapshot is null or snapshot <= 0 then raise exception 'Kart ödemesi için kur bulunamadı'; end if;
  end if;
  insert into public.transactions(workspace_id,account_id,transfer_to_account_id,direction,
    amount_minor,currency_code,fx_rate_try_minor,occurred_at,description)
    values(p_workspace_id,p_source_account_id,p_card_account_id,'transfer',p_amount_minor,
      p_currency_code,snapshot,p_paid_at,'Kredi kartı ödemesi') returning id into transfer_id;
  unallocated := p_amount_minor;
  for statement in select * from public.obligations where workspace_id = p_workspace_id
    and account_id = p_card_account_id and document_type = 'kredi_karti_ekstresi'
    and status <> 'iptal_edildi' and remaining_amount_minor > 0
    order by due_date nulls last, created_at, id loop
    exit when unallocated <= 0;
    if statement.currency_code <> p_currency_code or statement.direction <> 'payable' then
      raise exception 'Kart ekstresinin para birimi veya yönü uyuşmuyor';
    end if;
    -- Card statements are single obligations, not installment plans. Fail closed if corrupt.
    if exists(select 1 from public.installments where obligation_id = statement.id and status <> 'iptal_edildi') then
      raise exception 'Kart ekstresinde beklenmeyen taksit planı var';
    end if;
    applied := least(unallocated,statement.remaining_amount_minor);
    insert into public.payments(workspace_id,obligation_id,amount_minor,account_id,transaction_id,paid_at,fx_rate_try_minor)
      values(p_workspace_id,statement.id,applied,null,transfer_id,p_paid_at,snapshot);
    unallocated := unallocated - applied;
  end loop;
  -- No FK to the movement: even if it is subsequently deleted, replay must not recreate it.
  insert into finance_private.card_payment_requests(workspace_id,request_id,actor_id,payload,transaction_id)
    values(p_workspace_id,p_request_id,auth.uid(),payload,transfer_id);
  return transfer_id;
end;
$$;
revoke all on function public.record_card_payment_atomic(uuid,uuid,uuid,uuid,bigint,text,timestamptz) from public, anon;
grant execute on function public.record_card_payment_atomic(uuid,uuid,uuid,uuid,bigint,text,timestamptz) to authenticated;

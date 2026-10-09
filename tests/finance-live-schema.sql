-- Only run against a restored, disposable copy of the live schema.
-- Real auth.uid(), RLS, plan enforcement, constraints and triggers are preserved.
\set ON_ERROR_STOP on
do $$ begin
  if current_database() not in ('vademde_release_stage','vademde_release_stage_2','vademde_release_stage_3') then raise exception 'Local restored staging DB required'; end if;
end $$;
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('d3000000-0000-4000-8000-000000000001','finance-owner@example.invalid','{}'),
 ('d3000000-0000-4000-8000-000000000002','finance-viewer@example.invalid','{}'),
 ('d3000000-0000-4000-8000-000000000003','finance-outsider@example.invalid','{}');
select set_config('request.jwt.claim.sub','d3000000-0000-4000-8000-000000000001',true);
set local role authenticated;
insert into public.workspaces(id,name,owner_id) values
 ('d3000000-0000-4000-8000-000000000010','Release test','d3000000-0000-4000-8000-000000000001');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('d3000000-0000-4000-8000-000000000010','d3000000-0000-4000-8000-000000000002','viewer');
insert into public.counterparties(id,workspace_id,name) values
 ('d3000000-0000-4000-8000-000000000020','d3000000-0000-4000-8000-000000000010','Release customer');
insert into public.accounts(id,workspace_id,name,type) values
 ('d3000000-0000-4000-8000-000000000030','d3000000-0000-4000-8000-000000000010','Release cash','cash'),
 ('d3000000-0000-4000-8000-000000000031','d3000000-0000-4000-8000-000000000010','Release card','credit_card');
insert into public.obligations(id,workspace_id,counterparty_id,title,direction,document_type,total_amount_minor) values
 ('d3000000-0000-4000-8000-000000000040','d3000000-0000-4000-8000-000000000010','d3000000-0000-4000-8000-000000000020','Invoice','receivable','fatura',3000000);
insert into public.installments(id,workspace_id,obligation_id,installment_number,due_date,amount_minor) values
 ('d3000000-0000-4000-8000-000000000050','d3000000-0000-4000-8000-000000000010','d3000000-0000-4000-8000-000000000040',1,'2026-10-01',1500000),
 ('d3000000-0000-4000-8000-000000000051','d3000000-0000-4000-8000-000000000010','d3000000-0000-4000-8000-000000000040',2,'2026-11-01',1500000);
do $$ declare header jsonb; items jsonb; expected jsonb; receipt jsonb; original jsonb; advance uuid;
  ws uuid:='d3000000-0000-4000-8000-000000000010'; cp uuid:='d3000000-0000-4000-8000-000000000020';
  account uuid:='d3000000-0000-4000-8000-000000000030'; invoice uuid:='d3000000-0000-4000-8000-000000000040';
  request uuid:='d3000000-0000-4000-8000-000000000060'; offset_id uuid:='d3000000-0000-4000-8000-000000000061';
  rejected boolean; payment public.payments;
begin
  header:=jsonb_build_object('account_id',account,'counterparty_id',cp,'currency_code','TRY',
    'value_unit_type','fiat','direction','receivable','method','nakit','amount_minor',1000000,'paid_at','2026-10-09T12:00:00Z');
  items:=jsonb_build_array(jsonb_build_object('payment',jsonb_build_object('workspace_id',ws,'obligation_id',invoice,
    'installment_id','d3000000-0000-4000-8000-000000000050','account_id',account,'amount_minor',1000000,'paid_at',header->>'paid_at'),
    'transaction',jsonb_build_object('workspace_id',ws,'account_id',account,'counterparty_id',cp,'currency_code','TRY',
      'direction','income','payment_method','nakit','amount_minor',1000000)));
  expected:=jsonb_build_array(jsonb_build_object('id',invoice,'remaining_amount_minor',3000000));
  original:=public.settle_cash_atomic(auth.uid(),request,ws,header,items,expected);
  receipt:=public.settle_cash_atomic(auth.uid(),request,ws,header,items,expected);
  if receipt<>original or (select remaining_amount_minor from public.obligations where id=invoice)<>2000000
    or (select remaining_amount_minor from public.installments where id='d3000000-0000-4000-8000-000000000050')<>500000
    or (select count(*) from public.transactions where workspace_id=ws)<>1 then raise exception '30k/10k/20k or replay incorrect'; end if;
  raise notice 'PASS restored schema: 30,000 invoice - 10,000 receipt = 20,000, installment 5,000, replay one movement';
  rejected:=false;
  begin perform public.settle_cash_atomic(auth.uid(),gen_random_uuid(),ws,header,items,expected);
  exception when others then rejected:=sqlerrm like '%değişti%'; end;
  if not rejected then raise exception 'Stale snapshot accepted'; end if;
  select * into payment from public.payments where id=(original->'payments'->0->>'id')::uuid;
  perform public.delete_payment_atomic(payment.id,payment.amount_minor,payment.paid_at);
  if (select remaining_amount_minor from public.obligations where id=invoice)<>3000000
    or exists(select 1 from public.transactions where id=payment.transaction_id) then raise exception 'Atomic delete did not restore invoice and movement'; end if;
  -- A completed request must never recreate money after its payment was later deleted.
  perform public.settle_cash_atomic(auth.uid(),request,ws,header,items,expected);
  if exists(select 1 from public.payments where id=payment.id) then raise exception 'Replay recreated deleted payment'; end if;
  raise notice 'PASS restored schema: atomic deletion restores debt and completed replay does not recreate money';
  -- Existing app RPC remains usable, with the new server-side integrity trigger.
  perform public.record_payments(items);
  if (select remaining_amount_minor from public.obligations where id=invoice)<>2000000 then raise exception 'Old RPC compatibility broken'; end if;
  raise notice 'PASS restored schema: old record_payments RPC compatibility';
  header:=jsonb_set(header,'{amount_minor}','1000000');
  receipt:=public.settle_cash_atomic(auth.uid(),gen_random_uuid(),ws,header,'[]','[]');
  advance:=(receipt->'advance_obligation'->>'id')::uuid;
  if (select remaining_amount_minor from public.obligations where id=advance)<>1000000
    or (select direction from public.obligations where id=advance)<>'payable' then raise exception 'Advance incorrect'; end if;
  receipt:=public.settle_offset_atomic(auth.uid(),offset_id,ws,cp,'receivable','TRY',200000,'2026-10-09T12:00:00Z',null,
    jsonb_build_array(jsonb_build_object('source_id',advance,'target_id',invoice,'amount_minor',200000)),
    jsonb_build_array(jsonb_build_object('id',advance,'remaining_amount_minor',1000000),jsonb_build_object('id',invoice,'remaining_amount_minor',2000000)));
  if (select remaining_amount_minor from public.obligations where id=invoice)<>1800000
    or (select remaining_amount_minor from public.obligations where id=advance)<>800000 then raise exception 'Offset balances incorrect'; end if;
  perform public.reverse_offset_atomic(auth.uid(),ws,offset_id);
  perform public.reverse_offset_atomic(auth.uid(),ws,offset_id);
  if (select remaining_amount_minor from public.obligations where id=invoice)<>2000000
    or (select remaining_amount_minor from public.obligations where id=advance)<>1000000 then raise exception 'Offset reversal balances incorrect'; end if;
  raise notice 'PASS restored schema: advance, offset and idempotent reversal with real auth/RLS/triggers';
end $$;
insert into public.obligations(id,workspace_id,account_id,title,direction,document_type,total_amount_minor) values
 ('d3000000-0000-4000-8000-000000000041','d3000000-0000-4000-8000-000000000010','d3000000-0000-4000-8000-000000000031','Statement','payable','kredi_karti_ekstresi',1000000);
do $$ declare movement uuid; again uuid; ws uuid:='d3000000-0000-4000-8000-000000000010';
begin
  movement:=public.record_card_payment_owned(auth.uid(),'d3000000-0000-4000-8000-000000000062',ws,
    'd3000000-0000-4000-8000-000000000031','d3000000-0000-4000-8000-000000000030',500000,'TRY','2026-10-09T12:00:00Z');
  again:=public.record_card_payment_owned(auth.uid(),'d3000000-0000-4000-8000-000000000062',ws,
    'd3000000-0000-4000-8000-000000000031','d3000000-0000-4000-8000-000000000030',500000,'TRY','2026-10-09T12:00:00Z');
  if again<>movement or (select remaining_amount_minor from public.obligations where id='d3000000-0000-4000-8000-000000000041')<>500000
    or (select direction from public.transactions where id=movement)<>'transfer' then raise exception 'Card transfer or replay incorrect'; end if;
  raise notice 'PASS restored schema: card payment creates one transfer and reduces statement to 5,000';
end $$;
select set_config('request.jwt.claim.sub','d3000000-0000-4000-8000-000000000002',true);
do $$ declare rejected boolean:=false; ws uuid:='d3000000-0000-4000-8000-000000000010'; begin
  if (select count(*) from public.obligations where workspace_id=ws)<>3 then raise exception 'Viewer cannot see workspace'; end if;
  begin perform public.cancel_cash_settlement_request(auth.uid(),ws,gen_random_uuid()); exception when others then rejected:=true; end;
  if not rejected then raise exception 'Viewer can mutate cash ledger'; end if;
  raise notice 'PASS restored schema: viewer reads but cannot write financial requests';
end $$;
select set_config('request.jwt.claim.sub','d3000000-0000-4000-8000-000000000003',true);
do $$ begin
  if exists(select 1 from public.obligations where workspace_id='d3000000-0000-4000-8000-000000000010') then raise exception 'Cross-user RLS leak'; end if;
  if has_function_privilege('anon','public.settle_cash_atomic(uuid,uuid,uuid,jsonb,jsonb,jsonb)','EXECUTE')
    or has_table_privilege('authenticated','finance_private.cash_settlement_requests','UPDATE')
    or has_table_privilege('authenticated','finance_private.cash_settlement_requests','DELETE') then raise exception 'Excess cash privileges'; end if;
  raise notice 'PASS restored schema: other user cannot read, anon cannot execute, receipts immutable';
end $$;
reset role;
rollback;

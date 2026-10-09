do $$ begin
  if current_database() <> 'vademde_finance_test' then raise exception 'Disposable test DB required'; end if;
end $$;
create function public.test_card_request(request_id uuid, amount bigint default 1000000)
returns uuid language sql security invoker as $$
 select public.record_card_payment_atomic(request_id,'00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000001',amount,'TRY','2026-10-09T12:00:00Z')
$$;
set role authenticated;
do $$
declare tx uuid; replay uuid; count_before bigint; rejected boolean;
begin
 tx := public.test_card_request('00000000-0000-0000-0000-000000000320');
 if (select remaining_amount_minor from public.obligations where id='00000000-0000-0000-0000-000000000310') <> 2000000 then
  raise exception '30k minus 10k should be 20k'; end if;
 if (select remaining_amount_minor from public.obligations where id='00000000-0000-0000-0000-000000000312') <> 500000 then
  raise exception 'Cancelled statement must be ignored'; end if;
 select count(*) into count_before from public.transactions;
 replay := public.test_card_request('00000000-0000-0000-0000-000000000320');
 if replay <> tx or (select count(*) from public.transactions) <> count_before then raise exception 'Replay duplicated movement'; end if;
 rejected := false;
 begin perform public.test_card_request('00000000-0000-0000-0000-000000000320',2000000);
 exception when others then rejected := true; end;
 if not rejected then raise exception 'Changed payload must be rejected'; end if;
 raise notice 'PASS card payment 30k/10k/20k, cancelled exclusion, replay and payload conflict';
 perform public.test_card_request('00000000-0000-0000-0000-000000000321',3500000);
 if exists(select 1 from public.obligations where id in ('00000000-0000-0000-0000-000000000310','00000000-0000-0000-0000-000000000311') and remaining_amount_minor<>0) then
  raise exception 'Oldest statements should be paid fully'; end if;
 if (select sum(amount_minor) from public.payments where transaction_id=(select transaction_id from finance_private.card_payment_requests where request_id='00000000-0000-0000-0000-000000000321')) <> 3000000 then
  raise exception '5000 advance should only affect card balance, not statement payments'; end if;
 raise notice 'PASS multi-statement allocation and excess card credit';
end $$;
reset role;
-- Failure at the receipt-write step must roll back even the earlier transfer/payment writes.
create function public.test_reject_card_receipt() returns trigger language plpgsql as $$
begin raise exception 'Injected receipt write failure'; end $$;
create trigger test_receipt_failure before insert on finance_private.card_payment_requests
 for each row execute function public.test_reject_card_receipt();
set role authenticated;
do $$ declare count_before bigint; rejected boolean := false;
begin
 select count(*) into count_before from public.transactions;
 begin perform public.test_card_request('00000000-0000-0000-0000-000000000322',100000);
 exception when others then rejected:=true; end;
 if not rejected or (select count(*) from public.transactions) <> count_before then raise exception 'Partial transfer after failure'; end if;
 raise notice 'PASS final-step error rolls back transfer';
end $$;
reset role;
drop trigger test_receipt_failure on finance_private.card_payment_requests;
set role authenticated;
select set_config('test.editor','false',false);
do $$ declare rejected boolean := false;
begin
 begin perform public.test_card_request('00000000-0000-0000-0000-000000000320');
 exception when others then rejected:=true; end;
 if not rejected then raise exception 'Viewer must not replay an edit RPC'; end if;
 if has_table_privilege('authenticated','finance_private.card_payment_requests','DELETE')
    or has_table_privilege('authenticated','finance_private.card_payment_requests','UPDATE') then
  raise exception 'Receipts must not be mutable'; end if;
 raise notice 'PASS viewer rejection and immutable receipt privileges';
end $$;
reset role;
select set_config('test.editor','true',false);

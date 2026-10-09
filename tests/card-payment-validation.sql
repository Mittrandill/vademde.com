-- Additional tests for the current RPC; rolled back so they can be repeated.
begin;
do $$ begin
 if current_database()<>'vademde_finance_test' then raise exception 'Disposable DB required'; end if;
end $$;
set local role authenticated;
do $$ declare first_id uuid; second_id uuid; before_count bigint; rejected boolean:=false;
begin
 perform set_config('TimeZone','UTC',true);
 first_id:=public.test_card_request('00000000-0000-0000-0000-000000000325',100000);
 perform set_config('TimeZone','Europe/Istanbul',true);
 second_id:=public.test_card_request('00000000-0000-0000-0000-000000000325',100000);
 if first_id<>second_id then raise exception 'Same instant must replay across time zones'; end if;
 select count(*) into before_count from public.transactions;
 begin
 perform public.record_card_payment_atomic('00000000-0000-0000-0000-000000000326',
 '00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000301',
 '00000000-0000-0000-0000-000000000002',100000,'TRY','2026-10-09T12:00:00Z');
 exception when others then rejected:=true; end;
 if not rejected or (select count(*) from public.transactions)<>before_count then
 raise exception 'Currency mismatch must reject before writing'; end if;
 raise notice 'PASS time-zone-independent replay and mismatched source currency rejection';
end $$;
rollback;

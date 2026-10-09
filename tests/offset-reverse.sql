do $$ begin
 if current_database()<>'vademde_finance_test' then raise exception 'Disposable test DB required'; end if;
end $$;
-- Give the fixture's custom setting a real session value so SET LOCAL rolls back to true,
-- not an empty custom-GUC placeholder interpreted as a viewer by the reduced mock.
select set_config('test.editor','true',false);
begin;
set local role authenticated;
do $$ declare receipt jsonb; outcome jsonb; later_id uuid; before_count bigint; rejected boolean:=false;
begin
 receipt:=public.test_reverse_offset('00000000-0000-0000-0000-000000000520');
 if jsonb_array_length(receipt->'payment_snapshots')<>6 then raise exception 'Exact closure snapshots missing'; end if;
 insert into public.payments(workspace_id,obligation_id,installment_id,amount_minor,paid_at)
 values('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000503','00000000-0000-0000-0000-000000000511',200000,'2026-10-10T12:00:00Z') returning id into later_id;
 select count(*) into before_count from public.payments;
 outcome:=public.reverse_offset_atomic(auth.uid(),'00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000520');
 if outcome->>'state'<>'reversed' or (select count(*) from public.payments)<>before_count-6
 or not exists(select 1 from public.payments where id=later_id and amount_minor=200000)
 or (select remaining_amount_minor from public.obligations where id='00000000-0000-0000-0000-000000000500')<>1500000
 or (select remaining_amount_minor from public.obligations where id='00000000-0000-0000-0000-000000000501')<>1000000
 or (select remaining_amount_minor from public.obligations where id='00000000-0000-0000-0000-000000000502')<>1000000
 or (select remaining_amount_minor from public.obligations where id='00000000-0000-0000-0000-000000000503')<>1800000
 or (select remaining_amount_minor from public.installments where id='00000000-0000-0000-0000-000000000510')<>500000
 or (select remaining_amount_minor from public.installments where id='00000000-0000-0000-0000-000000000511')<>1300000 then raise exception 'Reversal balances or later payment incorrect'; end if;
 perform public.reverse_offset_atomic(auth.uid(),'00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000520');
 if (select count(*) from public.payments)<>before_count-6 then raise exception 'Reversal replay removed another payment'; end if;
 begin perform public.test_reverse_offset('00000000-0000-0000-0000-000000000520');
 exception when others then rejected:=sqlerrm like '%geri alındı%'; end;
 if not rejected then raise exception 'Reversed offset replay not blocked'; end if;
 outcome:=public.cancel_offset_request(auth.uid(),'00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000520');
 if outcome->>'state'<>'reversed' then raise exception 'Cancellation returned stale confirmed state'; end if;
 raise notice 'PASS six-row reversal restores both sides/installments, preserves later 2k payment, replay safe';
end $$;
reset role;
rollback;

begin;
set local role authenticated;
select set_config('test.editor','false',true);
do $$ declare rejected boolean:=false;
begin
 begin perform public.reverse_offset_atomic(auth.uid(),'00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000530'); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Viewer reversed offset'; end if;
 raise notice 'PASS viewer reversal rejected';
end $$;
reset role;
rollback;

begin;
set local role authenticated;
do $$ declare rejected boolean:=false; before_count bigint;
begin
 select count(*) into before_count from public.payments;
 if exists(select 1 from finance_private.offset_requests where request_id='00000000-0000-0000-0000-000000000440' and result->'payment_snapshots' is null) then
   begin perform public.reverse_offset_atomic(auth.uid(),'00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000440'); exception when others then rejected:=sqlerrm like '%Eski mahsup%'; end;
   if not rejected or (select count(*) from public.payments)<>before_count then raise exception 'Legacy receipt was guessed/reversed'; end if;
   raise notice 'PASS legacy receipt without exact payment IDs rejected';
 end if;
end $$;
reset role;
rollback;

begin;
set local role authenticated;
do $$ begin perform public.test_reverse_offset('00000000-0000-0000-0000-000000000521'); end $$;
reset role;
create function public.test_reversal_failure() returns trigger language plpgsql as $$ begin raise exception 'Injected reversal receipt failure'; end $$;
create trigger test_reversal_failure before insert on finance_private.offset_reversals for each row execute function public.test_reversal_failure();
set local role authenticated;
do $$ declare rejected boolean:=false; before_count bigint;
begin
 select count(*) into before_count from public.payments;
 begin perform public.reverse_offset_atomic(auth.uid(),'00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000521'); exception when others then rejected:=true; end;
 if not rejected or (select count(*) from public.payments)<>before_count
 or (select remaining_amount_minor from public.obligations where id='00000000-0000-0000-0000-000000000503')<>1000000
 or exists(select 1 from finance_private.offset_reversals where request_id='00000000-0000-0000-0000-000000000521') then raise exception 'Reversal failure left partial deletion'; end if;
 raise notice 'PASS final reversal receipt failure rolls back all deleted closures';
end $$;
reset role;
rollback;

begin;
set local role authenticated;
do $$ begin perform public.test_reverse_offset('00000000-0000-0000-0000-000000000522'); end $$;
update public.payments set amount_minor=amount_minor-1000 where id=(select id from public.payments where obligation_id='00000000-0000-0000-0000-000000000500' limit 1);
do $$ declare rejected boolean:=false; before_count bigint;
begin
 select count(*) into before_count from public.payments;
 begin perform public.reverse_offset_atomic(auth.uid(),'00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000522'); exception when others then rejected:=true; end;
 if not rejected or (select count(*) from public.payments)<>before_count then raise exception 'Modified closure silently reversed'; end if;
 rejected:=false;
 begin perform public.reverse_offset_atomic('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000522'); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Wrong actor accepted'; end if;
 if has_function_privilege('anon','public.reverse_offset_atomic(uuid,uuid,uuid)','EXECUTE')
 or has_table_privilege('authenticated','finance_private.offset_reversals','UPDATE')
 or has_table_privilege('authenticated','finance_private.offset_reversals','DELETE') then raise exception 'Excess reversal privileges'; end if;
 raise notice 'PASS changed payment/actor mismatch rejected, immutable reversal receipt, anon denied';
end $$;
reset role;
rollback;

begin;
do $$ begin
 if current_database()<>'vademde_finance_test' then raise exception 'Disposable test DB required'; end if;
end $$;
-- A later pair failure must undo the already-written first pair and its recomputations.
create function public.test_offset_failure() returns trigger language plpgsql as $$
begin
 if new.obligation_id='00000000-0000-0000-0000-000000000401' then raise exception 'Injected second-source failure'; end if;
 return new;
end $$;
create trigger test_offset_failure before insert on public.payments for each row execute function public.test_offset_failure();
set local role authenticated;
do $$ declare rejected boolean:=false; before_payments bigint;
begin
 select count(*) into before_payments from public.payments;
 begin perform public.test_offset('00000000-0000-0000-0000-000000000420');
 exception when others then rejected:=true; end;
 if not rejected or (select count(*) from public.payments)<>before_payments
 or exists(select 1 from public.obligations where id in ('00000000-0000-0000-0000-000000000400','00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000403') and remaining_amount_minor<>total_amount_minor)
 or exists(select 1 from finance_private.offset_requests where request_id='00000000-0000-0000-0000-000000000420') then raise exception 'Partial offset after failure'; end if;
 raise notice 'PASS later pair failure rolls back both sides, installments and receipt';
end $$;
reset role;
drop trigger test_offset_failure on public.payments;
set local role authenticated;
do $$ declare result jsonb; replay jsonb; before_tx bigint; before_payments bigint; rejected boolean:=false;
begin
 select count(*) into before_tx from public.transactions;
 result:=public.test_offset('00000000-0000-0000-0000-000000000421');
 if (select remaining_amount_minor from public.obligations where id='00000000-0000-0000-0000-000000000403')<>1000000
 or (select remaining_amount_minor from public.obligations where id='00000000-0000-0000-0000-000000000401')<>500000
 or (select remaining_amount_minor from public.installments where id='00000000-0000-0000-0000-000000000410')<>0
 or (select remaining_amount_minor from public.installments where id='00000000-0000-0000-0000-000000000411')<>1000000
 then raise exception 'Incorrect offset or installment balance'; end if;
 if (select sum(p.amount_minor) from public.payments p join public.obligations o on o.id=p.obligation_id where o.id in ('00000000-0000-0000-0000-000000000400','00000000-0000-0000-0000-000000000401'))<>2000000
 or (select sum(p.amount_minor) from public.payments p join public.obligations o on o.id=p.obligation_id where o.id in ('00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000403'))<>2000000
 or (select count(*) from public.transactions)<>before_tx then raise exception 'Cash movement or unequal sides'; end if;
 select count(*) into before_payments from public.payments;
 replay:=public.test_offset('00000000-0000-0000-0000-000000000421');
 if replay<>result or (select count(*) from public.payments)<>before_payments then raise exception 'Replay duplicated offset'; end if;
 begin perform public.test_offset('00000000-0000-0000-0000-000000000421',1000000);
 exception when others then rejected:=true; end;
 if not rejected then raise exception 'Request payload conflict accepted'; end if;
 rejected:=false;
 begin perform public.test_offset('00000000-0000-0000-0000-000000000422');
 exception when others then rejected:=true; end;
 if not rejected or (select count(*) from public.payments)<>before_payments then raise exception 'Stale snapshot accepted'; end if;
 raise notice 'PASS 20k equal-sided offset, repeated-parent installment allocation, no cash, replay and stale snapshot';
end $$;
reset role;
rollback;

begin;
do $$ begin
 if current_database()<>'vademde_finance_test' then raise exception 'Disposable test DB required'; end if;
end $$;
-- Deliberate fixture corruption to exercise fail-closed checks, rolled back at the end.
update public.obligations set counterparty_id='00000000-0000-0000-0000-000000000041'
 where id='00000000-0000-0000-0000-000000000400';
set local role authenticated;
do $$ declare rejected boolean:=false; before_count bigint;
begin
 select count(*) into before_count from public.payments;
 begin perform public.test_offset('00000000-0000-0000-0000-000000000430'); exception when others then rejected:=true; end;
 if not rejected or (select count(*) from public.payments)<>before_count then raise exception 'Other counterparty offset accepted'; end if;
 raise notice 'PASS different counterparty rejected without payments';
end $$;
reset role;
update public.obligations set counterparty_id='00000000-0000-0000-0000-000000000040' where id='00000000-0000-0000-0000-000000000400';
update public.installments set status='iptal_edildi' where id='00000000-0000-0000-0000-000000000411';
set local role authenticated;
do $$ declare rejected boolean:=false; before_count bigint;
begin
 select count(*) into before_count from public.payments;
 begin perform public.test_offset('00000000-0000-0000-0000-000000000431'); exception when others then rejected:=true; end;
 if not rejected or (select count(*) from public.payments)<>before_count then raise exception 'Cancelled plan was overallocated'; end if;
 raise notice 'PASS cancelled installment causes atomic rejection, no parent fallback';
end $$;
select set_config('test.editor','false',true);
do $$ declare rejected boolean:=false;
begin
 begin perform public.test_offset('00000000-0000-0000-0000-000000000432'); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Viewer offset accepted'; end if;
 if has_function_privilege('anon','public.settle_offset_atomic(uuid,uuid,uuid,uuid,text,text,bigint,timestamptz,bigint,jsonb,jsonb)','EXECUTE')
 or has_table_privilege('authenticated','finance_private.offset_requests','UPDATE')
 or has_table_privilege('authenticated','finance_private.offset_requests','DELETE') then raise exception 'Excess privileges'; end if;
 raise notice 'PASS viewer/anon rejection and immutable receipt privileges';
end $$;
reset role;
rollback;

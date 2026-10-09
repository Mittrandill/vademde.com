begin;
do $$ begin
 if current_database()<>'vademde_finance_test' then raise exception 'Disposable DB required'; end if;
end $$;
set local role authenticated;
do $$ declare before_count bigint; rejected boolean:=false; first_id uuid; replay uuid;
begin
 select count(*) into before_count from public.transactions;
 begin
 perform public.record_card_payment_owned('00000000-0000-0000-0000-000000000021',
 '00000000-0000-0000-0000-000000000330','00000000-0000-0000-0000-000000000010',
 '00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000001',10000,'TRY','2026-10-09T12:00:00Z');
 exception when others then rejected:=true; end;
 if not rejected or (select count(*) from public.transactions)<>before_count then raise exception 'Actor mismatch wrote a movement'; end if;
 first_id:=public.record_card_payment_owned(auth.uid(),
 '00000000-0000-0000-0000-000000000331','00000000-0000-0000-0000-000000000010',
 '00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000001',10000,'TRY','2026-10-09T12:00:00Z');
 replay:=public.record_card_payment_owned(auth.uid(),
 '00000000-0000-0000-0000-000000000331','00000000-0000-0000-0000-000000000010',
 '00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000001',10000,'TRY','2026-10-09T12:00:00Z');
 if first_id<>replay or (select count(*) from public.transactions)<>before_count+1 then raise exception 'Owned replay duplicated payment'; end if;
 if has_function_privilege('anon','public.record_card_payment_owned(uuid,uuid,uuid,uuid,uuid,bigint,text,timestamptz)','EXECUTE') then raise exception 'Anon RPC access'; end if;
 raise notice 'PASS RPC queue-owner guard, owned replay and anon denial';
end $$;
rollback;

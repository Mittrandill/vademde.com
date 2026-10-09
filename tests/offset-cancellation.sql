begin;
do $$ begin
 if current_database()<>'vademde_finance_test' then raise exception 'Disposable test DB required'; end if;
end $$;
set local role authenticated;
do $$ declare outcome jsonb; before_count bigint; rejected boolean:=false;
begin
 select count(*) into before_count from public.payments;
 outcome:=public.cancel_offset_request(auth.uid(),'00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000460');
 if outcome->>'state'<>'cancelled' then raise exception 'Uncommitted offset not cancelled'; end if;
 begin perform public.test_offset('00000000-0000-0000-0000-000000000460'); exception when others then rejected:=true; end;
 if not rejected or (select count(*) from public.payments)<>before_count then raise exception 'Delayed cancelled request wrote payments'; end if;
 outcome:=public.cancel_offset_request(auth.uid(),'00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000460');
 if outcome->>'state'<>'cancelled' then raise exception 'Cancellation replay failed'; end if;
 outcome:=public.cancel_offset_request(auth.uid(),'00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000440');
 if outcome->>'state'<>'confirmed' or (select count(*) from public.payments)<>before_count then raise exception 'Cancellation undid committed offset'; end if;
 rejected:=false;
 begin perform public.cancel_offset_request('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000461'); exception when others then rejected:=true; end;
 if not rejected or has_function_privilege('anon','public.cancel_offset_request(uuid,uuid,uuid)','EXECUTE') then raise exception 'Cancellation actor/anon guard failed'; end if;
 raise notice 'PASS cancellation tombstone blocks delayed write; repeated cancellation safe; committed offset preserved; actor/anon guards';
end $$;
reset role;
rollback;

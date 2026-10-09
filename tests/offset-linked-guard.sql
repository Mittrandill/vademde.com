begin;
do $$ begin
 if current_database()<>'vademde_finance_test' then raise exception 'Disposable test DB required'; end if;
end $$;
set local role authenticated;
do $$ declare p public.payments; rejected boolean:=false; before_count bigint;
begin
 select * into p from public.payments where obligation_id='00000000-0000-0000-0000-000000000403'
   and settled_by_obligation_id is not null limit 1;
 if p.id is null then raise exception 'Run offset concurrency test first'; end if;
 select count(*) into before_count from public.payments;
 begin perform public.delete_payment_atomic(p.id,p.amount_minor,p.paid_at); exception when others then rejected:=true; end;
 if not rejected or (select count(*) from public.payments)<>before_count then raise exception 'One-sided offset deletion accepted'; end if;
 rejected:=false;
 begin perform public.update_payment_atomic(p.id,p.amount_minor,p.paid_at,
 jsonb_build_object('amount_minor',p.amount_minor-1,'paid_at',p.paid_at),null);
 exception when others then rejected:=true; end;
 if not rejected or (select amount_minor from public.payments where id=p.id)<>p.amount_minor then raise exception 'One-sided offset edit accepted'; end if;
 raise notice 'PASS linked closure edit/delete rejected by RPC, both sides unchanged';
end $$;
reset role;
rollback;

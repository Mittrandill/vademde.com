do $$ begin
 if current_database()<>'vademde_finance_test' then raise exception 'Disposable test database required'; end if;
end $$;
do $$
declare p public.payments; q public.payments; x bigint; failed boolean;
begin
 select * into p from public.record_payments_v2('[{
   "payment":{"workspace_id":"00000000-0000-0000-0000-000000000010","obligation_id":"00000000-0000-0000-0000-000000000100","account_id":"00000000-0000-0000-0000-000000000001","amount_minor":1000000,"paid_at":"2026-10-09T09:00:00Z"},
   "transaction":{"workspace_id":"00000000-0000-0000-0000-000000000010","account_id":"00000000-0000-0000-0000-000000000001","amount_minor":1000000,"direction":"income"}
 }]');
 select remaining_amount_minor into x from public.obligations where id=p.obligation_id;
 if x<>2000000 then raise exception '30k-10k must leave 20k'; end if;
 raise notice 'PASS: invoice 30k / payment 10k / remaining 20k';

 -- Force failure AFTER movement is updated: exceeds remaining obligation.
 failed:=false;
 begin
   perform public.update_payment_atomic(p.id,p.amount_minor,p.paid_at,
     '{"amount_minor":4000000,"paid_at":"2026-10-09T09:00:00Z","account_id":"00000000-0000-0000-0000-000000000001"}',
     '{"direction":"income","financing_minor":0}');
 exception when others then failed:=true;
 end;
 if not failed then raise exception 'Overpayment must be rejected'; end if;
 select amount_minor into x from public.transactions where id=p.transaction_id;
 if x<>1000000 then raise exception 'Failed payment update leaked movement'; end if;
 raise notice 'PASS: failed payment update rolls movement back';

 q := public.update_payment_atomic(p.id,p.amount_minor,p.paid_at,
   '{"amount_minor":1500000,"paid_at":"2026-10-09T09:00:00Z","account_id":"00000000-0000-0000-0000-000000000001"}',
   '{"direction":"income","financing_minor":0}');
 select amount_minor into x from public.transactions where id=q.transaction_id;
 if x<>q.amount_minor then raise exception 'Successful update must match movement'; end if;
 failed:=false;
 begin
   perform public.delete_payment_atomic(p.id,p.amount_minor,p.paid_at);
 exception when others then failed:=true;
 end;
 if not failed then raise exception 'Stale delete must be rejected'; end if;
 raise notice 'PASS: update and stale-write protection';

 -- Force transaction deletion to fail via another real FK.
 create table public.locked_movement(id uuid references public.transactions(id));
 insert into locked_movement values(q.transaction_id);
 failed:=false;
 begin
   perform public.delete_payment_atomic(q.id,q.amount_minor,q.paid_at);
 exception when others then failed:=true;
 end;
 if not failed or not exists(select 1 from public.payments where id=q.id) then
   raise exception 'Failed deletion must restore payment';
 end if;
 select remaining_amount_minor into x from public.obligations where id=q.obligation_id;
 if x<>1500000 then raise exception 'Failed deletion leaked remaining update'; end if;
 delete from locked_movement;
 perform public.delete_payment_atomic(q.id,q.amount_minor,q.paid_at);
 if exists(select 1 from public.transactions where id=q.transaction_id) then raise exception 'Orphan movement'; end if;
 select remaining_amount_minor into x from public.obligations where id=q.obligation_id;
 if x<>3000000 then raise exception 'Successful deletion must reopen invoice'; end if;
 raise notice 'PASS: deletion failure rollback and successful deletion';

 select * into p from public.record_payments_v2('[{
   "payment":{"workspace_id":"00000000-0000-0000-0000-000000000010","obligation_id":"00000000-0000-0000-0000-000000000101","account_id":"00000000-0000-0000-0000-000000000002","amount_minor":10000,"fx_rate_try_minor":4000},
   "transaction":{"workspace_id":"00000000-0000-0000-0000-000000000010","account_id":"00000000-0000-0000-0000-000000000002","amount_minor":10000,"direction":"income"}
 }]');
 select fx_rate_try_minor into x from public.transactions where id=p.transaction_id;
 if x<>4000 or p.fx_rate_try_minor<>4000 then raise exception 'Custom FX snapshot mismatch'; end if;
 raise notice 'PASS: payment and movement share custom FX';

 perform set_config('test.editor','false',true);
 failed:=false;
 begin perform public.delete_payment_atomic(p.id,p.amount_minor,p.paid_at);
 exception when others then failed:=true; end;
 if not failed then raise exception 'Viewer must not delete payment'; end if;
 perform set_config('test.editor','true',true);
 raise notice 'PASS: explicit editor permission';

 failed:=false;
 begin
   insert into public.payments(workspace_id,obligation_id,amount_minor) values
     ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000100',100);
 exception when others then failed:=true; end;
 if not failed then raise exception 'Cross-workspace payment accepted'; end if;
 raise notice 'PASS: workspace reference validation';
end $$;

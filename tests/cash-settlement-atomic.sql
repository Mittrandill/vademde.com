do $$ begin if current_database()<>'vademde_finance_test' then raise exception 'Disposable DB required'; end if; end $$;
select set_config('test.editor','true',false);
begin;
-- Fixture helper creates a new independent target; this is not deployable API code.
create function public.test_cash_input(method text,dir text,unit text,invoice boolean) returns jsonb
language plpgsql security invoker as $$
declare ws uuid:='00000000-0000-0000-0000-000000000010'; cp uuid:='00000000-0000-0000-0000-000000000040';
 a uuid; target uuid:=gen_random_uuid(); amount bigint; applied bigint; header jsonb; items jsonb:='[]'; expected jsonb:='[]'; fx bigint;
begin
 a:=case when unit='TRY' then '00000000-0000-0000-0000-000000000001'::uuid else '00000000-0000-0000-0000-000000000002'::uuid end;
 amount:=case when unit='TRY' then 3000000 else 30000 end; applied:=amount*2/3;
 fx:=case when unit='USD' then 4000 else null end;
 header:=jsonb_build_object('account_id',a,'counterparty_id',cp,'currency_code',unit,'value_unit_type','fiat',
  'amount_minor',amount,'direction',dir,'method',method,'paid_at','2026-10-09T12:00:00Z','fx_rate_try_minor',fx);
 if invoice then
  insert into public.obligations(id,workspace_id,counterparty_id,title,document_type,direction,currency_code,total_amount_minor)
  values(target,ws,cp,'Fatura','fatura',dir,unit,applied);
  expected:=jsonb_build_array(jsonb_build_object('id',target,'remaining_amount_minor',applied));
  items:=jsonb_build_array(jsonb_build_object('payment',jsonb_build_object('workspace_id',ws,'obligation_id',target,'account_id',a,
   'amount_minor',applied,'paid_at',header->>'paid_at','fx_rate_try_minor',fx),
   'transaction',jsonb_build_object('workspace_id',ws,'account_id',a,'counterparty_id',cp,'currency_code',unit,'direction',
    case when dir='payable' then 'expense' else 'income' end,'amount_minor',applied,'fx_rate_try_minor',fx,'payment_method',method,'financing_minor',0)));
 end if;
 return jsonb_build_object('header',header,'items',items,'expected',expected);
end $$;
grant execute on function public.test_cash_input(text,text,text,boolean) to authenticated;
create function public.test_cash_failure() returns trigger language plpgsql as $$ begin
 if current_setting('test.cash_failure',true)='true' then raise exception 'Injected final cash receipt failure'; end if; return new; end $$;
create trigger test_cash_failure before insert on finance_private.cash_settlement_requests for each row execute function public.test_cash_failure();
set local role authenticated;
do $$ declare method text; dir text; unit text; invoice boolean; input jsonb; receipt jsonb; replay jsonb;
 req uuid; ws uuid:='00000000-0000-0000-0000-000000000010'; before_tx bigint; before_pay bigint;
 before_ob bigint; leftover bigint; original_rate bigint; rejected boolean; cancelled uuid;
 slice_one uuid; slice_two uuid; sliced jsonb; first_item jsonb;
begin
 foreach method in array array['nakit','havale','kredi_karti','online_odeme'] loop
 foreach dir in array array['payable','receivable'] loop
 foreach unit in array array['TRY','USD'] loop
 foreach invoice in array array[false,true] loop
  input:=public.test_cash_input(method,dir,unit,invoice); req:=gen_random_uuid();
  select count(*) into before_tx from public.transactions; select count(*) into before_pay from public.payments;
  receipt:=public.settle_cash_atomic(auth.uid(),req,ws,input->'header',input->'items',input->'expected');
  leftover:=(input->'header'->>'amount_minor')::bigint/(case when invoice then 3 else 1 end);
  if (receipt->>'leftover_minor')::bigint<>leftover
    or (receipt->'advance_obligation'->>'total_amount_minor')::bigint<>leftover
    or receipt->'advance_obligation'->>'direction'<>(case when dir='payable' then 'receivable' else 'payable' end)
    or (select count(*) from public.transactions)<>before_tx+(case when invoice then 2 else 1 end)
    or (select count(*) from public.payments)<>before_pay+(case when invoice then 1 else 0 end)
    or (receipt->'advance_obligation'->>'due_date') is not null then raise exception 'Incorrect cash/advance split'; end if;
  if invoice and (select remaining_amount_minor from public.obligations where id=(input->'expected'->0->>'id')::uuid)<>0 then
    raise exception 'Invoice not closed'; end if;
  if unit='USD' then
   if invoice and (receipt->'payments'->0->>'fx_rate_try_minor')::bigint<>4000 then raise exception 'Invoice FX not retained'; end if;
   select try_equivalent_minor into original_rate from public.value_unit_rates where unit_code='USD';
   if (select fx_rate_try_minor from public.transactions where source_obligation_id=(receipt->'advance_obligation'->>'id')::uuid)<>original_rate then
    raise exception 'Advance movement did not retain existing current FX rule'; end if;
  end if;
  replay:=public.settle_cash_atomic(auth.uid(),req,ws,input->'header',input->'items',input->'expected');
  if replay is distinct from receipt or (select count(*) from public.transactions)<>before_tx+(case when invoice then 2 else 1 end) then
    raise exception 'Replay duplicated cash movement'; end if;
  rejected:=false;
  begin perform public.settle_cash_atomic(auth.uid(),req,ws,jsonb_set(input->'header','{amount_minor}',to_jsonb(1)),input->'items',input->'expected');
   exception when others then rejected:=sqlerrm like '%farklı içerikle%'; end;
  if not rejected then raise exception 'Changed request payload accepted'; end if;
  raise notice 'PASS % % % invoice=%: atomic split, preserved FX, exact replay',method,dir,unit,invoice;
 end loop; end loop; end loop; end loop;

 input:=public.test_cash_input('havale','receivable','TRY',true); req:=gen_random_uuid();
 select count(*) into before_tx from public.transactions; select count(*) into before_pay from public.payments;
 select count(*) into before_ob from public.obligations;
 perform set_config('test.cash_failure','true',true); rejected:=false;
 begin perform public.settle_cash_atomic(auth.uid(),req,ws,input->'header',input->'items',input->'expected');
 exception when others then rejected:=sqlerrm like '%Injected final%'; end;
 perform set_config('test.cash_failure','false',true);
 if not rejected or (select count(*) from public.transactions)<>before_tx or (select count(*) from public.payments)<>before_pay
   or (select count(*) from public.obligations)<>before_ob
   or (select remaining_amount_minor from public.obligations where id=(input->'expected'->0->>'id')::uuid)<>2000000
   or exists(select 1 from finance_private.cash_settlement_requests where request_id=req) then raise exception 'Late failure left partial cash settlement'; end if;
 raise notice 'PASS final receipt failure rolls back payments, movements, advance, invoice progress';
 -- No excess: no advance or extra cash movement is created.
 input:=jsonb_set(input,'{header,amount_minor}',to_jsonb(2000000));
 receipt:=public.settle_cash_atomic(auth.uid(),req,ws,input->'header',input->'items',input->'expected');
 if receipt->'advance_obligation'<>'null'::jsonb or (receipt->>'leftover_minor')::bigint<>0
   or (select count(*) from public.transactions)<>before_tx+1 or (select count(*) from public.obligations)<>before_ob then
   raise exception 'Exact payment created excess advance'; end if;
 if public.cancel_cash_settlement_request(auth.uid(),ws,req)->>'state'<>'confirmed' then
   raise exception 'Committed cash payment was treated as uncommitted'; end if;
 raise notice 'PASS exact payment creates no advance; cancellation preserves confirmed result';
 input:=public.test_cash_input('havale','receivable','TRY',true);
 slice_one:=gen_random_uuid(); slice_two:=gen_random_uuid();
 insert into public.installments(id,workspace_id,obligation_id,amount_minor,remaining_amount_minor,status)
 values(slice_one,ws,(input->'expected'->0->>'id')::uuid,1000000,1000000,'bekliyor'),
  (slice_two,ws,(input->'expected'->0->>'id')::uuid,1000000,1000000,'iptal_edildi');
 first_item:=jsonb_set(jsonb_set(input->'items'->0,'{payment,amount_minor}',to_jsonb(1000000)),'{transaction,amount_minor}',to_jsonb(1000000));
 sliced:=jsonb_build_array(jsonb_set(first_item,'{payment,installment_id}',to_jsonb(slice_one)),jsonb_set(first_item,'{payment,installment_id}',to_jsonb(slice_two)));
 select count(*) into before_tx from public.transactions; select count(*) into before_pay from public.payments;
 select count(*) into before_ob from public.obligations; rejected:=false;
 begin perform public.settle_cash_atomic(auth.uid(),gen_random_uuid(),ws,input->'header',sliced,input->'expected');
 exception when others then rejected:=sqlerrm like '%İptal edilmiş taksite%'; end;
 if not rejected or (select count(*) from public.transactions)<>before_tx or (select count(*) from public.payments)<>before_pay
  or (select count(*) from public.obligations)<>before_ob
  or (select remaining_amount_minor from public.installments where id=slice_one)<>1000000 then
  raise exception 'Later installment failure left first slice committed'; end if;
 raise notice 'PASS second installment failure rolls back first payment slice and its movement';
 input:=public.test_cash_input('havale','receivable','TRY',true);
 select count(*) into before_tx from public.transactions;
 cancelled:=gen_random_uuid(); perform public.cancel_cash_settlement_request(auth.uid(),ws,cancelled); rejected:=false;
 begin perform public.settle_cash_atomic(auth.uid(),cancelled,ws,input->'header',input->'items',input->'expected');
 exception when others then rejected:=sqlerrm like '%iptal edildi%'; end;
 if not rejected or (select count(*) from public.transactions)<>before_tx then raise exception 'Cancelled request committed'; end if;
 raise notice 'PASS cancelled ID cannot later commit';
 -- A competing/earlier payment must not silently turn a stale allocation into a larger advance.
 insert into public.payments(workspace_id,obligation_id,amount_minor)
 values(ws,(input->'expected'->0->>'id')::uuid,100000);
 rejected:=false;
 begin perform public.settle_cash_atomic(auth.uid(),gen_random_uuid(),ws,input->'header',input->'items',input->'expected');
 exception when others then rejected:=sqlerrm like '%kalan tutarı değişti%'; end;
 if not rejected or (select count(*) from public.transactions)<>before_tx then raise exception 'Stale balance accepted'; end if;
 raise notice 'PASS stale remaining snapshot rejected without movement';
 rejected:=false;
 begin perform public.settle_cash_atomic('00000000-0000-0000-0000-000000000021',gen_random_uuid(),ws,input->'header',input->'items',input->'expected');
 exception when others then rejected:=true; end;
 if not rejected then raise exception 'Wrong actor accepted'; end if;
 perform set_config('test.editor','false',true); rejected:=false;
 begin perform public.settle_cash_atomic(auth.uid(),gen_random_uuid(),ws,input->'header',input->'items',input->'expected'); exception when others then rejected:=true; end;
 perform set_config('test.editor','true',true);
 if not rejected or has_function_privilege('anon','public.settle_cash_atomic(uuid,uuid,uuid,jsonb,jsonb,jsonb)','EXECUTE')
   or has_table_privilege('authenticated','finance_private.cash_settlement_requests','UPDATE')
   or has_table_privilege('authenticated','finance_private.cash_settlement_requests','DELETE') then raise exception 'Excess cash settlement authority'; end if;
 raise notice 'PASS owner/editor/anon checks and immutable ledger';
end $$;
reset role;
rollback;

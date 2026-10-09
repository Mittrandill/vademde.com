-- Reduced integration fixture only. Origin creation/refunds/bounces are NOT exercised here.
do $$ begin
 if current_database()<>'vademde_finance_test' then raise exception 'Disposable test DB required'; end if;
end $$;
select set_config('test.editor','true',false);
begin;
set local role authenticated;
do $$
declare
 ws uuid:='00000000-0000-0000-0000-000000000010';
 cp uuid:='00000000-0000-0000-0000-000000000040';
 method text; direction text; unit text; source_id uuid; target_id uuid; next_target uuid;
 origin_id uuid; request_id uuid; second_request uuid; receipt jsonb; original jsonb;
 amount bigint; step bigint; fx bigint; source_direction text; origin_count bigint;
begin
 foreach method in array array['nakit','havale','kredi_karti','online_odeme'] loop
 foreach direction in array array['payable','receivable'] loop
 foreach unit in array array['TRY','USD'] loop
  source_id:=gen_random_uuid(); target_id:=gen_random_uuid(); next_target:=gen_random_uuid();
  amount:=case when unit='TRY' then 3000000 else 30000 end; step:=amount/3;
  source_direction:=case when direction='payable' then 'receivable' else 'payable' end;
  insert into public.obligations(id,workspace_id,counterparty_id,title,document_type,direction,currency_code,total_amount_minor,remaining_amount_minor,status)
  values(source_id,ws,cp,'Avans','avans',source_direction,unit,amount,amount,'bekliyor'),
    (target_id,ws,cp,'Fatura 1','fatura',direction,unit,2*step,2*step,'bekliyor'),
    (next_target,ws,cp,'Fatura 2','fatura',direction,unit,2*step,2*step,'bekliyor');
  -- Seed the original movement separately: this test checks its preservation, not creation.
  insert into public.transactions(workspace_id,account_id,counterparty_id,direction,amount_minor,currency_code,fx_rate_try_minor,payment_method,occurred_at)
  values(ws,case when unit='TRY' then '00000000-0000-0000-0000-000000000001'::uuid else '00000000-0000-0000-0000-000000000002'::uuid end,
    cp,case when direction='payable' then 'expense' else 'income' end,amount,unit,case when unit='USD' then 4000 else null end,method,'2026-10-09T12:00:00Z') returning id into origin_id;
  select to_jsonb(t) into original from public.transactions t where id=origin_id;
  select count(*) into origin_count from public.transactions;
  for n in 1..3 loop
   request_id:=gen_random_uuid(); if n=2 then second_request:=request_id; end if;
   fx:=case when unit='USD' then 3000+n*1500 else null end;
   receipt:=public.settle_offset_atomic(auth.uid(),request_id,ws,cp,direction,unit,step,'2026-10-10T12:00:00Z',fx,
    jsonb_build_array(jsonb_build_object('source_id',source_id,'target_id',case when n=3 then next_target else target_id end,'amount_minor',step)),
    jsonb_build_array(jsonb_build_object('id',source_id,'remaining_amount_minor',amount-(n-1)*step),
      jsonb_build_object('id',case when n=3 then next_target else target_id end,'remaining_amount_minor',case when n=2 then step else 2*step end)));
   if (select remaining_amount_minor from public.obligations where id=source_id)<>amount-n*step
      or (select count(*) from public.transactions)<>origin_count then raise exception 'Incorrect advance use or duplicate money movement'; end if;
   if unit='USD' and exists(select 1 from jsonb_array_elements(receipt->'payment_snapshots') x where (x->>'fx')::bigint<>fx) then
    raise exception 'Applied portion did not preserve its own FX'; end if;
  end loop;
  -- Undo only the middle application. Keep the first/third and the originating movement.
  perform public.reverse_offset_atomic(auth.uid(),ws,second_request);
  if (select remaining_amount_minor from public.obligations where id=source_id)<>step
    or (select remaining_amount_minor from public.obligations where id=target_id)<>step
    or (select remaining_amount_minor from public.obligations where id=next_target)<>step
    or (select to_jsonb(t) from public.transactions t where id=origin_id) is distinct from original
    or (select count(*) from public.transactions)<>origin_count then raise exception 'Selective undo changed other applications/origin'; end if;
  perform public.reverse_offset_atomic(auth.uid(),ws,second_request);
  if (select remaining_amount_minor from public.obligations where id=source_id)<>step then raise exception 'Undo replay changed advance twice'; end if;
  raise notice 'PASS % % %: 3 applications, distinct FX, selective/repeated undo, origin preserved',method,direction,unit;
 end loop;
 end loop;
 end loop;
end $$;
reset role;
rollback;

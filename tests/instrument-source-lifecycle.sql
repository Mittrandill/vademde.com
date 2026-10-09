\set ON_ERROR_STOP on
do $$ begin
 if current_database() not in ('vademde_release_stage','vademde_release_stage_2','vademde_release_stage_3') then raise exception 'Restored local schema only'; end if;
end $$;
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('d4000000-0000-4000-8000-000000000001','source-owner@example.invalid','{}'),
 ('d4000000-0000-4000-8000-000000000002','source-viewer@example.invalid','{}');
select set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000001',true);
set local role authenticated;
insert into public.workspaces(id,name,owner_id) values
 ('d4000000-0000-4000-8000-000000000010','Source tests','d4000000-0000-4000-8000-000000000001');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('d4000000-0000-4000-8000-000000000010','d4000000-0000-4000-8000-000000000002','viewer');
insert into public.counterparties(id,workspace_id,name) values
 ('d4000000-0000-4000-8000-000000000020','d4000000-0000-4000-8000-000000000010','Customer'),
 ('d4000000-0000-4000-8000-000000000021','d4000000-0000-4000-8000-000000000010','Supplier');
insert into public.accounts(id,workspace_id,name,type,currency_code) values
 ('d4000000-0000-4000-8000-000000000030','d4000000-0000-4000-8000-000000000010','Cash TRY','cash','TRY'),
 ('d4000000-0000-4000-8000-000000000031','d4000000-0000-4000-8000-000000000010','Cash USD','cash','USD');

do $$ declare ws uuid:='d4000000-0000-4000-8000-000000000010'; cp uuid:='d4000000-0000-4000-8000-000000000020';
 doc text; direction text; unit text; with_invoice boolean; root uuid; advance uuid; other uuid; initial uuid; later uuid;
 first_inst uuid; second_inst uuid; account uuid; offset_id uuid; cash_tx uuid; preview jsonb; result jsonb; receipt jsonb;
 used bigint; rejected boolean; cases integer:=0;
begin
 foreach doc in array array['cek','senet'] loop
 foreach direction in array array['payable','receivable'] loop
 foreach unit in array array['TRY','USD'] loop
 foreach with_invoice in array array[false,true] loop
  root:=gen_random_uuid(); advance:=gen_random_uuid(); other:=gen_random_uuid(); initial:=gen_random_uuid(); later:=gen_random_uuid();
  offset_id:=gen_random_uuid(); first_inst:=gen_random_uuid(); second_inst:=gen_random_uuid();
  account:=case when unit='TRY' then 'd4000000-0000-4000-8000-000000000030'::uuid else 'd4000000-0000-4000-8000-000000000031'::uuid end;
  used:=case when with_invoice then 500000 else 2000000 end;
  insert into public.obligations(id,workspace_id,counterparty_id,title,direction,document_type,total_amount_minor,currency_code)
   values(root,ws,cp,'Original instrument',direction,doc,3000000,unit);
  if with_invoice then
   insert into public.obligations(id,workspace_id,counterparty_id,title,direction,document_type,total_amount_minor,currency_code)
    values(initial,ws,cp,'Original invoice',direction,'fatura',2000000,unit);
   perform finance_private.write_offset_slices(ws,initial,root,2000000,'2026-10-09T12:00:00Z',case when unit='TRY' then null else 4000 end,'Instrument closure');
  end if;
  insert into public.obligations(id,workspace_id,counterparty_id,title,direction,document_type,total_amount_minor,currency_code,parent_obligation_id)
   values(advance,ws,cp,'Instrument advance',case when direction='payable' then 'receivable' else 'payable' end,'avans',case when with_invoice then 1000000 else 3000000 end,unit,root),
   (other,ws,cp,'Unrelated advance',case when direction='payable' then 'receivable' else 'payable' end,'avans',500000,unit,null);
  insert into public.obligations(id,workspace_id,counterparty_id,title,direction,document_type,total_amount_minor,currency_code)
   values(later,ws,cp,'Later invoice',direction,'fatura',used+600000,unit);
  insert into public.installments(id,workspace_id,obligation_id,installment_number,due_date,amount_minor) values
   (first_inst,ws,later,1,'2026-10-01',(used+600000)/2),(second_inst,ws,later,2,'2026-11-01',(used+600000)/2);
  select transaction_id into cash_tx from public.record_payments_v2(jsonb_build_array(jsonb_build_object(
   'payment',jsonb_build_object('workspace_id',ws,'obligation_id',later,'installment_id',first_inst,'account_id',account,'amount_minor',100000,'paid_at','2026-10-09T12:00:00Z','fx_rate_try_minor',case when unit='TRY' then null else 4000 end),
   'transaction',jsonb_build_object('workspace_id',ws,'account_id',account,'counterparty_id',cp,'direction',case when direction='payable' then 'expense' else 'income' end,'amount_minor',100000))));
  receipt:=public.settle_offset_atomic(auth.uid(),offset_id,ws,cp,direction,unit,used+500000,'2026-10-09T12:00:00Z',case when unit='TRY' then null else 4000 end,
   jsonb_build_array(jsonb_build_object('source_id',advance,'target_id',later,'amount_minor',used),jsonb_build_object('source_id',other,'target_id',later,'amount_minor',500000)),
   jsonb_build_array(jsonb_build_object('id',advance,'remaining_amount_minor',case when with_invoice then 1000000 else 3000000 end),jsonb_build_object('id',other,'remaining_amount_minor',500000),jsonb_build_object('id',later,'remaining_amount_minor',used+500000)));
  preview:=public.preview_instrument_bounce(root);
  if (preview->>'replacement_claim_minor')::bigint<>0 then raise exception 'Payment instrument incorrectly treated as standalone claim'; end if;
  result:=public.bounce_instrument_atomic(auth.uid(),root,preview);
  if result->>'state'<>'bounced' or (select status from public.obligations where id=root)<>'iptal_edildi'
   or (select instrument_status from public.obligations where id=root)<>'karsiliksiz'
   or (select status from public.obligations where id=advance)<>'iptal_edildi'
   or (select remaining_amount_minor from public.obligations where id=later)<>used
   or (select remaining_amount_minor from public.obligations where id=other)<>0
   or not exists(select 1 from public.transactions where id=cash_tx and amount_minor=100000)
   or (with_invoice and (select remaining_amount_minor from public.obligations where id=initial)<>2000000) then
   raise exception 'Source-aware bounce incorrect: % % % invoice=%',doc,direction,unit,with_invoice; end if;
  if public.bounce_instrument_atomic(auth.uid(),root,preview) is distinct from result then raise exception 'Lost-response bounce replay differs'; end if;
  perform public.mark_instrument_bounced(root);
  perform public.reverse_offset_atomic(auth.uid(),ws,offset_id);
  perform public.reverse_offset_atomic(auth.uid(),ws,offset_id);
  if (select remaining_amount_minor from public.obligations where id=later)<>used+500000
   or (select remaining_amount_minor from public.obligations where id=other)<>500000
   or (select status from public.obligations where id=advance)<>'iptal_edildi' then raise exception 'Partial source reversal undid unrelated rows or resurrected invalid advance'; end if;
  rejected:=false;
  begin insert into public.payments(workspace_id,obligation_id,amount_minor,settled_by_obligation_id) values(ws,later,1,root);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Late closure using bounced instrument accepted'; end if;
  rejected:=false;
  begin update public.obligations set status='bekliyor',instrument_status='portfoy' where id=root;
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Bounced source reactivated directly'; end if;
  rejected:=false;
  begin update public.obligations set parent_obligation_id=null,status='bekliyor' where id=advance;
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Invalidated advance detached and reactivated'; end if;
  cases:=cases+1;
 end loop; end loop; end loop; end loop;
 raise notice 'PASS % source cases: cheque/note x received/issued x TRY/USD x invoice/advance, partial offset reversal, independent cash preserved',cases;
end $$;

do $$ declare ws uuid:='d4000000-0000-4000-8000-000000000010'; cp uuid:='d4000000-0000-4000-8000-000000000020'; supplier uuid:='d4000000-0000-4000-8000-000000000021';
 doc text; unit text; root uuid; root2 uuid; original uuid; invoice uuid; later uuid; request uuid; offset_id uuid;
 receipt jsonb; preview jsonb; result jsonb; sources jsonb; targets jsonb; a1 uuid; a2 uuid; transactions_before bigint; cases integer:=0;
begin
 foreach doc in array array['cek','senet'] loop foreach unit in array array['TRY','USD'] loop
  root:=gen_random_uuid(); root2:=gen_random_uuid(); original:=gen_random_uuid(); invoice:=gen_random_uuid(); later:=gen_random_uuid(); request:=gen_random_uuid(); offset_id:=gen_random_uuid();
  insert into public.obligations(id,workspace_id,counterparty_id,title,direction,document_type,total_amount_minor,currency_code) values
   (root,ws,cp,'First instrument','receivable',doc,5000000,unit),(root2,ws,cp,'Second instrument','receivable',doc,3000000,unit),
   (original,ws,cp,'Customer invoice','receivable','fatura',5000000,unit),
   (invoice,ws,supplier,'Supplier original invoice','payable','fatura',1000000,unit),
   (later,ws,supplier,'Supplier later invoice','payable','fatura',4000000,unit);
  perform finance_private.write_offset_slices(ws,original,root,5000000,'2026-10-09T12:00:00Z',case when unit='TRY' then null else 4000 end,'Original cheque receipt');
  sources:=jsonb_build_array(jsonb_build_object('id',root,'remaining_amount_minor',5000000),jsonb_build_object('id',root2,'remaining_amount_minor',3000000));
  targets:=jsonb_build_array(jsonb_build_object('id',invoice,'remaining_amount_minor',1000000));
  select count(*) into transactions_before from public.transactions where workspace_id=ws;
  receipt:=public.settle_endorsement_atomic(auth.uid(),request,ws,supplier,unit,'2026-10-09T12:00:00Z',case when unit='TRY' then null else 4000 end,sources,targets);
  if public.settle_endorsement_atomic(auth.uid(),request,ws,supplier,unit,'2026-10-09T12:00:00Z',case when unit='TRY' then null else 4000 end,sources,targets) is distinct from receipt
   or jsonb_array_length(receipt->'advances')<>2 or (receipt->>'leftover_minor')::bigint<>7000000 then raise exception 'Endorsement replay or per-source excess incorrect'; end if;
  select id into a1 from public.obligations where parent_obligation_id=root and document_type='avans';
  select id into a2 from public.obligations where parent_obligation_id=root2 and document_type='avans';
  if (select total_amount_minor from public.obligations where id=a1)<>4000000 or (select total_amount_minor from public.obligations where id=a2)<>3000000 then raise exception 'Source advance shares incorrect'; end if;
  perform public.settle_offset_atomic(auth.uid(),offset_id,ws,supplier,'payable',unit,4000000,'2026-10-09T12:00:00Z',case when unit='TRY' then null else 4000 end,
   jsonb_build_array(jsonb_build_object('source_id',a1,'target_id',later,'amount_minor',2000000),jsonb_build_object('source_id',a2,'target_id',later,'amount_minor',2000000)),
   jsonb_build_array(jsonb_build_object('id',a1,'remaining_amount_minor',4000000),jsonb_build_object('id',a2,'remaining_amount_minor',3000000),jsonb_build_object('id',later,'remaining_amount_minor',4000000)));
  preview:=public.preview_instrument_bounce(root); result:=public.bounce_instrument_atomic(auth.uid(),root,preview);
  if (select remaining_amount_minor from public.obligations where id=original)<>5000000
   or (select remaining_amount_minor from public.obligations where id=invoice)<>1000000
   or (select remaining_amount_minor from public.obligations where id=later)<>2000000
   or (select status from public.obligations where id=a1)<>'iptal_edildi'
   or (select remaining_amount_minor from public.obligations where id=a2)<>1000000
   or (select instrument_status from public.obligations where id=root2)<>'ciro_edildi'
   or (select count(*) from public.transactions where workspace_id=ws)<>transactions_before then raise exception 'One bounced ciro instrument affected another source or fabricated money'; end if;
  perform public.reverse_offset_atomic(auth.uid(),ws,offset_id);
  if (select remaining_amount_minor from public.obligations where id=a2)<>3000000 or (select remaining_amount_minor from public.obligations where id=later)<>4000000 then raise exception 'Remaining ciro offset reversal incorrect'; end if;
  cases:=cases+1;
 end loop; end loop;
 raise notice 'PASS % ciro cases: two instruments, separate advances, later shared offset, only one bounced source unwound, no money movement',cases;
end $$;

do $$ declare ws uuid:='d4000000-0000-4000-8000-000000000010'; cp uuid:='d4000000-0000-4000-8000-000000000020';
 doc text; direction text; root uuid; preview jsonb; result jsonb; claim uuid; count_before bigint;
begin
 foreach doc in array array['cek','senet'] loop foreach direction in array array['receivable','payable'] loop
  root:=gen_random_uuid();
  insert into public.obligations(id,workspace_id,counterparty_id,title,direction,document_type,total_amount_minor) values(root,ws,cp,'Standalone claim',direction,doc,3000000);
  preview:=public.preview_instrument_bounce(root); result:=public.bounce_instrument_atomic(auth.uid(),root,preview);
  claim:=(result->'replacement_claim'->>'id')::uuid;
  if claim is null or (select remaining_amount_minor from public.obligations where id=claim)<>3000000 or (select o.direction from public.obligations o where id=claim)<>direction then raise exception 'Standalone original debt erased'; end if;
  select count(*) into count_before from public.obligations where workspace_id=ws;
  perform public.bounce_instrument_atomic(auth.uid(),root,preview);
  if (select count(*) from public.obligations where workspace_id=ws)<>count_before then raise exception 'Standalone replay created another claim'; end if;
 end loop; end loop;
 raise notice 'PASS four standalone cheque/note cases: original payable/receivable preserved once as a separate claim';
end $$;

-- Legacy shared parentless ciro advance: block; never guess its per-instrument origin from notes.
do $$ declare ws uuid:='d4000000-0000-4000-8000-000000000010'; cp uuid:='d4000000-0000-4000-8000-000000000020'; root uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); rejected boolean:=false;
begin
 insert into public.obligations(id,workspace_id,counterparty_id,title,direction,document_type,total_amount_minor) values(root,ws,cp,'Legacy cheque','receivable','cek',3000000),(a,ws,cp,'Legacy joint advance','receivable','avans',3000000);
 perform finance_private.write_offset_slices(ws,root,a,3000000,now(),null,'Legacy ciro');
 update public.obligations set instrument_status='ciro_edildi' where id=root;
 begin perform public.preview_instrument_bounce(root); exception when others then rejected:=sqlerrm like '%ortak ciro avans%'; end;
 if not rejected or (select remaining_amount_minor from public.obligations where id=a)<>3000000 then raise exception 'Legacy shares guessed or mutated'; end if;
 raise notice 'PASS ambiguous legacy joint advance rejected unchanged';
end $$;

reset role;
create function pg_temp.fail_source_receipt() returns trigger language plpgsql as $$ begin raise exception 'Injected final receipt failure'; end $$;
create trigger test_bounce_receipt_failure before insert on finance_private.instrument_bounces for each row execute function pg_temp.fail_source_receipt();
set local role authenticated;
do $$ declare ws uuid:='d4000000-0000-4000-8000-000000000010'; cp uuid:='d4000000-0000-4000-8000-000000000020'; root uuid:=gen_random_uuid(); before_count bigint; rejected boolean:=false;
begin
 insert into public.obligations(id,workspace_id,counterparty_id,title,direction,document_type,total_amount_minor) values(root,ws,cp,'Late failure root','receivable','cek',3000000);
 select count(*) into before_count from public.obligations where workspace_id=ws;
 begin perform public.bounce_instrument_atomic(auth.uid(),root,public.preview_instrument_bounce(root)); exception when others then rejected:=sqlerrm like '%Injected%'; end;
 if not rejected or (select count(*) from public.obligations where workspace_id=ws)<>before_count or (select status from public.obligations where id=root)='iptal_edildi' then raise exception 'Final bounce failure left a new claim or cancelled source'; end if;
 raise notice 'PASS final bounce receipt failure rolls back replacement claim and source invalidation';
end $$;
reset role;
drop trigger test_bounce_receipt_failure on finance_private.instrument_bounces;
create trigger test_ciro_receipt_failure before insert on finance_private.endorsement_requests for each row execute function pg_temp.fail_source_receipt();
set local role authenticated;
do $$ declare ws uuid:='d4000000-0000-4000-8000-000000000010'; cp uuid:='d4000000-0000-4000-8000-000000000020'; root uuid:=gen_random_uuid(); invoice uuid:=gen_random_uuid(); before_count bigint; rejected boolean:=false;
begin
 insert into public.obligations(id,workspace_id,counterparty_id,title,direction,document_type,total_amount_minor) values(root,ws,cp,'Ciro failure root','receivable','cek',3000000),(invoice,ws,cp,'Ciro failure invoice','payable','fatura',2000000);
 select count(*) into before_count from public.obligations where workspace_id=ws;
 begin perform public.settle_endorsement_atomic(auth.uid(),gen_random_uuid(),ws,cp,'TRY',now(),null,jsonb_build_array(jsonb_build_object('id',root,'remaining_amount_minor',3000000)),jsonb_build_array(jsonb_build_object('id',invoice,'remaining_amount_minor',2000000))); exception when others then rejected:=sqlerrm like '%Injected%'; end;
 if not rejected or (select count(*) from public.obligations where workspace_id=ws)<>before_count or (select remaining_amount_minor from public.obligations where id=invoice)<>2000000
   or (select remaining_amount_minor from public.obligations where id=root)<>3000000 or (select instrument_status from public.obligations where id=root)<>'portfoy' then raise exception 'Final ciro failure left partial invoice/advance/instrument writes'; end if;
 raise notice 'PASS final ciro receipt failure rolls back all closures, advances and status changes';
end $$;
reset role;
drop trigger test_ciro_receipt_failure on finance_private.endorsement_requests;
set local role authenticated;
select set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000002',true);
do $$ declare rejected boolean:=false; ws uuid:='d4000000-0000-4000-8000-000000000010'; begin
 begin perform public.cancel_endorsement_request(auth.uid(),ws,gen_random_uuid()); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Viewer wrote ciro request'; end if;
 if has_function_privilege('anon','public.bounce_instrument_atomic(uuid,uuid,jsonb)','EXECUTE')
  or has_table_privilege('authenticated','finance_private.instrument_bounces','UPDATE')
  or has_table_privilege('authenticated','finance_private.endorsement_requests','DELETE') then raise exception 'Excess source lifecycle privileges'; end if;
 raise notice 'PASS viewer/anon denial and immutable ciro/source receipts';
end $$;
reset role;
rollback;

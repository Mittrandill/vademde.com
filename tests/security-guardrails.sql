do $$ begin
 if current_database()<>'vademde_finance_test' then raise exception 'Disposable test database required'; end if;
end $$;
set role authenticated;
select set_config('test.editor','false',false);
do $$ declare n bigint; failed boolean:=false; begin
 select count(*) into n from storage.objects;
 if n<>1 then raise exception 'Viewer must still read documents'; end if;
 delete from storage.objects;
 get diagnostics n = row_count;
 if n<>0 then raise exception 'Viewer deleted a document'; end if;
 update storage.objects set name='00000000-0000-0000-0000-000000000010/changed.pdf';
 get diagnostics n = row_count;
 if n<>0 then raise exception 'Viewer changed a document'; end if;
 begin
   insert into storage.objects(bucket_id,name) values('financial-documents','00000000-0000-0000-0000-000000000010/new.pdf');
 exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'Viewer inserted a document'; end if;
 raise notice 'PASS: viewer can read, cannot insert/update/delete files';
end $$;
select set_config('test.editor','true',false);
do $$ declare n bigint; begin
 update storage.objects set name='00000000-0000-0000-0000-000000000010/changed.pdf';
 get diagnostics n = row_count;
 if n<>1 then raise exception 'Editor cannot update document'; end if;
 raise notice 'PASS: editor can update files';
end $$;
reset role;
do $$ declare movement uuid; unit text; failed boolean:=false; begin
 insert into public.transactions(workspace_id,account_id,amount_minor,direction,currency_code)
 values('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000002',100,'income','TRY')
 returning id,currency_code into movement,unit;
 if unit<>'USD' then raise exception 'Legacy client currency inference failed'; end if;
 begin
   insert into public.transactions(workspace_id,account_id,transfer_to_account_id,amount_minor,direction,currency_code)
   values('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001',
     '00000000-0000-0000-0000-000000000002',100,'transfer','TRY');
 exception when others then failed:=true; end;
 if not failed then raise exception 'Mixed currency transfer accepted'; end if;
 if has_function_privilege('anon','public.record_payments_v2(jsonb)','execute') then
   raise exception 'Anonymous payment RPC permission'; end if;
 raise notice 'PASS: legacy currency, transfer units, anon RPC permissions';
end $$;
do $$ declare failed boolean:=false; begin
 begin delete from public.workspace_members;
 exception when others then failed:=true; end;
 if not failed then raise exception 'Owner membership must be protected'; end if;
 raise notice 'PASS: owner membership protected';
end $$;

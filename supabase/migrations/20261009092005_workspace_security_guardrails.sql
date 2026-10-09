-- No data rewrite. Enforce the same workspace on financial references.
create or replace function public.validate_workspace_references()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
 row_data jsonb := to_jsonb(new); mapping record; reference uuid; reference_workspace uuid;
 source_unit text; target_unit text;
begin
 for mapping in select * from (values
   ('account_id','accounts'),('transfer_to_account_id','accounts'),
   ('counterparty_id','counterparties'),('category_id','categories'),
   ('obligation_id','obligations'),('source_obligation_id','obligations'),
   ('settled_by_obligation_id','obligations'),('parent_obligation_id','obligations'),
   ('installment_id','installments'),('transaction_id','transactions'),
   ('related_transaction_id','transactions'),('document_id','financial_documents'),
   ('receipt_document_id','financial_documents'),('suggested_category_id','categories')
 ) as refs(column_name,table_name) loop
   reference := nullif(row_data->>mapping.column_name,'')::uuid;
   if reference is null then continue; end if;
   execute format('select workspace_id from public.%I where id = $1',mapping.table_name)
     into reference_workspace using reference;
   if reference_workspace is distinct from new.workspace_id then
     raise exception 'Bağlı % kaydı bulunamadı veya farklı çalışma alanına ait',mapping.column_name;
   end if;
 end loop;
 if tg_table_name = 'transactions' then
   select currency_code into source_unit from public.accounts where id=(row_data->>'account_id')::uuid;
   if row_data->>'direction' = 'transfer' then
     select currency_code into target_unit from public.accounts where id=(row_data->>'transfer_to_account_id')::uuid;
     if source_unit is distinct from target_unit then raise exception 'Transfer hesaplarının birimleri aynı olmalı'; end if;
   end if;
   -- Older clients omit currency_code; infer it from the selected account.
   new.currency_code := source_unit;
 end if;
 return new;
end $$;
revoke all on function public.validate_workspace_references() from public,anon,authenticated;
do $$ declare table_name text; begin
 foreach table_name in array array['transactions','obligations','installments','payments',
   'financial_documents','document_fields','document_line_items','document_extractions'] loop
   if to_regclass('public.'||table_name) is not null then
     execute format('create trigger a_validate_workspace_references before insert or update on public.%I
       for each row execute function public.validate_workspace_references()',table_name);
   end if;
 end loop;
end $$;

alter policy financial_documents_storage_insert on storage.objects
  to authenticated with check (bucket_id='financial-documents' and
    (select public.can_edit_workspace((storage.foldername(name))[1]::uuid)));
alter policy financial_documents_storage_update on storage.objects
  to authenticated using (bucket_id='financial-documents' and
    (select public.can_edit_workspace((storage.foldername(name))[1]::uuid)))
  with check (bucket_id='financial-documents' and
    (select public.can_edit_workspace((storage.foldername(name))[1]::uuid)));
alter policy financial_documents_storage_delete on storage.objects
  to authenticated using (bucket_id='financial-documents' and
    (select public.can_edit_workspace((storage.foldername(name))[1]::uuid)));

-- Owner must not be removed through direct table access; deletion of the entire
-- workspace still works because the parent row is absent during FK cascade.
create or replace function public.protect_workspace_owner_membership()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if auth.uid() is not null
    and exists(select 1 from public.workspaces w where w.id=old.workspace_id and w.owner_id=old.user_id)
    and (tg_op='DELETE' or new.role is distinct from old.role or
      new.user_id is distinct from old.user_id or new.workspace_id is distinct from old.workspace_id) then
   raise exception 'Çalışma alanı sahibinin üyeliği kaldırılamaz; önce sahiplik devri gerekir';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function public.protect_workspace_owner_membership() from public,anon,authenticated;
create trigger workspace_members_protect_owner before delete or update on public.workspace_members
  for each row execute function public.protect_workspace_owner_membership();

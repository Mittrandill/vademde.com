do $$ begin
 if current_database()<>'vademde_finance_test' then raise exception 'Disposable test database required'; end if;
end $$;
create schema auth;
create function auth.uid() returns uuid language sql as
 $$ select '00000000-0000-0000-0000-000000000020'::uuid $$;
create table public.workspaces(id uuid primary key,owner_id uuid);
create table public.workspace_members(id uuid primary key,workspace_id uuid,user_id uuid,role text);
insert into public.workspaces values('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000020');
insert into public.workspace_members values('00000000-0000-0000-0000-000000000030',
 '00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000020','owner');
create schema storage;
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
create function storage.foldername(text) returns text[] language sql immutable as
 $$ select string_to_array($1,'/') $$;
alter table storage.objects enable row level security;
create policy financial_documents_storage_select on storage.objects for select to authenticated using(true);
create policy financial_documents_storage_insert on storage.objects for insert with check(true);
create policy financial_documents_storage_update on storage.objects for update using(true);
create policy financial_documents_storage_delete on storage.objects for delete using(true);
grant usage on schema storage,public to authenticated;
grant select,insert,update,delete on storage.objects to authenticated;
insert into storage.objects(bucket_id,name) values('financial-documents','00000000-0000-0000-0000-000000000010/test.pdf');

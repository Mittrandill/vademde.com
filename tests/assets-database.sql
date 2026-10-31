\set ON_ERROR_STOP on
-- Disposable database only; this fixture is not a production migration.
do $$ begin if current_database() <> 'vademde_assets_test' then raise exception 'Disposable database required'; end if; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
create table public.workspaces(id uuid primary key);
insert into public.workspaces values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
create function public.is_workspace_member(uuid) returns boolean language sql as $$ select $1::text=current_setting('test.workspace',true) $$;
create function public.can_edit_workspace(uuid) returns boolean language sql as $$ select public.is_workspace_member($1) and current_setting('test.role',true)='editor' $$;
create table public.transactions(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,direction text,description text,currency_code text,occurred_at timestamptz default now(),amount_minor bigint,financing_minor bigint,source_obligation_id uuid);
create table public.obligations(id uuid primary key default gen_random_uuid(),workspace_id uuid not null);
create table public.installments(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,obligation_id uuid);
create table public.payments(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,transaction_id uuid,installment_id uuid,obligation_id uuid,amount_minor bigint);
do $$ declare tbl text; begin foreach tbl in array array['transactions','obligations','installments','payments'] loop
  execute format('alter table public.%I enable row level security',tbl);
  execute format('create policy fixture_read on public.%I for select to authenticated using(public.is_workspace_member(workspace_id))',tbl);
  execute format('create policy fixture_write on public.%I for all to authenticated using(public.can_edit_workspace(workspace_id)) with check(public.can_edit_workspace(workspace_id))',tbl);
  execute format('grant select,insert,update,delete on public.%I to authenticated',tbl);
end loop; end $$;
grant usage on schema public,auth to authenticated;
\ir ../supabase/migrations/20261031112137_owned_assets.sql
set "test.user"='00000000-0000-0000-0000-000000000010';
set "test.workspace"='00000000-0000-0000-0000-000000000001';
set "test.role"='editor';
set role authenticated;
insert into public.owned_assets(id,workspace_id,kind,name,estimated_value_minor,valued_on) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','home','Home',450000000,'2026-10-31'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','vehicle','Car',null,null);
update public.owned_assets set estimated_value_minor=460000000,valued_on='2026-11-01' where kind='home';
update public.owned_assets set notes='No new valuation' where kind='home';
do $$ begin
 if (select count(*) from public.asset_valuations where asset_id='10000000-0000-0000-0000-000000000001')<>2 then raise exception 'Valuation history not atomic'; end if;
 if (select count(*) from public.transactions)<>0 then raise exception 'Valuation wrote cash'; end if;
 begin insert into public.asset_valuations(workspace_id,asset_id,currency_code,ownership_bps) values('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','TRY',10000); raise exception 'History forgery allowed'; exception when insufficient_privilege then null; end;
 begin update public.owned_assets set workspace_id='00000000-0000-0000-0000-000000000002' where kind='home'; raise exception 'Identity changed'; exception when raise_exception then if sqlerrm <> 'Asset identity cannot be changed' then raise; end if; end;
end $$;
insert into public.obligations(id,workspace_id) values('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
insert into public.transactions(id,workspace_id,direction,amount_minor,financing_minor,currency_code) values('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','expense',12000,10000,'TRY');
insert into public.payments(workspace_id,transaction_id,obligation_id,amount_minor) values('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',12000);
-- Linking an old loan reveals its historical payment, without inserting a transaction.
update public.obligations set asset_id='10000000-0000-0000-0000-000000000001';
do $$ begin
 if (select sum(amount_minor) from public.asset_activity)<>12000 then raise exception 'Historical payment not inherited'; end if;
 if (select sum(amount_minor-financing_minor) from public.asset_activity)<>2000 then raise exception 'Principal counted as expense'; end if;
end $$;
-- An explicit assignment takes priority, without double counting the inherited link.
update public.transactions set asset_id='10000000-0000-0000-0000-000000000002';
do $$ begin
 if (select count(*) from public.asset_activity)<>1 then raise exception 'Duplicate activity'; end if;
 if (select asset_id from public.asset_activity)<>'10000000-0000-0000-0000-000000000002' then raise exception 'Explicit assignment lost'; end if;
end $$;
update public.transactions set asset_id=null;
insert into public.obligations(id,workspace_id,asset_id) values('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002');
insert into public.payments(workspace_id,transaction_id,obligation_id,amount_minor) values('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',12000);
do $$ begin
 if (select sum(amount_minor) from public.asset_activity)<>12000 or (select count(*) from public.asset_activity)<>2 then raise exception 'Allocation double counted'; end if;
end $$;
-- Uneven cent allocation must conserve both total cash and principal.
update public.transactions set amount_minor=3,financing_minor=1;
do $$ begin
 if (select sum(amount_minor) from public.asset_activity)<>3 or (select sum(financing_minor) from public.asset_activity)<>1 then raise exception 'Rounding lost cents'; end if;
 if exists(select 1 from public.asset_activity where financing_minor>amount_minor) then raise exception 'Principal exceeds allocated cash'; end if;
end $$;
update public.owned_assets set is_archived=true where kind='home';
do $$ begin if (select count(*) from public.asset_activity)<>2 then raise exception 'Archive lost history'; end if; end $$;
set "test.role"='viewer';
do $$ declare n integer; begin
 update public.owned_assets set name='Viewer edit'; get diagnostics n=row_count; if n<>0 then raise exception 'Viewer edited'; end if;
 if (select count(*) from public.owned_assets)<>2 then raise exception 'Viewer cannot read'; end if;
 begin insert into public.owned_assets(workspace_id,kind,name) values('00000000-0000-0000-0000-000000000001','land','Denied'); raise exception 'Viewer inserted'; exception when insufficient_privilege then null; when raise_exception then if sqlerrm <> 'Asset edit permission required' then raise; end if; end;
end $$;
set "test.role"='editor';
set "test.workspace"='00000000-0000-0000-0000-000000000002';
do $$ begin
 if (select count(*) from public.owned_assets)<>0 or (select count(*) from public.asset_activity)<>0 or (select count(*) from public.asset_valuations)<>0 then raise exception 'Cross-workspace leak'; end if;
 begin insert into public.transactions(workspace_id,asset_id) values('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001'); raise exception 'Cross-workspace link allowed'; exception when foreign_key_violation then null; end;
end $$;
reset role;
select 'Asset history, attribution, accounting separation, archive, viewer and workspace isolation passed' as result;

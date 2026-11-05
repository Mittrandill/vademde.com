\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'vademde_card_minimum_test' then
    raise exception 'Use only vademde_card_minimum_test';
  end if;
end $$;
begin;
create table public.obligations (
  id integer primary key, workspace_id integer, account_id integer, document_type text,
  due_date date, status text, total_amount_minor bigint, remaining_amount_minor bigint
);
insert into public.obligations values
  (1, 1, 1, 'kredi_karti_ekstresi', '2026-11-08', 'kismen_odendi', 2500000, 1500000),
  (2, 1, 1, 'kredi_karti_ekstresi', '2026-11-08', 'bekliyor', 500000, 500000);
\ir ../supabase/migrations/20261105114545_card_statement_dates.sql
do $$ begin
  if (select count(*) from public.obligations where statement_date is null) <> 2 then
    raise exception 'Legacy rows changed';
  end if;
  if not exists (select from public.obligations where id=1 and total_amount_minor=2500000 and remaining_amount_minor=1500000) then
    raise exception 'Legacy amounts changed';
  end if;
end $$;
insert into public.obligations values (3,1,2,'kredi_karti_ekstresi','2026-11-08','bekliyor',2500000,2500000,'2026-10-28');
do $$ begin
  begin
    insert into public.obligations values (4,1,2,'kredi_karti_ekstresi','2026-11-09','bekliyor',2500000,2500000,'2026-10-29');
    raise exception 'Duplicate month accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.obligations values (5,1,3,'kredi_karti_ekstresi','2026-10-25','bekliyor',2500000,2500000,'2026-10-28');
    raise exception 'Due before cutoff accepted';
  exception when check_violation then null;
  end;
end $$;
-- Cancellation frees the month; other cards/workspaces are independent.
update public.obligations set status='iptal_edildi' where id=3;
insert into public.obligations values (6,1,2,'kredi_karti_ekstresi','2026-11-08','bekliyor',2500000,2500000,'2026-10-28');
insert into public.obligations values (7,2,2,'kredi_karti_ekstresi','2026-11-08','bekliyor',2500000,2500000,'2026-10-28');
-- Old clients can still create records without the new column.
insert into public.obligations(id,workspace_id,account_id,document_type,due_date,status,total_amount_minor,remaining_amount_minor)
  values(8,1,1,'kredi_karti_ekstresi','2026-12-08','bekliyor',1000000,1000000);
rollback;
\echo 'PASS additive migration, legacy duplicate/amount preservation, month uniqueness, date constraint and old-client inserts'

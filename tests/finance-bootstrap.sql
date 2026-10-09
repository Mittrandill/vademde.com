-- Reduced integration fixture, NOT the production schema or a deployable migration.
-- Run only against a disposable database named vademde_finance_test.
do $$ begin
  if current_database() <> 'vademde_finance_test' then
    raise exception 'This fixture may only run in vademde_finance_test';
  end if;
end $$;
create role anon;
create role authenticated;
create table public.accounts(id uuid primary key,workspace_id uuid,currency_code text);
create table public.obligations(id uuid primary key,workspace_id uuid,total_amount_minor bigint,
  remaining_amount_minor bigint,currency_code text,direction text,status text);
create table public.installments(id uuid primary key,workspace_id uuid,obligation_id uuid,
  amount_minor bigint,remaining_amount_minor bigint,status text);
create table public.transactions(id uuid primary key default gen_random_uuid(),workspace_id uuid,
  account_id uuid,direction text,category_id uuid,counterparty_id uuid,amount_minor bigint check(amount_minor>0),
  financing_minor bigint default 0,currency_code text,fx_rate_try_minor bigint,payment_method text,
  description text,occurred_at timestamptz,transfer_to_account_id uuid);
create table public.payments(id uuid primary key default gen_random_uuid(),workspace_id uuid,
  obligation_id uuid,installment_id uuid,transaction_id uuid references public.transactions(id) on delete set null,
  account_id uuid,amount_minor bigint check(amount_minor>0),paid_at timestamptz default now(),notes text,
  receipt_document_id uuid,fx_rate_try_minor bigint,settled_by_obligation_id uuid);
create table public.value_unit_rates(unit_code text primary key,try_equivalent_minor bigint);
create function public.can_edit_workspace(uuid) returns boolean language sql as
  $$ select coalesce(current_setting('test.editor',true),'true') = 'true' $$;
create function public.test_recompute() returns trigger language plpgsql as $$
declare target uuid := coalesce(new.obligation_id,old.obligation_id);
begin
 update public.obligations set remaining_amount_minor=greatest(total_amount_minor-
   coalesce((select sum(amount_minor) from public.payments where obligation_id=target),0),0)
 where id=target;
 if coalesce(new.installment_id,old.installment_id) is not null then
   update public.installments set remaining_amount_minor=greatest(amount_minor-
     coalesce((select sum(p.amount_minor) from public.payments p where p.installment_id=installments.id),0),0)
   where id=coalesce(new.installment_id,old.installment_id);
 end if;
 return coalesce(new,old);
end $$;
create trigger payments_recompute after insert or update or delete on public.payments
  for each row execute function public.test_recompute();
insert into public.accounts values
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010','TRY'),
 ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010','USD');
insert into public.obligations values
 ('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000010',3000000,3000000,'TRY','receivable','bekliyor'),
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000010',10000,10000,'USD','receivable','bekliyor');
insert into public.value_unit_rates values ('USD',4500);

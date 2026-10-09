do $$ begin
  if current_database() <> 'vademde_finance_test' then raise exception 'Disposable test DB required'; end if;
end $$;
alter table public.accounts add column if not exists type text not null default 'bank';
alter table public.obligations add column if not exists account_id uuid;
alter table public.obligations add column if not exists due_date date;
alter table public.obligations add column if not exists created_at timestamptz default now();
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
grant select,insert,update,delete on public.accounts,public.obligations,public.installments,public.transactions,public.payments to authenticated;
grant select on public.value_unit_rates to authenticated;
insert into public.accounts(id,workspace_id,currency_code,type) values
 ('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000010','TRY','credit_card');
insert into public.obligations(id,workspace_id,account_id,total_amount_minor,remaining_amount_minor,currency_code,direction,status,document_type,due_date) values
 ('00000000-0000-0000-0000-000000000310','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000301',3000000,3000000,'TRY','payable','bekliyor','kredi_karti_ekstresi','2026-09-01'),
 ('00000000-0000-0000-0000-000000000311','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000301',1000000,1000000,'TRY','payable','bekliyor','kredi_karti_ekstresi','2026-10-01'),
 ('00000000-0000-0000-0000-000000000312','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000301',500000,500000,'TRY','payable','iptal_edildi','kredi_karti_ekstresi','2026-08-01');

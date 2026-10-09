do $$ begin
 if current_database()<>'vademde_finance_test' then raise exception 'Disposable test DB required'; end if;
end $$;
alter table public.obligations add column if not exists title text default 'Test';
alter table public.obligations add column if not exists counterparty_id uuid;
alter table public.installments add column if not exists due_date date;
alter table public.installments add column if not exists installment_number integer;
create table if not exists public.counterparties(id uuid primary key,workspace_id uuid);
grant select on public.counterparties to authenticated;
insert into public.counterparties values
 ('00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000010'),
 ('00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000010');
insert into public.obligations(id,workspace_id,counterparty_id,total_amount_minor,remaining_amount_minor,currency_code,direction,status,title) values
 ('00000000-0000-0000-0000-000000000400','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000040',1500000,1500000,'TRY','receivable','bekliyor','Avans 1'),
 ('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000040',1000000,1000000,'TRY','receivable','bekliyor','Avans 2'),
 ('00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000040',1000000,1000000,'TRY','payable','bekliyor','Fatura 1'),
 ('00000000-0000-0000-0000-000000000403','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000040',2000000,2000000,'TRY','payable','bekliyor','Fatura 2');
insert into public.installments(id,workspace_id,obligation_id,amount_minor,remaining_amount_minor,status,due_date,installment_number) values
 ('00000000-0000-0000-0000-000000000410','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000403',500000,500000,'bekliyor','2026-09-01',1),
 ('00000000-0000-0000-0000-000000000411','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000403',1500000,1500000,'bekliyor','2026-10-01',2);
create function public.test_offset(request_id uuid, amount bigint default 2000000) returns jsonb
language sql security invoker as $$
 select public.settle_offset_atomic(auth.uid(),request_id,'00000000-0000-0000-0000-000000000010',
 '00000000-0000-0000-0000-000000000040','payable','TRY',amount,'2026-10-09T12:00:00Z',null,
 '[{"source_id":"00000000-0000-0000-0000-000000000400","target_id":"00000000-0000-0000-0000-000000000402","amount_minor":1000000},
 {"source_id":"00000000-0000-0000-0000-000000000400","target_id":"00000000-0000-0000-0000-000000000403","amount_minor":500000},
 {"source_id":"00000000-0000-0000-0000-000000000401","target_id":"00000000-0000-0000-0000-000000000403","amount_minor":500000}]'::jsonb,
 '[{"id":"00000000-0000-0000-0000-000000000400","remaining_amount_minor":1500000},
 {"id":"00000000-0000-0000-0000-000000000401","remaining_amount_minor":1000000},
 {"id":"00000000-0000-0000-0000-000000000402","remaining_amount_minor":1000000},
 {"id":"00000000-0000-0000-0000-000000000403","remaining_amount_minor":2000000}]'::jsonb)
$$;

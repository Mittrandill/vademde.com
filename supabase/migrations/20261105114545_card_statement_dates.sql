-- Additive: no backfill, balance changes, or changes to payment/RLS behavior.
-- Legacy statements keep NULL and retain the existing inferred-cutoff behavior.
alter table public.obligations
  add column statement_date date,
  add constraint obligations_statement_date_check check (
    statement_date is null or (
      document_type = 'kredi_karti_ekstresi' and account_id is not null
      and due_date is not null and due_date > statement_date
    )
  );

-- Only explicitly dated statements participate; existing rows cannot conflict.
create unique index obligations_card_statement_month_unique
  on public.obligations (workspace_id, account_id, (date_trunc('month', statement_date::timestamp)))
  where document_type = 'kredi_karti_ekstresi'
    and status <> 'iptal_edildi' and statement_date is not null;

comment on column public.obligations.statement_date is
  'Actual card statement cutoff date. NULL preserves legacy inference from card settings and due_date.';

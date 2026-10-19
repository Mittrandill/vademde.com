-- Kredi kartı son ödeme günü hatırlatması: ekstre kaydı olmadan, kartın son ödeme gününden
-- (services/creditCardReminders.ts syncCardPaymentDueReminders). statement_upload gibi hesaba ve
-- döneme bağlıdır; kademeleri obligation hatırlatmalarıyla aynı adları kullanır (3_days_before,
-- due_day) — statement_upload'ın kademeleriyle (statement_day, mid_period) çakışmadığı için
-- (account_id, period_key, stage) tekilliği korunur.
alter table public.reminders drop constraint reminders_kind_check;
alter table public.reminders add constraint reminders_kind_check
  check (kind = any (array['obligation_due'::text, 'statement_upload'::text, 'card_payment_due'::text]));

alter table public.reminders drop constraint reminders_kind_fields_check;
alter table public.reminders add constraint reminders_kind_fields_check
  check (
    (kind = 'obligation_due' and obligation_id is not null and account_id is null and period_key is null)
    or (kind in ('statement_upload', 'card_payment_due') and account_id is not null and obligation_id is null and period_key is not null)
  );

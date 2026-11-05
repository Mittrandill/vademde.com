-- Nullable for existing cards and for users who choose not to enter a rate.
-- Existing clients can continue to create and update accounts without this field.
alter table public.accounts
  add column minimum_payment_rate numeric(5,2)
  constraint accounts_minimum_payment_rate_check
  check (minimum_payment_rate > 0 and minimum_payment_rate <= 100);

comment on column public.accounts.minimum_payment_rate is
  'Optional user-entered minimum payment percentage; used for statement-based estimates, not a bank-confirmed amount.';

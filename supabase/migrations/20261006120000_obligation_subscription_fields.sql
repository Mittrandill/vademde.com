-- Abonelikler için iki isteğe bağlı alan (tasarım: Aboneliklerim "Deneme bitiyor" ve "Yıllık" grupları).
-- Yalnızca ekleyicidir: mevcut kayıtlarda iki alan da NULL kalır ve davranış değişmez
-- (NULL billing_period = bugünkü aylık plan). Geri alma:
--   alter table public.obligations drop column trial_ends_on, drop column billing_period;
alter table public.obligations
  add column if not exists trial_ends_on date,
  add column if not exists billing_period text;

alter table public.obligations
  add constraint obligations_billing_period_check
  check (billing_period is null or billing_period in ('monthly', 'yearly'));

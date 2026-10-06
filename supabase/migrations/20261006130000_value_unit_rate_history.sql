-- Günlük kur anlık görüntüsü (akıllı önerilerdeki "kur etkisi" kuralı için). value_unit_rates yalnızca
-- güncel kuru tutuyordu. Yeni, bağımsız tablo: mevcut tablo ve kayıtlara dokunmaz.
-- Geri alma: drop table public.value_unit_rate_history;
create table if not exists public.value_unit_rate_history (
  unit_code text not null,
  rate_date date not null,
  try_equivalent_minor bigint not null,
  created_at timestamptz not null default now(),
  primary key (unit_code, rate_date)
);

alter table public.value_unit_rate_history enable row level security;

-- Kurlar herkese açık piyasa verisidir (value_unit_rates ile aynı); yazma yalnızca service role.
create policy "value_unit_rate_history_select" on public.value_unit_rate_history
  for select to authenticated using (true);

insert into public.value_unit_rate_history (unit_code, rate_date, try_equivalent_minor)
select unit_code, (cached_at at time zone 'Europe/Istanbul')::date, try_equivalent_minor
from public.value_unit_rates
on conflict do nothing;

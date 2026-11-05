\set ON_ERROR_STOP on
-- Disposable database only: migration compatibility and stored percentage constraints.
do $$ begin
  if current_database() <> 'vademde_card_minimum_test' then
    raise exception 'Use only vademde_card_minimum_test';
  end if;
end $$;
begin;
create table public.accounts (
  id integer primary key,
  type text not null,
  opening_balance_minor bigint not null default 0,
  opening_balance_set_at timestamptz
);
insert into public.accounts values (1, 'credit_card', 1234567, '2026-10-01T12:00:00Z');
\ir ../supabase/migrations/20261105112411_card_minimum_payment_rate.sql

do $$
declare rate numeric;
begin
  if not exists (select 1 from public.accounts where id = 1 and minimum_payment_rate is null
      and opening_balance_minor = 1234567 and opening_balance_set_at = '2026-10-01T12:00:00Z') then
    raise exception 'Migration changed legacy debt or invented a rate';
  end if;
  -- Old clients omit the field. New clients may explicitly leave it blank.
  insert into public.accounts (id, type) values (2, 'credit_card');
  insert into public.accounts (id, type, minimum_payment_rate) values (3, 'credit_card', null);
  foreach rate in array array[0.01, 20, 20.25, 40, 100] loop
    update public.accounts set minimum_payment_rate = rate where id = 1;
    if (select minimum_payment_rate from public.accounts where id = 1) <> rate then
      raise exception 'Rate did not round-trip: %', rate;
    end if;
  end loop;
  foreach rate in array array[-1, 0, 100.01, 101, 'NaN'::numeric] loop
    begin
      update public.accounts set minimum_payment_rate = rate where id = 1;
      raise exception 'Accepted invalid rate: %', rate;
    exception when check_violation then null;
    end;
  end loop;
  update public.accounts set minimum_payment_rate = null where id = 1;
  if not exists (select 1 from public.accounts where id = 1 and minimum_payment_rate is null
      and opening_balance_minor = 1234567 and opening_balance_set_at = '2026-10-01T12:00:00Z') then
    raise exception 'Settings update changed legacy debt';
  end if;
end $$;
rollback;
\echo 'PASS optional rates, old/new inserts, decimal round-trip, invalid rates and legacy debt preservation'

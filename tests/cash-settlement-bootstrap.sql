-- Only evolve the reduced, disposable fixture. NOT a production migration.
do $$ begin if current_database()<>'vademde_finance_test' then raise exception 'Disposable DB required'; end if; end $$;
alter table public.obligations alter column id set default gen_random_uuid();
alter table public.obligations add column if not exists value_unit_type text;
alter table public.obligations add column if not exists notes text;
alter table public.obligations add column if not exists parent_obligation_id uuid;
alter table public.obligations alter column status set default 'bekliyor';
alter table public.transactions add column if not exists source_obligation_id uuid;
-- Production insert triggers set this; the reduced fixture previously lacked the behavior.
create or replace function public.test_initial_remaining() returns trigger language plpgsql as $$ begin
 new.remaining_amount_minor:=coalesce(new.remaining_amount_minor,new.total_amount_minor); return new; end $$;
drop trigger if exists test_initial_remaining on public.obligations;
create trigger test_initial_remaining before insert on public.obligations for each row execute function public.test_initial_remaining();

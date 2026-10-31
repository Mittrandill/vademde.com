-- Shared by the web and Expo clients. Values are estimates, never account balances.
create table public.owned_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('home','land','field','commercial','vehicle','other')),
  name text not null check (length(trim(name)) between 1 and 160),
  currency_code text not null default 'TRY' check (currency_code in ('TRY','USD','EUR','GBP')),
  estimated_value_minor bigint check (estimated_value_minor between 0 and 9007199254740991),
  valued_on date,
  ownership_bps integer not null default 10000 check (ownership_bps between 1 and 10000),
  purchased_on date,
  purchase_price_minor bigint check (purchase_price_minor between 0 and 9007199254740991),
  location text,
  area_m2 numeric check (area_m2 > 0),
  parcel text,
  plate text,
  make_model text,
  notes text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  check ((estimated_value_minor is null) = (valued_on is null))
);
create index owned_assets_workspace_active_idx on public.owned_assets(workspace_id, is_archived, id);
alter table public.owned_assets enable row level security;
create policy owned_assets_read on public.owned_assets for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy owned_assets_insert on public.owned_assets for insert to authenticated
  with check (public.can_edit_workspace(workspace_id));
create policy owned_assets_update on public.owned_assets for update to authenticated
  using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
-- Archive instead of deleting: linked records and historical estimates remain available.
grant select, insert, update on public.owned_assets to authenticated;

create table public.asset_valuations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  asset_id uuid not null,
  estimated_value_minor bigint,
  currency_code text not null,
  ownership_bps integer not null,
  valued_on date,
  recorded_at timestamptz not null default now(),
  foreign key (workspace_id, asset_id) references public.owned_assets(workspace_id, id) on delete cascade
);
create index asset_valuations_asset_idx on public.asset_valuations(workspace_id, asset_id, recorded_at desc, id);
alter table public.asset_valuations enable row level security;
create policy asset_valuations_read on public.asset_valuations for select to authenticated
  using (public.is_workspace_member(workspace_id));
grant select on public.asset_valuations to authenticated;

create schema if not exists assets_private;
revoke all on schema assets_private from public;
-- A trigger is the only writer of immutable valuation history. Never exposed as an RPC.
create function assets_private.record_valuation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.workspace_id <> old.workspace_id or new.id <> old.id then
      raise exception 'Asset identity cannot be changed';
    end if;
    new.updated_at := now();
    if row(new.estimated_value_minor,new.currency_code,new.ownership_bps,new.valued_on)
       is not distinct from row(old.estimated_value_minor,old.currency_code,old.ownership_bps,old.valued_on) then
      return new;
    end if;
  end if;
  if auth.uid() is null or not public.can_edit_workspace(new.workspace_id) then
    raise exception 'Asset edit permission required';
  end if;
  insert into public.asset_valuations(workspace_id,asset_id,estimated_value_minor,currency_code,ownership_bps,valued_on)
    values(new.workspace_id,new.id,new.estimated_value_minor,new.currency_code,new.ownership_bps,new.valued_on);
  return new;
end;
$$;
-- The FK must permit the initial valuation to be inserted by the BEFORE trigger.
alter table public.asset_valuations drop constraint asset_valuations_workspace_id_asset_id_fkey;
alter table public.asset_valuations add constraint asset_valuations_workspace_id_asset_id_fkey
  foreign key(workspace_id,asset_id) references public.owned_assets(workspace_id,id) on delete cascade
  deferrable initially deferred;
revoke all on function assets_private.record_valuation() from public, anon, authenticated;
create trigger record_asset_valuation before insert or update on public.owned_assets
  for each row execute function assets_private.record_valuation();

alter table public.transactions add column asset_id uuid;
alter table public.obligations add column asset_id uuid;
alter table public.transactions add constraint transactions_asset_id_fkey
  foreign key (workspace_id, asset_id) references public.owned_assets(workspace_id,id);
alter table public.obligations add constraint obligations_asset_id_fkey
  foreign key (workspace_id, asset_id) references public.owned_assets(workspace_id,id);
create index transactions_asset_idx on public.transactions(workspace_id,asset_id) where asset_id is not null;
create index obligations_asset_idx on public.obligations(workspace_id,asset_id) where asset_id is not null;

-- Existing and future payments inherit the linked obligation dynamically. Linking an
-- old loan therefore also links its old payments, without rewriting financial rows.
-- Explicit transaction/source links take precedence. Payment allocations are weighted
-- when one transaction settles several obligations; each amount is counted once.
create view public.asset_activity with (security_invoker = true) as
with payment_links as (
  select p.transaction_id, o.asset_id, sum(p.amount_minor)::numeric as amount
  from public.payments p
  left join public.installments i on i.id = p.installment_id and i.workspace_id = p.workspace_id
  join public.obligations o on o.id = coalesce(p.obligation_id,i.obligation_id) and o.workspace_id = p.workspace_id
  where p.transaction_id is not null
  group by p.transaction_id,o.asset_id
), allocations as (
  select transaction_id,asset_id,
    coalesce(sum(amount) over (partition by transaction_id order by asset_id nulls last rows between unbounded preceding and 1 preceding),0)
      / nullif(sum(amount) over (partition by transaction_id),0) as share_before,
    sum(amount) over (partition by transaction_id order by asset_id nulls last rows unbounded preceding)
      / nullif(sum(amount) over (partition by transaction_id),0) as share_after
  from payment_links
)
select t.id as transaction_id,t.workspace_id,
  coalesce(t.asset_id, source.asset_id, a.asset_id) as asset_id,
  t.direction,t.description,t.currency_code,t.occurred_at,
  (bounds.amount_after-bounds.amount_before)::bigint as amount_minor,
  (floor(least(t.amount_minor,greatest(0,coalesce(t.financing_minor,0)))::numeric*bounds.amount_after/nullif(t.amount_minor,0))
   -floor(least(t.amount_minor,greatest(0,coalesce(t.financing_minor,0)))::numeric*bounds.amount_before/nullif(t.amount_minor,0)))::bigint as financing_minor
from public.transactions t
left join public.obligations source on source.id = t.source_obligation_id and source.workspace_id = t.workspace_id
left join allocations a on a.transaction_id = t.id and coalesce(t.asset_id,source.asset_id) is null
cross join lateral (select
  case when coalesce(t.asset_id,source.asset_id) is not null then 0 else round(t.amount_minor*a.share_before) end as amount_before,
  case when coalesce(t.asset_id,source.asset_id) is not null then t.amount_minor else round(t.amount_minor*a.share_after) end as amount_after
) bounds
where coalesce(t.asset_id,source.asset_id,a.asset_id) is not null;
grant select on public.asset_activity to authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.owned_assets,public.asset_valuations;
  end if;
end $$;

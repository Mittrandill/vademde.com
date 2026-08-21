-- Shopier web abonelik ödemeleri: platform_order_id olarak bu tablonun id'si kullanılır.
-- Mevcut RevenueCat (mobil) akışıyla aynı subscriptions tablosunu besler, store='shopier'.
create table public.shopier_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  plan text not null check (plan = any (array['plus', 'isletme'])),
  billing_period text not null check (billing_period = any (array['monthly', 'yearly'])),
  amount_minor bigint not null check (amount_minor > 0),
  currency_code text not null default 'TRY',
  status text not null default 'pending' check (status = any (array['pending', 'success', 'failed'])),
  payment_id text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.shopier_orders enable row level security;

-- Kullanıcı yalnızca kendi siparişlerini görebilir ve oluşturabilir (checkout Edge Function
-- kullanıcının JWT'siyle çağrılan authedClient ile insert eder). Durumu ('success'/'failed')
-- yalnızca webhook (service role, RLS bypass) günceller — kullanıcıya update izni verilmez.
create policy "shopier_orders_select_own" on public.shopier_orders
  for select using (owner_id = (select auth.uid()));

create policy "shopier_orders_insert_own" on public.shopier_orders
  for insert with check (owner_id = (select auth.uid()));

-- subscriptions.store'a Shopier'ı da ekle (mevcut değerler: app_store, play_store,
-- promotional, manual).
alter table public.subscriptions
  drop constraint subscriptions_store_check;

alter table public.subscriptions
  add constraint subscriptions_store_check
  check (store = any (array['app_store', 'play_store', 'promotional', 'manual', 'shopier']));

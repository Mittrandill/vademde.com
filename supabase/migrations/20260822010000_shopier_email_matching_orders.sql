-- kreditakip.com.tr'deki kanıtlanmış Shopier mimarisiyle hizalanır: sipariş bizim
-- oluşturduğumuz bir platform_order_id ile değil, Shopier'ın kendi orderid'i ve alıcı
-- e-postasıyla eşleşir (statik ürün linkine yönlendiriyoruz, dinamik checkout yok).

-- Shopier'ın kendi orderid'siyle idempotency + denetim kaydı.
create table public.shopier_processed_orders (
  order_id text primary key,
  buyer_email text not null,
  product_id text not null,
  plan text,
  billing_period text,
  owner_id uuid references auth.users(id),
  amount_minor bigint,
  matched boolean not null default false,
  raw_payload jsonb,
  created_at timestamp with time zone not null default now()
);

alter table public.shopier_processed_orders enable row level security;
-- Yalnızca service role (webhook) yazar/okur; hiçbir kullanıcı rolüne policy verilmez.

-- shopier-webhook'un (service role) alıcı e-postasından kullanıcı id'sini bulabilmesi
-- için — auth.users normalde public API'den sorgulanamaz, SECURITY DEFINER ile
-- yalnızca service_role'e açılır (authenticated/anon'a execute verilmez).
create or replace function public.get_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

revoke all on function public.get_user_id_by_email(text) from public, authenticated, anon;
grant execute on function public.get_user_id_by_email(text) to service_role;

-- shopier_orders/shopier-checkout artık kullanılmıyor (statik linke geçildi) — eski
-- tablo dursun (geçmiş veri/gelecek referans için), yeni kod bunu yazmıyor.

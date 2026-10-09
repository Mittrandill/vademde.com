-- Ödeme eklenirken fx_rate_try_minor boşsa, bağlı kaydın birimi TRY değilse o anki güncel kuru yazar.
-- İstemci kuru açıkça gönderdiyse (ödeme formundaki "Kur" alanı) dokunmaz. Böylece ödemenin
-- eklendiği 8 farklı kod yolundan hiçbirinin değişmesi gerekmeden her döviz/altın ödemesi kendi
-- kuruyla saklanır. Mevcut satırları değiştirmez; yalnızca yeni INSERT'lerde çalışır.
-- Geri alma:
--   drop trigger if exists payments_fill_fx_rate on public.payments;
--   drop function if exists public.payments_fill_fx_rate();
create or replace function public.payments_fill_fx_rate()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_currency text;
begin
  if new.fx_rate_try_minor is not null then
    return new;
  end if;

  select currency_code into v_currency from public.obligations where id = new.obligation_id;
  if v_currency is null or v_currency = 'TRY' then
    return new;
  end if;

  select try_equivalent_minor into new.fx_rate_try_minor
  from public.value_unit_rates
  where unit_code = v_currency;

  return new;
end;
$$;

drop trigger if exists payments_fill_fx_rate on public.payments;
create trigger payments_fill_fx_rate
  before insert on public.payments
  for each row execute function public.payments_fill_fx_rate();

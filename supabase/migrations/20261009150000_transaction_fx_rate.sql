-- Hareketlere işlem anındaki TL kuru. Raporlar eskiden geçmiş döviz/altın hareketlerini her
-- görüntülemede BUGÜNKÜ kurla çeviriyordu; kur değiştikçe geçmiş ayların gelir/gider toplamı
-- kayıyordu. Kur artık hareket yazılırken saklanır (value_unit_rates'teki güncel kur), raporlar onu kullanır.
-- TRY hareketlerde NULL kalır. Para birimi değişirse kur yeniden yazılır.
-- Geri alma:
--   drop trigger transactions_fill_fx_rate_ins on public.transactions;
--   drop trigger transactions_fill_fx_rate_upd on public.transactions;
--   drop function public.transactions_fill_fx_rate();
--   alter table public.transactions drop column fx_rate_try_minor;
alter table public.transactions add column if not exists fx_rate_try_minor bigint;
alter table public.transactions
  add constraint transactions_fx_rate_positive check (fx_rate_try_minor is null or fx_rate_try_minor > 0);

create or replace function public.transactions_fill_fx_rate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.currency_code = 'TRY' then
    new.fx_rate_try_minor := null;
    return new;
  end if;
  -- Ekleme: istemci kuru açıkça verdiyse dokunma. Güncelleme: yalnızca para birimi değiştiyse yeniden yaz.
  if tg_op = 'UPDATE' and new.currency_code = old.currency_code then
    return new;
  end if;
  if tg_op = 'INSERT' and new.fx_rate_try_minor is not null then
    return new;
  end if;
  select try_equivalent_minor into new.fx_rate_try_minor
  from public.value_unit_rates
  where unit_code = new.currency_code;
  return new;
end;
$$;

create trigger transactions_fill_fx_rate_ins
  before insert on public.transactions
  for each row execute function public.transactions_fill_fx_rate();
create trigger transactions_fill_fx_rate_upd
  before update of currency_code on public.transactions
  for each row execute function public.transactions_fill_fx_rate();

-- Mevcut döviz/altın hareketler (yazım anında 2 kayıt): kur geçmişi tek günlük olduğundan güncel kurla doldurulur.
update public.transactions t
set fx_rate_try_minor = r.try_equivalent_minor
from public.value_unit_rates r
where t.currency_code <> 'TRY' and r.unit_code = t.currency_code and t.fx_rate_try_minor is null;

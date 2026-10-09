-- Döviz/altın kayıtlarında işlem anındaki TL kuru. Cari ekstresi bu kuru kullanır (geçmiş kayıt =
-- sabit kur); carisiz açık pozisyonlar bu sütunu kullanmaz, canlı kurla izlenir.
-- try_equivalent_minor ile aynı anlam: 1 tam birimin (1 USD, 1 gram altın...) TL karşılığı, kuruş cinsinden.
-- TRY kayıtlarda ve eski kayıtlarda NULL kalır; eski kayıtlar için istemci kur geçmişinden
-- (value_unit_rate_history) en yakın tarihi, o da yoksa güncel kuru "tahmini" olarak kullanır.
-- Mevcut satırlara ve politikalara dokunmaz; yalnızca nullable sütun ekler.
-- Geri alma:
--   alter table public.obligations drop column fx_rate_try_minor;
--   alter table public.payments drop column fx_rate_try_minor;
alter table public.obligations add column if not exists fx_rate_try_minor bigint;
alter table public.payments add column if not exists fx_rate_try_minor bigint;

alter table public.obligations
  add constraint obligations_fx_rate_positive check (fx_rate_try_minor is null or fx_rate_try_minor > 0);
alter table public.payments
  add constraint payments_fx_rate_positive check (fx_rate_try_minor is null or fx_rate_try_minor > 0);

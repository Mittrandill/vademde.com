-- Kayıt düzenleme korumaları (denetim 2026-10-09, bulgu 1, 2 ve 4).
--
-- 1) Ödemesi, bağlı hesap hareketi, alt kaydı (avans/çek) olan ya da başka bir kaydı kapatmış
--    bir kaydın yönü (borç ↔ alacak) ve para birimi değiştirilemez: eski ödemeler/hareketler
--    eski yönde kalır, cari bakiye ters döner.
-- 2) Ödemesi olan taksit silinemez ve tutarı ödenen tutarın altına düşürülemez: silme ödemeleri
--    CASCADE ile siler ama hesap hareketleri (SET NULL) kalır → hesap ile kayıt ayrışır.
--    Kaydın kendisi silinirken (CASCADE) bu kontrol devre dışıdır: RI cascade, üst kayıt
--    silindikten sonra çalıştığı için o anda üst kayıt görünmez.
-- 3) Kaydın toplam tutarı ödenen tutarın altına düşürülemez: fazla ödeme sessizce kaybolurdu
--    (remaining = greatest(total - paid, 0)).
-- Kontroller veritabanında olduğu için eski uygulama sürümlerini de kapsar.

create or replace function public.guard_obligation_edit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  paid bigint;
begin
  if new.direction is distinct from old.direction or new.currency_code is distinct from old.currency_code then
    if exists (select 1 from public.payments where obligation_id = old.id)
      or exists (select 1 from public.payments where settled_by_obligation_id = old.id)
      or exists (select 1 from public.transactions where source_obligation_id = old.id)
      or exists (select 1 from public.obligations where parent_obligation_id = old.id) then
      raise exception 'Ödemesi veya bağlı hareketi olan kaydın yönü ya da para birimi değiştirilemez. Kaydı silip yeniden oluşturun.'
        using errcode = 'P0001';
    end if;
  end if;

  if new.total_amount_minor is distinct from old.total_amount_minor then
    select coalesce(sum(amount_minor), 0) into paid from public.payments where obligation_id = old.id;
    if new.total_amount_minor < paid then
      raise exception 'Toplam tutar, şimdiye kadar ödenen tutarın altına düşürülemez. Önce fazla ödemeyi düzenleyin veya silin.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists obligations_guard_edit on public.obligations;
create trigger obligations_guard_edit
  before update of direction, currency_code, total_amount_minor on public.obligations
  for each row execute function public.guard_obligation_edit();

create or replace function public.guard_installment_edit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  paid bigint;
begin
  if tg_op = 'DELETE' then
    -- Kaydın kendisi siliniyorsa (CASCADE) üst kayıt artık görünmez; izin verilir.
    if exists (select 1 from public.obligations where id = old.obligation_id)
      and exists (select 1 from public.payments where installment_id = old.id) then
      raise exception 'Ödemesi olan taksit silinemez. Önce bu taksitin ödemesini silin.'
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  if new.amount_minor is distinct from old.amount_minor then
    select coalesce(sum(amount_minor), 0) into paid from public.payments where installment_id = old.id;
    if new.amount_minor < paid then
      raise exception 'Taksit tutarı, bu taksite yapılan ödemenin altına düşürülemez.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists installments_guard_edit on public.installments;
create trigger installments_guard_edit
  before update of amount_minor or delete on public.installments
  for each row execute function public.guard_installment_edit();

revoke all on function public.guard_obligation_edit() from public, anon, authenticated;
revoke all on function public.guard_installment_edit() from public, anon, authenticated;

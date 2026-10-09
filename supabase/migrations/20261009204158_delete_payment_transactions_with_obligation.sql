-- Kayıt silinince ödemeleri CASCADE ile silinir ama hesap hareketleri (payments.transaction_id
-- ON DELETE SET NULL) kalıyordu: hesap bakiyesi parayı çıkmış gösterirken ödeme kaydı yoktu.
-- Tek ödeme silmede (delete_payment_atomic) hareket de silinir; kayıt silme artık aynı kuralı
-- uygular. Hareket başka kayıtların ödemelerini de taşıyorsa (tek havaleyle birden çok fatura)
-- yalnızca bu kayda düşen pay hareketten düşülür (aynı para biriminde).
create or replace function public.delete_payment_transactions_for_obligation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
begin
  for r in
    select p.transaction_id, sum(p.amount_minor) as slice
    from public.payments p
    where p.obligation_id = old.id and p.transaction_id is not null
    group by p.transaction_id
  loop
    if exists (select 1 from public.payments where transaction_id = r.transaction_id and obligation_id is distinct from old.id) then
      update public.transactions t set amount_minor = t.amount_minor - r.slice
      where t.id = r.transaction_id and t.amount_minor > r.slice and t.currency_code = old.currency_code;
    else
      delete from public.transactions where id = r.transaction_id;
    end if;
  end loop;
  return old;
end;
$$;

drop trigger if exists obligations_delete_payment_transactions on public.obligations;
create trigger obligations_delete_payment_transactions
  before delete on public.obligations
  for each row execute function public.delete_payment_transactions_for_obligation();

revoke all on function public.delete_payment_transactions_for_obligation() from public, anon, authenticated;

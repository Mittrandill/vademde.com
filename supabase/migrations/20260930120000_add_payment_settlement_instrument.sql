-- Çek/senet ile ödeme ve tahsilat (bkz. features/payments/api.ts settleObligations).
--
-- Bir faturaya çek/senetle ödeme yapıldığında fatura o tutar kadar kapanır (payments satırı,
-- hesapsız, transaction'sız) ve vadeli yeni bir çek/senet kaydı açılır. Para, çek/senet
-- vadesinde ödendiğinde/tahsil edildiğinde hesaptan çıkar/hesaba girer.
--
-- Önceden çek/senet bağımsız yeni bir borç/alacak olarak açılıyordu: 30.000 fatura + 20.000
-- çek = 50.000 borç görünüyordu. Bu kolon, faturayı kapatan ödeme satırını onu doğuran çek/senet
-- kaydına bağlar.
--
-- Kasıtlı olarak FOREIGN KEY DEĞİLDİR: payments → obligations arasında ikinci bir FK, PostgREST'te
-- mevcut tüm `payments(...)` / `obligation:obligations(...)` gömülü seçimlerini belirsiz yapar
-- ("more than one relationship was found") ve yayındaki uygulama sürümlerini bozar. Çek/senet
-- silinince bağlı ödeme satırlarının silinmesi (faturanın yeniden açılması) aşağıdaki
-- tetikleyiciyle sağlanır; payments_recompute_progress faturanın kalanını yeniden hesaplar.
alter table public.payments
  add column if not exists settled_by_obligation_id uuid;

create index if not exists payments_settled_by_obligation_id_idx
  on public.payments (settled_by_obligation_id)
  where settled_by_obligation_id is not null;

comment on column public.payments.settled_by_obligation_id is
  'Bu ödeme bir çek/senet verilerek/alınarak yapıldıysa o çek/senet kaydı (obligations.id). Hesap hareketi oluşturmaz; para çek/senet vadesinde hareket eder.';

create or replace function public.delete_settlement_payments_for_obligation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from public.payments where settled_by_obligation_id = old.id;
  return old;
end;
$$;

drop trigger if exists obligations_delete_settlement_payments on public.obligations;
create trigger obligations_delete_settlement_payments
  before delete on public.obligations
  for each row execute function public.delete_settlement_payments_for_obligation();

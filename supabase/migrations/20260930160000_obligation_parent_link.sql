-- Bir kaydın başka bir kayıt işlenirken otomatik doğduğunu tutar: ör. 20.000'lik çek 15.000'lik
-- faturaya verilince artan 5.000 tedarikçiden alacak (avans) olarak açılır ve çeke bağlanır (bkz.
-- features/payments/api.ts createAdvanceObligation). Çek silinirse bu avans da silinir.
--
-- FK değildir: payments_settled_by_obligation_id ile aynı gerekçe — obligations üzerinde ikinci bir
-- ilişki, PostgREST'teki mevcut gömülü seçimleri belirsiz yapabilir. Silme davranışı aşağıdaki
-- tetikleyiciyle sağlanır.
alter table public.obligations
  add column if not exists parent_obligation_id uuid;

create index if not exists obligations_parent_obligation_id_idx
  on public.obligations (parent_obligation_id)
  where parent_obligation_id is not null;

comment on column public.obligations.parent_obligation_id is
  'Bu kayıt başka bir kayıt işlenirken otomatik oluştuysa (ör. çek/ödeme fazlasından doğan avans) o kayıt. Üst kayıt silinince bu da silinir.';

-- Mahsup/ciro/çek ile kapatma satırları (payments.settled_by_obligation_id) ve bu kayda bağlı
-- otomatik kayıtlar (parent_obligation_id) birlikte silinir; payments_recompute_progress
-- tetikleyicisi karşı kayıtların kalanını yeniden açar.
create or replace function public.delete_settlement_payments_for_obligation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- security definer olduğu için silme yalnızca aynı çalışma alanıyla sınırlanır (docs/07 — workspace izolasyonu).
  delete from public.payments where settled_by_obligation_id = old.id and workspace_id = old.workspace_id;
  delete from public.obligations where parent_obligation_id = old.id and workspace_id = old.workspace_id;
  return old;
end;
$$;

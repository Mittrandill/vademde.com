-- Ödeme dekontu: bir ödeme kaydına (payments) isteğe bağlı dekont/fotoğraf/PDF eklenir ve
-- Belge arşivi'nde saklanır. Dosya, mevcut financial_documents + 'financial-documents' bucket
-- altyapısında durur (document_type = 'banka_dekontu'); bu migration yalnızca ödeme satırından
-- o belgeye tek dokunuşluk bağlantıyı ekler. Birden çok ödeme aynı dekonta bağlanabilir
-- (ör. tek bir kart ödemesinin birden çok ekstreye dağıtılması, bkz. features/payments/api.ts
-- recordCardPayment), bu yüzden bağlantı belge tarafında değil ödeme tarafında tutulur.
--
-- Silinen belge ödemeyi silmez: bağlantı ON DELETE SET NULL ile boşalır, finansal kayıt kalır.

alter table public.payments
  add column if not exists receipt_document_id uuid
  references public.financial_documents(id) on delete set null;

create index if not exists payments_receipt_document_id_idx
  on public.payments (receipt_document_id)
  where receipt_document_id is not null;

-- ---------------------------------------------------------------------------
-- Plan kilidi: dekont ekleme "Belge arşivi"dir ve yalnızca plan_limits.document_archive
-- açık planlarda (Plus, İşletme) çalışır. İstemcideki paywall yönlendirmesi kullanıcı deneyimi
-- içindir; gerçek kapı burasıdır (bkz. 20260905130000_enforce_plan_limits.sql ile aynı desen:
-- plan, çalışma alanının SAHİBİNİN planıdır, ekip üyesinin değil).
-- ---------------------------------------------------------------------------

create or replace function public.workspace_has_document_archive(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select pl.document_archive
       from public.plan_limits pl
       join public.workspaces w on w.id = p_workspace_id
      where pl.plan = public.plan_for_owner(w.owner_id)),
    false
  );
$$;

create or replace function public.enforce_payment_receipt_plan()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.receipt_document_id is null then
    return new;
  end if;
  -- Var olan bir bağlantıyı değiştirmeyen güncellemeler (tutar/tarih düzenleme) plan
  -- düştükten sonra da engellenmez; yalnızca YENİ bağlantı kurmak Plus ister.
  if tg_op = 'UPDATE' and new.receipt_document_id is not distinct from old.receipt_document_id then
    return new;
  end if;
  if not public.workspace_has_document_archive(new.workspace_id) then
    raise exception 'RECEIPT_ARCHIVE_PLAN_REQUIRED: dekont ekleme Plus planına özeldir'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists payments_enforce_receipt_plan on public.payments;
create trigger payments_enforce_receipt_plan
  before insert or update of receipt_document_id on public.payments
  for each row execute function public.enforce_payment_receipt_plan();

-- Her iki fonksiyon da yalnızca payments tetikleyicisinin içinden (tanımlayan rolün yetkisiyle)
-- çalışır; RPC olarak çağrılabilir olmalarına gerek yoktur. Aksi halde herhangi bir kullanıcı
-- başka bir çalışma alanının planını sorgulayabilirdi.
revoke execute on function public.enforce_payment_receipt_plan() from public, anon, authenticated;
revoke execute on function public.workspace_has_document_archive(uuid) from public, anon, authenticated;

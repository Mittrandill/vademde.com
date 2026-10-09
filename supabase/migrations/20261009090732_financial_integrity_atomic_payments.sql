-- Additive staging-only migration. No existing financial rows are rewritten.
-- v2 is intentional: existing migration timestamps later today recreate v1.
-- Apply and verify this migration before distributing the matching app version.

create or replace function public.validate_payment_integrity()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  o public.obligations;
  i public.installments;
  t public.transactions;
  a public.accounts;
  paid bigint;
begin
  if new.installment_id is not null then
    select * into i from public.installments where id = new.installment_id;
    if not found or i.workspace_id <> new.workspace_id then
      raise exception 'Taksit bulunamadı veya çalışma alanı uyuşmuyor';
    end if;
    new.obligation_id := coalesce(new.obligation_id, i.obligation_id);
    if new.obligation_id <> i.obligation_id then
      raise exception 'Ödeme ve taksit farklı kayıtlara ait';
    end if;
  end if;
  select * into o from public.obligations where id = new.obligation_id for update;
  if not found or o.workspace_id <> new.workspace_id then
    raise exception 'Ödeme kaydı bulunamadı veya çalışma alanı uyuşmuyor';
  end if;
  if not public.can_edit_workspace(new.workspace_id) then
    raise exception 'Bu çalışma alanında ödeme yazma yetkisi yok';
  end if;
  if new.amount_minor <= 0 then raise exception 'Ödeme pozitif olmalı'; end if;
  if o.status = 'iptal_edildi' then raise exception 'İptal edilmiş kayda ödeme yapılamaz'; end if;
  select coalesce(sum(amount_minor), 0) into paid from public.payments
    where obligation_id = o.id and id <> new.id;
  if new.amount_minor > o.total_amount_minor - paid then
    raise exception 'Ödeme güncel kalan tutarı aşıyor; kayıtları yenileyin';
  end if;
  if new.installment_id is not null then
    select * into i from public.installments where id = new.installment_id for update;
    if i.status = 'iptal_edildi' then raise exception 'İptal edilmiş taksite ödeme yapılamaz'; end if;
    select coalesce(sum(amount_minor), 0) into paid from public.payments
      where installment_id = i.id and id <> new.id;
    if new.amount_minor > i.amount_minor - paid then
      raise exception 'Ödeme güncel taksit kalanını aşıyor';
    end if;
  end if;
  if new.account_id is not null then
    select * into a from public.accounts where id = new.account_id;
    if not found or a.workspace_id <> new.workspace_id or a.currency_code <> o.currency_code then
      raise exception 'Ödeme hesabının çalışma alanı veya para birimi uyuşmuyor';
    end if;
  end if;
  if new.transaction_id is not null then
    select * into t from public.transactions where id = new.transaction_id;
    if not found or t.workspace_id <> new.workspace_id or t.currency_code <> o.currency_code then
      raise exception 'Ödeme hesap hareketi uyuşmuyor';
    end if;
    if new.account_id is not null and (
      t.account_id <> new.account_id or t.amount_minor <> new.amount_minor or
      t.direction <> case when o.direction = 'payable' then 'expense' else 'income' end
    ) then raise exception 'Ödeme tutarı, yönü veya hesabı hareketle uyuşmuyor'; end if;
    -- Use the actual movement snapshot, not today's rate for an old payment.
    if new.fx_rate_try_minor is null then new.fx_rate_try_minor := t.fx_rate_try_minor; end if;
    if new.account_id is not null and new.fx_rate_try_minor is distinct from t.fx_rate_try_minor then
      raise exception 'Ödeme ile hesap hareketinin kuru uyuşmuyor';
    end if;
  end if;
  return new;
end;
$$;

create trigger payments_validate_integrity
  before insert or update on public.payments
  for each row execute function public.validate_payment_integrity();
revoke all on function public.validate_payment_integrity() from public, anon, authenticated;

create or replace function public.record_payments_v2(p_items jsonb)
returns setof public.payments language plpgsql security invoker set search_path = '' as $$
declare
  item jsonb; tx jsonb; pay jsonb; tx_id uuid; result public.payments;
  snapshot bigint; unit text;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Ödeme listesi boş veya geçersiz';
  end if;
  -- Stable lock order for batches spanning multiple obligations.
  perform o.id from public.obligations o where o.id in (
    select coalesce(nullif(x->'payment'->>'obligation_id','')::uuid,
      (select i.obligation_id from public.installments i where i.id = nullif(x->'payment'->>'installment_id','')::uuid))
    from jsonb_array_elements(p_items) x
  ) order by o.id for update;
  for item in select * from jsonb_array_elements(p_items) loop
    tx := item->'transaction'; pay := item->'payment'; tx_id := null;
    select o.currency_code into unit from public.obligations o
      where o.id = coalesce(nullif(pay->>'obligation_id','')::uuid,
        (select i.obligation_id from public.installments i where i.id = nullif(pay->>'installment_id','')::uuid));
    snapshot := nullif(pay->>'fx_rate_try_minor','')::bigint;
    if unit = 'TRY' then snapshot := null;
    elsif snapshot is null then
      select r.try_equivalent_minor into snapshot from public.value_unit_rates r where r.unit_code = unit;
      if snapshot is null then raise exception 'Ödeme için kur bulunamadı'; end if;
    end if;
    if jsonb_typeof(tx) = 'object' then
      insert into public.transactions (workspace_id,account_id,direction,category_id,counterparty_id,
        amount_minor,financing_minor,currency_code,fx_rate_try_minor,payment_method,description,occurred_at)
      values ((tx->>'workspace_id')::uuid,(tx->>'account_id')::uuid,tx->>'direction',
        nullif(tx->>'category_id','')::uuid,nullif(tx->>'counterparty_id','')::uuid,
        (tx->>'amount_minor')::bigint,coalesce((tx->>'financing_minor')::bigint,0),unit,snapshot,
        nullif(tx->>'payment_method',''),tx->>'description',coalesce((pay->>'paid_at')::timestamptz,now()))
      returning id into tx_id;
    end if;
    insert into public.payments (workspace_id,obligation_id,installment_id,transaction_id,account_id,
      amount_minor,paid_at,notes,receipt_document_id,fx_rate_try_minor)
    values ((pay->>'workspace_id')::uuid,nullif(pay->>'obligation_id','')::uuid,
      nullif(pay->>'installment_id','')::uuid,tx_id,nullif(pay->>'account_id','')::uuid,
      (pay->>'amount_minor')::bigint,coalesce((pay->>'paid_at')::timestamptz,now()),pay->>'notes',
      nullif(pay->>'receipt_document_id','')::uuid,snapshot) returning * into result;
    return next result;
  end loop;
end;
$$;
revoke all on function public.record_payments_v2(jsonb) from public, anon;
grant execute on function public.record_payments_v2(jsonb) to authenticated;

create or replace function public.update_payment_atomic(
  p_payment_id uuid, p_expected_amount_minor bigint, p_expected_paid_at timestamptz,
  p_patch jsonb, p_transaction jsonb
) returns public.payments language plpgsql security invoker set search_path = '' as $$
declare
  p public.payments; result public.payments; old_tx uuid; new_tx uuid; account uuid;
  snapshot bigint; unit text;
begin
  select * into p from public.payments where id = p_payment_id;
  if not found then raise exception 'Ödeme bulunamadı'; end if;
  if not public.can_edit_workspace(p.workspace_id) then raise exception 'Ödeme düzenleme yetkisi yok'; end if;
  perform id from public.obligations where id = p.obligation_id for update;
  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Ödeme artık mevcut değil'; end if;
  if p.amount_minor is distinct from p_expected_amount_minor or p.paid_at is distinct from p_expected_paid_at then
    raise exception 'Ödeme başka bir işlemde değişti; yenileyip tekrar deneyin';
  end if;
  if p.settled_by_obligation_id is not null then
    raise exception 'Bağlı mahsup/ciro/çek kapanışı tek ödeme olarak düzenlenemez';
  end if;
  old_tx := p.transaction_id; new_tx := old_tx;
  if old_tx is not null and exists (select 1 from public.payments where transaction_id=old_tx and id<>p.id) then
    raise exception 'Paylaşılan kart ödemesini kart ödeme ekranından yönetin';
  end if;
  if old_tx is not null and exists (select 1 from public.transactions where id=old_tx and direction='transfer') then
    raise exception 'Kart transferini normal ödeme olarak düzenleyemezsiniz';
  end if;
  account := nullif(p_patch->>'account_id','')::uuid;
  select currency_code into unit from public.obligations where id=p.obligation_id;
  snapshot := p.fx_rate_try_minor;
  if snapshot is null and old_tx is not null then
    select fx_rate_try_minor into snapshot from public.transactions where id=old_tx;
  end if;
  if unit <> 'TRY' and snapshot is null then raise exception 'Geçmiş ödemenin kuru belirlenmeli'; end if;
  if unit = 'TRY' then snapshot := null; end if;
  if account is not null then
    if jsonb_typeof(p_transaction) is distinct from 'object' then raise exception 'Hesap hareketi eksik'; end if;
    if old_tx is null then
      insert into public.transactions (workspace_id,account_id,direction,category_id,counterparty_id,
        amount_minor,financing_minor,currency_code,fx_rate_try_minor,occurred_at,description)
      values (p.workspace_id,account,p_transaction->>'direction',nullif(p_transaction->>'category_id','')::uuid,
        nullif(p_transaction->>'counterparty_id','')::uuid,(p_patch->>'amount_minor')::bigint,
        coalesce((p_transaction->>'financing_minor')::bigint,0),unit,snapshot,
        (p_patch->>'paid_at')::timestamptz,p_transaction->>'description') returning id into new_tx;
    else
      update public.transactions set account_id=account,direction=p_transaction->>'direction',
        category_id=nullif(p_transaction->>'category_id','')::uuid,
        counterparty_id=nullif(p_transaction->>'counterparty_id','')::uuid,
        amount_minor=(p_patch->>'amount_minor')::bigint,
        financing_minor=coalesce((p_transaction->>'financing_minor')::bigint,0),currency_code=unit,
        fx_rate_try_minor=snapshot,occurred_at=(p_patch->>'paid_at')::timestamptz,
        description=p_transaction->>'description' where id=old_tx;
      if not found then raise exception 'Hesap hareketi güncellenemedi'; end if;
    end if;
  else new_tx := null;
  end if;
  update public.payments set amount_minor=(p_patch->>'amount_minor')::bigint,
    paid_at=(p_patch->>'paid_at')::timestamptz,notes=p_patch->>'notes',account_id=account,
    transaction_id=new_tx,fx_rate_try_minor=snapshot,
    receipt_document_id=case when p_patch ? 'receipt_document_id'
      then nullif(p_patch->>'receipt_document_id','')::uuid else receipt_document_id end
    where id=p.id returning * into result;
  if old_tx is not null and new_tx is null then
    delete from public.transactions where id=old_tx;
    if not found then raise exception 'Eski hesap hareketi silinemedi'; end if;
  end if;
  return result;
end;
$$;
revoke all on function public.update_payment_atomic(uuid,bigint,timestamptz,jsonb,jsonb) from public, anon;
grant execute on function public.update_payment_atomic(uuid,bigint,timestamptz,jsonb,jsonb) to authenticated;

create or replace function public.delete_payment_atomic(
  p_payment_id uuid, p_expected_amount_minor bigint, p_expected_paid_at timestamptz
) returns void language plpgsql security invoker set search_path = '' as $$
declare p public.payments; deleted_count bigint; expected_count bigint;
begin
  select * into p from public.payments where id=p_payment_id;
  if not found then raise exception 'Ödeme bulunamadı'; end if;
  if not public.can_edit_workspace(p.workspace_id) then raise exception 'Ödeme silme yetkisi yok'; end if;
  perform o.id from public.obligations o where o.id in (
    select obligation_id from public.payments where id=p.id or
      (p.transaction_id is not null and transaction_id=p.transaction_id)
  ) order by o.id for update;
  select * into p from public.payments where id=p_payment_id for update;
  if not found then raise exception 'Ödeme artık mevcut değil'; end if;
  if p.amount_minor is distinct from p_expected_amount_minor or p.paid_at is distinct from p_expected_paid_at then
    raise exception 'Ödeme başka bir işlemde değişti; yenileyip tekrar deneyin';
  end if;
  if p.settled_by_obligation_id is not null then
    raise exception 'Bağlı mahsup/ciro/çek kapanışı tek ödeme olarak silinemez';
  end if;
  if p.transaction_id is not null then
    select count(*) into expected_count from public.payments where transaction_id=p.transaction_id;
    delete from public.payments where transaction_id=p.transaction_id;
    get diagnostics deleted_count = row_count;
    if deleted_count <> expected_count then raise exception 'Bağlı ödemeler silinemedi'; end if;
    delete from public.transactions where id=p.transaction_id;
    if not found then raise exception 'Hesap hareketi silinemedi'; end if;
  else
    delete from public.payments where id=p.id;
    if not found then raise exception 'Ödeme silinemedi'; end if;
  end if;
end;
$$;
revoke all on function public.delete_payment_atomic(uuid,bigint,timestamptz) from public, anon;
grant execute on function public.delete_payment_atomic(uuid,bigint,timestamptz) to authenticated;

-- Ödeme düzenlenirken hesap eklenince oluşan yeni hareketin ödeme yöntemi boş kalıyordu
-- (rapor/filtrelerde "yöntemsiz" görünüyordu). Yöntem istemci gönderirse ondan, göndermezse
-- hesabın türünden türetilir: kart/POS → kredi_karti, kasa → nakit, cüzdan → online_odeme,
-- banka → havale. Mevcut harekette yöntem korunur; yalnızca kart ↔ kart dışı hesap geçişinde
-- (eski yöntem yeni hesaba uymuyorsa) yeniden türetilir.
create or replace function public.update_payment_atomic(p_payment_id uuid, p_expected_amount_minor bigint, p_expected_paid_at timestamp with time zone, p_patch jsonb, p_transaction jsonb)
 returns public.payments
 language plpgsql
 set search_path to ''
as $function$
declare
  p public.payments; result public.payments; old_tx uuid; new_tx uuid; account uuid;
  snapshot bigint; unit text; account_type text; derived_method text; requested_method text; old_method text;
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
    select type into account_type from public.accounts where id = account;
    derived_method := case account_type
      when 'credit_card' then 'kredi_karti' when 'pos' then 'kredi_karti'
      when 'cash' then 'nakit' when 'wallet' then 'online_odeme' else 'havale' end;
    requested_method := nullif(p_transaction->>'payment_method','');
    if old_tx is null then
      insert into public.transactions (workspace_id,account_id,direction,category_id,counterparty_id,
        amount_minor,financing_minor,currency_code,fx_rate_try_minor,occurred_at,description,payment_method)
      values (p.workspace_id,account,p_transaction->>'direction',nullif(p_transaction->>'category_id','')::uuid,
        nullif(p_transaction->>'counterparty_id','')::uuid,(p_patch->>'amount_minor')::bigint,
        coalesce((p_transaction->>'financing_minor')::bigint,0),unit,snapshot,
        (p_patch->>'paid_at')::timestamptz,p_transaction->>'description',
        coalesce(requested_method, derived_method)) returning id into new_tx;
    else
      select payment_method into old_method from public.transactions where id=old_tx;
      update public.transactions set account_id=account,direction=p_transaction->>'direction',
        category_id=nullif(p_transaction->>'category_id','')::uuid,
        counterparty_id=nullif(p_transaction->>'counterparty_id','')::uuid,
        amount_minor=(p_patch->>'amount_minor')::bigint,
        financing_minor=coalesce((p_transaction->>'financing_minor')::bigint,0),currency_code=unit,
        fx_rate_try_minor=snapshot,occurred_at=(p_patch->>'paid_at')::timestamptz,
        description=p_transaction->>'description',
        payment_method=coalesce(requested_method,
          case when old_method is not null
                and (old_method = 'kredi_karti') = (account_type in ('credit_card','pos'))
               then old_method else derived_method end)
        where id=old_tx;
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
$function$;

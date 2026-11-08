-- Ödemesi olan bir kayıt silinirken 27000 hatası alınıyordu ("tuple to be deleted was already
-- modified by an operation triggered by the current command"). BEFORE DELETE tetikleyicisi ödemeye
-- bağlı hesap hareketini siler; payments.transaction_id ON DELETE SET NULL ödeme satırını günceller;
-- payments_recompute_progress da silinmekte olan kaydı günceller. Postgres bir BEFORE tetikleyicisinin
-- sildiği satırı aynı komutta değiştirmesine izin vermez.
-- Silinmekte olan kaydın ilerlemesi hesaplanmaz: satır zaten yok olacak. Ayar işlem yereldir.
create or replace function public.mark_obligation_deleting(target_obligation_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  select set_config(
    'vademde.deleting_obligations',
    concat_ws(',', nullif(current_setting('vademde.deleting_obligations', true), ''), target_obligation_id::text),
    true
  );
$$;

revoke all on function public.mark_obligation_deleting(uuid) from public, anon, authenticated;

create or replace function public.recompute_obligation_progress(target_obligation_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  ob record;
  paid bigint;
  new_status text;
begin
  if target_obligation_id::text = any(string_to_array(coalesce(current_setting('vademde.deleting_obligations', true), ''), ',')) then
    return;
  end if;

  select * into ob from public.obligations where id = target_obligation_id for update;
  if not found then
    return;
  end if;

  select coalesce(sum(amount_minor), 0) into paid
  from public.payments where obligation_id = target_obligation_id;

  new_status := ob.status;
  if ob.status in ('bekliyor', 'kismen_odendi', 'odendi', 'kismen_tahsil_edildi', 'tahsil_edildi', 'gecikti') then
    if paid >= ob.total_amount_minor then
      new_status := case when ob.direction = 'payable' then 'odendi' else 'tahsil_edildi' end;
    elsif paid > 0 then
      new_status := case when ob.direction = 'payable' then 'kismen_odendi' else 'kismen_tahsil_edildi' end;
    else
      new_status := 'bekliyor';
    end if;
  end if;

  update public.obligations
  set remaining_amount_minor = greatest(ob.total_amount_minor - paid, 0),
      status = new_status
  where id = target_obligation_id;
end;
$function$;

create or replace function public.delete_payment_transactions_for_obligation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
begin
  perform public.mark_obligation_deleting(old.id);
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
$function$;

create or replace function public.delete_settlement_payments_for_obligation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.mark_obligation_deleting(old.id);
  delete from public.payments where settled_by_obligation_id = old.id and workspace_id = old.workspace_id;
  delete from public.obligations where parent_obligation_id = old.id and workspace_id = old.workspace_id;
  return old;
end;
$function$;

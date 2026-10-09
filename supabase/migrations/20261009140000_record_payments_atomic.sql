-- Ödeme + hesap hareketi yazımını tek işlemde (atomik) yapar. İstemci eskiden önce transactions'a
-- sonra payments'a ayrı istekler atıyordu: ikinci adım düşerse hesap bakiyesini değiştiren yetim bir
-- hareket kalıyor, taksitlere bölünen ödemelerde de yalnızca ilk dilimler yazılıp gerisi kayboluyordu.
-- SECURITY INVOKER: RLS politikaları ve tetikleyiciler (recompute_*, payments_fill_fx_rate) olduğu gibi çalışır.
-- p_items: [{ "transaction": {...} | null, "payment": {...} }, ...]; sırayla yazılır, biri düşerse hepsi geri alınır.
-- Geri alma: drop function public.record_payments(jsonb);
create or replace function public.record_payments(p_items jsonb)
returns setof public.payments
language plpgsql
security invoker
set search_path = public
as $$
declare
  item jsonb;
  tx jsonb;
  pay jsonb;
  tx_id uuid;
  result public.payments;
begin
  for item in select * from jsonb_array_elements(p_items) loop
    tx := item -> 'transaction';
    pay := item -> 'payment';
    tx_id := null;

    if tx is not null and jsonb_typeof(tx) = 'object' then
      insert into public.transactions (
        workspace_id, account_id, direction, category_id, counterparty_id, amount_minor,
        financing_minor, currency_code, payment_method, description, occurred_at
      ) values (
        (tx ->> 'workspace_id')::uuid,
        (tx ->> 'account_id')::uuid,
        tx ->> 'direction',
        nullif(tx ->> 'category_id', '')::uuid,
        nullif(tx ->> 'counterparty_id', '')::uuid,
        (tx ->> 'amount_minor')::bigint,
        coalesce((tx ->> 'financing_minor')::bigint, 0),
        coalesce(tx ->> 'currency_code', 'TRY'),
        nullif(tx ->> 'payment_method', ''),
        tx ->> 'description',
        coalesce((tx ->> 'occurred_at')::timestamptz, now())
      )
      returning id into tx_id;
    end if;

    insert into public.payments (
      workspace_id, obligation_id, installment_id, transaction_id, account_id, amount_minor,
      paid_at, notes, receipt_document_id, fx_rate_try_minor
    ) values (
      (pay ->> 'workspace_id')::uuid,
      nullif(pay ->> 'obligation_id', '')::uuid,
      nullif(pay ->> 'installment_id', '')::uuid,
      tx_id,
      nullif(pay ->> 'account_id', '')::uuid,
      (pay ->> 'amount_minor')::bigint,
      coalesce((pay ->> 'paid_at')::timestamptz, now()),
      pay ->> 'notes',
      nullif(pay ->> 'receipt_document_id', '')::uuid,
      nullif(pay ->> 'fx_rate_try_minor', '')::bigint
    )
    returning * into result;

    return next result;
  end loop;
end;
$$;

grant execute on function public.record_payments(jsonb) to authenticated;

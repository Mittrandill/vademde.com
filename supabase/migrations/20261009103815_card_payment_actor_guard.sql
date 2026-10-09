-- The queue's owner is checked inside the same transaction as the financial write.
-- A session switch between the client's check and the RPC cannot replay another user's queue.
create or replace function public.record_card_payment_owned(
  p_expected_actor uuid, p_request_id uuid, p_workspace_id uuid, p_card_account_id uuid,
  p_source_account_id uuid, p_amount_minor bigint, p_currency_code text, p_paid_at timestamptz
) returns uuid language plpgsql security invoker set search_path = '' as $$
begin
  if p_expected_actor is null or auth.uid() is distinct from p_expected_actor then
    raise exception 'Oturum değişti; saklanan ödeme başka kullanıcı adına gönderilemez';
  end if;
  return public.record_card_payment_atomic(p_request_id,p_workspace_id,p_card_account_id,
    p_source_account_id,p_amount_minor,p_currency_code,p_paid_at);
end;
$$;
revoke all on function public.record_card_payment_owned(uuid,uuid,uuid,uuid,uuid,bigint,text,timestamptz) from public, anon;
grant execute on function public.record_card_payment_owned(uuid,uuid,uuid,uuid,uuid,bigint,text,timestamptz) to authenticated;

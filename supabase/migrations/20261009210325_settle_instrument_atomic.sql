-- Çek/senetle ödeme / tahsilat tek transaction ve idempotent (denetim 2026-10-09).
--
-- Önceden istemci üç ayrı yazım yapıyordu: çek/senet kaydı (+ vadeler) → seçilen kayıtları
-- kapatan hesapsız ödemeler → fazla tutar için avans. Arada bağlantı koparsa telafi silmesi
-- sonucu kontrol edilmeden çalışıyordu; açık bir çek + kapanmamış fatura (aynı borcun iki kez
-- görünmesi) kalabiliyordu, yanıt kaybında tekrar deneme ikinci bir çek açıyordu.
--
-- settle_instrument_atomic hepsini tek transaction'da yazar. İstek kimliği (request_id) ile
-- aynı istek tekrar gelirse yeni kayıt açmadan ilk sonucu döndürür; aynı kimlik farklı içerikle
-- kullanılamaz. Taksit dilimleri sunucuda, kilit altında güncel kalanlardan hesaplanır.

create table if not exists finance_private.instrument_settlement_requests (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid not null,
  actor_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, request_id)
);
alter table finance_private.instrument_settlement_requests enable row level security;
revoke all on finance_private.instrument_settlement_requests from public, anon;
grant select, insert on finance_private.instrument_settlement_requests to authenticated;
drop policy if exists instrument_settlement_read on finance_private.instrument_settlement_requests;
create policy instrument_settlement_read on finance_private.instrument_settlement_requests
  for select to authenticated
  using (actor_id = (select auth.uid()) and public.can_edit_workspace(workspace_id));
drop policy if exists instrument_settlement_write on finance_private.instrument_settlement_requests;
create policy instrument_settlement_write on finance_private.instrument_settlement_requests
  for insert to authenticated
  with check (actor_id = (select auth.uid()) and public.can_edit_workspace(workspace_id));

-- p_header: direction, method (cek|senet), counterparty_id, counterparty_name, currency_code,
--   value_unit_type, amount_minor, paid_at, title, bank_code, document_no, account_id (vadede
--   paranın çıkacağı/gireceği hesap, isteğe bağlı), category_id, due_dates [{due_date, amount_minor}]
-- p_allocations: [{obligation_id, amount_minor, remaining_amount_minor}] — en eski vade önce;
--   remaining_amount_minor istemcinin gördüğü kalan tutardır, değiştiyse istek reddedilir.
create or replace function public.settle_instrument_atomic(
  p_expected_actor uuid, p_request_id uuid, p_workspace_id uuid, p_header jsonb, p_allocations jsonb)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  previous finance_private.instrument_settlement_requests; payload jsonb; result jsonb;
  direction text; method text; label text; cp uuid; unit text; unit_type text; amount bigint;
  paid_at timestamptz; account uuid; due jsonb; due_sum bigint := 0; due_count int; first_due date;
  ids uuid[]; alloc jsonb; o public.obligations; remaining bigint; take bigint; left_to_slice bigint;
  applied bigint := 0; leftover bigint; instrument public.obligations; advance public.obligations;
  inst record; last_installment uuid; note text; doc_no text; n int := 0; allocations jsonb := '[]';
  cp_name text;
begin
  if p_expected_actor is null or auth.uid() is distinct from p_expected_actor
    or public.can_edit_workspace(p_workspace_id) is not true then
    raise exception 'Ödeme işlem sahibi veya yazma yetkisi uyuşmuyor';
  end if;
  if p_request_id is null or jsonb_typeof(p_header) is distinct from 'object'
    or jsonb_typeof(p_allocations) is distinct from 'array' or jsonb_array_length(p_allocations) > 500 then
    raise exception 'Çek/senet bilgileri geçersiz';
  end if;

  direction := p_header->>'direction'; method := p_header->>'method';
  cp := nullif(p_header->>'counterparty_id','')::uuid; unit := p_header->>'currency_code';
  unit_type := p_header->>'value_unit_type'; amount := (p_header->>'amount_minor')::bigint;
  paid_at := (p_header->>'paid_at')::timestamptz; account := nullif(p_header->>'account_id','')::uuid;
  if direction is null or direction not in ('payable','receivable') or method is null or method not in ('cek','senet')
    or cp is null or paid_at is null or amount is null or amount <= 0 or amount > 9007199254740991
    or unit not in ('TRY','USD','EUR','gram_altin','ceyrek_altin','yarim_altin','tam_altin','cumhuriyet_altini')
    or unit_type is distinct from (case when unit in ('TRY','USD','EUR') then 'fiat' else 'kiymetli_maden' end)
    or jsonb_typeof(p_header->'due_dates') is distinct from 'array' then
    raise exception 'Çek/senet başlığı geçersiz';
  end if;
  label := case when method = 'cek' then 'Çek' else 'Senet' end;
  due_count := jsonb_array_length(p_header->'due_dates');
  if due_count < 1 or due_count > 60 or (method = 'cek' and due_count <> 1) then
    raise exception 'Vade bilgisi geçersiz';
  end if;
  for due in select * from jsonb_array_elements(p_header->'due_dates') loop
    if (due->>'due_date')::date is null or (due->>'amount_minor')::bigint is null or (due->>'amount_minor')::bigint <= 0 then
      raise exception 'Vade bilgisi geçersiz';
    end if;
    due_sum := due_sum + (due->>'amount_minor')::bigint;
    if first_due is null or (due->>'due_date')::date < first_due then first_due := (due->>'due_date')::date; end if;
  end loop;
  if due_sum <> amount then raise exception 'Vade tutarlarının toplamı, toplam tutara eşit olmalı'; end if;

  payload := jsonb_build_object('header', p_header, 'allocations', p_allocations);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('instrument:'||p_workspace_id::text||p_request_id::text, 0));
  select * into previous from finance_private.instrument_settlement_requests
    where workspace_id = p_workspace_id and request_id = p_request_id;
  if found then
    if previous.result->>'cancelled' = 'true' then raise exception 'Bu ödeme isteği iptal edildi'; end if;
    if previous.payload is distinct from payload then raise exception 'Ödeme işlem kimliği farklı içerikle kullanılamaz'; end if;
    return previous.result;
  end if;

  select name into cp_name from public.counterparties where id = cp and workspace_id = p_workspace_id;
  if not found then raise exception 'Cari bulunamadı veya çalışma alanı uyuşmuyor'; end if;
  if account is not null and not exists (
    select 1 from public.accounts a where a.id = account and a.workspace_id = p_workspace_id
      and a.type in ('bank','cash') and a.currency_code = unit) then
    raise exception 'Vade hesabı bulunamadı veya para birimi uyuşmuyor';
  end if;

  select coalesce(array_agg((x->>'obligation_id')::uuid), '{}'::uuid[]) into ids from jsonb_array_elements(p_allocations) x;
  if array_position(ids, null) is not null or cardinality(ids) <> (select count(distinct x) from unnest(ids) x) then
    raise exception 'Kapatılacak kayıt listesi tekrar veya boş kimlik içeriyor';
  end if;
  perform id from public.obligations where id = any(ids) order by id for update;
  if (select count(*) from public.obligations where id = any(ids)) <> cardinality(ids) then
    raise exception 'Kapatılacak kayıt bulunamadı';
  end if;
  perform id from public.installments where obligation_id = any(ids) order by id for update;

  for alloc in select * from jsonb_array_elements(p_allocations) loop
    select * into o from public.obligations where id = (alloc->>'obligation_id')::uuid;
    if o.workspace_id is distinct from p_workspace_id or o.currency_code is distinct from unit
      or o.counterparty_id is distinct from cp or o.direction is distinct from direction
      or o.status = 'iptal_edildi' or o.document_type in ('cek','senet','kredi_karti_ekstresi') then
      raise exception 'Kapatılacak kaydın çalışma alanı, cari, yön veya birimi uyuşmuyor';
    end if;
    select o.total_amount_minor - coalesce(sum(amount_minor), 0) into remaining from public.payments where obligation_id = o.id;
    if remaining <= 0 or remaining is distinct from (alloc->>'remaining_amount_minor')::bigint then
      raise exception 'Kaydın kalan tutarı değişti; kayıtları yenileyin';
    end if;
    take := (alloc->>'amount_minor')::bigint;
    if take is null or take <= 0 or take > remaining then raise exception 'Kapatma tutarı geçersiz'; end if;
    applied := applied + take;
  end loop;
  if applied > amount then raise exception 'Kapatılan toplam, çek/senet tutarını aşıyor'; end if;
  leftover := amount - applied;

  doc_no := nullif(btrim(coalesce(p_header->>'document_no','')), '');
  insert into public.obligations (workspace_id, direction, document_type, title, total_amount_minor, currency_code,
    value_unit_type, due_date, counterparty_id, account_id, category_id, bank_code, notes)
  values (p_workspace_id, direction, method, coalesce(nullif(btrim(p_header->>'title'), ''), label), amount, unit,
    unit_type, first_due, cp, account, nullif(p_header->>'category_id','')::uuid,
    case when method = 'cek' then nullif(p_header->>'bank_code','') else null end,
    case when doc_no is not null then label || ' no: ' || doc_no else null end)
  returning * into instrument;

  if due_count > 1 then
    for due in select * from jsonb_array_elements(p_header->'due_dates') order by (value->>'due_date')::date loop
      n := n + 1;
      insert into public.installments (workspace_id, obligation_id, installment_number, due_date, amount_minor)
      values (p_workspace_id, instrument.id, n, (due->>'due_date')::date, (due->>'amount_minor')::bigint);
    end loop;
  end if;

  note := label || ' ile ' || case when direction = 'payable' then 'ödendi' else 'tahsil edildi' end
    || case when doc_no is not null then ' (No: ' || doc_no || ')' else '' end;
  for alloc in select * from jsonb_array_elements(p_allocations) loop
    left_to_slice := (alloc->>'amount_minor')::bigint; last_installment := null;
    for inst in
      select i.id, i.remaining_amount_minor from public.installments i
      where i.obligation_id = (alloc->>'obligation_id')::uuid and i.remaining_amount_minor > 0 and i.status <> 'iptal_edildi'
      order by i.due_date, i.installment_number
    loop
      exit when left_to_slice <= 0;
      take := least(left_to_slice, inst.remaining_amount_minor);
      insert into public.payments (workspace_id, obligation_id, installment_id, amount_minor, paid_at,
        account_id, transaction_id, settled_by_obligation_id, notes)
      values (p_workspace_id, (alloc->>'obligation_id')::uuid, inst.id, take, paid_at, null, null, instrument.id, note);
      left_to_slice := left_to_slice - take; last_installment := inst.id;
    end loop;
    if left_to_slice > 0 then
      -- Taksitsiz kayıt (ya da taksitlerin kalanı kayıt kalanından azsa artan) kaydın kendisine yazılır;
      -- validate_payment_integrity fazla ödemeyi yine reddeder.
      insert into public.payments (workspace_id, obligation_id, installment_id, amount_minor, paid_at,
        account_id, transaction_id, settled_by_obligation_id, notes)
      values (p_workspace_id, (alloc->>'obligation_id')::uuid, last_installment, left_to_slice, paid_at, null, null, instrument.id, note);
    end if;
    allocations := allocations || jsonb_build_array(jsonb_build_object(
      'obligation_id', alloc->>'obligation_id', 'amount_minor', (alloc->>'amount_minor')::bigint));
  end loop;

  if leftover > 0 then
    insert into public.obligations (workspace_id, direction, document_type, title, total_amount_minor, currency_code,
      value_unit_type, due_date, counterparty_id, notes, parent_obligation_id)
    values (p_workspace_id, case when direction = 'payable' then 'receivable' else 'payable' end, 'avans',
      (case when direction = 'payable' then 'Ön ödeme' else 'Alınan avans' end) || ' — ' || cp_name,
      leftover, unit, unit_type, null, cp, label || ' fazlası', instrument.id)
    returning * into advance;
  end if;

  select * into instrument from public.obligations where id = instrument.id;
  result := jsonb_build_object(
    'instrument_obligation', to_jsonb(instrument),
    'advance_obligation', case when leftover > 0 then to_jsonb(advance) else 'null'::jsonb end,
    'leftover_minor', leftover,
    'allocations', allocations);
  insert into finance_private.instrument_settlement_requests (workspace_id, request_id, actor_id, payload, result)
  values (p_workspace_id, p_request_id, auth.uid(), payload, result);
  return result;
end
$function$;

create or replace function public.cancel_instrument_settlement_request(p_expected_actor uuid, p_workspace_id uuid, p_request_id uuid)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare previous finance_private.instrument_settlement_requests;
begin
  if p_expected_actor is null or auth.uid() is distinct from p_expected_actor
    or public.can_edit_workspace(p_workspace_id) is not true or p_request_id is null then
    raise exception 'Ödeme iptal yetkisi uyuşmuyor';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('instrument:'||p_workspace_id::text||p_request_id::text, 0));
  select * into previous from finance_private.instrument_settlement_requests where workspace_id = p_workspace_id and request_id = p_request_id;
  if found then
    return jsonb_build_object('state', case when previous.result->>'cancelled' = 'true' then 'cancelled' else 'confirmed' end);
  end if;
  insert into finance_private.instrument_settlement_requests (workspace_id, request_id, actor_id, payload, result)
  values (p_workspace_id, p_request_id, auth.uid(), '{}', '{"cancelled":true}');
  return jsonb_build_object('state', 'cancelled');
end
$function$;

revoke all on function public.settle_instrument_atomic(uuid, uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.settle_instrument_atomic(uuid, uuid, uuid, jsonb, jsonb) to authenticated;
revoke all on function public.cancel_instrument_settlement_request(uuid, uuid, uuid) from public, anon;
grant execute on function public.cancel_instrument_settlement_request(uuid, uuid, uuid) to authenticated;

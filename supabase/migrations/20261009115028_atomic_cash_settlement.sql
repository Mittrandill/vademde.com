-- Backend foundation only: the app is NOT switched to this RPC yet.
-- Requires private finance schema and record_payments_v2. No historical data writes.
create table finance_private.cash_settlement_requests (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 request_id uuid not null, actor_id uuid not null, payload jsonb not null, result jsonb not null,
 created_at timestamptz not null default now(), primary key(workspace_id,request_id)
);
alter table finance_private.cash_settlement_requests enable row level security;
revoke all on finance_private.cash_settlement_requests from public,anon,authenticated;
grant select,insert on finance_private.cash_settlement_requests to authenticated;
create policy cash_settlement_read on finance_private.cash_settlement_requests for select to authenticated
 using(actor_id=(select auth.uid()) and public.can_edit_workspace(workspace_id));
create policy cash_settlement_write on finance_private.cash_settlement_requests for insert to authenticated
 with check(actor_id=(select auth.uid()) and public.can_edit_workspace(workspace_id));

create or replace function public.settle_cash_atomic(
 p_expected_actor uuid,p_request_id uuid,p_workspace_id uuid,p_header jsonb,p_items jsonb,p_expected jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 previous finance_private.cash_settlement_requests; payload jsonb; result jsonb;
 account_id uuid; cp uuid; category uuid; unit text; direction text; method text; unit_type text;
 amount bigint; applied bigint; leftover bigint; snapshot bigint; paid_at timestamptz;
 ids uuid[]; expected jsonb; item jsonb; pay jsonb; tx jsonb; o public.obligations;
 a public.accounts; advance public.obligations; payment public.payments;
 payments jsonb:='[]'; tx_ids jsonb:='[]'; advance_tx uuid; remaining bigint;
begin
 if p_expected_actor is null or auth.uid() is distinct from p_expected_actor
   or public.can_edit_workspace(p_workspace_id) is not true then raise exception 'Ödeme işlem sahibi veya yazma yetkisi uyuşmuyor'; end if;
 if p_request_id is null or jsonb_typeof(p_header) is distinct from 'object'
   or jsonb_typeof(p_items) is distinct from 'array' or jsonb_typeof(p_expected) is distinct from 'array'
   then raise exception 'Ödeme bilgileri geçersiz'; end if;
 if jsonb_array_length(p_items)>1000 or jsonb_array_length(p_expected)>1000 then raise exception 'Ödeme listesi çok büyük'; end if;
 account_id:=(p_header->>'account_id')::uuid; cp:=(p_header->>'counterparty_id')::uuid;
 category:=nullif(p_header->>'category_id','')::uuid; unit:=p_header->>'currency_code';
 direction:=p_header->>'direction'; method:=p_header->>'method'; unit_type:=p_header->>'value_unit_type';
 amount:=(p_header->>'amount_minor')::bigint; paid_at:=(p_header->>'paid_at')::timestamptz;
 if account_id is null or cp is null or paid_at is null or amount is null or amount<=0 or amount>9007199254740991
   or direction is null or direction not in ('payable','receivable')
   or method is null or method not in ('nakit','havale','kredi_karti','online_odeme')
   or unit is null or unit_type is null or unit_type not in ('fiat','kiymetli_maden')
   or (nullif(p_header->>'fx_rate_try_minor','')::bigint is not null and nullif(p_header->>'fx_rate_try_minor','')::bigint<=0) then
   raise exception 'Ödeme başlığı geçersiz'; end if;
 if unit not in ('TRY','USD','EUR','gram_altin','ceyrek_altin','yarim_altin','tam_altin','cumhuriyet_altini')
   or unit_type<>(case when unit in ('TRY','USD','EUR') then 'fiat' else 'kiymetli_maden' end) then
   raise exception 'Ödeme değer birimi uyuşmuyor'; end if;
 payload:=jsonb_build_object('header',p_header,'items',p_items,'expected',p_expected);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cash:'||p_workspace_id::text||p_request_id::text,0));
 select * into previous from finance_private.cash_settlement_requests where workspace_id=p_workspace_id and request_id=p_request_id;
 if found then
   if previous.result->>'cancelled'='true' then raise exception 'Bu ödeme isteği iptal edildi'; end if;
   if previous.payload is distinct from payload then raise exception 'Ödeme işlem kimliği farklı içerikle kullanılamaz'; end if;
   return previous.result;
 end if;
 -- Account first, then ALL parents and installments in stable order, before record_payments_v2.
 -- SHARE stabilizes account metadata but remains compatible with ordinary transaction FK
 -- KEY SHARE checks. UPDATE here could deadlock with parent-first record_payments_v2 writers.
 select * into a from public.accounts where id=account_id for share;
 if not found or a.workspace_id is distinct from p_workspace_id or a.currency_code is distinct from unit then
   raise exception 'Ödeme hesabı veya para birimi uyuşmuyor'; end if;
 if not exists(select 1 from public.counterparties where id=cp and workspace_id=p_workspace_id) then
   raise exception 'Cari bulunamadı veya çalışma alanı uyuşmuyor'; end if;
 select coalesce(array_agg((x->>'id')::uuid),'{}'::uuid[]) into ids from jsonb_array_elements(p_expected) x;
 if array_position(ids,null) is not null or cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then
   raise exception 'Ödeme kalan listesi tekrar veya boş kimlik içeriyor'; end if;
 perform id from public.obligations where id=any(ids) order by id for update;
 if (select count(*) from public.obligations where id=any(ids))<>cardinality(ids) then raise exception 'Ödenecek kayıt bulunamadı'; end if;
 perform id from public.installments where obligation_id=any(ids) order by id for update;
 for expected in select * from jsonb_array_elements(p_expected) loop
   select * into o from public.obligations where id=(expected->>'id')::uuid;
   if o.workspace_id is distinct from p_workspace_id or o.currency_code is distinct from unit
     or o.counterparty_id is distinct from cp or o.direction is distinct from direction
     or o.status='iptal_edildi' or o.document_type='kredi_karti_ekstresi' then
     raise exception 'Ödeme kaydının çalışma alanı, cari, yön veya birimi uyuşmuyor'; end if;
   select o.total_amount_minor-coalesce(sum(amount_minor),0) into remaining from public.payments where obligation_id=o.id;
   if remaining<=0 or remaining is distinct from (expected->>'remaining_amount_minor')::bigint then
     raise exception 'Ödeme kalan tutarı değişti; kayıtları yenileyin'; end if;
 end loop;
 applied:=0;
 for item in select * from jsonb_array_elements(p_items) loop
   pay:=item->'payment'; tx:=item->'transaction';
   if jsonb_typeof(pay) is distinct from 'object' or jsonb_typeof(tx) is distinct from 'object' then raise exception 'Ödeme dilimi geçersiz'; end if;
   if (pay->>'obligation_id')::uuid is null or not ((pay->>'obligation_id')::uuid=any(ids))
     or (pay->>'workspace_id')::uuid is distinct from p_workspace_id or (tx->>'workspace_id')::uuid is distinct from p_workspace_id
     or (pay->>'account_id')::uuid is distinct from account_id or (tx->>'account_id')::uuid is distinct from account_id
     or (tx->>'counterparty_id')::uuid is distinct from cp or tx->>'currency_code' is distinct from unit
     or tx->>'direction' is distinct from (case when direction='payable' then 'expense' else 'income' end)
     or tx->>'payment_method' is distinct from method or (pay->>'paid_at')::timestamptz is distinct from paid_at
     or (pay->>'amount_minor')::bigint is null or (pay->>'amount_minor')::bigint<=0
     or (tx->>'amount_minor')::bigint is distinct from (pay->>'amount_minor')::bigint
     or nullif(pay->>'fx_rate_try_minor','')::bigint is distinct from nullif(p_header->>'fx_rate_try_minor','')::bigint
     or nullif(tx->>'fx_rate_try_minor','')::bigint is distinct from nullif(p_header->>'fx_rate_try_minor','')::bigint
     or coalesce((tx->>'financing_minor')::bigint,0)<0
     or coalesce((tx->>'financing_minor')::bigint,0)>(pay->>'amount_minor')::bigint then
     raise exception 'Ödeme dilimi başlıkla uyuşmuyor'; end if;
   applied:=applied+(pay->>'amount_minor')::bigint;
 end loop;
 if applied>amount or (select count(distinct (x->'payment'->>'obligation_id')::uuid) from jsonb_array_elements(p_items) x)<>cardinality(ids) then
   raise exception 'Ödeme toplamı veya kalan listesi uyuşmuyor'; end if;
 leftover:=amount-applied;
 -- Preserve the existing rule: invoice uses its supplied FX; advance movement uses current FX.
 if unit<>'TRY' and leftover>0 then
   select try_equivalent_minor into snapshot from public.value_unit_rates where unit_code=unit;
   if snapshot is null or snapshot<=0 then raise exception 'Ödeme için güncel kur bulunamadı'; end if;
 end if;
 if jsonb_array_length(p_items)>0 then
   for payment in select * from public.record_payments_v2(p_items) loop
     payments:=payments||jsonb_build_array(to_jsonb(payment)); tx_ids:=tx_ids||jsonb_build_array(payment.transaction_id);
   end loop;
 end if;
 if leftover>0 then
   insert into public.obligations(workspace_id,direction,document_type,title,total_amount_minor,currency_code,
     value_unit_type,due_date,counterparty_id,notes,parent_obligation_id)
   values(p_workspace_id,case when direction='payable' then 'receivable' else 'payable' end,'avans',
     case when direction='payable' then 'Ön ödeme' else 'Alınan avans' end,leftover,unit,unit_type,null,cp,
     nullif(p_header->>'description',''),null) returning * into advance;
   insert into public.transactions(workspace_id,account_id,direction,category_id,counterparty_id,payment_method,
     amount_minor,currency_code,fx_rate_try_minor,occurred_at,description,source_obligation_id)
   values(p_workspace_id,account_id,case when direction='payable' then 'expense' else 'income' end,category,cp,
     method,leftover,unit,snapshot,paid_at,advance.title,advance.id) returning id into advance_tx;
   tx_ids:=tx_ids||jsonb_build_array(advance_tx);
 end if;
 result:=jsonb_build_object('payments',payments,'leftover_minor',leftover,'advance_obligation',
   case when leftover>0 then to_jsonb(advance) else 'null'::jsonb end,'transaction_ids',tx_ids);
 insert into finance_private.cash_settlement_requests(workspace_id,request_id,actor_id,payload,result)
 values(p_workspace_id,p_request_id,auth.uid(),payload,result);
 return result;
end $$;
revoke all on function public.settle_cash_atomic(uuid,uuid,uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.settle_cash_atomic(uuid,uuid,uuid,jsonb,jsonb,jsonb) to authenticated;

create function public.cancel_cash_settlement_request(p_expected_actor uuid,p_workspace_id uuid,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare previous finance_private.cash_settlement_requests;
begin
 if p_expected_actor is null or auth.uid() is distinct from p_expected_actor
   or public.can_edit_workspace(p_workspace_id) is not true or p_request_id is null then raise exception 'Ödeme iptal yetkisi uyuşmuyor'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cash:'||p_workspace_id::text||p_request_id::text,0));
 select * into previous from finance_private.cash_settlement_requests where workspace_id=p_workspace_id and request_id=p_request_id;
 if found then return jsonb_build_object('state',case when previous.result->>'cancelled'='true' then 'cancelled' else 'confirmed' end); end if;
 insert into finance_private.cash_settlement_requests(workspace_id,request_id,actor_id,payload,result)
 values(p_workspace_id,p_request_id,auth.uid(),'{}','{"cancelled":true}');
 return jsonb_build_object('state','cancelled');
end $$;
revoke all on function public.cancel_cash_settlement_request(uuid,uuid,uuid) from public,anon;
grant execute on function public.cancel_cash_settlement_request(uuid,uuid,uuid) to authenticated;

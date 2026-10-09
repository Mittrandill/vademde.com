-- Forward-only: existing rows are not rewritten. Requires the eight finance migrations.
-- Ciro advances have ONE instrument parent, never an ambiguous shared parentless advance.
create table finance_private.endorsement_requests (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 request_id uuid not null, actor_id uuid not null, payload jsonb not null, result jsonb not null,
 created_at timestamptz not null default now(), primary key(workspace_id,request_id)
);
alter table finance_private.endorsement_requests enable row level security;
revoke all on finance_private.endorsement_requests from public,anon,authenticated;
grant select,insert on finance_private.endorsement_requests to authenticated;
create policy endorsement_read on finance_private.endorsement_requests for select to authenticated
 using(actor_id=(select auth.uid()) and public.can_edit_workspace(workspace_id));
create policy endorsement_write on finance_private.endorsement_requests for insert to authenticated
 with check(actor_id=(select auth.uid()) and public.can_edit_workspace(workspace_id));

create function public.settle_endorsement_atomic(
 p_expected_actor uuid,p_request_id uuid,p_workspace_id uuid,p_counterparty_id uuid,
 p_currency_code text,p_paid_at timestamptz,p_fx_rate_try_minor bigint,p_sources jsonb,p_targets jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare previous finance_private.endorsement_requests; payload jsonb; result jsonb; entry jsonb;
 source public.obligations; target public.obligations; advance public.obligations;
 ids uuid[]; source_ids uuid[]; target_ids uuid[]; old_ids uuid[];
 source_left bigint; target_left bigint; applied bigint; total bigint:=0; leftover bigint:=0; snapshot bigint;
 target_index integer:=0; allocations jsonb:='[]'; advances jsonb:='[]'; snapshots jsonb;
begin
 if p_expected_actor is null or auth.uid() is distinct from p_expected_actor or public.can_edit_workspace(p_workspace_id) is not true then
   raise exception 'Ciro işlem sahibi veya yazma yetkisi uyuşmuyor'; end if;
 if p_request_id is null or p_counterparty_id is null or p_paid_at is null
   or p_currency_code not in ('TRY','USD','EUR','gram_altin','ceyrek_altin','yarim_altin','tam_altin','cumhuriyet_altini') or p_currency_code is null
   or jsonb_typeof(p_sources) is distinct from 'array' or jsonb_typeof(p_targets) is distinct from 'array'
   or jsonb_array_length(p_sources)=0 or jsonb_array_length(p_sources)>1000 or jsonb_array_length(p_targets)>1000
   or (p_fx_rate_try_minor is not null and p_fx_rate_try_minor<=0) then raise exception 'Ciro bilgileri geçersiz'; end if;
 payload:=jsonb_build_object('counterparty',p_counterparty_id,'currency',p_currency_code,
   'paid_at_epoch',extract(epoch from p_paid_at),'fx',p_fx_rate_try_minor,'sources',p_sources,'targets',p_targets);
 perform pg_advisory_xact_lock(hashtextextended('endorsement:'||p_workspace_id::text||p_request_id::text,0));
 select * into previous from finance_private.endorsement_requests where workspace_id=p_workspace_id and request_id=p_request_id;
 if found then
   if previous.result->>'cancelled'='true' then raise exception 'Bu ciro isteği iptal edildi'; end if;
   if previous.payload is distinct from payload then raise exception 'Ciro kimliği farklı içerikle kullanılamaz'; end if;
   return previous.result;
 end if;
 if not exists(select 1 from public.counterparties where id=p_counterparty_id and workspace_id=p_workspace_id) then raise exception 'Ciro carisi bulunamadı'; end if;
 select array_agg((x->>'id')::uuid) into source_ids from jsonb_array_elements(p_sources) x;
 select coalesce(array_agg((x->>'id')::uuid),'{}'::uuid[]) into target_ids from jsonb_array_elements(p_targets) x;
 ids:=source_ids||target_ids;
 if array_position(ids,null) is not null or cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Ciro seçimleri tekrar veya boş kimlik içeriyor'; end if;
 perform id from public.obligations where id=any(ids) order by id for update;
 if (select count(*) from public.obligations where id=any(ids))<>cardinality(ids) then raise exception 'Ciro kaydı bulunamadı'; end if;
 perform id from public.installments where obligation_id=any(ids) order by id for update;
 for entry in select * from jsonb_array_elements(p_sources) loop
   select * into source from public.obligations where id=(entry->>'id')::uuid;
   if source.workspace_id is distinct from p_workspace_id or source.currency_code is distinct from p_currency_code
     or source.direction<>'receivable' or source.document_type not in ('cek','senet') or source.instrument_status is distinct from 'portfoy'
     or source.value_unit_type is distinct from (case when p_currency_code in ('TRY','USD','EUR') then 'fiat' else 'kiymetli_maden' end)
     or source.status='iptal_edildi' or source.remaining_amount_minor is distinct from source.total_amount_minor
     or source.remaining_amount_minor is distinct from (entry->>'remaining_amount_minor')::bigint
     or exists(select 1 from public.payments where obligation_id=source.id) then raise exception 'Yalnızca tam tutarlı, değişmemiş portföy çek/senetleri ciro edilebilir'; end if;
   total:=total+source.total_amount_minor;
 end loop;
 if total<=0 or total>9007199254740991 then raise exception 'Ciro toplamı güvenli tutar sınırını aşıyor'; end if;
 for entry in select * from jsonb_array_elements(p_targets) loop
   select * into target from public.obligations where id=(entry->>'id')::uuid;
   if target.workspace_id is distinct from p_workspace_id or target.currency_code is distinct from p_currency_code
     or target.direction<>'payable' or target.counterparty_id is distinct from p_counterparty_id or target.status='iptal_edildi'
     or target.document_type in ('cek','senet','kredi_karti_ekstresi') or target.remaining_amount_minor<=0
     or target.remaining_amount_minor is distinct from (entry->>'remaining_amount_minor')::bigint
     or target.remaining_amount_minor is distinct from target.total_amount_minor-(select coalesce(sum(amount_minor),0) from public.payments where obligation_id=target.id)
     then raise exception 'Ciro hedefinin kalan tutarı veya kapsamı değişti'; end if;
 end loop;
 snapshot:=p_fx_rate_try_minor;
 if p_currency_code='TRY' then snapshot:=null;
 elsif snapshot is null then select try_equivalent_minor into snapshot from public.value_unit_rates where unit_code=p_currency_code; end if;
 if p_currency_code<>'TRY' and (snapshot is null or snapshot<=0) then raise exception 'Ciro için kur bulunamadı'; end if;
 select coalesce(array_agg(id),'{}'::uuid[]) into old_ids from public.payments where obligation_id=any(ids);
 if cardinality(target_ids)>0 then
   select remaining_amount_minor into target_left from public.obligations where id=target_ids[1];
 end if;
 for entry in select * from jsonb_array_elements(p_sources) loop
   select * into source from public.obligations where id=(entry->>'id')::uuid;
   source_left:=source.total_amount_minor;
   while source_left>0 and target_index<cardinality(target_ids) loop
     select * into target from public.obligations where id=target_ids[target_index+1];
     applied:=least(source_left,target_left);
     perform finance_private.write_offset_slices(p_workspace_id,target.id,source.id,applied,p_paid_at,snapshot,'Ciro ile ödendi');
     perform finance_private.write_offset_slices(p_workspace_id,source.id,target.id,applied,p_paid_at,snapshot,'Ciro edildi');
     source_left:=source_left-applied; target_left:=target_left-applied;
     if target_left=0 then
       target_index:=target_index+1;
       if target_index<cardinality(target_ids) then select remaining_amount_minor into target_left from public.obligations where id=target_ids[target_index+1]; end if;
     end if;
   end loop;
   if source_left>0 then
     insert into public.obligations(workspace_id,direction,document_type,title,total_amount_minor,currency_code,
       value_unit_type,counterparty_id,parent_obligation_id,due_date,notes)
     values(p_workspace_id,'receivable','avans','Ciro ön ödemesi',source_left,p_currency_code,source.value_unit_type,
       p_counterparty_id,source.id,null,'Ciro edilen çek/senedin yalnızca bu kaynağa ait fazlası') returning * into advance;
     advances:=advances||jsonb_build_array(to_jsonb(advance));
     perform finance_private.write_offset_slices(p_workspace_id,source.id,advance.id,source_left,p_paid_at,snapshot,'Ciro fazlası');
     leftover:=leftover+source_left;
   end if;
   update public.obligations set instrument_status='ciro_edildi',instrument_status_changed_at=now() where id=source.id;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('obligation_id',o.id,'amount_minor',
   (x->>'remaining_amount_minor')::bigint-o.remaining_amount_minor) order by ordinal),'[]') into allocations
   from jsonb_array_elements(p_targets) with ordinality as selected(x,ordinal) join public.obligations o on o.id=(x->>'id')::uuid
   where (x->>'remaining_amount_minor')::bigint>o.remaining_amount_minor;
 select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') into snapshots from public.payments p
   where p.obligation_id=any(ids) and not(p.id=any(old_ids));
 result:=jsonb_build_object('allocations',allocations,'leftover_minor',leftover,'advances',advances,'payment_snapshots',snapshots);
 insert into finance_private.endorsement_requests(workspace_id,request_id,actor_id,payload,result)
 values(p_workspace_id,p_request_id,auth.uid(),payload,result);
 return result;
end $$;
revoke all on function public.settle_endorsement_atomic(uuid,uuid,uuid,uuid,text,timestamptz,bigint,jsonb,jsonb) from public,anon;
grant execute on function public.settle_endorsement_atomic(uuid,uuid,uuid,uuid,text,timestamptz,bigint,jsonb,jsonb) to authenticated;

create function public.cancel_endorsement_request(p_expected_actor uuid,p_workspace_id uuid,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare previous finance_private.endorsement_requests;
begin
 if p_expected_actor is null or auth.uid() is distinct from p_expected_actor or public.can_edit_workspace(p_workspace_id) is not true or p_request_id is null then raise exception 'Ciro iptal yetkisi uyuşmuyor'; end if;
 perform pg_advisory_xact_lock(hashtextextended('endorsement:'||p_workspace_id::text||p_request_id::text,0));
 select * into previous from finance_private.endorsement_requests where workspace_id=p_workspace_id and request_id=p_request_id;
 if found then return jsonb_build_object('state',case when previous.result->>'cancelled'='true' then 'cancelled' else 'confirmed' end); end if;
 insert into finance_private.endorsement_requests(workspace_id,request_id,actor_id,payload,result) values(p_workspace_id,p_request_id,auth.uid(),'{}','{"cancelled":true}');
 return jsonb_build_object('state','cancelled');
end $$;
revoke all on function public.cancel_endorsement_request(uuid,uuid,uuid) from public,anon;
grant execute on function public.cancel_endorsement_request(uuid,uuid,uuid) to authenticated;

create table finance_private.instrument_bounces (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 source_id uuid not null, actor_id uuid not null, payment_ids uuid[] not null,
 snapshot jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(workspace_id,source_id)
);
create index instrument_bounces_payment_ids on finance_private.instrument_bounces using gin(payment_ids);
create index instrument_bounces_invalidated_ids on finance_private.instrument_bounces using gin((result->'invalidated_ids'));
alter table finance_private.instrument_bounces enable row level security;
revoke all on finance_private.instrument_bounces from public,anon,authenticated;
grant select,insert on finance_private.instrument_bounces to authenticated;
create policy instrument_bounce_read on finance_private.instrument_bounces for select to authenticated using(public.can_edit_workspace(workspace_id));
create policy instrument_bounce_write on finance_private.instrument_bounces for insert to authenticated
 with check(actor_id=(select auth.uid()) and public.can_edit_workspace(workspace_id));

-- A workspace editor already sees the payments. These private SELECT policies let another
-- editor recover a source-invalidated offset; INSERT remains bound to the current actor.
create policy offset_workspace_editor_read on finance_private.offset_requests for select to authenticated using(public.can_edit_workspace(workspace_id));
create policy offset_reversal_workspace_editor_read on finance_private.offset_reversals for select to authenticated using(public.can_edit_workspace(workspace_id));

create function public.preview_instrument_bounce(p_obligation_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare source public.obligations; previous finance_private.instrument_bounces; roots uuid[];
 nodes jsonb; payments jsonb; impacts jsonb; ids uuid[]; original_coverage bigint;
begin
 select * into source from public.obligations where id=p_obligation_id;
 if not found or public.can_edit_workspace(source.workspace_id) is not true then raise exception 'Çek/senet bulunamadı veya düzenleme yetkisi yok'; end if;
 select * into previous from finance_private.instrument_bounces where workspace_id=source.workspace_id and source_id=source.id;
 if found then return previous.result; end if;
 if source.document_type not in ('cek','senet') or source.status='iptal_edildi' then raise exception 'Yalnızca aktif çek/senet karşılıksız işaretlenebilir'; end if;
 if source.instrument_status='karsiliksiz' then raise exception 'Eski karşılıksız kaydın kaynak dağılımı mutabakat gerektiriyor'; end if;
 if exists(select 1 from public.obligations where parent_obligation_id=source.id and document_type<>'avans') then raise exception 'Kaynağa bağlı beklenmeyen kayıt var; mutabakat gerekli'; end if;
 select array_agg(id order by id) into roots from public.obligations where id=source.id or (parent_obligation_id=source.id and document_type='avans');
 if exists(select 1 from public.obligations where id=any(roots) and (workspace_id is distinct from source.workspace_id or currency_code is distinct from source.currency_code or status='iptal_edildi')) then raise exception 'Kaynak avans kapsamı değişmiş; mutabakat gerekli'; end if;
 if exists(select 1 from public.payments p join public.obligations a on a.id=p.settled_by_obligation_id
   where p.obligation_id=source.id and a.document_type='avans' and a.parent_obligation_id is distinct from source.id) then
   raise exception 'Eski ortak ciro avansının çek payı kesin bilinmiyor; otomatik geri alma yapılamaz'; end if;
 if exists(select 1 from public.payments where (obligation_id=any(roots) or settled_by_obligation_id=any(roots)) and (account_id is not null or transaction_id is not null)) then
   raise exception 'Kaynak veya avans gerçek para hareketi içeriyor; karşılıksız yerine kontrollü iade gerekir'; end if;
 -- Original invoice closures have the same direction as the instrument; original advances
 -- have the opposite direction. Ciro advances have the SAME direction and another purpose.
 select (select coalesce(sum(p.amount_minor),0) from public.payments p join public.obligations o on o.id=p.obligation_id
   where p.settled_by_obligation_id=source.id and o.direction=source.direction)
   +(select coalesce(sum(total_amount_minor),0) from public.obligations where parent_obligation_id=source.id and direction<>source.direction)
   into original_coverage;
 if original_coverage<>0 and original_coverage<>source.total_amount_minor then
   raise exception 'Çekin özgün fatura/avans karşılığı tam izlenemiyor; mutabakat gerekli'; end if;
 if exists(select 1 from public.payments p join public.obligations o on o.id=p.obligation_id
   where (p.obligation_id=any(roots) or p.settled_by_obligation_id=any(roots)) and (p.workspace_id is distinct from source.workspace_id or o.workspace_id is distinct from source.workspace_id or o.currency_code is distinct from source.currency_code)) then
   raise exception 'Bağlı kapanışın çalışma alanı veya birimi uyuşmuyor'; end if;
 -- Each used advance has an equal-sided closure. Never silently undo a broken one-sided link.
 if exists(select 1 from public.payments p where p.obligation_id=any(roots) and p.obligation_id<>source.id
   and (p.settled_by_obligation_id is null or
     (select coalesce(sum(amount_minor),0) from public.payments where obligation_id=p.obligation_id and settled_by_obligation_id=p.settled_by_obligation_id)
     <> (select coalesce(sum(amount_minor),0) from public.payments where obligation_id=p.settled_by_obligation_id and settled_by_obligation_id=p.obligation_id))) then
   raise exception 'Avansın iki taraflı mahsup bağlantısı bozuk; mutabakat gerekli'; end if;
 select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'),coalesce(array_agg(distinct p.obligation_id),'{}'::uuid[]) into payments,ids
   from public.payments p where p.obligation_id=any(roots) or p.settled_by_obligation_id=any(roots);
 ids:=array(select distinct x from unnest(ids||roots) x order by x);
 if cardinality(ids)>4000 or jsonb_array_length(payments)>8000 then raise exception 'Kaynak zinciri otomatik işlem sınırını aşıyor'; end if;
 select jsonb_agg(to_jsonb(o) order by o.id) into nodes from public.obligations o where id=any(ids);
 if exists(select 1 from public.obligations o where id=any(ids) and o.remaining_amount_minor is distinct from greatest(o.total_amount_minor-(select coalesce(sum(amount_minor),0) from public.payments where obligation_id=o.id),0)) then
   raise exception 'Mevcut bakiye ile ödeme toplamı tutarsız; önce mutabakat gerekli'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'title',o.title,'direction',o.direction,'currency_code',o.currency_code,
   'reopened_minor',(select coalesce(sum((x->>'amount_minor')::bigint),0) from jsonb_array_elements(payments) x where (x->>'obligation_id')::uuid=o.id)) order by o.id),'[]') into impacts
   from public.obligations o where id=any(ids) and not(id=any(roots));
 return jsonb_build_object('state','preview','source_id',source.id,'workspace_id',source.workspace_id,'invalidated_ids',to_jsonb(roots),
   'impacts',impacts,'currency_code',source.currency_code,'replacement_claim_minor',case when original_coverage=0 then source.total_amount_minor else 0 end,
   'snapshot',jsonb_build_object('nodes',nodes,'payments',payments));
end $$;
revoke all on function public.preview_instrument_bounce(uuid) from public,anon;
grant execute on function public.preview_instrument_bounce(uuid) to authenticated;

create function public.bounce_instrument_atomic(p_expected_actor uuid,p_obligation_id uuid,p_expected jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare preview jsonb; refreshed jsonb; ids uuid[]; roots uuid[]; payment_ids uuid[]; ws uuid; result jsonb; deleted bigint;
 source public.obligations; claim public.obligations;
begin
 if p_expected_actor is null or auth.uid() is distinct from p_expected_actor then raise exception 'Karşılıksız işlem sahibi uyuşmuyor'; end if;
 perform pg_advisory_xact_lock(hashtextextended('instrument-bounce:'||p_obligation_id::text,0));
 preview:=public.preview_instrument_bounce(p_obligation_id);
 if preview->>'state'='bounced' then return preview; end if;
 if p_expected is null or preview is distinct from p_expected then raise exception 'Kaynak zinciri değişti; etkilenen kayıtları yeniden kontrol edin'; end if;
 ws:=(preview->>'workspace_id')::uuid;
 select array_agg((x->>'id')::uuid) into ids from jsonb_array_elements(preview->'snapshot'->'nodes') x;
 perform id from public.obligations where id=any(ids) order by id for update;
 perform id from public.installments where obligation_id=any(ids) order by id for update;
 select coalesce(array_agg((x->>'id')::uuid),'{}'::uuid[]) into payment_ids from jsonb_array_elements(preview->'snapshot'->'payments') x;
 perform id from public.payments where id=any(payment_ids) order by id for update;
 refreshed:=public.preview_instrument_bounce(p_obligation_id);
 if refreshed is distinct from preview then raise exception 'Kaynak zinciri kilit alınırken değişti; tekrar kontrol edin'; end if;
 select array_agg(x::uuid) into roots from jsonb_array_elements_text(preview->'invalidated_ids') x;
 if (preview->>'replacement_claim_minor')::bigint>0 then
   select * into source from public.obligations where id=p_obligation_id;
   insert into public.obligations(workspace_id,direction,document_type,title,total_amount_minor,currency_code,value_unit_type,counterparty_id,notes,due_date)
   values(ws,source.direction,case when source.direction='receivable' then 'musteri_alacagi' else 'tedarikci_borcu' end,
     'Karşılıksız '||case when source.document_type='senet' then 'senet' else 'çek' end||' bakiyesi',
     (preview->>'replacement_claim_minor')::bigint,source.currency_code,source.value_unit_type,source.counterparty_id,
     'Kaynak: '||source.id::text,source.due_date) returning * into claim;
 end if;
 delete from public.payments where id=any(payment_ids) and workspace_id=ws;
 get diagnostics deleted=row_count;
 if deleted<>cardinality(payment_ids) then raise exception 'Bağlı kapanışların tümü geri alınamadı'; end if;
 update public.obligations set status='iptal_edildi',instrument_status=case when id=p_obligation_id then 'karsiliksiz' else instrument_status end,
   instrument_status_changed_at=case when id=p_obligation_id then now() else instrument_status_changed_at end where id=any(roots);
 update public.installments set status='iptal_edildi' where obligation_id=any(roots);
 result:=jsonb_set(preview,'{state}','"bounced"')||jsonb_build_object('replacement_claim',case when claim.id is null then 'null'::jsonb else to_jsonb(claim) end);
 insert into finance_private.instrument_bounces(workspace_id,source_id,actor_id,payment_ids,snapshot,result)
 values(ws,p_obligation_id,auth.uid(),payment_ids,preview->'snapshot',result);
 return result;
end $$;
revoke all on function public.bounce_instrument_atomic(uuid,uuid,jsonb) from public,anon;
grant execute on function public.bounce_instrument_atomic(uuid,uuid,jsonb) to authenticated;

-- Older app versions keep their RPC, but receive the same atomic, source-aware behavior.
create or replace function public.mark_instrument_bounced(p_obligation_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin perform public.bounce_instrument_atomic(auth.uid(),p_obligation_id,public.preview_instrument_bounce(p_obligation_id)); end $$;
revoke all on function public.mark_instrument_bounced(uuid) from public,anon;
grant execute on function public.mark_instrument_bounced(uuid) to authenticated;

-- Late old-client writes cannot close invoices using an already invalidated source.
create function public.guard_invalidated_settlement_source()
returns trigger language plpgsql security invoker set search_path='' as $$
declare source public.obligations;
begin
 if new.settled_by_obligation_id is not null then
   select * into source from public.obligations where id=new.settled_by_obligation_id for share;
   if not found or source.workspace_id is distinct from new.workspace_id or source.status='iptal_edildi' or source.instrument_status='karsiliksiz' then
     raise exception 'Geçersiz veya farklı çalışma alanındaki kaynakla kapanış yapılamaz'; end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_invalidated_settlement_source() from public,anon,authenticated;
create trigger payments_guard_invalidated_source before insert or update on public.payments for each row execute function public.guard_invalidated_settlement_source();

create function public.guard_invalidated_instrument_parent()
returns trigger language plpgsql security invoker set search_path='' as $$
declare parent public.obligations;
begin
 if tg_op='UPDATE' and exists(select 1 from finance_private.instrument_bounces b
   where b.workspace_id=old.workspace_id and (b.result->'invalidated_ids') @> jsonb_build_array(old.id))
   and (new.status is distinct from old.status or new.instrument_status is distinct from old.instrument_status
     or new.parent_obligation_id is distinct from old.parent_obligation_id or new.workspace_id is distinct from old.workspace_id
     or new.currency_code is distinct from old.currency_code or new.direction is distinct from old.direction
     or new.counterparty_id is distinct from old.counterparty_id or new.total_amount_minor is distinct from old.total_amount_minor) then
   raise exception 'Geçersizleşmiş kaynak veya avansın finansal kapsamı doğrudan değiştirilemez'; end if;
 if tg_op='UPDATE' and old.instrument_status='karsiliksiz' and old.status='iptal_edildi'
   and (new.status is distinct from old.status or new.instrument_status is distinct from old.instrument_status) then raise exception 'Karşılıksız kaynak doğrudan yeniden aktifleştirilemez'; end if;
 if new.parent_obligation_id is not null and (tg_op='INSERT' or new.parent_obligation_id is distinct from old.parent_obligation_id
   or (new.status is distinct from old.status and new.status<>'iptal_edildi')) then
   select * into parent from public.obligations where id=new.parent_obligation_id for share;
   if not found or parent.workspace_id is distinct from new.workspace_id or parent.status='iptal_edildi' or parent.instrument_status='karsiliksiz' then raise exception 'Geçersiz kaynağa yeni kayıt bağlanamaz'; end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_invalidated_instrument_parent() from public,anon,authenticated;
create trigger obligations_guard_invalidated_parent before insert or update on public.obligations for each row execute function public.guard_invalidated_instrument_parent();

-- A source bounce can remove only part of a multi-source offset. Undoing that offset later
-- verifies/deletes only its remaining original rows; unrelated pairs were never bounced.
create or replace function public.reverse_offset_atomic(p_expected_actor uuid,p_workspace_id uuid,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare receipt finance_private.offset_requests; expected jsonb; p public.payments;
 payment_ids uuid[]; obligation_ids uuid[]; deleted_count bigint; remaining_snapshots jsonb;
begin
 if p_expected_actor is null or auth.uid() is distinct from p_expected_actor or public.can_edit_workspace(p_workspace_id) is not true or p_request_id is null then raise exception 'Mahsup geri alma yetkisi veya işlem sahibi uyuşmuyor'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offset:'||p_workspace_id::text||p_request_id::text,0));
 select * into receipt from finance_private.offset_requests where workspace_id=p_workspace_id and request_id=p_request_id;
 if not found then raise exception 'Mahsup işlem makbuzu bulunamadı'; end if;
 if exists(select 1 from finance_private.offset_reversals where workspace_id=p_workspace_id and request_id=p_request_id) then return jsonb_build_object('state','reversed'); end if;
 if receipt.result->>'cancelled'='true' then raise exception 'Kaydedilmemiş mahsup geri alınamaz'; end if;
 if jsonb_typeof(receipt.result->'payment_snapshots') is distinct from 'array' or jsonb_array_length(receipt.result->'payment_snapshots')=0 then raise exception 'Eski mahsup makbuzunda ödeme kimlikleri yok; otomatik geri alma güvenli değil'; end if;
 select coalesce(jsonb_agg(x),'[]') into remaining_snapshots from jsonb_array_elements(receipt.result->'payment_snapshots') x
   where not exists(select 1 from finance_private.instrument_bounces b where b.workspace_id=p_workspace_id and b.payment_ids @> array[(x->>'id')::uuid]);
 select coalesce(array_agg((x->>'id')::uuid),'{}'::uuid[]),coalesce(array_agg(distinct (x->>'obligation_id')::uuid),'{}'::uuid[])
   into payment_ids,obligation_ids from jsonb_array_elements(remaining_snapshots) x;
 perform id from public.obligations where id=any(obligation_ids) order by id for update;
 if (select count(*) from public.obligations where id=any(obligation_ids))<>cardinality(obligation_ids)
   or exists(select 1 from public.obligations o where o.id=any(obligation_ids) and (
     o.workspace_id<>p_workspace_id or o.currency_code<>receipt.payload->>'currency'
     or o.counterparty_id is distinct from (receipt.payload->>'counterparty')::uuid or o.status='iptal_edildi'
     or o.direction<>(case when o.id in (select (x->>'target_id')::uuid from jsonb_array_elements(receipt.payload->'pairs') x)
       then receipt.payload->>'direction' when receipt.payload->>'direction'='payable' then 'receivable' else 'payable' end))) then raise exception 'Mahsup kayıtlarının kapsamı değişti; geri alma durduruldu'; end if;
 perform id from public.installments where obligation_id=any(obligation_ids) order by id for update;
 perform id from public.payments where id=any(payment_ids) order by id for update;
 -- A bounce waiting for these parent locks has not removed rows yet. A previously finished
 -- bounce was filtered above. Any other disappearance/change still fails closed.
 for expected in select * from jsonb_array_elements(remaining_snapshots) loop
   select * into p from public.payments where id=(expected->>'id')::uuid;
   if not found or finance_private.offset_payment_snapshot(p) is distinct from expected then raise exception 'Mahsup ödeme satırı silinmiş veya değiştirilmiş; tek taraflı geri alma yapılmadı'; end if;
 end loop;
 delete from public.payments where id=any(payment_ids) and workspace_id=p_workspace_id;
 get diagnostics deleted_count=row_count;
 if deleted_count<>cardinality(payment_ids) then raise exception 'Mahsup satırlarının tümü geri alınamadı'; end if;
 insert into finance_private.offset_reversals(workspace_id,request_id,actor_id) values(p_workspace_id,p_request_id,auth.uid());
 return jsonb_build_object('state','reversed');
end $$;
revoke all on function public.reverse_offset_atomic(uuid,uuid,uuid) from public,anon;
grant execute on function public.reverse_offset_atomic(uuid,uuid,uuid) to authenticated;

-- docs/10-abonelik-gelir-modeli.md — plan_limits tablosu baştan beri doğru değerleri taşıyordu
-- (free: 1 çalışma alanı, ekip yok) ama bu değerler yalnızca paywall ekranında GÖSTERİLİYORDU;
-- hiçbir katmanda uygulanmıyordu. Ücretsiz kullanıcı sınırsız çalışma alanı açabiliyor ve
-- sınırsız ekip üyesi davet edebiliyordu. Tek gerçekten uygulanan limit OCR kotasıydı
-- (supabase/functions/process-document/index.ts).
--
-- Uygulama stratejisi (kullanıcı kararı):
--   * YENİ çalışma alanı oluşturma limiti serttir ve sunucuda uygulanır.
--   * Zaten limitin üzerinde olan mevcut kullanıcıların verisi SİLİNMEZ. 14 günlük bir lütuf
--     süresi verilir; süre dolduğunda yalnızca birincil çalışma alanı yazılabilir kalır,
--     diğerleri salt-okunur olur (veri durur, okunur, dışa aktarılabilir). Kullanıcı abone
--     olursa kilit anında kalkar.

-- ---------------------------------------------------------------------------
-- 1. Profil üzerinde birincil çalışma alanı ve lütuf süresi
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists primary_workspace_id uuid references public.workspaces(id) on delete set null;

-- Limitin üzerindeki ücretsiz kullanıcı için salt-okunur kilidinin devreye gireceği an.
-- null = kullanıcı hiç limit aşımına düşmedi (veya abone olup çıktı).
alter table public.profiles
  add column if not exists plan_grace_until timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Plan yardımcıları
-- ---------------------------------------------------------------------------

-- subscriptions satırı yoksa kullanıcı ücretsiz plandadır (features/subscriptions/api.ts
-- getMySubscription ile aynı varsayım).
create or replace function public.plan_for_owner(p_owner uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select s.plan from public.subscriptions s where s.owner_id = p_owner limit 1),
    'free'
  );
$$;

create or replace function public.owned_workspace_count(p_owner uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select count(*)::int
  from public.workspaces w
  where w.owner_id = p_owner and w.archived_at is null;
$$;

create or replace function public.workspace_limit_for_owner(p_owner uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select pl.max_personal_workspaces
       from public.plan_limits pl
      where pl.plan = public.plan_for_owner(p_owner)),
    1
  );
$$;

-- Kilit devreye girdiğinde yazılabilir kalan tek alan. Kullanıcı seçmediyse en eski
-- çalışma alanı (ilk kurulan, genelde asıl kullanılan) birincil sayılır.
create or replace function public.resolve_primary_workspace(p_owner uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select p.primary_workspace_id
       from public.profiles p
       join public.workspaces w on w.id = p.primary_workspace_id
      where p.id = p_owner and w.owner_id = p_owner and w.archived_at is null),
    (select w.id
       from public.workspaces w
      where w.owner_id = p_owner and w.archived_at is null
      order by w.created_at
      limit 1)
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Yeni çalışma alanı oluşturma limiti (sert kural)
-- ---------------------------------------------------------------------------

create or replace function public.enforce_workspace_plan_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_limit integer := public.workspace_limit_for_owner(new.owner_id);
  v_count integer := public.owned_workspace_count(new.owner_id);
begin
  if v_count >= v_limit then
    raise exception 'WORKSPACE_LIMIT_REACHED: Ücretsiz planda % çalışma alanı oluşturabilirsiniz. Daha fazlası için planınızı yükseltin.', v_limit
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists on_workspace_enforce_plan_limit on public.workspaces;
create trigger on_workspace_enforce_plan_limit
  before insert on public.workspaces
  for each row execute function public.enforce_workspace_plan_limit();

-- ---------------------------------------------------------------------------
-- 4. Salt-okunur kilidi (lütuf süresi dolduktan sonra)
-- ---------------------------------------------------------------------------

create or replace function public.workspace_write_allowed(p_workspace_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_owner uuid;
  v_grace timestamptz;
  v_limit integer;
  v_count integer;
begin
  select w.owner_id into v_owner from public.workspaces w where w.id = p_workspace_id;
  if v_owner is null then
    return true; -- çalışma alanı yoksa asıl hatayı FK/RLS versin, burada engellemeyelim
  end if;

  -- Ücretli planlarda kilit hiç devreye girmez.
  if public.plan_for_owner(v_owner) <> 'free' then
    return true;
  end if;

  v_limit := public.workspace_limit_for_owner(v_owner);
  v_count := public.owned_workspace_count(v_owner);
  if v_count <= v_limit then
    return true;
  end if;

  -- Lütuf süresi henüz başlamadıysa (kullanıcı uygulamayı açıp uyarıyı hiç görmediyse) veya
  -- dolmadıysa yazma serbest kalır — uyarı görmeden kilitlenmek olmaz.
  select p.plan_grace_until into v_grace from public.profiles p where p.id = v_owner;
  if v_grace is null or now() < v_grace then
    return true;
  end if;

  return p_workspace_id = public.resolve_primary_workspace(v_owner);
end;
$$;

-- Tüm workspace_id taşıyan veri tablolarında ortak tetikleyici. RLS politikalarına
-- dokunulmaz (mevcut izolasyon kuralları olduğu gibi kalır); yalnızca yazma yolu
-- üzerine ek bir kapı konur. DELETE bilerek serbesttir — kullanıcı kilitli alandaki
-- veriyi her zaman temizleyebilmeli/silebilmelidir.
create or replace function public.enforce_workspace_write_access()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.workspace_write_allowed(new.workspace_id) then
    raise exception 'WORKSPACE_READ_ONLY: Bu çalışma alanı salt-okunur. Ücretsiz planda tek çalışma alanı kullanılabilir; devam etmek için planınızı yükseltin.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'categories', 'counterparties', 'transactions', 'obligations',
    'installments', 'payments', 'financial_documents', 'reminders'
  ] loop
    execute format('drop trigger if exists enforce_write_access on public.%I', t);
    execute format(
      'create trigger enforce_write_access before insert or update on public.%I
         for each row execute function public.enforce_workspace_write_access()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Ekip üyesi limiti
-- ---------------------------------------------------------------------------

-- plan_limits.max_team_members: free ve plus'ta null (ekip özelliği yok), İşletme'de 10.
-- Sayım çalışma alanı SAHİBİNİ içermez — "10 ekip üyesi" sahibin yanına 10 kişi demektir.
create or replace function public.team_member_limit_for_workspace(p_workspace_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select pl.max_team_members
  from public.workspaces w
  join public.plan_limits pl on pl.plan = public.plan_for_owner(w.owner_id)
  where w.id = p_workspace_id;
$$;

create or replace function public.create_workspace_invite(
  p_workspace_id uuid,
  p_role text default 'editor',
  p_label text default null,
  p_expires_at timestamptz default null,
  p_max_uses integer default null
)
returns public.workspace_invites
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_code text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_invite public.workspace_invites;
  v_limit integer;
  i integer;
begin
  if not public.is_workspace_owner(p_workspace_id) then
    raise exception 'Yalnızca çalışma alanı sahibi davet oluşturabilir';
  end if;
  if p_role not in ('editor', 'viewer') then
    raise exception 'Geçersiz rol: %', p_role;
  end if;

  -- docs/10-abonelik-gelir-modeli.md — ekip üyeliği İşletme planının özelliğidir.
  v_limit := public.team_member_limit_for_workspace(p_workspace_id);
  if v_limit is null then
    raise exception 'TEAM_PLAN_REQUIRED: Ekip daveti İşletme planında kullanılabilir.'
      using errcode = 'check_violation';
  end if;

  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.workspace_invites where code = v_code);
  end loop;

  insert into public.workspace_invites (workspace_id, code, role, created_by, label, expires_at, max_uses)
  values (p_workspace_id, v_code, p_role, auth.uid(), p_label, p_expires_at, p_max_uses)
  returning * into v_invite;

  return v_invite;
end;
$function$;

create or replace function public.redeem_workspace_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_invite public.workspace_invites;
  v_limit integer;
  v_members integer;
begin
  if v_uid is null then
    raise exception 'Oturum bulunamadı';
  end if;

  select * into v_invite from public.workspace_invites
  where code = upper(btrim(p_code));

  if not found then raise exception 'Geçersiz davet kodu'; end if;
  if v_invite.revoked_at is not null then raise exception 'Bu davet iptal edilmiş'; end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'Bu davetin süresi dolmuş';
  end if;
  if v_invite.max_uses is not null and v_invite.used_count >= v_invite.max_uses then
    raise exception 'Bu davet kullanım limitine ulaşmış';
  end if;

  if exists (
    select 1 from public.workspace_members
    where workspace_id = v_invite.workspace_id and user_id = v_uid
  ) then
    return v_invite.workspace_id;
  end if;

  -- Davet oluşturulduktan sonra sahibin planı düşmüş olabilir; kabul anında da doğrulanır.
  v_limit := public.team_member_limit_for_workspace(v_invite.workspace_id);
  if v_limit is null then
    raise exception 'TEAM_PLAN_REQUIRED: Bu çalışma alanının planı ekip üyeliğini desteklemiyor.'
      using errcode = 'check_violation';
  end if;

  select count(*)::int into v_members
  from public.workspace_members m
  join public.workspaces w on w.id = m.workspace_id
  where m.workspace_id = v_invite.workspace_id and m.user_id <> w.owner_id;

  if v_members >= v_limit then
    raise exception 'TEAM_LIMIT_REACHED: Bu çalışma alanı % ekip üyesi limitine ulaştı.', v_limit
      using errcode = 'check_violation';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_invite.workspace_id, v_uid, v_invite.role);

  update public.workspace_invites set used_count = used_count + 1 where id = v_invite.id;

  return v_invite.workspace_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Onboarding: "Her ikisi" seçeneği ücretsiz planda kapalı
-- ---------------------------------------------------------------------------

-- 'both' modu tek çağrıda iki alan açıyordu ve ücretsiz kullanıcıya ilk günden 2 alan
-- veriyordu. Yukarıdaki insert trigger'ı zaten ikinci insert'i reddederdi ama hata mesajı
-- kullanıcıya anlamsız gelirdi — burada baştan, anlaşılır biçimde durdurulur.
-- Ayrıca 'both' modunda p_opening_balance_minor sessizce yok sayılıyordu; artık birincil
-- (kişisel) alana uygulanır.
create or replace function public.setup_initial_workspaces(
  p_mode text,
  p_name text default null,
  p_opening_balance_minor bigint default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_primary uuid;
  v_limit integer;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Oturum bulunamadı';
  end if;

  v_limit := public.workspace_limit_for_owner(v_uid);
  v_count := public.owned_workspace_count(v_uid);

  if p_mode = 'both' then
    if v_count + 2 > v_limit then
      raise exception 'WORKSPACE_LIMIT_REACHED: Ücretsiz planda % çalışma alanı oluşturabilirsiniz. Hem kişisel hem işletme alanı için planınızı yükseltin.', v_limit
        using errcode = 'check_violation';
    end if;
    insert into public.workspaces (owner_id, name, type)
      values (v_uid, 'Kişisel', 'personal')
      returning id into v_primary;
    insert into public.workspaces (owner_id, name, type)
      values (v_uid, 'İşletme', 'business');
    if p_opening_balance_minor is not null then
      insert into public.accounts (workspace_id, name, type, opening_balance_minor)
        values (v_primary, 'Kasa', 'cash', p_opening_balance_minor);
    end if;
  elsif p_mode in ('personal', 'business') then
    insert into public.workspaces (owner_id, name, type)
      values (v_uid, coalesce(nullif(btrim(p_name), ''), 'Çalışma Alanı'), p_mode)
      returning id into v_primary;
    if p_opening_balance_minor is not null then
      insert into public.accounts (workspace_id, name, type, opening_balance_minor)
        values (v_primary, 'Kasa', 'cash', p_opening_balance_minor);
    end if;
  else
    raise exception 'Geçersiz çalışma alanı türü: %', p_mode;
  end if;

  return v_primary;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 7. İstemcinin okuyacağı tek plan durumu kaynağı
-- ---------------------------------------------------------------------------

-- Uygulama açılışında çağrılır. Limit aşımını tespit ettiği anda 14 günlük lütuf süresini
-- başlatır (kullanıcı uyarıyı görmeden kilit devreye girmez); kullanıcı abone olduğunda veya
-- fazla alanı kendisi sildiğinde süreyi temizler.
create or replace function public.sync_plan_enforcement()
returns table (
  plan text,
  workspace_count integer,
  workspace_limit integer,
  over_limit boolean,
  grace_until timestamptz,
  locked boolean,
  primary_workspace_id uuid,
  team_member_limit integer
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_plan text;
  v_limit integer;
  v_count integer;
  v_over boolean;
  v_grace timestamptz;
begin
  if v_uid is null then
    raise exception 'Oturum bulunamadı';
  end if;

  v_plan := public.plan_for_owner(v_uid);
  v_limit := public.workspace_limit_for_owner(v_uid);
  v_count := public.owned_workspace_count(v_uid);
  v_over := v_plan = 'free' and v_count > v_limit;

  select p.plan_grace_until into v_grace from public.profiles p where p.id = v_uid;

  if v_over then
    if v_grace is null then
      v_grace := now() + interval '14 days';
      update public.profiles set plan_grace_until = v_grace where id = v_uid;
    end if;
  elsif v_grace is not null then
    v_grace := null;
    update public.profiles set plan_grace_until = null where id = v_uid;
  end if;

  return query
  select
    v_plan,
    v_count,
    v_limit,
    v_over,
    v_grace,
    (v_over and v_grace is not null and now() >= v_grace),
    public.resolve_primary_workspace(v_uid),
    (select pl.max_team_members from public.plan_limits pl where pl.plan = v_plan);
end;
$function$;

-- Kullanıcı kilitten sonra hangi alanın aktif kalacağını kendi seçer.
create or replace function public.set_primary_workspace(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Oturum bulunamadı';
  end if;
  if not exists (
    select 1 from public.workspaces
    where id = p_workspace_id and owner_id = v_uid and archived_at is null
  ) then
    raise exception 'Bu çalışma alanı size ait değil';
  end if;
  update public.profiles set primary_workspace_id = p_workspace_id where id = v_uid;
end;
$function$;

grant execute on function public.sync_plan_enforcement() to authenticated;
grant execute on function public.set_primary_workspace(uuid) to authenticated;

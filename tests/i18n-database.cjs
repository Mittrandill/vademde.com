// Isolated real Postgres/WASM test; no live service or credentials.
// npm install --prefix node_modules/.cache/i18n-validation --no-save --package-lock=false @electric-sql/pglite@0.3.14
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require('../node_modules/.cache/i18n-validation/node_modules/@electric-sql/pglite');
const root = path.resolve(__dirname, '..');
const trUser = '11111111-1111-4111-8111-111111111111';
const enUser = '22222222-2222-4222-8222-222222222222';

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      create table public.profiles(id uuid primary key, locale text not null default 'tr-TR');
      alter table public.profiles enable row level security;
      create policy profile_owner on public.profiles for all to authenticated using (id = auth.uid()) with check(id = auth.uid());
      grant select, update(locale) on public.profiles to authenticated;
      create table public.workspaces(id uuid primary key default gen_random_uuid(), owner_id uuid, name text, type text);
      create table public.categories(id uuid primary key default gen_random_uuid(), workspace_id uuid, kind text, name text, icon text, color text, is_default boolean, unique(workspace_id,kind,name));
      create table public.accounts(id uuid primary key default gen_random_uuid(), workspace_id uuid, name text, type text, opening_balance_minor bigint);
      create table public.ai_insights(id uuid primary key default gen_random_uuid(), workspace_id uuid, status text, generated_at timestamptz default now());
      create function public.workspace_limit_for_owner(uuid) returns integer language sql as $$ select 2 $$;
      create function public.owned_workspace_count(p_uid uuid) returns integer language sql as $$ select count(*)::integer from public.workspaces where owner_id=p_uid $$;
      insert into public.profiles values ('${trUser}', 'tr-TR'), ('${enUser}', 'en-US');
    `);
    const catalog = fs.readFileSync(path.join(root, 'supabase/migrations/20260813121956_expand_default_category_catalog.sql'), 'utf8');
    await db.exec(catalog.match(/create or replace function public.default_category_catalog\(p_workspace_type text\)[\s\S]*?\$function\$;/)[0]);
    // An existing workspace must remain untouched by the migration.
    await db.exec(`insert into public.workspaces(id,owner_id,name,type) values('33333333-3333-4333-8333-333333333333','${enUser}','Kişisel','personal');
      insert into public.categories(workspace_id,kind,name) values('33333333-3333-4333-8333-333333333333','expense','Market');`);
    const migration = fs.readdirSync(path.join(root, 'supabase/migrations')).find((name) => name.endsWith('_add_server_locale_support.sql'));
    await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations', migration), 'utf8'));
    await db.exec('create trigger seed_categories after insert on public.workspaces for each row execute function public.seed_default_categories();');
    assert.deepEqual((await db.query('select locale from public.profiles order by id')).rows, [{locale:'tr'}, {locale:'en'}]);
    for (const type of ['personal', 'business']) {
      const tr = (await db.query('select * from public.default_category_catalog($1)', [type])).rows;
      const en = (await db.query("select * from public.default_category_catalog($1,'en')", [type])).rows;
      assert.equal(tr.length, en.length);
      assert.ok(tr.length > 30);
      assert.deepEqual(tr.map(({name,...rest})=>rest), en.map(({name,...rest})=>rest));
      assert.ok(en.every((row)=>!/[çğıöşüÇĞİÖŞÜ]/.test(row.name)));
      assert.equal(new Set(en.map((r)=>`${r.kind}:${r.name}`)).size, en.length);
    }
    assert.equal((await db.query("select name from public.categories where workspace_id='33333333-3333-4333-8333-333333333333'")).rows[0].name, 'Market');
    await db.exec(`set role authenticated; set test.uid='${enUser}';`);
    assert.equal((await db.query('update public.profiles set locale=$1 where id=$2 returning id',['en',trUser])).rows.length, 0);
    await assert.rejects(db.query('update public.profiles set locale=$1 where id=$2',['de',enUser]), /profiles_locale_supported/);
    const created = (await db.query("select public.setup_initial_workspaces('business',null,10000) as id")).rows[0].id;
    await db.exec('reset role;');
    assert.equal((await db.query('select name from public.workspaces where id=$1',[created])).rows[0].name,'Workspace');
    assert.equal((await db.query('select name from public.accounts where workspace_id=$1',[created])).rows[0].name,'Cash');
    assert.ok((await db.query('select name from public.categories where workspace_id=$1',[created])).rows.some((r)=>r.name==='POS Commission'));
    await db.exec(`set role authenticated; set test.uid='${trUser}';`);
    const primary = (await db.query("select public.setup_initial_workspaces('both',null,5000) as id")).rows[0].id;
    await assert.rejects(db.query("select public.setup_initial_workspaces('both')"), /WORKSPACE_LIMIT_REACHED/);
    await db.exec("set test.uid='';");
    await assert.rejects(db.query("select public.setup_initial_workspaces('personal')"), /Oturum bulunamadı/);
    await assert.rejects(db.query("select * from public.default_category_catalog('personal','en')"), /permission denied/);
    await db.exec('reset role;');
    assert.equal((await db.query('select name from public.workspaces where id=$1',[primary])).rows[0].name,'Kişisel');
    assert.equal((await db.query('select name from public.accounts where workspace_id=$1',[primary])).rows[0].name,'Kasa');
    assert.ok((await db.query('select name from public.categories where workspace_id=$1',[primary])).rows.some((r)=>r.name==='Market'));
    console.log('PASS locale migration: catalogs, legacy data, owner RLS, invalid locale, TR/EN onboarding and plan gate (real Postgres).');
  } finally { await db.close(); }
})().catch((error)=>{console.error(error);process.exitCode=1;});

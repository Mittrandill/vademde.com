// Isolated PostgreSQL integration tests. Never connects to a remote/live database.
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const host = process.env.TEST_PGHOST;
const port = process.env.TEST_PGPORT;
if (!host?.startsWith('/private/tmp/vademde-workspace-entitlements-pg') || !/^\d+$/.test(port ?? '')) throw Error('Disposable PostgreSQL socket required');
const bin = process.env.TEST_PSQL_BIN || '/usr/local/opt/postgresql@17/bin/psql';
const args = ['-X', '-h', host, '-p', port, '-d', 'vademde_workspace_test', '-v', 'ON_ERROR_STOP=1', '-Atq'];
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
function run(query) {
  return new Promise(resolve => {
    const child = spawn(bin, [...args, '-c', query]); let out = '', err = '';
    child.stdout.on('data', x => out += x); child.stderr.on('data', x => err += x);
    child.on('close', code => resolve({ code, out: out.trim(), err }));
    child.on('error', e => resolve({ code: -1, out, err: String(e) }));
  });
}
async function ok(query) { const r = await run(query); assert.equal(r.code, 0, r.err); return r.out; }
const asUser = (user, sql) => `set role authenticated; set request.jwt.claim.sub='${id(user)}'; ${sql}`;
const entitlement = (user, workspace) => ok(asUser(user, `select public.get_workspace_entitlements(${workspace ? `'${id(workspace)}'` : 'null'});`)).then(JSON.parse);
const reserve = (user, doc) => run(asUser(user, `select public.reserve_workspace_ocr('${id(doc)}');`));
const finish = (token, success) => ok(`set role service_role; select public.finish_workspace_ocr('${token}', ${success});`);
const planSource = fs.readFileSync(path.join(root, 'supabase/migrations/20260905130000_enforce_plan_limits.sql'), 'utf8');
const helper = name => {
 const start = planSource.indexOf(`create or replace function public.${name}(`);
 const end = planSource.indexOf('$$;', planSource.indexOf('as $$', start)) + 3;
 return planSource.slice(start, end);
};
async function main() {
 const created = spawnSync(bin, ['-X', '-h', host, '-p', port, '-d', 'postgres', '-Atqc', 'create database vademde_workspace_test'], { encoding: 'utf8' });
 if (created.status !== 0 && !created.stderr.includes('already exists')) throw Error(created.stderr);
 await ok(`
 drop schema if exists entitlement_private cascade;
 drop schema public cascade; create schema public; grant usage on schema public to public;
 drop schema if exists auth cascade; create schema auth;
 do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
 do $$ begin create role anon; exception when duplicate_object then null; end $$;
 do $$ begin create role service_role; exception when duplicate_object then null; end $$;
 grant usage on schema auth to authenticated, service_role;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table auth.users(id uuid primary key);
 create table public.workspaces(id uuid primary key, owner_id uuid references auth.users, archived_at timestamptz, created_at timestamptz default now());
 create table public.workspace_members(workspace_id uuid references public.workspaces, user_id uuid references auth.users, role text, primary key(workspace_id,user_id));
 create table public.profiles(id uuid primary key, primary_workspace_id uuid, plan_grace_until timestamptz);
 create table public.subscriptions(owner_id uuid primary key, plan text, status text, current_period_end timestamptz);
 alter table public.subscriptions enable row level security;
 grant select on public.subscriptions to authenticated;
 create policy own_subscription on public.subscriptions for select to authenticated using(owner_id=auth.uid());
 create table public.plan_limits(plan text primary key, monthly_ocr_quota integer, max_personal_workspaces integer, max_team_members integer,
 document_archive boolean, advanced_reports boolean, unlimited_export boolean, face_id boolean, audit_log boolean, recurring_transactions boolean);
 create table public.ocr_usage(owner_id uuid, period_month date, used_count integer, updated_at timestamptz, primary key(owner_id,period_month));
 create table public.financial_documents(id uuid primary key, workspace_id uuid references public.workspaces, status text);
 create function public.can_edit_workspace(target_workspace_id uuid) returns boolean language sql stable security definer as $$
 select exists(select 1 from public.workspace_members where workspace_id=target_workspace_id and user_id=auth.uid() and role in ('owner','editor')) $$;
 create function public.increment_ocr_usage(target_owner uuid,target_period date) returns void language sql as $$
 insert into public.ocr_usage values(target_owner,target_period,1,now()) on conflict(owner_id,period_month)
 do update set used_count=ocr_usage.used_count+1, updated_at=now() $$;
 ${helper('plan_for_owner')} ${helper('owned_workspace_count')} ${helper('workspace_limit_for_owner')}
 ${helper('resolve_primary_workspace')} ${helper('workspace_write_allowed')}
 insert into auth.users select '${id(1)}'::uuid union all select '${id(2)}'::uuid union all select '${id(3)}'::uuid union all select '${id(4)}'::uuid;
 insert into public.plan_limits values ('free',5,1,null,false,false,false,false,false,false),('plus',100,3,2,true,true,true,true,false,true),('isletme',500,10,10,true,true,true,true,true,true);
 insert into public.subscriptions values('${id(1)}','isletme','active',now()+interval '1 month'),('${id(3)}','plus','active',now()+interval '1 month');
 insert into public.workspaces(id,owner_id) values('${id(101)}','${id(1)}'),('${id(102)}','${id(2)}'),('${id(103)}','${id(3)}'),('${id(104)}','${id(1)}'),('${id(105)}','${id(4)}');
 insert into public.workspace_members select id,owner_id,'owner' from public.workspaces;
 insert into public.workspace_members values('${id(101)}','${id(2)}','editor'),('${id(103)}','${id(2)}','viewer'),('${id(104)}','${id(2)}','editor');
 insert into public.financial_documents values('${id(201)}','${id(101)}','uploaded'),('${id(202)}','${id(104)}','uploaded'),('${id(203)}','${id(103)}','uploaded');
 `);
 await ok(fs.readFileSync(path.join(root, 'supabase/migrations/20261104071113_workspace_entitlements.sql'), 'utf8'));
 const inherited = await entitlement(2,101);
 assert.equal(inherited.plan,'isletme'); assert.equal(inherited.quota,500); assert.equal(inherited.inherited,true);
 assert.equal(inherited.limits.document_archive,true); assert.equal(inherited.limits.unlimited_export,true);
 assert.equal(inherited.limits.face_id,true); assert.equal(inherited.limits.audit_log,true);
 assert.equal((await entitlement(2,102)).plan,'free'); assert.equal((await entitlement(2,null)).quota,5);
 assert.equal((await entitlement(2,103)).plan,'plus');
 assert.equal(inherited.owner_id,undefined); assert.equal(inherited.subscription,undefined);
 assert.equal(await ok(asUser(2,'select count(*) from public.subscriptions;')),'0');
 console.log('PASS workspace owner features, personal isolation, Plus viewer, billing privacy');
 for (const query of [asUser(4,`select public.get_workspace_entitlements('${id(101)}');`),`set role anon; select public.get_workspace_entitlements('${id(101)}');`,asUser(2,"select public.finish_workspace_ocr(gen_random_uuid(),true);"),asUser(2,'select * from entitlement_private.ocr_reservations;')]) assert.notEqual((await run(query)).code,0);
 assert.notEqual((await reserve(2,203)).code,0);
 await ok(`delete from public.workspace_members where workspace_id='${id(101)}' and user_id='${id(2)}';`);
 assert.notEqual((await run(asUser(2,`select public.get_workspace_entitlements('${id(101)}');`))).code,0);
 assert.notEqual((await reserve(2,201)).code,0);
 await ok(`insert into public.workspace_members values('${id(101)}','${id(2)}','editor'); update public.workspaces set archived_at=now() where id='${id(104)}';`);
 assert.notEqual((await reserve(2,202)).code,0);
 await ok(`update public.workspaces set archived_at=null where id='${id(104)}';`);
 console.log('PASS outsiders, anonymous users, removed members, archived workspaces, viewer writes, private quota API');
 for (const [status,expiration,plan] of [['expired',"now()+interval '1 day'",'free'],['active',"now()-interval '1 day'",'free'],['cancelled',"now()+interval '1 day'",'isletme'],['cancelled',"now()-interval '1 day'",'free'],['trialing',"now()+interval '1 day'",'isletme'],['grace_period',"now()-interval '1 day'",'isletme']]) {
  await ok(`update public.subscriptions set status='${status}',current_period_end=${expiration} where owner_id='${id(1)}';`);
  assert.equal((await entitlement(2,101)).plan,plan,status);
 }
 await ok(`update public.subscriptions set status='active',current_period_end=now()+interval '1 month' where owner_id='${id(1)}';
 insert into public.ocr_usage values('${id(1)}',date_trunc('month',now() at time zone 'UTC')::date,499,now());`);
 const race = await Promise.all([reserve(1,201),reserve(2,202)]);
 assert.equal(race.filter(r=>r.code===0).length,1,JSON.stringify(race));
 assert.match(race.find(r=>r.code!==0).err,/OCR_QUOTA_EXCEEDED/);
 const token = race.find(r=>r.code===0).out;
 const reservedDoc = race[0].code === 0 ? 201 : 202;
 assert.match((await reserve(2,reservedDoc)).err,/OCR_ALREADY_PROCESSING/);
 await finish(token,false);
 assert.equal((await entitlement(2,101)).usedCount,499);
 const retry=await reserve(2,201);assert.equal(retry.code,0,retry.err);
 await finish(retry.out,true);await finish(retry.out,true);
 assert.equal((await entitlement(2,101)).usedCount,500);assert.equal((await entitlement(2,104)).remaining,0);
 assert.equal((await entitlement(2,102)).usedCount,0);
 assert.match((await reserve(2,202)).err,/OCR_QUOTA_EXCEEDED/);
 console.log('PASS shared 500 OCR cap under concurrency, failure refund, retry idempotency, no personal usage charge');
 await ok(`update public.ocr_usage set used_count=499 where owner_id='${id(1)}';`);
 const month=await reserve(2,201);assert.equal(month.code,0,month.err);
 await ok(`update entitlement_private.ocr_reservations set period_month=(date_trunc('month',now() at time zone 'UTC')-interval '1 month')::date where id='${month.out}';`);
 await finish(month.out,true);assert.equal((await entitlement(2,101)).usedCount,499);
 const stale=await reserve(2,202);assert.equal(stale.code,0,stale.err);
 await ok(`update entitlement_private.ocr_reservations set expires_at=now()-interval '1 second' where id='${stale.out}';`);
 assert.notEqual((await run(`set role service_role; select public.finish_workspace_ocr('${stale.out}',true);`)).code,0);
 const recovered=await reserve(2,202);assert.equal(recovered.code,0,recovered.err);await finish(recovered.out,false);
 console.log('PASS month boundary accounting and expired reservation recovery');
 await ok(`update public.subscriptions set status='expired' where owner_id='${id(1)}'; insert into public.profiles values('${id(1)}','${id(101)}',now()-interval '1 day');`);
 assert.equal((await entitlement(2,104)).readOnly,true);assert.notEqual((await reserve(2,202)).code,0);
 console.log('PASS downgraded workspace read-only enforcement');
 const security=await ok(`select count(*) from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' and p.proname in ('get_workspace_entitlements','reserve_workspace_ocr','finish_workspace_ocr') and p.prosecdef;`);
 assert.equal(security,'0');
 console.log('PASS exposed RPCs use SECURITY INVOKER; privileged implementations are private');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

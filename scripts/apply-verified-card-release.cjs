/* global __dirname */
// Explicit two-migration release. Does not replay or repair divergent old history.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { linkedEnvironment, run } = require('./finance-release-audit.cjs');
const pg = process.env.FINANCE_PG_BIN || '/usr/local/opt/postgresql@17/bin';
const files = ['20261105112411_card_minimum_payment_rate.sql', '20261105114545_card_statement_dates.sql'];
const tables = ['accounts', 'obligations', 'installments', 'payments', 'transactions'];
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
const fingerprint = `jsonb_build_object(${tables.map((table) => `'${table}', (select md5(coalesce(string_agg((to_jsonb(t)-'minimum_payment_rate'-'statement_date')::text, E'\\n' order by t.id),'')) from public.${table} t)`).join(',')})`;
function buildSql(apply = false) {
  const sources = files.map((name) => ({ name, source: fs.readFileSync(path.join(__dirname, '../supabase/migrations', name), 'utf8') }));
  const sql = `begin isolation level repeatable read;
set local role postgres;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_advisory_xact_lock(hashtextextended('vademde:card-release:20261105', 0));
do $$ begin
 if exists(select from supabase_migrations.schema_migrations where version in (${files.map((name) => quote(name.slice(0,14))).join(',')})) then raise exception 'Card release already present or partially recorded; inspect instead of replaying'; end if;
 if exists(select from information_schema.columns where table_schema='public' and ((table_name='accounts' and column_name='minimum_payment_rate') or (table_name='obligations' and column_name='statement_date'))) then raise exception 'Card columns already exist; inspect instead of replaying'; end if;
 if exists(select from pg_class where oid in ('public.accounts'::regclass,'public.obligations'::regclass) and not relrowsecurity) then raise exception 'Expected RLS enabled'; end if;
end $$;
create temporary table card_release_before on commit drop as select ${fingerprint} as digest;
${sources.map(({ name, source }) => source + (apply ? `\ninsert into supabase_migrations.schema_migrations(version,name,statements) values(${quote(name.slice(0,14))},${quote(name.slice(15,-4))},array[${quote(source)}]);` : '')).join('\n')}
do $$ begin
 if (select digest from card_release_before) is distinct from (${fingerprint}) then raise exception 'Existing financial data changed'; end if;
 if exists(select from public.accounts where minimum_payment_rate is not null) or exists(select from public.obligations where statement_date is not null) then raise exception 'Unexpected backfill'; end if;
 if to_regclass('public.obligations_card_statement_month_unique') is null then raise exception 'Missing uniqueness index'; end if;
end $$;
select 'PASS two additive migrations; financial fingerprints unchanged; RLS retained; no backfill';
notify pgrst, 'reload schema';
${apply ? 'commit;' : 'rollback;'}
`;
  return { sql, hashes: Object.fromEntries(sources.map(({ name, source }) => [name, createHash('sha256').update(source).digest('hex')])) };
}
async function main() {
  const mode = process.argv[2] || 'inspect';
  const project = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/.temp/linked-project.json'), 'utf8'));
  assert.equal(project.ref, 'wgdirnckmlicctreyoxk', 'Unexpected linked project');
  if (mode === 'advisors') {
    let token = process.env.SUPABASE_ACCESS_TOKEN;
    if (!token) for (const service of ['Supabase CLI', 'supabase']) {
      const result = spawnSync('security', ['find-generic-password', '-s', service, '-w'], { encoding: 'utf8' });
      let value = result.stdout?.trim();
      if (value?.startsWith('go-keyring-base64:')) value = Buffer.from(value.slice('go-keyring-base64:'.length), 'base64').toString('utf8');
      if (result.status === 0 && /^sbp_[a-zA-Z0-9]+$/.test(value ?? '')) { token = value; break; }
    }
    assert(token, 'Use an authenticated Supabase CLI session for security advisors');
    const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/advisors/security`, { headers: { Authorization: `Bearer ${token}` } });
    assert(response.ok, `Security advisors HTTP ${response.status}`);
    const result = await response.json();
    const counts = {};
    for (const lint of result.lints ?? []) counts[`${lint.level}:${lint.name}`] = (counts[`${lint.level}:${lint.name}`] ?? 0) + 1;
    console.log(JSON.stringify({ project: project.ref, advisors: counts }));
    return;
  }
  const env = linkedEnvironment();
  const query = (sql, writable = false) => run(path.join(pg, 'psql'), ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-f', '-'], {
    env: writable ? { ...env, PGOPTIONS: '-c default_transaction_read_only=off -c statement_timeout=60000' } : env,
    input: writable ? sql : `set role postgres; ${sql}` });
  if (mode === 'inspect' || mode === 'verify') {
    process.stdout.write(query(`select jsonb_build_object('rows',jsonb_build_object(${tables.map((table) => `'${table}',(select count(*) from public.${table})`).join(',')}),'migrations',(select coalesce(jsonb_agg(jsonb_build_object('version',version,'name',name)),'[]') from supabase_migrations.schema_migrations where version in (${files.map((name) => quote(name.slice(0,14))).join(',')})),'columns',(select coalesce(jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type,'nullable',is_nullable)),'[]') from information_schema.columns where table_schema='public' and ((table_name='accounts' and column_name='minimum_payment_rate') or (table_name='obligations' and column_name='statement_date'))),'rls',(select jsonb_agg(jsonb_build_object('table',relname,'enabled',relrowsecurity)) from pg_class where oid in ('public.accounts'::regclass,'public.obligations'::regclass)));`));
    return;
  }
  const backupDir = process.argv[3];
  assert(backupDir && path.isAbsolute(backupDir) && !backupDir.startsWith(path.resolve(__dirname, '..') + path.sep), 'Private backup directory outside repository required');
  if (mode === 'backup') {
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    fs.chmodSync(backupDir, 0o700);
    const archive = path.join(backupDir, 'before-card-release.dump');
    assert(!fs.existsSync(archive), 'Never overwrite an existing backup');
    run(path.join(pg, 'pg_dump'), ['--role=postgres', '--format=custom', '--schema=public', '--schema=auth', '--schema=storage', '--schema=supabase_migrations', '--schema=finance_private', '--schema=entitlement_private', '--file', archive], { env });
    fs.chmodSync(archive, 0o600);
    run(path.join(pg, 'pg_restore'), ['--list', archive]);
    const metadata = { project: project.ref, createdAt: new Date().toISOString(), bytes: fs.statSync(archive).size, sha256: createHash('sha256').update(fs.readFileSync(archive)).digest('hex'), archiveReadable: true };
    fs.writeFileSync(path.join(backupDir, 'verification.json'), JSON.stringify(metadata, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(metadata));
    return;
  }
  assert(['check', 'apply'].includes(mode), 'Unknown release mode');
  const archive = path.join(backupDir, 'before-card-release.dump');
  const verification = JSON.parse(fs.readFileSync(path.join(backupDir, 'verification.json'), 'utf8'));
  assert.equal(verification.project, project.ref);
  assert.equal(verification.sha256, createHash('sha256').update(fs.readFileSync(archive)).digest('hex'), 'Backup checksum mismatch');
  run(path.join(pg, 'pg_restore'), ['--list', archive]);
  if (mode === 'apply') assert.equal(process.argv[4], '--apply-live', 'Explicit live flag required');
  const { sql, hashes } = buildSql(mode === 'apply');
  process.stdout.write(query(sql, true));
  console.log(JSON.stringify({ mode, project: project.ref, hashes }));
}
if (require.main === module) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { files, buildSql };

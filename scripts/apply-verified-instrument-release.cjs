/* global __dirname */
// One allowlisted migration, atomic history entry, no historical data repair.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { linkedEnvironment, run, pgBin } = require('./finance-release-audit.cjs');
const { files: prerequisites, fingerprint } = require('./apply-verified-finance-release.cjs');
const file = '20261009123535_atomic_endorsement_and_instrument_bounce.sql';
function buildSql() {
  const source = fs.readFileSync(path.join(__dirname, '../supabase/migrations', file), 'utf8');
  const quote = value => `'${value.replaceAll("'", "''")}'`;
  return { hash: createHash('sha256').update(source).digest('hex'), sql: `
set transaction isolation level repeatable read;
set local role postgres;
set local lock_timeout='5s';
set local statement_timeout='60s';
select pg_advisory_xact_lock(hashtextextended('vademde:verified-finance-release:20261009',0));
do $$ begin
 if (select count(*) from supabase_migrations.schema_migrations where version in (${prerequisites.map(name => quote(name.slice(0,14))).join(',')})) <> 8 then raise exception 'All eight finance prerequisites required'; end if;
 if to_regclass('finance_private.instrument_bounces') is not null or to_regclass('finance_private.endorsement_requests') is not null or exists(select 1 from supabase_migrations.schema_migrations where version=${quote(file.slice(0,14))}) then raise exception 'Instrument release already present; inspect instead of replaying'; end if;
end $$;
create temporary table instrument_release_before as select ${fingerprint} as digest;
${source}
insert into supabase_migrations.schema_migrations(version,name,statements) values (${quote(file.slice(0,14))},${quote(file.slice(15,-4))},array[${quote(source)}]);
do $$ begin
 if (select digest from instrument_release_before) is distinct from (${fingerprint}) then raise exception 'Existing financial rows changed during migration'; end if;
 if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('settle_endorsement_atomic','cancel_endorsement_request','preview_instrument_bounce','bounce_instrument_atomic','mark_instrument_bounced','reverse_offset_atomic')) <> 6 then raise exception 'Missing or ambiguous instrument RPC'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('settle_endorsement_atomic','cancel_endorsement_request','preview_instrument_bounce','bounce_instrument_atomic','mark_instrument_bounced','reverse_offset_atomic') and (p.prosecdef or has_function_privilege('anon',p.oid,'EXECUTE') or not has_function_privilege('authenticated',p.oid,'EXECUTE'))) then raise exception 'Unsafe instrument RPC permissions'; end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='finance_private' and c.relkind='r' and (not c.relrowsecurity or has_table_privilege('authenticated',c.oid,'UPDATE') or has_table_privilege('authenticated',c.oid,'DELETE') or has_table_privilege('anon',c.oid,'SELECT'))) then raise exception 'Unsafe private ledger permissions'; end if;
end $$;
select 'Instrument release verified: financial rows unchanged, RPC and ledger permissions checked.';
` };
}
function main() {
  const backupDir = process.argv[2];
  assert(backupDir && path.isAbsolute(backupDir) && !backupDir.startsWith(path.resolve(__dirname, '..') + path.sep), 'Private backup directory outside repo required');
  const archive = path.join(backupDir, 'before-finance-release.dump');
  assert(fs.statSync(archive).size > 0, 'Pre-release backup required');
  assert(Date.now() - fs.statSync(archive).mtimeMs < 3600000, 'A fresh backup less than one hour old is required');
  const project = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/.temp/linked-project.json'), 'utf8'));
  assert.equal(project.ref, 'wgdirnckmlicctreyoxk', 'Unexpected linked project');
  assert.equal(process.argv[3], '--apply-live', 'Explicit --apply-live required');
  run(path.join(pgBin, 'pg_restore'), ['--list', archive]);
  const { sql, hash } = buildSql();
  const env = { ...linkedEnvironment(), PGOPTIONS: '-c default_transaction_read_only=off -c statement_timeout=60000' };
  process.stdout.write(run(path.join(pgBin, 'psql'), ['-X','-A','-t','-v','ON_ERROR_STOP=1','--single-transaction','-f','-'], { env, input: sql }));
  console.log(JSON.stringify({ project: project.ref, migration: file, sha256: hash }));
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { buildSql, file };

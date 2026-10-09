/* global __dirname */
/* Explicit, allowlisted deployment; never repairs/replays the divergent old history. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { linkedEnvironment, run, pgBin } = require('./finance-release-audit.cjs');

const files = [
  '20261009090732_financial_integrity_atomic_payments.sql',
  '20261009092005_workspace_security_guardrails.sql',
  '20261009092959_instrument_reopen_status.sql',
  '20261009101713_atomic_card_payment.sql',
  '20261009103815_card_payment_actor_guard.sql',
  '20261009105448_atomic_offset_settlement.sql',
  '20261009111903_reverse_offset_atomically.sql',
  '20261009115028_atomic_cash_settlement.sql',
];
const tables = ['accounts','counterparties','obligations','installments','payments','transactions','workspaces','workspace_members'];
const fingerprint = `jsonb_build_object(${tables.map((table) => `'${table}',(select md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by t.id),'')) from public.${table} t)`).join(',')})`;
function buildSql() {
  const sources = files.map((name) => ({ name, source: fs.readFileSync(path.join(__dirname,'../supabase/migrations',name),'utf8') }));
  const quote = (value) => `'${value.replaceAll("'", "''")}'`;
  return {
    hashes: Object.fromEntries(sources.map(({ name, source }) => [name, createHash('sha256').update(source).digest('hex')])),
    sql: `set transaction isolation level repeatable read;
set local role postgres;
set local lock_timeout='5s';
set local statement_timeout='60s';
select pg_advisory_xact_lock(hashtextextended('vademde:verified-finance-release:20261009',0));
do $$ begin
 if to_regnamespace('finance_private') is not null then raise exception 'Finance release already present or partly installed; inspect instead of replaying'; end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version in (${files.map((name) => quote(name.slice(0,14))).join(',')})) then raise exception 'Release migration version already recorded'; end if;
end $$;
create temporary table finance_release_before as select ${fingerprint} as digest;
${sources.map(({name, source}) => `${source}\ninsert into supabase_migrations.schema_migrations(version,name,statements) values (${quote(name.slice(0,14))},${quote(name.slice(15,-4))},array[${quote(source)}]);`).join('\n')}
do $$ begin
 if (select digest from finance_release_before) is distinct from (${fingerprint}) then raise exception 'Existing financial data changed during deployment'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
   and p.proname in ('settle_cash_atomic','settle_offset_atomic','reverse_offset_atomic','record_card_payment_owned','record_payments_v2','update_payment_atomic','delete_payment_atomic')
   and (p.prosecdef or has_function_privilege('anon',p.oid,'EXECUTE'))) then raise exception 'Unsafe public finance RPC permissions'; end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='finance_private' and c.relkind='r'
   and (not c.relrowsecurity or has_table_privilege('authenticated',c.oid,'UPDATE') or has_table_privilege('authenticated',c.oid,'DELETE'))) then raise exception 'Unsafe private ledger permissions'; end if;
end $$;
select 'Verified eight-migration finance release; existing financial rows unchanged.';
`,
  };
}
function main() {
  const backupDir = process.argv[2];
  assert(backupDir && path.isAbsolute(backupDir) && !backupDir.startsWith(path.resolve(__dirname,'..')+path.sep), 'Private backup directory outside repo required');
  assert(fs.statSync(path.join(backupDir,'before-finance-release.dump')).size>0, 'Verified pre-release archive required');
  const project = JSON.parse(fs.readFileSync(path.join(__dirname,'../supabase/.temp/linked-project.json'),'utf8'));
  assert.equal(project.ref,'wgdirnckmlicctreyoxk','Unexpected linked project');
  assert.equal(process.argv[3],'--apply-live','Explicit --apply-live flag required');
  const { sql, hashes } = buildSql();
  const env = { ...linkedEnvironment(), PGOPTIONS: '-c default_transaction_read_only=off -c statement_timeout=60000' };
  run(path.join(pgBin,'pg_restore'),['--list',path.join(backupDir,'before-finance-release.dump')]);
  process.stdout.write(run(path.join(pgBin,'psql'),['-X','-A','-t','-v','ON_ERROR_STOP=1','--single-transaction','-f','-'],{env,input:sql}));
  console.log(JSON.stringify({ project: project.ref, migrations: hashes },null,2));
}
if (require.main===module) {
  try { main(); } catch(error) { console.error(error.message); process.exitCode=1; }
}
module.exports={buildSql,files,fingerprint};

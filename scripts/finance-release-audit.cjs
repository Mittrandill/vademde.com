/* global __dirname */
/* Read-only live audit. Credentials remain in child-process memory, never printed. */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const pgBin = process.env.FINANCE_PG_BIN || '/usr/local/Cellar/postgresql@17/17.11/bin';
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed: ${result.stderr || result.error || result.status}`);
  return result.stdout;
}
function linkedEnvironment() {
  const script = run('supabase', ['db', 'dump', '--linked', '--dry-run']);
  const exports = script.split('\n').filter((line) => /^export PG(?:HOST|PORT|USER|PASSWORD|DATABASE)=/.test(line));
  assert.equal(exports.length, 5, 'Unexpected Supabase credential script');
  const raw = run('/bin/bash', ['-c', `${exports.join('\n')}\nexec "$1" -e 'process.stdout.write(JSON.stringify(process.env))'`, 'finance-audit', process.execPath]);
  const parsed = JSON.parse(raw);
  return { ...process.env, ...Object.fromEntries(Object.entries(parsed).filter(([key]) => /^PG(?:HOST|PORT|USER|PASSWORD|DATABASE)$/.test(key))), PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '20', PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=60000' };
}
function main() {
  const env = linkedEnvironment();
  const sql = fs.readFileSync(path.join(__dirname, '../tests/finance-release-audit.sql'), 'utf8');
  const report = run(path.join(pgBin, 'psql'), ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '--set=ROLE=postgres', '-c', `set role postgres; ${sql}`], { env });
  process.stdout.write(report);
  const backupDir = process.argv[2];
  if (backupDir) {
    assert(path.isAbsolute(backupDir) && fs.statSync(backupDir).isDirectory(), 'Use an existing absolute private backup directory');
    assert(!path.resolve(backupDir).startsWith(path.resolve(__dirname, '..') + path.sep), 'Never put user-data backups in the repository');
    run(path.join(pgBin, 'pg_dump'), ['--role=postgres', '--format=custom', '--schema=public', '--schema=auth', '--schema=storage', '--schema=supabase_migrations', '--schema=finance_private', '--file', path.join(backupDir, 'before-finance-release.dump')], { env });
    run(path.join(pgBin, 'pg_restore'), ['--list', path.join(backupDir, 'before-finance-release.dump')]);
    run(path.join(pgBin, 'pg_dump'), ['--role=postgres', '--schema-only', '--schema=public', '--schema=auth', '--schema=storage', '--schema=supabase_migrations', '--schema=finance_private', '--file', path.join(backupDir, 'before-finance-release-schema.sql')], { env });
    console.log(`Backup archive and schema saved: ${backupDir}`);
  }
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { linkedEnvironment, run, pgBin };

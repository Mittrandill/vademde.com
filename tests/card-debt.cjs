/* global __dirname */
// Kredi kartı "ekstre çapası" borç hesabı (utils/cardDebt.ts) ve bekleyen taksitler
// (features/cardInstallments/api.ts pendingInstallmentMinor). Saf fonksiyonlar; ağ/veritabanı yok.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(rel) {
  const file = path.join(root, rel);
  if (cache.has(file)) return cache.get(file).exports;
  const source = fs.readFileSync(file, 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const mod = { exports: {} };
  cache.set(file, mod);
  const req = (spec) => {
    if (spec === '@/services/supabase') return { supabase: {} };
    if (spec.startsWith('@/')) return load(`${spec.slice(2)}.ts`);
    return require(spec);
  };
  new Function('require', 'module', 'exports', outputText)(req, mod, mod.exports);
  return mod.exports;
}
const { computeCardDebt, statementCutoff } = load('utils/cardDebt.ts');
const { pendingInstallmentMinor } = load('features/cardInstallments/api.ts');

let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }

const card = { id: 'card', statement_day: 15, payment_due_day: 25, opening_balance_minor: 0, created_at: '2026-08-01T09:00:00' };
const tx = (direction, amount, day, extra = {}) => ({ account_id: 'card', transfer_to_account_id: null, direction, amount_minor: amount, occurred_at: `${day}T10:00:00`, ...extra });
const payIn = (amount, day) => ({ account_id: 'bank', transfer_to_account_id: 'card', direction: 'transfer', amount_minor: amount, occurred_at: `${day}T10:00:00` });
const statement = (id, total, due, extra = {}) => ({ id, total_amount_minor: total, remaining_amount_minor: total, due_date: due, status: 'bekliyor', created_at: `${due}T08:00:00`, off_card_paid_minor: 0, ...extra });
const TODAY = '2026-10-01';

check('ekstre yoksa açılış + tüm hareketler + açık nakit avans', () => {
  const r = computeCardDebt({ ...card, opening_balance_minor: 5000 }, [tx('expense', 2000, '2026-08-10'), payIn(1000, '2026-08-20')], [],
    [{ remaining_amount_minor: 500, created_at: '2026-09-01T10:00:00', status: 'bekliyor' }], TODAY);
  assert.equal(r.debtMinor, 6500);
  assert.equal(r.anchor, null);
});

check('ekstre çapası: kesimden önceki hareketler sayılmaz, sonrakiler eklenir/düşülür', () => {
  const r = computeCardDebt(card,
    [tx('expense', 3000, '2026-09-10'), tx('expense', 2000, '2026-09-20'), payIn(4000, '2026-09-22')],
    [statement('s1', 10000, '2026-09-25')], [], TODAY);
  assert.equal(r.anchor.cutoffDate, '2026-09-15');
  assert.equal(r.anchor.cutoffEstimated, false);
  assert.equal(r.debtMinor, 10000 + 2000 - 4000);
});

check('kesim günü harcaması ekstrenin içindedir', () => {
  const r = computeCardDebt(card, [tx('expense', 700, '2026-09-15')], [statement('s1', 10000, '2026-09-25')], [], TODAY);
  assert.equal(r.debtMinor, 10000);
});

check('karta transfer olmadan ödenen ekstre (hesapsız/bankadan gider) borçtan düşer', () => {
  const r = computeCardDebt(card, [], [statement('s1', 10000, '2026-09-25', { off_card_paid_minor: 3000, remaining_amount_minor: 7000 })], [], TODAY);
  assert.equal(r.debtMinor, 7000);
  assert.equal(r.anchor.statementRemainingMinor, 7000);
});

check('en son kesimli ekstre çapa olur; iptal edilmiş ve kesimi gelmemiş ekstre atlanır', () => {
  const r = computeCardDebt(card, [],
    [statement('aug', 8000, '2026-08-25'), statement('sep', 9000, '2026-09-25'),
     statement('cancelled', 99999, '2026-09-25', { status: 'iptal_edildi', created_at: '2026-09-26T08:00:00' }),
     statement('future', 12000, '2026-10-25')], [], TODAY);
  assert.equal(r.anchor.statementId, 'sep');
  assert.equal(r.debtMinor, 9000);
});

check('son ödeme bir sonraki aya sarkınca kesim önceki aydadır', () => {
  const spill = { statement_day: 28, payment_due_day: 8 };
  assert.deepEqual(statementCutoff(spill, '2026-10-08', '2026-10-01T09:00:00'), { date: '2026-09-28', estimated: false });
});

check('kesim günü yoksa tahmin: son ödemeden 10 gün önce, giriş günü daha erkense o gün', () => {
  const noDay = { statement_day: null, payment_due_day: null };
  assert.deepEqual(statementCutoff(noDay, '2026-10-05', '2026-09-28T09:00:00'), { date: '2026-09-25', estimated: true });
  assert.deepEqual(statementCutoff(noDay, '2026-10-05', '2026-09-20T09:00:00'), { date: '2026-09-20', estimated: true });
  const r = computeCardDebt({ ...card, statement_day: null, payment_due_day: null },
    [tx('expense', 400, '2026-09-24'), tx('expense', 600, '2026-09-26')],
    [statement('s', 5000, '2026-10-05', { created_at: '2026-09-28T09:00:00' })], [], TODAY);
  assert.equal(r.anchor.cutoffEstimated, true);
  assert.equal(r.debtMinor, 5600);
});

check('açılış borcu en son ekstreden sonra girildiyse açılış modeli kalır; 0 ise ekstre esas alınır', () => {
  const newer = computeCardDebt({ ...card, opening_balance_minor: 9000, created_at: '2026-09-20T09:00:00' },
    [tx('expense', 1000, '2026-09-22')], [statement('s1', 10000, '2026-09-25')], [], TODAY);
  assert.equal(newer.anchor, null);
  assert.equal(newer.debtMinor, 10000);
  const zero = computeCardDebt({ ...card, created_at: '2026-09-20T09:00:00' },
    [tx('expense', 1000, '2026-09-22')], [statement('s1', 10000, '2026-09-25')], [], TODAY);
  assert.equal(zero.anchor.statementId, 's1');
  assert.equal(zero.debtMinor, 11000);
});

check('nakit avans: kesimden sonra çekilenin kalanı eklenir, öncesi ekstrededir', () => {
  const r = computeCardDebt(card, [], [statement('s1', 10000, '2026-09-25')], [
    { remaining_amount_minor: 1500, created_at: '2026-09-10T10:00:00', status: 'bekliyor' },
    { remaining_amount_minor: 2500, created_at: '2026-09-18T10:00:00', status: 'bekliyor' },
    { remaining_amount_minor: 9999, created_at: '2026-09-19T10:00:00', status: 'iptal_edildi' },
  ], TODAY);
  assert.equal(r.debtMinor, 12500);
});

check('karttan karta/iade: karta gelen gelir borcu düşürür, karttan çıkan transfer artırır', () => {
  const r = computeCardDebt(card, [tx('income', 300, '2026-09-20'), { account_id: 'card', transfer_to_account_id: 'bank', direction: 'transfer', amount_minor: 800, occurred_at: '2026-09-21T10:00:00' }],
    [statement('s1', 1000, '2026-09-25')], [], TODAY);
  assert.equal(r.debtMinor, 1000 - 300 + 800);
});

check('bekleyen taksitler: ekstrenin kesim ayı ve öncesi ekstrededir', () => {
  const purchases = [{ total_minor: 3000, installment_count: 3, first_statement_month: '2026-09-01' }];
  assert.equal(pendingInstallmentMinor(purchases, '2026-09-15'), 2000);
  assert.equal(pendingInstallmentMinor(purchases, '2026-10-15'), 1000);
  assert.equal(pendingInstallmentMinor(purchases, null, new Date(2026, 9, 5)), 2000);
  assert.equal(pendingInstallmentMinor(purchases, '2026-11-15'), 0);
});

console.log(`${passed} card debt checks passed. No network or database access.`);

/* global __dirname */
// Kredi kartı "ekstre çapası" borç hesabı (utils/cardDebt.ts) ve bekleyen taksitler
// (features/cardInstallments/api.ts pendingInstallmentMinor). Saf fonksiyonlar; ağ/veritabanı yok.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const i18next = require('i18next').createInstance();
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
    if (spec === '@/i18n') return { t: i18next.t.bind(i18next) };
    const loadLocal = (base) => load(fs.existsSync(path.join(root, base + '.ts')) ? base + '.ts' : path.join(base, 'index.ts'));
    if (spec.startsWith('@/')) return loadLocal(spec.slice(2));
    if (spec.startsWith('.')) return loadLocal(path.relative(root, path.resolve(path.dirname(file), spec)));
    return require(spec);
  };
  new Function('require', 'module', 'exports', outputText)(req, mod, mod.exports);
  return mod.exports;
}
i18next.init({ resources: { tr: { translation: load('i18n/locales/tr/index.ts').tr } }, lng: 'tr', fallbackLng: 'tr', initAsync: false, interpolation: { escapeValue: false } });
const { computeCardDebt, statementCutoff } = load('utils/cardDebt.ts');
const { parseMinimumPaymentRate, estimateRemainingMinimumPayment } = load('utils/cardMinimumPayment.ts');
const { pendingInstallmentMinor } = load('features/cardInstallments/api.ts');
const { projectCardStatements, projectCardLedger } = load('supabase/functions/_shared/cardLedger.ts');

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

check('asgari oran isteğe bağlı; iki dilin ondalık ayıracı ve yüzde sınırları', () => {
  for (const input of ['', ' ', '0', '-20', '100.01', '101', '20%', 'abc', '1.234', '1,234', '1e1']) {
    assert.equal(parseMinimumPaymentRate(input), null, input);
  }
  for (const [input, expected] of [['20', 20], ['40', 40], ['20,25', 20.25], ['20.25', 20.25], ['100', 100], ['0,01', 0.01]]) {
    assert.equal(parseMinimumPaymentRate(input), expected, input);
  }
});

const minimum = (total, remaining, rate = 20) => estimateRemainingMinimumPayment({ statementTotalMinor: total, statementRemainingMinor: remaining }, rate);
check('ekstre veya oran yoksa asgari uydurulmaz', () => {
  assert.equal(estimateRemainingMinimumPayment(null, 20), null);
  for (const rate of [null, undefined, 0, -20, 101, NaN, Infinity]) {
    assert.equal(estimateRemainingMinimumPayment({ statementTotalMinor: 1000000, statementRemainingMinor: 1000000 }, rate), null);
  }
});

check('asgari kalan borcun yüzdesi değil, ekstre asgarisinden ödenen tutarın kalanıdır', () => {
  assert.equal(minimum(1000000, 1000000), 200000);
  assert.equal(minimum(1000000, 900000), 100000);
  assert.equal(minimum(1000000, 800000), 0);
  assert.equal(minimum(1000000, 500000), 0);
  assert.equal(minimum(1000000, 0), 0);
  assert.equal(minimum(1000000, 900000, 100), 900000);
});

check('asgari kuruşa yuvarlanır, negatif ödeme veya kalan üretmez', () => {
  assert.equal(minimum(100005, 100005, 20.25), 20251);
  assert.equal(minimum(0, 0), 0);
  assert.equal(minimum(1000, -500), 0);
});

check('ilk ekstre kartın borcuna bir kez girer; kesim sonrası harcamalar asgariyi artırmaz', () => {
  const newCard = { ...card, created_at: '2026-09-20T09:00:00' };
  const first = statement('first', 1000000, '2026-09-25');
  const initial = computeCardDebt(newCard, [], [], [], TODAY);
  assert.equal(initial.debtMinor, 0);
  assert.equal(initial.anchor, null);
  const entered = computeCardDebt(newCard, [], [first], [], TODAY);
  assert.equal(entered.debtMinor, 1000000);
  assert.equal(estimateRemainingMinimumPayment(entered.anchor, 20), 200000);
  const later = computeCardDebt(newCard, [tx('expense', 500000, '2026-09-21')], [first], [], TODAY);
  assert.equal(later.debtMinor, 1500000);
  assert.equal(estimateRemainingMinimumPayment(later.anchor, 20), 200000);
});

check('eski 50.000 açılış borcu ve 25.000 ekstre üst üste eklenmez; 35.000 harcama toplamı 85.000 yapar', () => {
  const legacy = { ...card, opening_balance_minor: 5000000, created_at: '2026-09-20T09:00:00' };
  const oldStatement = statement('old', 2500000, '2026-09-25');
  assert.equal(computeCardDebt(legacy, [], [oldStatement], [], TODAY).debtMinor, 5000000);
  assert.equal(computeCardDebt(legacy, [tx('expense', 3500000, '2026-09-22')], [oldStatement], [], TODAY).debtMinor, 8500000);
  assert.deepEqual(computeCardDebt(legacy, [], [{ ...oldStatement, statement_date: null }], [], TODAY),
    computeCardDebt(legacy, [], [oldStatement], [], TODAY));
});

check('yeni ekstre gerçek kesim tarihini kullanır; kart ayarları değişince tarih kaymaz', () => {
  const changed = { ...card, statement_day: 5, payment_due_day: 16 };
  const dated = statement('dated', 2500000, '2026-09-27', { statement_date: '2026-09-17' });
  const result = computeCardDebt(changed, [tx('expense', 50000, '2026-09-16'), tx('expense', 100000, '2026-09-18')], [dated], [], TODAY);
  assert.equal(result.anchor.cutoffDate, '2026-09-17');
  assert.equal(result.anchor.cutoffEstimated, false);
  assert.equal(result.debtMinor, 2600000);
});

const ledgerStatements = (payments = [], oldRemaining = 2500000) => [
  statement('old', 2500000, '2026-09-25', { remaining_amount_minor: oldRemaining, payments }),
  statement('new', 6000000, '2026-10-25', { payments: [], created_at: '2026-10-16T12:00:00' }),
];
const ledgerToday = '2026-10-20';
const credit = (amount, day, isTransfer = true) => ({ id: 'payment', amount_minor: amount, paid_at: `${day}T12:00:00`, transaction: isTransfer ? { transfer_to_account_id: card.id } : null });
const dueSum = (result) => result.statementProjections.reduce((sum, row) => sum + row.dueMinor, 0);

check('ödenmeyen 25.000 sonraki 60.000 ekstresinde yeniden sayılmaz; geçmiş vade korunur', () => {
  const result = computeCardDebt(card, [], ledgerStatements(), [], ledgerToday);
  assert.equal(result.debtMinor, 6000000);
  assert.equal(result.anchor.statementRemainingMinor, 6000000);
  assert.deepEqual(result.statementProjections.map((row) => [row.statementId, row.dueMinor, row.dueDate]),
    [['old', 2500000, '2026-09-25'], ['new', 3500000, '2026-10-25']]);
  assert.equal(dueSum(result), result.debtMinor);
});

check('eski ekstreye dağıtılmış 10.000 ödeme güncel ekstreyi ve kartı bir kez azaltır', () => {
  const result = computeCardDebt(card, [payIn(1000000, '2026-10-20')], ledgerStatements([credit(1000000, '2026-10-20')], 1500000), [], ledgerToday);
  assert.equal(result.debtMinor, 5000000);
  assert.equal(result.anchor.statementRemainingMinor, 5000000);
  assert.equal(dueSum(result), 5000000);
  assert.deepEqual(result.statementProjections.map((row) => row.dueMinor), [1500000, 3500000]);
  assert.equal(estimateRemainingMinimumPayment(result.anchor, 20), 200000);
});

check('hesapsız eski ekstre ödemesi de güncel kartı ve ekstreyi azaltır', () => {
  const result = computeCardDebt(card, [], ledgerStatements([credit(1000000, '2026-10-20', false)], 1500000), [], ledgerToday);
  assert.equal(result.debtMinor, 5000000);
  assert.equal(result.anchor.statementRemainingMinor, 5000000);
  assert.equal(dueSum(result), 5000000);
});

check('yeni kesimden önceki ödeme zaten yeni ekstreye dahildir, tekrar düşülmez', () => {
  const result = computeCardDebt(card, [payIn(1000000, '2026-10-10')], ledgerStatements([credit(1000000, '2026-10-10')], 1500000), [], ledgerToday);
  assert.equal(result.debtMinor, 6000000);
  assert.equal(result.anchor.statementRemainingMinor, 6000000);
  assert.deepEqual(result.statementProjections.map((row) => row.dueMinor), [1500000, 4500000]);
});

check('kart ödemesi iki ekstreye bölünse bile tek transferdir; tam ödeme hiçbir borcu geri getirmez', () => {
  const rows = ledgerStatements([credit(2500000, '2026-10-20')], 0);
  rows[1].remaining_amount_minor = 2500000;
  rows[1].payments = [{ ...credit(3500000, '2026-10-20'), id: 'payment2' }];
  const result = computeCardDebt(card, [payIn(6000000, '2026-10-20')], rows, [], ledgerToday);
  assert.equal(result.debtMinor, 0); assert.equal(result.anchor.statementRemainingMinor, 0); assert.equal(dueSum(result), 0);
});

check('sonradan girilen ekstre daha önce yapılmış kesim sonrası kart ödemesini görür', () => {
  const rows = ledgerStatements(); rows[1].created_at = '2026-10-20T12:00:00';
  const result = computeCardDebt(card, [payIn(1000000, '2026-10-18')], rows, [], ledgerToday);
  assert.equal(result.debtMinor, 5000000); assert.equal(result.anchor.statementRemainingMinor, 5000000);
});

check('ekstre sonrası 35.000 harcama kartı artırır; kesilmiş ekstre ve asgariyi artırmaz', () => {
  const result = computeCardDebt(card, [tx('expense', 3500000, '2026-10-20')], ledgerStatements(), [], ledgerToday);
  assert.equal(result.debtMinor, 9500000); assert.equal(result.anchor.statementRemainingMinor, 6000000);
  assert.equal(dueSum(result), 6000000); assert.equal(estimateRemainingMinimumPayment(result.anchor, 20), 1200000);
});

check('iade borcu azaltır; ödeme geri alındığında kayıt silmeden borç geri gelir', () => {
  const refunded = computeCardDebt(card, [tx('income', 1000000, '2026-10-20')], ledgerStatements(), [], ledgerToday);
  assert.equal(refunded.debtMinor, 5000000); assert.equal(refunded.anchor.statementRemainingMinor, 5000000);
  const restored = computeCardDebt(card, [], ledgerStatements(), [], ledgerToday);
  assert.equal(restored.debtMinor, 6000000); assert.equal(dueSum(restored), 6000000);
});

check('gelecekteki ödeme ve henüz kesilmemiş ekstre bugünkü borcu değiştirmez', () => {
  const rows = ledgerStatements([credit(1000000, '2026-10-21')], 1500000);
  rows.push(statement('future', 9000000, '2026-11-25', { payments: [] }));
  const result = computeCardDebt(card, [payIn(1000000, '2026-10-21')], rows, [], ledgerToday);
  assert.equal(result.debtMinor, 6000000); assert.equal(dueSum(result), 6000000);
  assert.equal(result.statementProjections.find((row) => row.statementId === 'future').dueMinor, 0);
});

check('yeni banka özeti azaldığında eski borcu yeniden eklemez ve sahte ödeme oluşturmaz', () => {
  const rows = ledgerStatements(); rows[1].total_amount_minor = 1000000; rows[1].remaining_amount_minor = 1000000;
  const before = JSON.stringify(rows);
  const result = computeCardDebt(card, [], rows, [], ledgerToday);
  assert.equal(result.debtMinor, 1000000); assert.equal(dueSum(result), 1000000); assert.equal(JSON.stringify(rows), before);
});

check('eski açılış bakiyesi ve geçmiş veriler korunur; ekstre özeti ayrı okunabilir', () => {
  const legacy = { ...card, opening_balance_minor: 5000000, created_at: '2026-09-20T12:00:00' };
  const row = statement('old', 2500000, '2026-09-25', { payments: [] });
  const before = JSON.stringify(legacy);
  const result = computeCardDebt(legacy, [tx('expense', 3500000, '2026-09-22')], [row], [], TODAY);
  assert.equal(result.debtMinor, 8500000); assert.equal(result.anchor, null);
  assert.equal(result.paymentAnchor.statementRemainingMinor, 2500000); assert.equal(JSON.stringify(legacy), before);
});

check('aynı kesim tarihli eski mükerrer ekstreler bağımsız borç değildir', () => {
  const rows = ledgerStatements(); rows.push({ ...rows[1], id: 'newer-duplicate', created_at: '2026-10-20T12:00:00' });
  const result = projectCardStatements(card, [], rows, ledgerToday);
  assert.equal(result.active.statementId, 'newer-duplicate');
  assert.equal(result.statements.reduce((sum, row) => sum + row.dueMinor, 0), 6000000);
});

check('eşzamanlı okumada ödeme ilişkisi eksik transferi tamamlar, aynı transferi iki kez düşmez', () => {
  const transfer = { ...payIn(1000000, '2026-10-20'), id: 'transfer' };
  const rows = ledgerStatements([{ ...credit(1000000, '2026-10-20'), transaction: transfer }], 1500000);
  const missing = projectCardLedger(card, [], rows, [], ledgerToday);
  const present = projectCardLedger(card, [transfer], rows, [], ledgerToday);
  assert.equal(missing.debtMinor, 5000000);
  assert.equal(missing.paymentAnchor.statementRemainingMinor, 5000000);
  assert.deepEqual(missing, present);
});

check('ekstresiz kartta geleceğe girilmiş harcama bugünün borcuna eklenmez', () => {
  const result = projectCardLedger(card, [tx('expense', 3500000, '2026-10-21')], [], [], ledgerToday);
  assert.equal(result.debtMinor, 0);
  assert.equal(result.paymentAnchor, null);
});

check('eski mükerrer dönemlerde ödeme kaydı olmayan ilerleme iki kez sayılmaz', () => {
  const rows = ledgerStatements();
  rows[1].remaining_amount_minor = 5000000;
  rows.push({ ...rows[1], id: 'duplicate', created_at: '2026-10-20T12:00:00' });
  const result = projectCardLedger(card, [], rows, [], ledgerToday);
  assert.equal(result.debtMinor, 5000000);
  assert.equal(result.statementProjections.reduce((sum, row) => sum + row.dueMinor, 0), 5000000);
});

console.log(`${passed} card debt checks passed. No network or database access.`);

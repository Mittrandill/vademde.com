/* global __dirname */
// Kart son ödemesinin takvim/toplam borç kalemi (features/accounts/cardDues.ts buildCardDueItems).
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const i18next = require('i18next').createInstance();
const root = path.resolve(__dirname, '..');
const cache = new Map();
const STUBS = {
  '@/i18n': { t: i18next.t.bind(i18next), useLanguage: () => i18next.language },
  react: { useMemo: (fn) => fn() },
  '@tanstack/react-query': { useQuery: () => ({}) },
  '@/services/supabase': { supabase: {} },
  '@/services/fetchAll': { fetchAll: async () => [] },
  '@/services/queryKeys': { queryKeys: {} },
  '@/features/accounts/api': {},
  '@/features/reports/api': {},
  '@/features/obligations/api': {
    ACTIVE_OBLIGATION_STATUSES: ['taslak', 'inceleme_gerekli', 'bekliyor', 'kismen_odendi', 'gecikti', 'kismen_tahsil_edildi'],
  },
};
function load(rel) {
  const file = path.join(root, rel);
  if (cache.has(file)) return cache.get(file).exports;
  const source = fs.readFileSync(file, 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const mod = { exports: {} };
  cache.set(file, mod);
  const req = (spec) => {
    if (STUBS[spec]) return STUBS[spec];
    const loadLocal = (base) => load(fs.existsSync(path.join(root, base + '.ts')) ? base + '.ts' : path.join(base, 'index.ts'));
    if (spec.startsWith('@/')) return loadLocal(spec.slice(2));
    if (spec.startsWith('.')) return loadLocal(path.relative(root, path.resolve(path.dirname(file), spec)));
    return require(spec);
  };
  new Function('require', 'module', 'exports', outputText)(req, mod, mod.exports);
  return mod.exports;
}
i18next.init({ resources: {
  tr: { translation: load('i18n/locales/tr/index.ts').tr },
  en: { translation: load('i18n/locales/en/index.ts').en },
}, lng: 'tr', fallbackLng: 'tr', initAsync: false, interpolation: { escapeValue: false } });
const { buildCardDueItems, nextCardDue } = load('features/accounts/cardDues.ts');
const { computeCardDebt } = load('utils/cardDebt.ts');

let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }

const card = { id: 'c1', workspace_id: 'w', name: 'Bonus', type: 'credit_card', bank_code: 'garanti', currency_code: 'TRY', statement_day: 15, payment_due_day: 25, created_at: '2026-08-01T09:00:00' };
const bal = (minor, id = 'c1') => ({ accountId: id, name: '', type: 'credit_card', bankCode: null, currencyCode: 'TRY', balanceMinor: minor });

check('dil değişiminde kart vadesi başlığı güncellenir; hesap adı ve tutar korunur', () => {
  const args = [[{ ...card, name: 'Özel Hesabım' }], [bal(1000)], [], '2026-10-19'];
  const [tr] = buildCardDueItems(...args);
  assert.equal(tr.title, 'Özel Hesabım son ödeme');
  i18next.changeLanguage('en');
  const [en] = buildCardDueItems(...args);
  assert.equal(en.title, 'Özel Hesabım payment due');
  assert.deepEqual({ ...en, title: tr.title }, tr);
  i18next.changeLanguage('tr');
});

check('ekstresiz kart: borç sıradaki son ödeme gününde', () => {
  const [item] = buildCardDueItems([card], [bal(500000)], [], '2026-10-19');
  assert.equal(item.due_date, '2026-10-25');
  assert.equal(item.remaining_amount_minor, 500000);
  assert.equal(item.card_due_account_id, 'c1');
  assert.equal(item.direction, 'payable');
});

check('son ödeme geçtiyse bir sonraki aya', () => {
  const [item] = buildCardDueItems([card], [bal(1000)], [], '2026-10-26');
  assert.equal(item.due_date, '2026-11-25');
});

check('kesim sonrası ödeme günü sonraki aya sarkar (kesim 28, ödeme 8)', () => {
  const [item] = buildCardDueItems([{ ...card, statement_day: 28, payment_due_day: 8 }], [bal(1000)], [], '2026-10-19');
  assert.equal(item.due_date, '2026-11-08');
});

check('borç yoksa kalem yok', () => {
  assert.equal(buildCardDueItems([card], [bal(0)], [], '2026-10-19').length, 0);
  assert.equal(buildCardDueItems([card], [bal(-500)], [], '2026-10-19').length, 0);
});

check('açık ekstre kalanı düşülür, kalan borç ekstresiz döneme', () => {
  const st = { account_id: 'c1', due_date: '2026-10-25', status: 'bekliyor', remaining_amount_minor: 300000 };
  const [item] = buildCardDueItems([card], [bal(450000)], [st], '2026-10-19');
  assert.equal(item.remaining_amount_minor, 150000);
  assert.equal(item.due_date, '2026-11-25');
});

check('borcun tamamı açık ekstredeyse kalem yok (çift sayma yok)', () => {
  const st = { account_id: 'c1', due_date: '2026-10-25', status: 'kismen_odendi', remaining_amount_minor: 300000 };
  assert.equal(buildCardDueItems([card], [bal(300000)], [st], '2026-10-19').length, 0);
});

check('ödenmiş ekstrenin dönemi atlanır, kalanı sayılmaz', () => {
  const st = { account_id: 'c1', due_date: '2026-10-25', status: 'odendi', remaining_amount_minor: 0 };
  const [item] = buildCardDueItems([card], [bal(80000)], [st], '2026-10-19');
  assert.equal(item.due_date, '2026-11-25');
  assert.equal(item.remaining_amount_minor, 80000);
});

check('kesim günü yok, ödeme günü var', () => {
  const [item] = buildCardDueItems([{ ...card, statement_day: null, payment_due_day: 5 }], [bal(1000)], [], '2026-10-19');
  assert.equal(item.due_date, '2026-11-05');
});

check('gün bilgisi yoksa tarih null ama toplam borca girer', () => {
  const [item] = buildCardDueItems([{ ...card, statement_day: null, payment_due_day: null }], [bal(1000)], [], '2026-10-19');
  assert.equal(item.due_date, null);
  assert.equal(item.remaining_amount_minor, 1000);
});

check('kart olmayan hesap yok sayılır', () => {
  assert.equal(buildCardDueItems([{ ...card, type: 'bank' }], [bal(1000)], [], '2026-10-19').length, 0);
});

// --- Dönemlere dağıtım: ödenmeyen dönem silinmez, toplam güncel borca eşit kalır ---
const opening = (minor, day) => ({ day, amountMinor: minor, isOpening: true });
const spend = (minor, day) => ({ day, amountMinor: minor, isOpening: false });
const balWith = (minor, charges) => ({ ...bal(minor), cardCharges: charges });
const sum = (items) => items.reduce((s, i) => s + i.remaining_amount_minor, 0);
const brief = (items) => items.map((i) => [i.due_date, i.remaining_amount_minor, i.status]);

check('ödenmeyen dönem son ödeme günü geçince silinmez, gecikti olarak kalır', () => {
  const items = buildCardDueItems([card], [balWith(500000, [opening(500000, '2026-10-16')])], [], '2026-10-26');
  assert.deepEqual(brief(items), [['2026-10-25', 500000, 'gecikti']]);
});

check('gecikmiş dönem + yeni dönem harcaması: iki kalem, toplam = borç (çift sayma yok)', () => {
  const charges = [opening(500000, '2026-10-16'), spend(100000, '2026-10-20')];
  const items = buildCardDueItems([card], [balWith(600000, charges)], [], '2026-10-26');
  assert.deepEqual(brief(items), [['2026-10-25', 500000, 'gecikti'], ['2026-11-25', 100000, 'bekliyor']]);
  assert.equal(sum(items), 600000);
  assert.equal(new Set(items.map((i) => i.id)).size, 2);
});

check('kısmi ödeme en eski dönemden düşer', () => {
  const charges = [opening(500000, '2026-10-16'), spend(100000, '2026-10-20')];
  const items = buildCardDueItems([card], [balWith(400000, charges)], [], '2026-10-26');
  assert.deepEqual(brief(items), [['2026-10-25', 300000, 'gecikti'], ['2026-11-25', 100000, 'bekliyor']]);
});

check('geciken dönem ödenince yalnızca sonraki dönem kalır', () => {
  const charges = [opening(500000, '2026-10-16'), spend(100000, '2026-10-20')];
  const items = buildCardDueItems([card], [balWith(100000, charges)], [], '2026-10-26');
  assert.deepEqual(brief(items), [['2026-11-25', 100000, 'bekliyor']]);
});

check('güncel borç sonradan yeniden girilirse eski dönemle toplanmaz', () => {
  const items = buildCardDueItems([card], [balWith(700000, [opening(700000, '2026-11-10')])], [], '2026-11-12');
  assert.deepEqual(brief(items), [['2026-11-25', 700000, 'bekliyor']]);
});

check('kesim günü harcaması o dönemin ekstresine girer, ertesi gün sonrakine', () => {
  const charges = [spend(1000, '2026-10-15'), spend(2000, '2026-10-16')];
  const items = buildCardDueItems([card], [balWith(3000, charges)], [], '2026-10-19');
  assert.deepEqual(brief(items), [['2026-10-25', 1000, 'bekliyor'], ['2026-11-25', 2000, 'bekliyor']]);
});

check('ekstresi girilmiş döneme düşen kalem bir sonraki ekstresiz döneme kayar', () => {
  const st = { account_id: 'c1', due_date: '2026-10-25', status: 'bekliyor', remaining_amount_minor: 300000 };
  const items = buildCardDueItems([card], [balWith(350000, [spend(50000, '2026-10-10')])], [st], '2026-10-19');
  assert.deepEqual(brief(items), [['2026-11-25', 50000, 'bekliyor']]);
});

check('kalemlerle açıklanamayan borç sıradaki son ödemeye eklenir', () => {
  const items = buildCardDueItems([card], [balWith(1500, [spend(1000, '2026-10-20')])], [], '2026-10-26');
  assert.deepEqual(brief(items), [['2026-11-25', 1500, 'bekliyor']]);
});

check('computeCardDebt kalemleriyle uçtan uca: ekstresiz kart, ödeme yapılmamış', () => {
  const account = { ...card, opening_balance_minor: 500000, created_at: '2026-10-16T12:00:00', opening_balance_set_at: null };
  const txs = [{ account_id: 'c1', transfer_to_account_id: null, direction: 'expense', amount_minor: 100000, occurred_at: '2026-10-20T10:00:00' }];
  const { debtMinor, charges } = computeCardDebt(account, txs, [], [], '2026-10-26');
  const items = buildCardDueItems([card], [{ ...bal(debtMinor), cardCharges: charges }], [], '2026-10-26');
  assert.deepEqual(brief(items), [['2026-10-25', 500000, 'gecikti'], ['2026-11-25', 100000, 'bekliyor']]);
});

check('computeCardDebt: açılış bakiyesi tarihi opening_balance_set_at, yoksa created_at', () => {
  const account = { ...card, opening_balance_minor: 1000, created_at: '2026-08-01T09:00:00', opening_balance_set_at: '2026-11-10T09:00:00' };
  assert.equal(computeCardDebt(account, [], [], [], '2026-11-12').charges[0].day, '2026-11-10');
  assert.equal(computeCardDebt({ ...account, opening_balance_set_at: null }, [], [], [], '2026-11-12').charges[0].day, '2026-08-01');
});

check('hatırlatma için sıradaki son ödeme gecikmiş dönemi atlar', () => {
  const charges = [opening(500000, '2026-10-16'), spend(100000, '2026-10-20')];
  const items = buildCardDueItems([card], [balWith(600000, charges)], [], '2026-10-26');
  assert.equal(nextCardDue(items, 'c1', '2026-10-26').due_date, '2026-11-25');
  assert.equal(nextCardDue(buildCardDueItems([card], [balWith(500000, [opening(500000, '2026-10-16')])], [], '2026-10-26'), 'c1', '2026-10-26'), null);
});

console.log(`\n${passed} test geçti`);

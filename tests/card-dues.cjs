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
const { buildCardDueItems } = load('features/accounts/cardDues.ts');

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

console.log(`\n${passed} test geçti`);

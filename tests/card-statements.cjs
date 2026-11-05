/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const i18next = require('i18next').createInstance();
const root = path.resolve(__dirname, '..');
const cache = new Map();
let initial = null, plan = [], duplicates = [], writes = [], writeError = null, changed = false;
let account = { id: 'card', workspace_id: 'workspace', type: 'credit_card', is_archived: false,
  name: 'My Card', bank_code: 'bank', currency_code: 'TRY', statement_day: 28, payment_due_day: 8 };
const supabase = { from: (table) => {
  assert.equal(table, 'obligations');
  let update;
  const filters = {};
  const q = { select: () => q, update: (data) => { update = data; return q; },
    eq: (key, value) => { filters[key] = value; return q; }, neq: () => q, order: () => q,
    maybeSingle: async () => {
      if (changed) return { data: null, error: null };
      assert.equal(filters.workspace_id, initial.workspace_id);
      assert.equal(filters.remaining_amount_minor, initial.remaining_amount_minor);
      assert.equal(filters.total_amount_minor, initial.total_amount_minor);
      assert.equal(filters.status, initial.status);
      writes.push(['update', filters.id, update]); return { data: { ...initial, ...update }, error: null };
    },
    range: async () => ({ data: duplicates, error: null }) };
  return q;
} };
function load(rel) {
  const file = path.join(root, rel);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} }; cache.set(file, mod);
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const req = (name) => {
    if (name === '@/services/supabase') return { supabase };
    if (name === '@/i18n') return { t: i18next.t.bind(i18next) };
    if (name === '@/i18n/format') return {
      capitalizeUi: (value) => value[0].toLocaleUpperCase(i18next.language) + value.slice(1),
      localeDateFormatter: (options) => ({ format: (value) => new Intl.DateTimeFormat(i18next.language === 'en' ? 'en-US' : 'tr-TR', options).format(value) }),
    };
    if (name === '@/features/accounts/api') return { getAccount: async () => account };
    if (name === '@/features/obligations/api') return {
      getObligationWithInstallments: async () => ({ obligation: initial, installments: plan }),
      createObligation: async (data) => { if (writeError) throw writeError; writes.push(['create', data]); return { id: 'new', ...data }; },
      updateObligation: async (id, data) => { if (writeError) throw writeError; writes.push(['update', id, data]); return { ...initial, ...data }; },
    };
    const local = name.startsWith('@/') ? name.slice(2) : name.startsWith('.') ? path.relative(root, path.resolve(path.dirname(file), name)) : null;
    if (local) return load(fs.existsSync(path.join(root, local + '.ts')) ? local + '.ts' : path.join(local, 'index.ts'));
    return require(name);
  };
  new Function('require', 'module', 'exports', output)(req, mod, mod.exports);
  return mod.exports;
}
i18next.init({ resources: {
  tr: { translation: { accounts: load('i18n/locales/tr/accounts.ts').accounts } },
  en: { translation: { accounts: load('i18n/locales/en/accounts.ts').accounts } },
}, lng: 'tr', fallbackLng: 'tr', initAsync: false, interpolation: { escapeValue: false } });

const { saveCardStatement, cardStatementTitle } = load('features/accounts/statements.ts');
const { validateStatementDates, latestClosedStatementPeriod } = load('utils/cardStatementForm.ts');
const { periodKeyForStatement } = load('utils/creditCardPeriod.ts');
const { calendarMarkerKinds, calendarMarkerColor } = load('utils/calendarMarker.ts');
const colors = { danger: '#ff0000', success: '#00ff00', accentViolet: '#800080', attentionMarker: '#ffff00', accentAqua: '#00ffff' };
const input = { workspaceId: 'workspace', accountId: 'card', period: '2026-10', statementDate: '2026-10-28', dueDate: '2026-11-08', totalMinor: 2500000 };
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log('PASS', name); }

(async () => {
  await check('cutoff validation: future dates, invalid dates, month, due date, month-end and latest closed period', () => {
    assert.equal(validateStatementDates('2026-11', '2026-11-28', '2026-12-08', '2026-11-05'), 'notClosed');
    assert.equal(validateStatementDates('2026-02', '2026-02-30', '2026-03-08', '2026-11-05'), 'invalidDates');
    assert.equal(validateStatementDates('2026-11', '2026-10-28', '2026-12-08', '2026-11-05'), 'wrongPeriod');
    assert.equal(validateStatementDates('2026-10', '2026-10-28', '2026-10-27', '2026-11-05'), 'dueAfterCutoff');
    assert.equal(validateStatementDates('2026-10', '2026-10-28', '2026-11-08', '2026-11-05'), null);
    assert.equal(latestClosedStatementPeriod(account, new Date(2026, 10, 5)), '2026-10');
    assert.equal(latestClosedStatementPeriod(account, new Date(2026, 10, 28)), '2026-11');
    assert.equal(latestClosedStatementPeriod({ statement_day: 31, payment_due_day: 8 }, new Date(2026, 1, 28)), '2026-02');
  });
  await check('TR/EN automatic titles retain card name and closing month', async () => {
    assert.equal(cardStatementTitle('My Card', '2026-11'), 'My Card · Kasım 2026 Ekstre Borcu');
    await i18next.changeLanguage('en');
    assert.equal(cardStatementTitle('My Card', '2026-11'), 'My Card · November 2026 Statement Balance');
    await i18next.changeLanguage('tr');
  });
  await check('new statement is a single record: no opening balance, transaction, installment or category', async () => {
    const before = JSON.stringify(account);
    await saveCardStatement(input);
    assert.equal(writes.length, 1);
    assert.equal(writes[0][0], 'create');
    const data = writes[0][1];
    assert.equal(data.total_amount_minor, 2500000);
    assert.equal(data.category_id, null); assert.equal(data.bank_code, account.bank_code);
    assert.equal(data.account_id, account.id); assert.equal(data.statement_date, '2026-10-28');
    assert.ok(!Object.hasOwn(data, 'opening_balance_minor'));
    assert.ok(!Object.hasOwn(data, 'remaining_amount_minor'));
    assert.equal(JSON.stringify(account), before);
  });
  await check('legacy statement blocks duplicate even without stored closing date', async () => {
    duplicates = [{ id: 'old', due_date: '2026-11-08', statement_date: null }];
    await assert.rejects(saveCardStatement(input), /zaten var/);
    assert.equal(writes.length, 1); duplicates = [];
  });
  await check('database unique conflict is reported as a duplicate, never retried as another debt', async () => {
    writeError = { code: '23505' }; await assert.rejects(saveCardStatement(input), /zaten var/); writeError = null;
    assert.equal(writes.length, 1);
  });
  await check('statement edit preserves legacy category, bank, payments, remaining amount and unrelated fields', async () => {
    initial = { id: 'old', workspace_id: 'workspace', account_id: 'card', document_type: 'kredi_karti_ekstresi', status: 'kismen_odendi',
      total_amount_minor: 2500000, remaining_amount_minor: 2000000, category_id: 'old-category', bank_code: 'old-bank', notes: 'Keep me' };
    const result = await saveCardStatement({ ...input, id: 'old', totalMinor: 3000000 });
    assert.deepEqual(Object.keys(writes.at(-1)[2]).sort(), ['due_date', 'statement_date', 'title', 'total_amount_minor']);
    assert.equal(result.category_id, 'old-category'); assert.equal(result.bank_code, 'old-bank'); assert.equal(result.notes, 'Keep me');
    assert.equal(result.remaining_amount_minor, 2000000);
  });
  await check('paid amounts and historical installment plans cannot be silently removed', async () => {
    const count = writes.length;
    await assert.rejects(saveCardStatement({ ...input, id: 'old', totalMinor: 100000 }), /ödemelerden az/);
    plan = [{ id: 'keep-plan' }];
    await assert.rejects(saveCardStatement({ ...input, id: 'old' }), /taksit planı/); plan = [];
    assert.equal(writes.length, count);
  });
  await check('concurrent payment/edit fails safely without overwriting the changed row', async () => {
    const count = writes.length; changed = true;
    await assert.rejects(saveCardStatement({ ...input, id: 'old' }), /ödemeleri değişti/);
    changed = false; assert.equal(writes.length, count);
  });
  await check('archived cards keep historical editing; new statements on archived cards are rejected', async () => {
    account = { ...account, is_archived: true };
    await assert.rejects(saveCardStatement(input), /geçerli bir kredi kartı/);
    await saveCardStatement({ ...input, id: 'old' });
    account = { ...account, is_archived: false };
  });
  await check('wrong workspace, non-card accounts and invalid amounts fail without writes', async () => {
    const count = writes.length;
    for (const totalMinor of [0, -1, 1.5, NaN, Infinity]) await assert.rejects(saveCardStatement({ ...input, totalMinor }));
    await assert.rejects(saveCardStatement({ ...input, workspaceId: 'other' }));
    account = { ...account, type: 'bank' }; await assert.rejects(saveCardStatement(input)); account = { ...account, type: 'credit_card' };
    assert.equal(writes.length, count);
  });
  await check('explicit statement month survives changed card settings; NULL uses legacy inference', () => {
    assert.equal(periodKeyForStatement(account, { statement_date: '2026-10-28', due_date: '2026-11-09' }), '2026-10');
    assert.equal(periodKeyForStatement({ statement_day: 1, payment_due_day: 9 }, { statement_date: '2026-10-28', due_date: '2026-11-09' }), '2026-10');
    assert.equal(periodKeyForStatement(account, { statement_date: null, due_date: '2026-11-08' }), '2026-10');
  });
  await check('one mixed calendar color: orange for payable loan; green/purple for receivable cheque', () => {
    const loan = calendarMarkerKinds([{ direction: 'payable', document_type: 'kredi' }]);
    assert.deepEqual(loan, ['Payable', 'Loan']); assert.equal(calendarMarkerColor(loan, colors), '#ff8000');
    const cheque = calendarMarkerKinds([{ direction: 'receivable', document_type: 'cek' }]);
    assert.equal(calendarMarkerColor(cheque, colors), '#408040');
    assert.deepEqual(calendarMarkerKinds([{ direction: 'payable', document_type: 'kredi_karti_ekstresi' }]), ['Payable', 'CreditCard']);
    assert.equal(calendarMarkerColor([], colors), null);
    assert.equal(calendarMarkerColor([...loan, ...loan], colors), '#ff8000');
  });
  console.log(`${passed} statement and calendar checks passed; no live database writes.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });

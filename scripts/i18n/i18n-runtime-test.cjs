// i18n/locales'i TypeScript'ten derleyip gerçek i18next ile çözer: çoğul, değişken, eksik anahtar.
const fs = require('fs');
const path = require('path');
const Module = require('module');
const assert = require('node:assert/strict');
const root = process.argv[2];
const ts = require(path.join(root, 'node_modules/typescript'));
const i18next = require(path.join(root, 'node_modules/i18next')).default ?? require(path.join(root, 'node_modules/i18next'));

const cache = {};
function load(file) {
  if (cache[file]) return cache[file].exports;
  const src = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  cache[file] = mod;
  const req = (id) => {
    if (id === '@/i18n' || (id === './index' && file === path.join(root, 'i18n/format.ts'))) {
      return { t: i18next.t.bind(i18next), getLanguage: () => i18next.language, getLocaleTag: () => i18next.language === 'en' ? 'en-US' : 'tr-TR' };
    }
    if (id === 'expo-localization') return { getLocales: () => [{ decimalSeparator: ',' }] };
    if (id === 'expo-print' || id === 'expo-sharing') return {};
    if (id === 'react-native') return { Alert: { alert() {} }, InteractionManager: { runAfterInteractions() {} } };
    if (id === 'expo-router') return { router: { push() {} } };
    if (id.endsWith('.png')) return id;
    if (id.startsWith('@/')) return load(path.join(root, id.slice(2) + '.ts'));
    if (id.startsWith('.')) {
      const base = path.resolve(path.dirname(file), id);
      return load(fs.existsSync(base + '.ts') ? base + '.ts' : path.join(base, 'index.ts'));
    }
    return require(id);
  };
  new Function('require', 'module', 'exports', js)(req, mod, mod.exports);
  return mod.exports;
}

const { tr } = load(path.join(root, 'i18n/locales/tr/index.ts'));
const { en } = load(path.join(root, 'i18n/locales/en/index.ts'));

// Anahtar ağaçlarının birebir aynı olduğunu doğrula (TS zaten zorlar; çalışma anı için ikinci kontrol).
function keys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => (typeof v === 'string' ? [prefix + k] : keys(v, prefix + k + '.')));
}
const trKeys = new Set(keys(tr));
const enKeys = new Set(keys(en));
const missing = [...trKeys].filter((k) => !enKeys.has(k));
const extra = [...enKeys].filter((k) => !trKeys.has(k));

// Değişken uyuşmazlığı: TR'deki {{x}} EN'de de olmalı (ve tersi).
function lookup(obj, key) { return key.split('.').reduce((o, k) => o?.[k], obj); }
const vars = (s) => new Set([...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]));
const varMismatch = [];
for (const k of trKeys) {
  const a = vars(lookup(tr, k)); const b = vars(lookup(en, k) ?? '');
  const diff = [...a].filter((x) => !b.has(x)).concat([...b].filter((x) => !a.has(x)));
  if (diff.length) varMismatch.push(`${k}: ${diff.join(',')}`);
}

(async () => {
  await i18next.init({ resources: { tr: { translation: tr }, en: { translation: en } }, lng: 'tr', fallbackLng: 'tr', interpolation: { escapeValue: false } });
  // Gerçek biçim yardımcılarını çalıştır; native cihaz bölgesi yalnızca testte sağlanır.
  // Arayüz dili ile klavye ayıracının birbirine bağlanmadığını da doğrular.
  let deviceDecimalSeparator = ',';
  const formatSource = fs.readFileSync(path.join(root, 'i18n/format.ts'), 'utf8');
  const formatJs = ts.transpileModule(formatSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const formatModule = { exports: {} };
  new Function('require', 'module', 'exports', formatJs)((id) => {
    if (id === 'expo-localization') return { getLocales: () => [{ decimalSeparator: deviceDecimalSeparator }] };
    if (id === './index') return { getLocaleTag: () => i18next.language === 'en' ? 'en-US' : 'tr-TR' };
    throw new Error(`Unexpected format dependency: ${id}`);
  }, formatModule, formatModule.exports);
  const { unitForCount, lowerUi, upperUi, formatPercent, getInputDecimalSeparator } = formatModule.exports;
  for (const lng of ['tr', 'en']) {
    await i18next.changeLanguage(lng);
    const english = lng === 'en';
    for (const count of [1, 3]) {
      for (const period of ['monthly', 'installment']) {
        const unit = i18next.t(`domain.installmentUnits.${period}.unit`);
        const dative = i18next.t(`domain.installmentUnits.${period}.unitDative`);
        const unitText = unitForCount(english ? unit : dative, count);
        const split = i18next.t('obligations.form.splitHelp', { count, unit: unitText });
        const expectedUnit = english ? (period === 'monthly' ? 'month' : 'installment') + (count === 1 ? '' : 's') : period === 'monthly' ? 'aya' : 'taksite';
        assert.equal(split, english
          ? `The entered amount is the total debt, split into ${count} ${expectedUnit}.`
          : `Girilen tutar toplam borçtur; ${count} ${expectedUnit} bölünür.`);
        assert.equal(i18next.t('obligations.form.planSummary', { count, unit: unitForCount(lowerUi(unit), count) }), `${count} ${unitForCount(lowerUi(unit), count)} · ${english ? 'Total' : 'Toplam'}`);
      }
      assert.equal(i18next.t('payments.offsetSaved', { count }), english
        ? `${count} ${count === 1 ? 'record was' : 'records were'} offset. No money changed hands.`
        : `${count} kayıt mahsup edildi. Para hareketi oluşmadı.`);
      assert.equal(i18next.t('documentReview.statementExpenses', { count }), english
        ? `STATEMENT EXPENSES (${count} ${count === 1 ? 'transaction' : 'transactions'})`
        : `EKSTRE HARCAMALARI (${count} işlem)`);
    }
    assert.equal(i18next.t('receiptReview.confidence', { percent: formatPercent(85) }), english ? 'OVERALL CONFIDENCE · 85%' : 'GENEL GÜVEN · %85');
    assert.equal(upperUi(english ? 'installment' : 'taksit'), english ? 'INSTALLMENT' : 'TAKSİT');
    for (const separator of [',', '.']) {
      deviceDecimalSeparator = separator;
      assert.equal(getInputDecimalSeparator(), separator);
      assert.equal(i18next.t('documentReview.interestPlaceholder', { amount: `2${getInputDecimalSeparator()}5` }), `${english ? 'e.g.' : 'Örn.'} 2${separator}5`);
    }
  }
  console.log('Finans formları: TR/EN çoğullar, birimler, yüzde ve cihaz giriş ayıracı doğrulandı.');
  const { receiptMatchReasonLabel } = load(path.join(root, 'features/receipts/matchReasons.ts'));
  const { documentWarningEntries, documentWarningText } = load(path.join(root, 'features/documents/warnings.ts'));
  const { CATEGORY_ICON_CHOICES } = load(path.join(root, 'features/categories/categoryIcons.ts'));
  const { buildObligationReminderMessage } = load(path.join(root, 'utils/reminderMessage.ts'));
  const { buildReportHtml } = load(path.join(root, 'features/reports/pdf.ts'));
  const reasons = JSON.parse(JSON.stringify(['installmentAmount', 'openCounterparty']));
  const warningEntries = documentWarningEntries({ warnings: ['Özel belge uyarısı'], warningsEn: ['A specific document warning'] });
  const edgeSource = ts.createSourceFile('process-document.ts', fs.readFileSync(path.join(root, 'supabase/functions/process-document/index.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
  assert.equal(edgeSource.parseDiagnostics.length, 0, 'OCR Edge Function syntax');
  assert.deepEqual(documentWarningEntries({ warnings: [null, 'uyarı'], warningsEn: ['wrong', 'correct'] }), [{ source: 'uyarı', en: 'correct' }]);
  assert.deepEqual(documentWarningEntries({ warnings: ['uyarı'], warningsEn: ['too', 'many'] }), [{ source: 'uyarı' }]);
  assert.deepEqual(documentWarningEntries(null), []);
  const reportInput = {
    periodLabel: '2026-10', workspaceName: '<script>alert(1)</script>', incomeMinor: 100000, expenseMinor: 50000,
    payableTotalMinor: 10000, payableCount: 1, receivableTotalMinor: 0, receivableCount: 0,
    monthlyComparison: [], expenseCategories: [{ name: 'Custom category', amountMinor: 50000, percentage: 1 }],
    incomeCategories: [], counterparties: [], accountBalances: [], overdueObligations: [], cashFlow: [],
  };
  for (const lng of ['tr', 'en', 'tr']) {
    await i18next.changeLanguage(lng);
    const english = lng === 'en';
    // Reuse the very same cached data and module instances across language switches.
    assert.deepEqual(reasons.map(receiptMatchReasonLabel), english
      ? ['Installment amount matched', 'You have an open record with this person']
      : ['Taksit tutarı eşleşti', 'Bu kişiyle açık kaydınız var']);
    assert.equal(receiptMatchReasonLabel('Taksit tutarı eşleşti'), english ? 'Installment amount matched' : 'Taksit tutarı eşleşti');
    assert.equal(CATEGORY_ICON_CHOICES.find((item) => item.icon === 'cart').label, english ? 'Groceries' : 'Market');
    assert.equal(documentWarningText(warningEntries[0]), english ? 'A specific document warning' : 'Özel belge uyarısı');
    assert.equal(documentWarningText('Rakamla ve yazıyla tutar uyuşmuyor'), english ? 'The amounts in figures and words do not match' : 'Rakamla ve yazıyla tutar uyuşmuyor');
    assert.equal(documentWarningText('legacy custom warning'), 'legacy custom warning');
    const uncertainWarning = 'Tutar okuması belirsiz: belgede "2.000,00" yazıyor. Kaydedilen tutar 2000.00; lütfen doğrulayın.';
    assert.equal(documentWarningText(uncertainWarning), english ? 'Uncertain amount reading: the document says "2.000,00". The recorded amount is 2000.00; please verify it.' : uncertainWarning);
    const message = buildObligationReminderMessage({ title: 'Custom title', direction: 'payable', document_type: 'kredi', bank_code: null, service_code: null, currency_code: 'TRY' }, 123456, '3_days_before');
    assert.equal(message.body, english ? 'Custom title · Loan Payment of 1,234.56 TL · In 3 Days' : 'Custom title 1.234,56 TL Tutarındaki Kredi Ödemeniz 3 Gün Sonra');
    const html = buildReportHtml(reportInput);
    assert.ok(html.includes(`<html lang="${lng}">`));
    assert.ok(html.includes(english ? 'Financial report' : 'Finans raporu'));
    assert.ok(html.includes(english ? '1 open record' : '1 açık kayıt'));
    assert.ok(html.includes(english ? '50%' : '%50'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(!html.includes('reportPdf.'));
    const pagination = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    assert.ok(pagination);
    new (require('node:vm').Script)(pagination);
    assert.ok(pagination.includes(english ? '(continued)' : '(devam)'));
  }
  console.log('Servis katmanı: dil değişimi, önbellekteki gerekçeler, OCR uyarıları, hatırlatma ve PDF HTML doğrulandı.');
  const { serverErrorMessage } = load(path.join(root, 'i18n/serverErrorMessage.ts'));
  const { friendlyErrorMessage } = load(path.join(root, 'utils/alerts.ts'));
  for (const lng of ['tr', 'en']) {
    await i18next.changeLanguage(lng);
    for (const [key, template] of Object.entries(tr.serverErrors)) {
      const raw = template.replace(/{{value\d+}}/g, 'test-value');
      const expected = (lng === 'en' ? en : tr).serverErrors[key].replace(/{{value\d+}}/g, 'test-value');
      assert.equal(serverErrorMessage(raw), expected, `${lng} ${key}`);
      assert.equal(friendlyErrorMessage({ message: raw }), expected, `${lng} friendly ${key}`);
    }
    assert.equal(friendlyErrorMessage({ message: 'WORKSPACE_LIMIT_REACHED: example' }), i18next.t('errors.plan.workspaceLimit'));
    assert.equal(friendlyErrorMessage({ message: 'network request failed' }), i18next.t('errors.network'));
    assert.equal(friendlyErrorMessage({ message: 'Yeni bir sunucu hatası' }, 'fallback'), lng === 'en' ? 'fallback' : 'Yeni bir sunucu hatası');
  }
  console.log(`Sunucu iş kuralı hataları: ${Object.keys(tr.serverErrors).length} mesaj TR/EN ve değişkenleri doğrulandı.`);
  for (const file of fs.readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql'))) {
    const sql = fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8');
    for (const [, literal] of sql.matchAll(/raise exception '((?:''|[^'])*)'/gi)) {
      if (/^[A-Z_]+:/.test(literal)) continue; // Plan prefixes have their own localized mapping.
      assert.ok(serverErrorMessage(literal.replace(/%/g, 'test-value')), `Unmapped SQL business rule in ${file}: ${literal}`);
    }
  }
  const { getLegalSections } = load(path.join(root, 'i18n/legal.ts'));
  const legalBaseline = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/legal-tr-sha256.json'), 'utf8'));
  for (const lng of ['tr', 'en', 'tr']) {
    await i18next.changeLanguage(lng);
    for (const [kind, count] of [['privacy', 11], ['terms', 15]]) {
      const sections = getLegalSections(kind);
      assert.equal(sections.length, count);
      assert.ok(sections.every((section, index) => section.title.startsWith(`${index + 1}. `) && section.body.trim().length > 20));
      if (lng === 'tr') {
        const hashes = sections.map((section) => require('node:crypto').createHash('sha256').update(JSON.stringify(section)).digest('hex'));
        assert.deepEqual(hashes, legalBaseline[kind], 'Turkish legal text must remain byte-for-byte identical');
      }
      const document = sections.map((s) => s.body).join('\n');
      assert.ok(document.includes('info@vademde.com'));
      assert.ok(document.includes('0543 203 53 09'));
      assert.ok(document.includes('Turgut Akın Kaya'));
    }
    assert.equal(getLegalSections('privacy')[0].title, lng === 'en' ? '1. Data Controller' : '1. Veri Sorumlusu');
  }
  console.log('Yasal metinler: 26 bölüm, TR özgün metin hashleri, EN geçişi ve iletişim bilgileri doğrulandı.');
  const samples = [
    ['home.alerts.insightsCount', { count: 1 }],
    ['home.alerts.insightsCount', { count: 3 }],
    ['home.alerts.overdueBody', { count: 1 }],
    ['ui.planLimit.graceDetail', { date: '1 Kasım', count: 1 }],
    ['onboarding.progress', { current: 2, total: 3 }],
  ];
  for (const lng of ['tr', 'en']) {
    await i18next.changeLanguage(lng);
    for (const [key, opts] of samples) console.log(`${lng} ${key} ${JSON.stringify(opts)} → ${i18next.t(key, opts)}`);
  }
  console.log(`\nanahtar: tr ${trKeys.size}, en ${enKeys.size}`);
  if (missing.length) console.log('EN eksik:', missing);
  if (extra.length) console.log('EN fazla:', extra);
  if (varMismatch.length) console.log('Değişken uyuşmazlığı:', varMismatch);
  process.exit(missing.length || extra.length || varMismatch.length ? 1 : 0);
})();

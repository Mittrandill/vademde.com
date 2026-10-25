// i18n/locales'i TypeScript'ten derleyip gerçek i18next ile çözer: çoğul, değişken, eksik anahtar.
const fs = require('fs');
const path = require('path');
const Module = require('module');
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

#!/usr/bin/env node
// OCR model karşılaştırması. Canlıdaki istem ve şema process-document'ten okunur; uygulamaya veya
// veritabanına dokunmaz. Gerekli: Node 20+ ve önce `python3 scripts/ocr-eval/generate.py`.
//
//   GEMINI_API_KEY=... node scripts/ocr-eval/run.mjs
//
// Seçenekler: --models a,b  --only o01,o14  --dry-run
//             --source-ref HEAD  o git sürümündeki istemle ve taraf çözümlemesi olmadan çalışır
// Node 22.18+ gerekir.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveDocumentParties } from '../../supabase/functions/_shared/documentParties.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(HERE, '../../output/ocr-eval');
const SOURCE = join(HERE, '../../supabase/functions/process-document/index.ts');
const MIME = { png: 'image/png', jpg: 'image/jpeg', pdf: 'application/pdf' };
const DEFAULT_MODELS = ['gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];
// 1M token başına USD (Gemini API standart katman, okundu: 2026-11-09; 3.8 Flash 2027'de iki katına çıkıyor).
const PRICES = {
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'gemini-3.6-flash': { input: 0.75, output: 3.75 },
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
};
const CATEGORY_SUFFIX = '\n\nKATEGORİ LİSTESİ: Market, Yakıt, Restoran / Kafe, Abonelikler, Telefon, Alışveriş, Sağlık, Banka / Kart Ücretleri, Faturalar';

export function loadProductionPrompt(ref = null) {
  const source = ref
    ? execFileSync('git', ['show', `${ref}:supabase/functions/process-document/index.ts`], { cwd: join(HERE, '../..'), encoding: 'utf8' })
    : readFileSync(SOURCE, 'utf8');
  const start = source.indexOf('const DOCUMENT_TYPES = [');
  const end = source.indexOf('interface ProcessRequest');
  if (start < 0 || end < 0) throw new Error('process-document istemi bulunamadı');
  return new Function(`${source.slice(start, end)}\nreturn { PROMPT, RESPONSE_SCHEMA };`)();
}

const normalize = (value) =>
  String(value ?? '').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const sameNumber = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.005;
const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

function documentNumbers(actual) {
  const values = [actual.documentNumber, actual.invoiceDetails?.invoiceNumber, actual.receiptDetails?.referenceNo];
  for (const field of actual.fields ?? []) values.push(field.normalizedValue, field.rawValue);
  return values.filter(Boolean).map((value) => String(value).replace(/\s/g, ''));
}

function sameName(want, got) {
  const a = normalize(want);
  const b = normalize(got);
  return Boolean(b) && (a === b || a.includes(b) || b.includes(a));
}

export function scoreDocument(document, actual) {
  const fields = {};
  const expected = document.expected;
  for (const [key, want] of Object.entries(expected)) {
    if (key === 'documentType') fields[key] = want.split('|').includes(actual?.documentType);
    else if (key === 'totalAmount') fields[key] = sameNumber(actual?.totalAmount, want);
    else if (key === 'counterpartyName') fields[key] = sameName(want, actual?.counterpartyName);
    else if (key === 'bankName') fields[key] = sameName(want, actual?.instrumentDetails?.bankName);
    else if (key === 'documentNumber') fields[key] = documentNumbers(actual ?? {}).includes(want);
    else if (key === 'issueDate') fields[key] = String(actual?.issueDate ?? actual?.receiptDetails?.transactionDateTime ?? '').slice(0, 10) === want;
    else fields[key] = actual?.[key] === want;
  }
  const result = { fields, rows: null };
  if (document.plan) {
    const got = actual?.installmentPlan ?? {};
    const lines = got.installments ?? [];
    fields.installmentCount = got.installmentCount === document.plan.count;
    fields.totalRepayment = sameNumber(got.totalRepayment, document.plan.totalRepayment);
    let right = 0;
    for (const want of document.plan.rows) {
      const line = lines.find((item) => item.installmentNumber === want.n);
      if (line && line.dueDate === want.dueDate && sameNumber(line.installmentAmount, want.amount) && sameNumber(line.principal, want.principal) && sameNumber(line.interest, want.interest) && sameNumber(line.remainingPrincipal, want.remaining)) right += 1;
    }
    result.rows = { right, total: document.plan.rows.length, returned: lines.length };
  }
  if (document.statement) {
    const got = actual?.cardStatement ?? {};
    const want = document.statement;
    fields.last4 = got.cardLastFourDigits === want.last4;
    fields.statementDate = got.statementDate === want.statementDate;
    fields.minimumPayment = sameNumber(got.minimumPayment, want.minimumPayment);
    fields.previousDebt = sameNumber(got.previousDebt, want.previousDebt);
    const remaining = [...(got.transactions ?? [])];
    let right = 0;
    for (const row of want.rows) {
      const index = remaining.findIndex((item) => item.date === row.date && sameNumber(Math.abs(item.amount), row.amount) && item.transactionType === row.type);
      if (index >= 0) {
        right += 1;
        remaining.splice(index, 1);
      }
    }
    result.rows = { right, total: want.rows.length, returned: (got.transactions ?? []).length };
  }
  return result;
}

export function costUsd(model, usage = {}) {
  const price = PRICES[model];
  if (!price) return null;
  return ((usage.promptTokenCount ?? 0) * price.input + ((usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0)) * price.output) / 1e6;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function callModel(model, production, document) {
  const data = readFileSync(join(OUTPUT, 'docs', document.file)).toString('base64');
  const mime = MIME[document.file.split('.').pop()];
  const startedAt = Date.now();
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      contents: [{ parts: [{ text: production.PROMPT + CATEGORY_SUFFIX }, { inline_data: { mime_type: mime, data } }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: production.RESPONSE_SCHEMA },
    }),
  });
  const durationMs = Date.now() - startedAt;
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const json = await response.json();
  return { actual: JSON.parse(json.candidates?.[0]?.content?.parts?.[0]?.text ?? 'null'), usage: json.usageMetadata, servedBy: json.modelVersion, finishReason: json.candidates?.[0]?.finishReason, durationMs };
}

function report(model, documents, rows) {
  const succeeded = rows.filter((row) => !row.error);
  console.log(`\n=== ${model} (yanıtlayan: ${[...new Set(succeeded.map((row) => row.servedBy))].join(', ') || '-'}) ===`);
  console.log(`Başarılı çağrı: ${succeeded.length}/${rows.length}`);
  if (rows.length !== succeeded.length) console.log(`İlk hata: ${rows.find((row) => row.error).error}`);
  const stats = {};
  for (const row of rows) {
    if (row.error) continue;
    for (const [key, ok] of Object.entries(row.fields)) {
      stats[key] ??= { right: 0, total: 0 };
      stats[key].total += 1;
      if (ok) stats[key].right += 1;
    }
  }
  for (const [key, stat] of Object.entries(stats)) console.log(`  ${key.padEnd(18)} ${stat.right}/${stat.total}`);
  for (const group of ['plan', 'statement']) {
    const selected = rows.filter((row) => row.rows && documents.find((doc) => doc.id === row.id)[group]);
    if (!selected.length) continue;
    const right = selected.reduce((sum, row) => sum + row.rows.right, 0);
    const total = selected.reduce((sum, row) => sum + row.rows.total, 0);
    console.log(`  ${group === 'plan' ? 'Taksit satırı' : 'Ekstre satırı'}: ${right}/${total} (%${round((right / total) * 100)})  ${selected.map((row) => `${row.id}:${row.rows.right}/${row.rows.total}`).join(' ')}`);
  }
  const misses = rows.filter((row) => !row.error).flatMap((row) => Object.entries(row.fields).filter(([, ok]) => !ok).map(([key]) => `${row.id}:${key}`));
  console.log(`Yanlış alanlar: ${misses.join(' ') || 'yok'}`);
  const costs = succeeded.map((row) => row.cost).filter((cost) => cost !== null);
  const tables = succeeded.filter((row) => row.rows).map((row) => row.cost).filter((cost) => cost !== null);
  const latency = succeeded.map((row) => row.durationMs);
  if (costs.length) console.log(`Maliyet: ort $${(costs.reduce((a, b) => a + b, 0) / costs.length).toFixed(5)}  p95 $${percentile(costs, 95).toFixed(5)}  tablolu ort $${tables.length ? (tables.reduce((a, b) => a + b, 0) / tables.length).toFixed(5) : '-'}`);
  if (latency.length) console.log(`Gecikme: p50 ${percentile(latency, 50)} ms  p95 ${percentile(latency, 95)} ms`);
  const truncated = succeeded.filter((row) => row.finishReason && row.finishReason !== 'STOP').map((row) => `${row.id}:${row.finishReason}`);
  if (truncated.length) console.log(`Yarım kalan yanıtlar: ${truncated.join(' ')}`);
}

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1];
}

async function main() {
  const sourceRef = arg('source-ref');
  const production = loadProductionPrompt(sourceRef);
  const only = arg('only')?.split(',');
  const documents = JSON.parse(readFileSync(join(OUTPUT, 'expected.json'), 'utf8')).filter((doc) => !only || only.includes(doc.id));
  const models = arg('models')?.split(',') ?? DEFAULT_MODELS;
  console.log(`${documents.length} belge, ${models.length} model, istem: ${sourceRef ?? 'çalışma kopyası'} (${production.PROMPT.length} karakter).`);
  if (process.argv.includes('--dry-run')) return;
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY ortam değişkeni gerekli');

  const results = [];
  for (const model of models) {
    const rows = [];
    for (const document of documents) {
      try {
        const call = await callModel(model, production, document);
        const actual = sourceRef ? call.actual : { ...call.actual, ...resolveDocumentParties(call.actual, document.ownNames ?? []) };
        rows.push({ id: document.id, ...call, actual, cost: costUsd(model, call.usage), ...scoreDocument(document, actual) });
      } catch (error) {
        rows.push({ id: document.id, error: error.message, fields: {}, rows: null });
      }
      process.stdout.write('.');
    }
    report(model, documents, rows);
    results.push({ model, rows });
  }
  mkdirSync(OUTPUT, { recursive: true });
  const file = join(OUTPUT, `results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(results, null, 2));
  console.log(`\nAyrıntılar: ${file}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

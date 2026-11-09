#!/usr/bin/env node
// Sesli kayıt için model karşılaştırması: gerçek Türkçe kayıtları her modele gönderir, alan
// doğruluğunu, token kullanımını, maliyeti ve gecikmeyi raporlar. Uygulamaya veya veritabanına
// dokunmaz. İstem, şema ve doğrulama voice-intake ile aynıdır. Gerekli: Node 22.18+.
//
//   1. cases.json'daki her cümleyi telefonla okuyun: output/voice-eval/recordings/v01.m4a ...
//   2. GEMINI_API_KEY=... node scripts/voice-eval/run.mjs
//
// Seçenekler: --models a,b  --only v01,v08  --thinking-budget 0  --dry-run
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildVoicePrompt, normalizeVoiceDraft, VOICE_SCHEMA } from '../../supabase/functions/_shared/voiceIntake.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(HERE, '../../output/voice-eval');
const RECORDINGS = join(OUTPUT, 'recordings');
const MIME = { m4a: 'audio/mp4', wav: 'audio/wav', mp3: 'audio/mpeg' };
const DEFAULT_MODELS = ['gemini-3.5-flash-lite'];
// 1M token başına USD (Gemini API standart katman, okundu: 2026-11-09).
const PRICES = {
  'gemini-2.5-flash': { text: 0.3, audio: 1, output: 2.5 },
  'gemini-2.5-flash-lite': { text: 0.1, audio: 0.3, output: 0.4 },
  'gemini-3.1-flash-lite': { text: 0.25, audio: 0.5, output: 1.5 },
  'gemini-3.5-flash-lite': { text: 0.3, audio: 0.3, output: 2.5 },
};
const CRITICAL = ['kind', 'direction', 'amountMinor', 'date', 'documentNumber'];

function evalContext(data) {
  return {
    today: data.referenceDate,
    counterparties: data.counterparties.map((name) => ({ id: name, name })),
    categories: ['Yakıt', 'Market', 'Sigorta', 'Kırtasiye'].map((name) => ({ id: name, name, kind: 'expense' })),
    assets: data.assets.map((name) => ({ id: name, name, kind: 'vehicle', plate: null })),
  };
}

function evalActual(raw, context) {
  const draft = normalizeVoiceDraft(raw, context);
  return {
    ...draft,
    counterparty: draft.counterpartyName,
    category: draft.categoryName,
    asset: draft.assetName,
    newCounterparty: Boolean(draft.counterpartyName && !draft.counterpartyId),
    missing: draft.amountMinor === null ? ['amount'] : [],
  };
}

const normalize = (value) =>
  String(value ?? '').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function scoreCase(expected, actual) {
  const fields = {};
  for (const [key, want] of Object.entries(expected)) {
    if (key === 'asksAsset') continue;
    const got = actual?.[key];
    if (key === 'missing') fields[key] = want.every((item) => got?.includes(item));
    else if (key === 'documentNumber') fields[key] = String(got ?? '') === want;
    else if (want === null || typeof want !== 'string') fields[key] = (got ?? null) === want;
    else if (key === 'category') fields[key] = normalize(got).includes(normalize(want));
    else if (key === 'bank') fields[key] = normalize(got).includes(normalize(want).split(' ')[0]);
    else fields[key] = normalize(got) === normalize(want);
  }
  return fields;
}

export function costUsd(model, usage = {}) {
  const price = PRICES[model];
  if (!price) return null;
  const details = usage.promptTokensDetails ?? [];
  const audio = details.filter((d) => d.modality === 'AUDIO').reduce((sum, d) => sum + (d.tokenCount ?? 0), 0);
  const text = (usage.promptTokenCount ?? 0) - audio;
  const output = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
  return (text * price.text + audio * price.audio + output * price.output) / 1e6;
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function findRecording(id) {
  for (const ext of Object.keys(MIME)) {
    const path = join(RECORDINGS, `${id}.${ext}`);
    if (existsSync(path)) return { path, mime: MIME[ext] };
  }
  return null;
}

async function callModel(model, prompt, recording, thinkingBudget) {
  const startedAt = Date.now();
  const generationConfig = { responseMimeType: 'application/json', responseSchema: VOICE_SCHEMA, temperature: 0 };
  if (thinkingBudget !== null) generationConfig.thinkingConfig = { thinkingBudget };
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: recording.mime, data: readFileSync(recording.path).toString('base64') } }] }],
      generationConfig,
    }),
  });
  const durationMs = Date.now() - startedAt;
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const json = await response.json();
  return { actual: JSON.parse(json.candidates?.[0]?.content?.parts?.[0]?.text ?? 'null'), usage: json.usageMetadata, servedBy: json.modelVersion, durationMs };
}

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1];
}

async function main() {
  const data = JSON.parse(readFileSync(join(HERE, 'cases.json'), 'utf8'));
  const only = arg('only')?.split(',');
  const cases = data.cases.filter((item) => !only || only.includes(item.id));
  const models = arg('models')?.split(',') ?? DEFAULT_MODELS;
  const budget = arg('thinking-budget');
  const thinkingBudget = budget === null ? null : Number(budget);
  const ready = cases.filter((item) => findRecording(item.id));
  console.log(`${cases.length} cümle, ${ready.length} kayıt hazır. Klasör: ${RECORDINGS}`);
  const absent = cases.filter((item) => !findRecording(item.id)).map((item) => item.id);
  if (absent.length) console.log(`Eksik kayıtlar: ${absent.join(', ')}`);
  if (process.argv.includes('--dry-run')) return;
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY ortam değişkeni gerekli');
  if (ready.length === 0) throw new Error('Kayıt bulunamadı');

  const context = evalContext(data);
  const prompt = buildVoicePrompt(context);
  const results = [];
  for (const model of models) {
    const rows = [];
    for (const item of ready) {
      try {
        const call = await callModel(model, prompt, findRecording(item.id), thinkingBudget);
        rows.push({ id: item.id, ...call, cost: costUsd(model, call.usage), fields: scoreCase(item.expected, evalActual(call.actual, context)) });
      } catch (error) {
        rows.push({ id: item.id, error: error.message, fields: {} });
      }
    }
    const succeeded = rows.filter((row) => !row.error);
    const fieldStats = {};
    for (const item of ready) {
      const row = rows.find((candidate) => candidate.id === item.id);
      for (const key of Object.keys(scoreCase(item.expected, {}))) {
        fieldStats[key] ??= { right: 0, total: 0 };
        fieldStats[key].total += 1;
        if (row.fields[key]) fieldStats[key].right += 1;
      }
    }
    const perfect = rows.filter((row) => !row.error && Object.values(row.fields).every(Boolean)).length;
    const criticalMisses = rows.flatMap((row) => CRITICAL.filter((key) => row.fields[key] === false).map((key) => `${row.id}:${key}`));
    const costs = succeeded.map((row) => row.cost).filter((cost) => cost !== null);
    const latency = succeeded.map((row) => row.durationMs);
    console.log(`\n=== ${model} (yanıtlayan: ${[...new Set(succeeded.map((row) => row.servedBy))].join(', ') || '-'}) ===`);
    console.log(`Tam doğru: ${perfect}/${rows.length}   Hata: ${rows.length - succeeded.length}`);
    for (const [key, stat] of Object.entries(fieldStats)) console.log(`  ${key.padEnd(16)} ${stat.right}/${stat.total}`);
    console.log(`Kritik yanlışlar: ${criticalMisses.join(' ') || 'yok'}`);
    if (costs.length) console.log(`Maliyet: ort $${(costs.reduce((a, b) => a + b, 0) / costs.length).toFixed(5)}  p95 $${percentile(costs, 95).toFixed(5)}`);
    if (latency.length) console.log(`Gecikme: p50 ${percentile(latency, 50)} ms  p95 ${percentile(latency, 95)} ms`);
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

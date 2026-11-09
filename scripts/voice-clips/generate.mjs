#!/usr/bin/env node
// Asistanın sabit cümlelerini ElevenLabs ile seslendirir, assets/voice altına yazar ve
// features/voice/clips.ts dosyasını üretir. Değişmeyen cümleler yeniden üretilmez.
// Gerekli: Node 22.18+.
//
//   ELEVENLABS_API_KEY=... ELEVENLABS_VOICE_TR=... ELEVENLABS_VOICE_EN=... node scripts/voice-clips/generate.mjs
//
// Seçenek: --dry-run (yalnızca cümleleri ve karakter sayısını yazar). Model: ELEVENLABS_MODEL.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { voiceSpokenPhrases } from '../../supabase/functions/_shared/voiceIntake.ts';
import { voice as tr } from '../../i18n/locales/tr/voice.ts';
import { voice as en } from '../../i18n/locales/en/voice.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MODEL = process.env.ELEVENLABS_MODEL ?? 'eleven_multilingual_v2';
const LANGS = [
  { code: 'tr', greeting: tr.greeting, voice: process.env.ELEVENLABS_VOICE_TR },
  { code: 'en', greeting: en.greeting, voice: process.env.ELEVENLABS_VOICE_EN },
];
const dryRun = process.argv.includes('--dry-run');

function jsString(value) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

async function synthesize(text, voiceId) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': process.env.ELEVENLABS_API_KEY },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  });
  if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return Buffer.from(await response.arrayBuffer());
}

const entries = [];
let characters = 0;
for (const lang of LANGS) {
  const phrases = [...new Set([lang.greeting, ...voiceSpokenPhrases(lang.code)])];
  console.log(`\n${lang.code}: ${phrases.length} cümle`);
  for (const text of phrases) {
    characters += text.length;
    if (dryRun) {
      console.log(`  ${text}`);
      continue;
    }
    if (!process.env.ELEVENLABS_API_KEY || !lang.voice) throw new Error('ELEVENLABS_API_KEY ve her dil için ses kimliği gerekli');
    const hash = createHash('sha256').update(`${MODEL}|${lang.voice}|${text}`).digest('hex').slice(0, 16);
    const relative = `assets/voice/${lang.code}/${hash}.mp3`;
    const file = join(ROOT, relative);
    if (!existsSync(file)) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, await synthesize(text, lang.voice));
      console.log(`  üretildi: ${text}`);
    }
    entries.push([`${lang.code}:${text}`, relative]);
  }
}
console.log(`\nToplam ${characters} karakter.`);
if (!dryRun) {
  const header = readFileSync(join(ROOT, 'features/voice/clips.ts'), 'utf8').split('\n').slice(0, 2).join('\n');
  const body = entries.map(([key, path]) => `  ${jsString(key)}: require('../../${path}'),`).join('\n');
  writeFileSync(join(ROOT, 'features/voice/clips.ts'), `${header}\nexport const VOICE_CLIPS: Record<string, number> = {\n${body}\n};\n`);
  console.log('features/voice/clips.ts güncellendi.');
}

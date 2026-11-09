// Gemini kullanım kaydının token ayrıştırması. Gerekli: Node 22.18+.
import assert from 'node:assert/strict';
import { buildAiUsageEvent, recordAiUsage } from '../supabase/functions/_shared/aiUsage.ts';

const base = {
  feature: 'voice',
  workspaceId: '11111111-1111-1111-1111-111111111111',
  plan: 'plus',
  requestId: '22222222-2222-2222-2222-222222222222',
  model: 'gemini-2.5-flash',
  ok: true,
  httpStatus: 200,
  durationMs: 1234.6,
};

const event = buildAiUsageEvent({
  ...base,
  audioSeconds: 30,
  response: {
    modelVersion: 'gemini-3.5-flash-lite',
    candidates: [{ content: { parts: [{ text: 'GİZLİ YANIT' }] } }],
    usageMetadata: {
      promptTokenCount: 3960,
      candidatesTokenCount: 400,
      thoughtsTokenCount: 500,
      cachedContentTokenCount: 100,
      promptTokensDetails: [
        { modality: 'TEXT', tokenCount: 3000 },
        { modality: 'AUDIO', tokenCount: 960 },
      ],
    },
  },
});
assert.equal(event.requested_model, 'gemini-2.5-flash');
assert.equal(event.response_model, 'gemini-3.5-flash-lite');
assert.equal(event.input_tokens, 3960);
assert.equal(event.audio_input_tokens, 960);
assert.equal(event.output_tokens, 400);
assert.equal(event.thinking_tokens, 500);
assert.equal(event.cached_tokens, 100);
assert.equal(event.duration_ms, 1235);
assert.equal(event.is_fallback, false);
assert.ok(!JSON.stringify(event).includes('GİZLİ'), 'yanıt metni kayda girmemeli');

// Yanıtsız deneme (zaman aşımı) sıfır token olarak yazılır.
const timedOut = buildAiUsageEvent({ ...base, ok: false, httpStatus: null, response: null });
assert.equal(timedOut.input_tokens, 0);
assert.equal(timedOut.response_model, null);
assert.equal(timedOut.ok, false);

// Bozuk sayılar sıfırlanır.
const malformed = buildAiUsageEvent({ ...base, response: { usageMetadata: { promptTokenCount: 'x', candidatesTokenCount: -5 } } });
assert.equal(malformed.input_tokens, 0);
assert.equal(malformed.output_tokens, 0);

// Kayıt hatası kullanıcı akışına sıçramaz.
const warn = console.warn;
console.warn = () => {};
await recordAiUsage({ rpc: async () => { throw new Error('ağ'); } }, base);
await recordAiUsage({ rpc: async () => ({ error: { message: 'db' } }) }, base);
console.warn = warn;

let call;
await recordAiUsage({ rpc: async (name, args) => { call = { name, args }; return { error: null }; } }, base);
assert.equal(call.name, 'record_ai_usage');
assert.equal(call.args.p_event.feature, 'voice');

console.log('ai-usage: ok');

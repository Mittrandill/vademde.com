// Sesli kayıt: sesi Gemini ile yapılandırılmış taslağa çevirir, eksik alan sorusunu seçer. Hiçbir
// finans kaydı oluşturmaz; taslak kullanıcının onaylayacağı forma gider. Ses saklanmaz, loglanmaz.
// Gemini anahtarı sunucuda kalır. Yalnızca Plus/İşletme. Veriler kullanıcının JWT'siyle (RLS) okunur.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { recordAiUsage } from '../_shared/aiUsage.ts';
import {
  applyChipAnswer,
  buildVoicePrompt,
  isVoiceField,
  mergeFollowUp,
  nextVoiceQuestion,
  normalizeVoiceDraft,
  voiceAcknowledgement,
  VOICE_SCHEMA,
  type VoiceContext,
  type VoiceDraft,
  type VoiceField,
  type VoiceLocale,
} from '../_shared/voiceIntake.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const VOICE_MODEL = Deno.env.get('VOICE_MODEL') ?? 'gemini-3.5-flash-lite';
const VOICE_FALLBACK_MODEL = Deno.env.get('VOICE_FALLBACK_MODEL') ?? 'gemini-3.8-flash';
const MONTHLY_LIMIT = Number(Deno.env.get('VOICE_MONTHLY_LIMIT') ?? '300');
const MAX_AUDIO_BASE64 = 4 * 1024 * 1024;
const MAX_SECONDS = 65;
const ALLOWED_MIME = new Set(['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/mpeg']);
const MAX_CONTEXT_ROWS = 200;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function loadContext(db: ReturnType<typeof createClient<any>>, workspaceId: string, today: string): Promise<VoiceContext> {
  const [counterparties, categories, assets, accounts] = await Promise.all([
    db.from('counterparties').select('id, name').eq('workspace_id', workspaceId).order('updated_at', { ascending: false }).limit(MAX_CONTEXT_ROWS),
    db.from('categories').select('id, name, kind').eq('workspace_id', workspaceId).limit(MAX_CONTEXT_ROWS),
    db.from('owned_assets').select('id, name, kind, plate').eq('workspace_id', workspaceId).limit(MAX_CONTEXT_ROWS),
    db.from('accounts').select('id, name, currency_code').eq('workspace_id', workspaceId).eq('is_archived', false).limit(MAX_CONTEXT_ROWS),
  ]);
  if (counterparties.error || categories.error || assets.error || accounts.error) throw new Error('context_failed');
  return {
    today,
    counterparties: (counterparties.data ?? []) as VoiceContext['counterparties'],
    categories: (categories.data ?? []) as VoiceContext['categories'],
    assets: (assets.data ?? []) as VoiceContext['assets'],
    accounts: (accounts.data ?? []) as NonNullable<VoiceContext['accounts']>,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'unauthorized' }, 401);

  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authorization } } });
  const { data: { user } } = await db.auth.getUser();
  if (!user) return json({ error: 'unauthorized' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : null;
  if (!workspaceId) return json({ error: 'bad_request' }, 400);
  const locale: VoiceLocale = body.locale === 'en' ? 'en' : 'tr';
  const today = typeof body.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);
  const answered = Array.isArray(body.answered) ? body.answered.filter((item): item is string => typeof item === 'string').slice(0, 8) : [];
  const field: VoiceField | null = isVoiceField(body.field) ? body.field : null;
  const previous = body.draft && typeof body.draft === 'object' ? (body.draft as VoiceDraft) : null;

  const { data: member } = await db.from('workspace_members').select('id').eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle();
  if (!member) return json({ error: 'forbidden' }, 403);
  const { data: entitlements, error: entitlementError } = await db.rpc('get_workspace_entitlements', { p_workspace_id: workspaceId });
  if (entitlementError) return json({ error: 'workspace_access_denied' }, 403);
  if (!entitlements || entitlements.plan === 'free') return json({ error: 'plus_required' }, 403);

  let context: VoiceContext;
  try {
    context = await loadContext(db, workspaceId, today);
  } catch {
    return json({ error: 'ai_unavailable' }, 502);
  }

  const respond = (draft: VoiceDraft, nextAnswered: string[]) =>
    json({
      draft,
      answered: nextAnswered,
      question: nextVoiceQuestion(draft, context, nextAnswered, locale),
      acknowledgement: voiceAcknowledgement(draft, locale),
    });

  // Seçenekli yanıtlar modele gitmez.
  if (typeof body.value === 'string' && field && previous) {
    return respond(applyChipAnswer(previous, context, field, body.value), [...answered, field]);
  }

  const audio = typeof body.audioBase64 === 'string' ? body.audioBase64 : null;
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';
  const audioSeconds = typeof body.durationSeconds === 'number' ? body.durationSeconds : null;
  if (!audio || !ALLOWED_MIME.has(mimeType)) return json({ error: 'bad_request' }, 400);
  if (audio.length > MAX_AUDIO_BASE64 || (audioSeconds !== null && audioSeconds > MAX_SECONDS)) return json({ error: 'audio_too_long' }, 413);

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const monthStart = `${today.slice(0, 7)}-01T00:00:00Z`;
  const { data: used, error: usageError } = await service.rpc('ai_usage_count', { p_workspace_id: workspaceId, p_feature: 'voice', p_since: monthStart });
  if (usageError) console.warn('Sesli kullanım sayısı okunamadı:', usageError.message);
  else if ((used as number) >= MONTHLY_LIMIT) return json({ error: 'voice_quota_exceeded' }, 429);

  const followUp = field && previous ? { field, draft: previous } : null;
  const prompt = buildVoicePrompt(context, followUp);
  const requestId = typeof body.requestId === 'string' && /^[0-9a-f-]{36}$/i.test(body.requestId) ? body.requestId : crypto.randomUUID();

  const call = async (model: string, isFallback: boolean): Promise<Record<string, unknown>> => {
    const startedAt = Date.now();
    const track = (ok: boolean, httpStatus: number | null, response?: unknown) =>
      recordAiUsage(service, {
        feature: 'voice', workspaceId, plan: entitlements.plan, requestId, model, isFallback, ok, httpStatus,
        durationMs: Date.now() - startedAt, audioSeconds, response,
      });
    let response: Response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: audio } }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: VOICE_SCHEMA, temperature: 0 },
        }),
      });
    } catch (error) {
      await track(false, null);
      throw error;
    }
    if (!response.ok) {
      await track(false, response.status);
      throw new Error(`gemini_${response.status}`);
    }
    const geminiJson = await response.json();
    try {
      const parsed = JSON.parse(geminiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? 'null');
      if (!parsed || typeof parsed !== 'object') throw new Error('empty');
      await track(true, response.status, geminiJson);
      return parsed;
    } catch (error) {
      await track(false, response.status, geminiJson);
      throw error;
    }
  };

  let raw: Record<string, unknown>;
  try {
    raw = await call(VOICE_MODEL, false).catch(() => call(VOICE_FALLBACK_MODEL, true));
  } catch {
    return json({ error: 'ai_unavailable' }, 502);
  }

  const parsedDraft = normalizeVoiceDraft(raw, context);
  if (followUp) return respond(mergeFollowUp(followUp.draft, parsedDraft, followUp.field), [...answered, followUp.field]);
  return respond(parsedDraft, answered);
});

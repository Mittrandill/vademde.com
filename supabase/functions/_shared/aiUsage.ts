// Gemini çağrılarının token kullanımını maliyet ölçümü için kaydeder. Yalnızca sayılar ve model
// adı tutulur; ses, belge, istem veya yanıt metni asla yazılmaz. Kayıt hatası kullanıcı akışını
// bozmaz.
export type AiFeature = 'ocr' | 'ask' | 'insights' | 'voice';

export interface AiAttempt {
  feature: AiFeature;
  workspaceId: string;
  plan?: string | null;
  /** Aynı kullanıcı işlemine ait denemeleri (yedek model, sesli takip soruları) gruplar. */
  requestId: string;
  model: string;
  isFallback?: boolean;
  ok: boolean;
  httpStatus?: number | null;
  durationMs: number;
  audioSeconds?: number | null;
  /** Gemini'nin ham yanıtı; zaman aşımı gibi yanıtsız durumlarda null. */
  response?: unknown;
}

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

export function buildAiUsageEvent(attempt: AiAttempt): Record<string, unknown> {
  const response = (attempt.response ?? {}) as Record<string, any>;
  const usage = (response.usageMetadata ?? {}) as Record<string, any>;
  const details: any[] = Array.isArray(usage.promptTokensDetails) ? usage.promptTokensDetails : [];
  const audioInput = details
    .filter((detail) => detail?.modality === 'AUDIO')
    .reduce((sum, detail) => sum + count(detail?.tokenCount), 0);

  return {
    feature: attempt.feature,
    workspace_id: attempt.workspaceId,
    plan: attempt.plan ?? null,
    request_id: attempt.requestId,
    requested_model: attempt.model,
    // Google isteği başka modele yönlendirirse gerçek model burada görünür.
    response_model: typeof response.modelVersion === 'string' ? response.modelVersion : null,
    is_fallback: attempt.isFallback === true,
    ok: attempt.ok,
    http_status: attempt.httpStatus ?? null,
    duration_ms: Math.max(0, Math.round(attempt.durationMs)),
    audio_seconds: attempt.audioSeconds ?? null,
    input_tokens: count(usage.promptTokenCount),
    audio_input_tokens: audioInput,
    output_tokens: count(usage.candidatesTokenCount),
    thinking_tokens: count(usage.thoughtsTokenCount),
    cached_tokens: count(usage.cachedContentTokenCount),
  };
}

interface RpcClient {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
}

export async function recordAiUsage(client: RpcClient, attempt: AiAttempt): Promise<void> {
  try {
    const { error } = await client.rpc('record_ai_usage', { p_event: buildAiUsageEvent(attempt) });
    if (error) console.warn('AI kullanım kaydı yazılamadı:', error.message);
  } catch (error) {
    console.warn('AI kullanım kaydı yazılamadı:', error instanceof Error ? error.message : error);
  }
}

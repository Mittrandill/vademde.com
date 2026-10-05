import { supabase } from '@/services/supabase';

// ai_insights tablosu (migration 20261005120000_ai_insights.sql) henüz db/database.types.ts'te
// yok; tipler burada elle tanımlıdır. Tipler yeniden üretilince bu arayüz Tables<'ai_insights'> ile değişir.
export type InsightKind = 'abonelik' | 'tasarruf' | 'nakit' | 'aliskanlik' | 'kur';
export type InsightStatus = 'new' | 'dismissed' | 'applied';

export interface AiInsight {
  id: string;
  workspace_id: string;
  kind: InsightKind;
  title: string;
  body: string;
  /** Aylık etki (kuruş); negatif = tasarruf. */
  impact_minor: number | null;
  action_route: string | null;
  status: InsightStatus;
  generated_at: string;
}

export const INSIGHT_KIND_LABEL: Record<InsightKind, string> = {
  abonelik: 'Abonelik',
  tasarruf: 'Tasarruf',
  nakit: 'Nakit',
  aliskanlik: 'Alışkanlık',
  kur: 'Kur etkisi',
};

// Plus planı gerektiren işlevlerde sunucu 403 {error:'plus_required'} döner.
export class PlusRequiredError extends Error {
  constructor() {
    super('Akıllı öneriler Plus planına dahildir.');
  }
}

async function readFunctionError(error: unknown): Promise<string | null> {
  const context = (error as { context?: Response }).context;
  if (context instanceof Response) {
    try {
      return (await context.clone().json())?.error ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function listInsights(workspaceId: string): Promise<AiInsight[]> {
  const { data, error } = await supabase
    .from('ai_insights' as never)
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('status', 'new')
    .order('generated_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as AiInsight[];
}

export async function dismissInsight(id: string): Promise<void> {
  const { error } = await supabase
    .from('ai_insights' as never)
    .update({ status: 'dismissed' } as never)
    .eq('id', id);
  if (error) throw error;
}

export async function generateInsights(workspaceId: string): Promise<number> {
  const { data, error } = await supabase.functions.invoke('generate-insights', { body: { workspaceId } });
  if (error) {
    if ((await readFunctionError(error)) === 'plus_required') throw new PlusRequiredError();
    throw error;
  }
  return (data as { created?: number } | null)?.created ?? 0;
}

export interface AiAnswer {
  answer: string;
  source: { count: number; from: string; to: string };
}

export async function askAi(workspaceId: string, question: string): Promise<AiAnswer> {
  const { data, error } = await supabase.functions.invoke('ai-ask', { body: { workspaceId, question } });
  if (error) {
    const code = await readFunctionError(error);
    if (code === 'plus_required') throw new PlusRequiredError();
    if (code === 'question_too_long') throw new Error('Sorun çok uzun; biraz kısaltır mısın?');
    throw new Error('Şu an yanıt veremiyorum. Biraz sonra tekrar dene.');
  }
  return data as AiAnswer;
}

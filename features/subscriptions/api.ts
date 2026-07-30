import { supabase } from '@/services/supabase';
import type { Tables } from '@/db/database.types';

export type Subscription = Tables<'subscriptions'>;
export type PlanLimits = Tables<'plan_limits'>;
export type PlanCode = 'free' | 'plus' | 'isletme';

// docs/10-abonelik-gelir-modeli.md — subscriptions satırı yoksa kullanıcı Ücretsiz plandadır.
export async function getMySubscription(): Promise<Subscription | null> {
  const { data, error } = await supabase.from('subscriptions').select('*').maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPlanLimits(plan: PlanCode): Promise<PlanLimits> {
  const { data, error } = await supabase.from('plan_limits').select('*').eq('plan', plan).single();
  if (error) throw error;
  return data;
}

export async function getAllPlanLimits(): Promise<PlanLimits[]> {
  const { data, error } = await supabase
    .from('plan_limits')
    .select('*')
    .order('monthly_ocr_quota', { ascending: true });
  if (error) throw error;
  return data;
}

export function currentPeriodMonth(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export interface OcrUsageStatus {
  usedCount: number;
  quota: number;
  remaining: number;
}

// Tarama öncesi kalan OCR kotasını göstermek için (docs/10-abonelik-gelir-modeli.md §14.1).
export async function getCurrentOcrUsage(): Promise<OcrUsageStatus> {
  const subscription = await getMySubscription();
  const plan: PlanCode = (subscription?.plan as PlanCode) ?? 'free';
  const limits = await getPlanLimits(plan);

  const { data: usage, error } = await supabase
    .from('ocr_usage')
    .select('used_count')
    .eq('period_month', currentPeriodMonth())
    .maybeSingle();
  if (error) throw error;

  const usedCount = usage?.used_count ?? 0;
  return {
    usedCount,
    quota: limits.monthly_ocr_quota,
    remaining: Math.max(limits.monthly_ocr_quota - usedCount, 0),
  };
}

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

// docs/10-abonelik-gelir-modeli.md — plan limitleri artık gerçekten uygulanıyor
// (bkz. supabase/migrations/20260905130000_enforce_plan_limits.sql). Bu tip, sunucudaki
// sync_plan_enforcement RPC'sinin döndürdüğü tek plan durumu kaynağıdır; istemci hiçbir
// limiti kendi başına hesaplamaz.
export interface PlanEnforcementState {
  plan: PlanCode;
  /** Kullanıcının sahip olduğu (arşivlenmemiş) çalışma alanı sayısı. */
  workspaceCount: number;
  /** Planın izin verdiği çalışma alanı sayısı. */
  workspaceLimit: number;
  /** Limitin üzerinde mi — evetse uyarı bandı gösterilir. */
  overLimit: boolean;
  /** Salt-okunur kilidinin devreye gireceği an (14 günlük lütuf süresi sonu). */
  graceUntil: string | null;
  /** Lütuf süresi doldu ve fazla alanlar artık salt-okunur. */
  locked: boolean;
  /** Kilit devreye girdiğinde yazılabilir kalan çalışma alanı. */
  primaryWorkspaceId: string | null;
  /** null → planda ekip özelliği yok. */
  teamMemberLimit: number | null;
}

// RPC henüz uygulanmamış bir ortamda (ör. migration çalıştırılmadan açılan eski istemci)
// uygulamanın açılışını kilitlememek için hata yutulur ve "limit yok" durumu döner.
export async function syncPlanEnforcement(): Promise<PlanEnforcementState | null> {
  const { data, error } = await supabase.rpc('sync_plan_enforcement');
  if (error) return null;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    plan: (row.plan as PlanCode) ?? 'free',
    workspaceCount: row.workspace_count ?? 0,
    workspaceLimit: row.workspace_limit ?? 1,
    overLimit: !!row.over_limit,
    graceUntil: row.grace_until ?? null,
    locked: !!row.locked,
    primaryWorkspaceId: row.primary_workspace_id ?? null,
    teamMemberLimit: row.team_member_limit ?? null,
  };
}

// Kilit devreye girdiğinde hangi çalışma alanının aktif kalacağını kullanıcı seçer.
export async function setPrimaryWorkspace(workspaceId: string): Promise<void> {
  const { error } = await supabase.rpc('set_primary_workspace', { p_workspace_id: workspaceId });
  if (error) throw error;
}

/** Salt-okunur kilit bu çalışma alanını kapsıyor mu? */
export function isWorkspaceReadOnly(
  state: PlanEnforcementState | null | undefined,
  workspaceId: string | null
): boolean {
  if (!state?.locked || !workspaceId) return false;
  return workspaceId !== state.primaryWorkspaceId;
}

/** Lütuf süresinin bitmesine kaç gün kaldı (uyarı metni için). */
export function graceDaysLeft(state: PlanEnforcementState | null | undefined): number | null {
  if (!state?.graceUntil) return null;
  const ms = new Date(state.graceUntil).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

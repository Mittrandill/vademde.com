import { supabase } from '@/services/supabase';
import type { ObligationWithRelations } from '@/features/obligations/api';
import { fetchAll } from '@/services/fetchAll';
import { sumToReferenceMinor, type ValueUnitRate } from '@/features/valueUnits/api';

// Çek/senet portföyü yaşam döngüsü (migration 20261005130000_instrument_status.sql).
export type InstrumentStatus =
  | 'portfoy'
  | 'ciro_edildi'
  | 'tahsile_verildi'
  | 'tahsil_edildi'
  | 'karsiliksiz'
  | 'odendi';

export const INSTRUMENT_STATUS_LABEL: Record<InstrumentStatus, string> = {
  portfoy: 'Portföyde',
  ciro_edildi: 'Ciro edildi',
  tahsile_verildi: 'Tahsilde',
  tahsil_edildi: 'Tahsil edildi',
  karsiliksiz: 'Karşılıksız',
  odendi: 'Ödendi',
};

export function instrumentStatusOf(o: { instrument_status: string | null }): InstrumentStatus | null {
  return o.instrument_status && o.instrument_status in INSTRUMENT_STATUS_LABEL
    ? (o.instrument_status as InstrumentStatus)
    : null;
}

export async function listInstruments(workspaceId: string): Promise<ObligationWithRelations[]> {
  const rows = await fetchAll<ObligationWithRelations>((from, to) => supabase.from('obligations')
    .select('*, category:categories(name), counterparty:counterparties(name), account:accounts(name), payments(paid_at)')
    .eq('workspace_id', workspaceId).in('document_type', ['cek', 'senet']).order('id').range(from, to));
  return rows.filter((o) => o.status !== 'iptal_edildi' || o.instrument_status === 'karsiliksiz');
}

export function instrumentPortfolioRows(rows: ObligationWithRelations[], direction: 'payable' | 'receivable') {
  return rows.filter((o) => o.direction === direction && o.status !== 'iptal_edildi'
    && o.instrument_status !== 'karsiliksiz' && o.remaining_amount_minor > 0
    && (direction === 'payable' || o.instrument_status === 'portfoy'));
}
export function instrumentPortfolioTotal(rows: ObligationWithRelations[], direction: 'payable' | 'receivable', rates: ValueUnitRate[]) {
  return sumToReferenceMinor(instrumentPortfolioRows(rows, direction).map((o) => ({ amountMinor: o.remaining_amount_minor, unitCode: o.currency_code })), rates);
}

// Portföy ↔ Tahsilde: yalnızca durum etiketidir, finansal kayıt değişmez (tahsil edildi işlemi
// mevcut Tahsilat akışıyla yapılır ve durum veritabanı tetikleyicisiyle güncellenir).
export async function setInstrumentStatus(obligationId: string, status: 'portfoy' | 'tahsile_verildi'): Promise<void> {
  const { error } = await supabase
    .from('obligations')
    .update({ instrument_status: status, instrument_status_changed_at: new Date().toISOString() })
    .eq('id', obligationId);
  if (error) throw error;
}

// Ciro tamamlandığında (features/payments/api.ts settleByEndorsement) çağrılır.
export async function markEndorsed(obligationIds: string[]): Promise<void> {
  if (obligationIds.length === 0) return;
  const { error } = await supabase
    .from('obligations')
    .update({ instrument_status: 'ciro_edildi', instrument_status_changed_at: new Date().toISOString() })
    .in('id', obligationIds);
  if (error) throw error;
}

export interface InstrumentBouncePreview {
  state: 'preview' | 'bounced';
  source_id: string;
  workspace_id: string;
  currency_code: string;
  replacement_claim_minor: number;
  invalidated_ids: string[];
  impacts: { id: string; title: string; direction: string; currency_code: string; reopened_minor: number }[];
  snapshot: unknown;
}
function checkedPreview(data: unknown, obligationId: string): InstrumentBouncePreview {
  const result = data as InstrumentBouncePreview | null;
  if (!result || !['preview', 'bounced'].includes(result.state) || result.source_id !== obligationId
    || !result.workspace_id || !result.currency_code || !Number.isSafeInteger(result.replacement_claim_minor) || result.replacement_claim_minor < 0
    || !Array.isArray(result.invalidated_ids) || !result.invalidated_ids.includes(obligationId)
    || !Array.isArray(result.impacts) || !result.snapshot || result.impacts.some((o) => !o.id || !o.currency_code
      || !Number.isSafeInteger(o.reopened_minor) || o.reopened_minor < 0)) throw new Error('Karşılıksız işlem sonucu doğrulanamadı; aynı kaydı tekrar kontrol edin');
  return result;
}
export async function previewInstrumentBounce(obligationId: string): Promise<InstrumentBouncePreview> {
  const { data, error } = await supabase.rpc('preview_instrument_bounce' as never, { p_obligation_id: obligationId } as never);
  if (error) throw error;
  return checkedPreview(data, obligationId);
}
// The instrument ID is a permanent one-way idempotency key, including after response loss.
export async function markBounced(obligationId: string, expected: InstrumentBouncePreview): Promise<InstrumentBouncePreview> {
  checkedPreview(expected, obligationId);
  const { data: session, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session.session?.user.id) throw new Error('Karşılıksız işlem için giriş yapın');
  const { data, error } = await supabase.rpc('bounce_instrument_atomic' as never, {
    p_expected_actor: session.session.user.id, p_obligation_id: obligationId, p_expected: expected,
  } as never);
  if (error) throw error;
  const result = checkedPreview(data, obligationId);
  if (result.state !== 'bounced') throw new Error('Karşılıksız işlem tamamlanmadı; aynı kaydı kontrol edin');
  return result;
}

import { supabase } from '@/services/supabase';
import { listObligations, type ObligationWithRelations } from '@/features/obligations/api';

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
  const [cheques, notes] = await Promise.all([
    listObligations({ workspaceId, documentType: 'cek', pageSize: 200 }),
    listObligations({ workspaceId, documentType: 'senet', pageSize: 200 }),
  ]);
  return [...cheques, ...notes].filter((o) => o.status !== 'iptal_edildi');
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

// Karşılıksız: ciro edilmişse ciroyla kapanan fatura ve çek yeniden açılır (atomik, SQL fonksiyonu).
export async function markBounced(obligationId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_instrument_bounced', { p_obligation_id: obligationId });
  if (error) throw error;
}

import { supabase } from '@/services/supabase';
import type { Tables } from '@/db/database.types';
import { listValueUnitRates, sumToReferenceMinor, type ValueUnitRate } from '@/features/valueUnits/api';

export interface IncomeExpenseTotals {
  incomeMinor: number;
  expenseMinor: number;
}

// docs/03-bilgi-mimarisi-ekranlar.md §5.3 — Gelir-Gider Analizi widget'ı bu ayın
// başı/sonuyla sınırlı, dar bir projeksiyon (join yok) kullanır.
export async function getMonthTransactionTotals(
  workspaceId: string,
  monthStart: Date = new Date()
): Promise<IncomeExpenseTotals> {
  const start = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  const end = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);

  const [{ data, error }, rates] = await Promise.all([
    supabase
      .from('transactions')
      .select('amount_minor, direction, currency_code')
      .eq('workspace_id', workspaceId)
      .in('direction', ['income', 'expense'])
      .gte('occurred_at', start.toISOString())
      .lt('occurred_at', end.toISOString()),
    listValueUnitRates(),
  ]);

  if (error) throw error;
  return sumByDirection(data, rates);
}

// docs/01-finansal-kayit-modeli.md §8 — Bakiye Hero: açılış bakiyesi + tamamlanan
// gelirler - giderler. Tarih filtresiz, dar seçim; veri hacmi büyürse sunucu
// taraflı aggregate'e (RPC/view) taşınabilir.
export async function getAllTimeIncomeExpenseTotals(workspaceId: string): Promise<IncomeExpenseTotals> {
  const [{ data, error }, rates] = await Promise.all([
    supabase
      .from('transactions')
      .select('amount_minor, direction, currency_code')
      .eq('workspace_id', workspaceId)
      .in('direction', ['income', 'expense']),
    listValueUnitRates(),
  ]);

  if (error) throw error;
  return sumByDirection(data, rates);
}

// İşlemler hangi hesaba aitse o hesabın değer birimini taşır (TRY, USD, gram_altin, ...) —
// bkz. features/accounts/api.ts. Doğrudan toplamak yerine her satır güncel TL karşılığına
// çevrilir (bkz. features/valueUnits/api.ts sumToReferenceMinor).
function sumByDirection(
  rows: Pick<Tables<'transactions'>, 'amount_minor' | 'direction' | 'currency_code'>[],
  rates: ValueUnitRate[]
): IncomeExpenseTotals {
  return rows.reduce<IncomeExpenseTotals>(
    (totals, row) => {
      const refMinor = sumToReferenceMinor([{ amountMinor: row.amount_minor, unitCode: row.currency_code }], rates);
      if (row.direction === 'income') totals.incomeMinor += refMinor;
      else if (row.direction === 'expense') totals.expenseMinor += refMinor;
      return totals;
    },
    { incomeMinor: 0, expenseMinor: 0 }
  );
}

export type PendingReviewDocument = Pick<
  Tables<'financial_documents'>,
  'id' | 'file_name' | 'document_type' | 'mime_type' | 'created_at'
>;

// docs/04-ocr-belge-isleme.md — OCR Kontrol Kuyruğu widget'ı: ready_for_review
// durumundaki belgeler, thumbnail yerine tür ikonu + dosya adıyla listelenir.
export async function getPendingReviewDocuments(workspaceId: string): Promise<PendingReviewDocument[]> {
  const { data, error } = await supabase
    .from('financial_documents')
    .select('id, file_name, document_type, mime_type, created_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'ready_for_review')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw error;
  return data;
}

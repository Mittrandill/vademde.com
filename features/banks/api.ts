import { supabase } from '@/services/supabase';
import { ACTIVE_OBLIGATION_STATUSES } from '@/features/obligations/api';

// Kredi (kredi belge türü) kayıtları kişi/firma değil banka bazlı tutulur — bkz.
// app/obligations/new.tsx (kredi'de KİŞİ/FİRMA seçimi yerine zorunlu BANKA seçimi).
// Bu yüzden Kişi/Firmalar ekranında cari listesine paralel bir "banka + krediler"
// görünümü buradan beslenir (features/counterparties/api.ts'teki cari fonksiyonlarının
// bire bir aynısı, counterparty_id yerine bank_code + document_type='kredi' ile).
const LOAN_DOCUMENT_TYPE = 'kredi';

export interface BankLoanLedger {
  receivableMinor: number;
  payableMinor: number;
  netMinor: number;
  overdueMinor: number;
  overdueCount: number;
  openCount: number;
  nearestDueDate: string | null;
  /** Açık kredilerin orijinal (anapara) toplamı — obligation detayındaki taksit
   * ilerleme halkasının banka toplamı karşılığı: 1 - payableMinor/totalPayableMinor. */
  totalPayableMinor: number;
}

export async function getBankLoanLedger(workspaceId: string, bankCode: string): Promise<BankLoanLedger> {
  const { data, error } = await supabase
    .from('obligations')
    .select('direction, remaining_amount_minor, total_amount_minor, status, due_date')
    .eq('workspace_id', workspaceId)
    .eq('document_type', LOAN_DOCUMENT_TYPE)
    .eq('bank_code', bankCode)
    .in('status', ACTIVE_OBLIGATION_STATUSES);
  if (error) throw error;

  const rows = data ?? [];
  const payableRows = rows.filter((r) => r.direction === 'payable');
  const receivableMinor = rows
    .filter((r) => r.direction === 'receivable')
    .reduce((sum, r) => sum + r.remaining_amount_minor, 0);
  const payableMinor = payableRows.reduce((sum, r) => sum + r.remaining_amount_minor, 0);
  const totalPayableMinor = payableRows.reduce((sum, r) => sum + r.total_amount_minor, 0);
  const overdue = rows.filter((r) => r.status === 'gecikti');
  const dueDates = rows
    .map((r) => r.due_date)
    .filter((d): d is string => !!d)
    .sort();

  return {
    receivableMinor,
    payableMinor,
    netMinor: receivableMinor - payableMinor,
    overdueMinor: overdue.reduce((sum, r) => sum + r.remaining_amount_minor, 0),
    overdueCount: overdue.length,
    openCount: rows.length,
    nearestDueDate: dueDates[0] ?? null,
    totalPayableMinor,
  };
}

export interface BankWithLoans {
  bankCode: string;
  count: number;
  netMinor: number;
  overdueCount: number;
  nearestDueDate: string | null;
}

// Kişi/Firmalar ekranındaki "Bankalar" bölümü için: workspace'te en az bir açık kredisi
// olan bankaların özeti. getCounterpartyBalances'ın banka karşılığı — tek sorguyla,
// banka başına ayrı istek atmadan.
export async function listBanksWithLoans(workspaceId: string): Promise<BankWithLoans[]> {
  const { data, error } = await supabase
    .from('obligations')
    .select('bank_code, direction, remaining_amount_minor, status, due_date')
    .eq('workspace_id', workspaceId)
    .eq('document_type', LOAN_DOCUMENT_TYPE)
    .not('bank_code', 'is', null)
    .in('status', ACTIVE_OBLIGATION_STATUSES);
  if (error) throw error;

  const byBank = new Map<string, BankWithLoans>();
  for (const row of data ?? []) {
    if (!row.bank_code) continue;
    const current = byBank.get(row.bank_code) ?? {
      bankCode: row.bank_code,
      count: 0,
      netMinor: 0,
      overdueCount: 0,
      nearestDueDate: null,
    };
    current.count += 1;
    const sign = row.direction === 'receivable' ? 1 : -1;
    current.netMinor += sign * row.remaining_amount_minor;
    if (row.status === 'gecikti') current.overdueCount += 1;
    if (row.due_date && (!current.nearestDueDate || row.due_date < current.nearestDueDate)) {
      current.nearestDueDate = row.due_date;
    }
    byBank.set(row.bank_code, current);
  }
  return Array.from(byBank.values());
}

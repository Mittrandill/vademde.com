import { supabase } from '@/services/supabase';
import { ACTIVE_OBLIGATION_STATUSES } from '@/features/obligations/api';
import { BANK_NAME } from '@/features/banks/banks';
import { listValueUnitRates, sumToReferenceMinor } from '@/features/valueUnits/api';

// Kredi (kredi belge türü) kayıtları kişi/firma değil banka bazlı tutulur — bkz.
// app/obligations/new.tsx (kredi'de KİŞİ/FİRMA seçimi yerine zorunlu BANKA seçimi).
// Hesaplar ve kredi kartları da (accounts.bank_code) aynı şekilde bankaya bağlanır.
// Banka detay ekranı (app/banks/[code].tsx) buradan beslenir; oraya giriş noktaları
// Krediler listesindeki banka satırları (bkz. app/obligations/index.tsx) ve Daha
// Fazla > Yönetim > Bankalar listesidir (app/banks/index.tsx).
const LOAN_DOCUMENT_TYPE = 'kredi';

export interface BankSummary {
  bankCode: string;
  accountCount: number;
  cardCount: number;
  loanCount: number;
  overdueLoanCount: number;
  /** Yalnızca kredilerin kalan borcu — hesap/kart bakiyeleri işaret kuralı türe göre
   * değiştiğinden (normal hesap varlık, kredi kartı borç) burada karıştırılmaz; her ikisi
   * de zaten kendi ekranlarında (Hesaplar, Kredi Kartlarım) doğru işaretle gösteriliyor. */
  loanDebtMinor: number;
}

// Daha Fazla > Yönetim > Bankalar listesi ve banka detayındaki "Genel" özeti için: en az
// bir hesabı, kredi kartı veya kredisi olan bankaların özeti. getCounterpartyBalances'ın
// banka karşılığı — tek sorguyla, banka başına ayrı istek atmadan.
export async function listBankSummaries(workspaceId: string): Promise<BankSummary[]> {
  const [{ data: accounts, error: accountsError }, { data: loans, error: loansError }, rates] = await Promise.all([
    supabase
      .from('accounts')
      .select('bank_code, type')
      .eq('workspace_id', workspaceId)
      .eq('is_archived', false)
      .not('bank_code', 'is', null),
    supabase
      .from('obligations')
      .select('bank_code, remaining_amount_minor, currency_code, status')
      .eq('workspace_id', workspaceId)
      .eq('document_type', LOAN_DOCUMENT_TYPE)
      .not('bank_code', 'is', null)
      .in('status', ACTIVE_OBLIGATION_STATUSES),
    listValueUnitRates(),
  ]);
  if (accountsError) throw accountsError;
  if (loansError) throw loansError;

  const byBank = new Map<string, BankSummary>();
  function entryFor(bankCode: string): BankSummary {
    let entry = byBank.get(bankCode);
    if (!entry) {
      entry = { bankCode, accountCount: 0, cardCount: 0, loanCount: 0, overdueLoanCount: 0, loanDebtMinor: 0 };
      byBank.set(bankCode, entry);
    }
    return entry;
  }

  for (const account of accounts ?? []) {
    if (!account.bank_code) continue;
    const entry = entryFor(account.bank_code);
    if (account.type === 'credit_card') entry.cardCount += 1;
    else entry.accountCount += 1;
  }
  for (const loan of loans ?? []) {
    if (!loan.bank_code) continue;
    const entry = entryFor(loan.bank_code);
    entry.loanCount += 1;
    entry.loanDebtMinor += sumToReferenceMinor([{ amountMinor: loan.remaining_amount_minor, unitCode: loan.currency_code }], rates);
    if (loan.status === 'gecikti') entry.overdueLoanCount += 1;
  }

  return Array.from(byBank.values()).sort((a, b) =>
    (BANK_NAME[a.bankCode] ?? a.bankCode).localeCompare(BANK_NAME[b.bankCode] ?? b.bankCode, 'tr')
  );
}

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
  const [{ data, error }, rates] = await Promise.all([
    supabase
      .from('obligations')
      .select('direction, remaining_amount_minor, total_amount_minor, currency_code, status, due_date')
      .eq('workspace_id', workspaceId)
      .eq('document_type', LOAN_DOCUMENT_TYPE)
      .eq('bank_code', bankCode)
      .in('status', ACTIVE_OBLIGATION_STATUSES),
    listValueUnitRates(),
  ]);
  if (error) throw error;

  const rows = data ?? [];
  const payableRows = rows.filter((r) => r.direction === 'payable');
  const receivableMinor = sumToReferenceMinor(
    rows.filter((r) => r.direction === 'receivable').map((r) => ({ amountMinor: r.remaining_amount_minor, unitCode: r.currency_code })),
    rates
  );
  const payableMinor = sumToReferenceMinor(
    payableRows.map((r) => ({ amountMinor: r.remaining_amount_minor, unitCode: r.currency_code })),
    rates
  );
  const totalPayableMinor = sumToReferenceMinor(
    payableRows.map((r) => ({ amountMinor: r.total_amount_minor, unitCode: r.currency_code })),
    rates
  );
  const overdue = rows.filter((r) => r.status === 'gecikti');
  const dueDates = rows
    .map((r) => r.due_date)
    .filter((d): d is string => !!d)
    .sort();

  return {
    receivableMinor,
    payableMinor,
    netMinor: receivableMinor - payableMinor,
    overdueMinor: sumToReferenceMinor(
      overdue.map((r) => ({ amountMinor: r.remaining_amount_minor, unitCode: r.currency_code })),
      rates
    ),
    overdueCount: overdue.length,
    openCount: rows.length,
    nearestDueDate: dueDates[0] ?? null,
    totalPayableMinor,
  };
}


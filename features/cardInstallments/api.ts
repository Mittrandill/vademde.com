import { supabase } from '@/services/supabase';

// card_installment_purchases (migration 20261005140000). Tipler db/database.types.ts'te henüz yok;
// elle tanımlıdır. Tutarlar kuruş (tam sayı) — kayan nokta tutulmaz.
export interface CardInstallmentPurchase {
  id: string;
  workspace_id: string;
  account_id: string;
  merchant: string;
  total_minor: number;
  currency_code: string;
  installment_count: number;
  /** YYYY-MM-01 */
  first_statement_month: string;
  created_at: string;
}

export async function listCardInstallmentPurchases(
  workspaceId: string,
  accountId: string
): Promise<CardInstallmentPurchase[]> {
  const { data, error } = await supabase
    .from('card_installment_purchases' as never)
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('account_id', accountId)
    .order('first_statement_month', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as CardInstallmentPurchase[];
}

export interface NewCardInstallmentPurchase {
  workspaceId: string;
  accountId: string;
  merchant: string;
  totalMinor: number;
  installmentCount: number;
  /** YYYY-MM-01 */
  firstStatementMonth: string;
}

export async function createCardInstallmentPurchase(input: NewCardInstallmentPurchase): Promise<void> {
  const { data: account, error: accountError } = await supabase.from('accounts')
    .select('workspace_id, currency_code, type').eq('id', input.accountId).single();
  if (accountError) throw accountError;
  if (account.workspace_id !== input.workspaceId || account.type !== 'credit_card') {
    throw new Error('Taksit planı bu çalışma alanındaki bir kredi kartına ait olmalı.');
  }
  const { error } = await supabase.from('card_installment_purchases' as never).insert({
    workspace_id: input.workspaceId,
    account_id: input.accountId,
    merchant: input.merchant.trim(),
    total_minor: input.totalMinor,
    currency_code: account.currency_code,
    installment_count: input.installmentCount,
    first_statement_month: input.firstStatementMonth,
  } as never);
  if (error) throw error;
}

export async function deleteCardInstallmentPurchase(id: string): Promise<void> {
  const { error } = await supabase.from('card_installment_purchases' as never).delete().eq('id', id);
  if (error) throw error;
}

// Taksit tutarları: toplam eşit bölünür, kuruş farkı son taksitte kapanır (toplam her zaman tutar).
export function installmentAmounts(totalMinor: number, count: number): number[] {
  const base = Math.floor(totalMinor / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? totalMinor - base * (count - 1) : base));
}

export interface PurchaseProgress {
  purchase: CardInstallmentPurchase;
  amounts: number[];
  /** Calendar progress only; this table has no payment linkage. */
  elapsedStatementCount: number;
  futureStatementMinor: number;
  monthlyMinor: number;
}

function monthIndex(isoDate: string): number {
  const [y, m] = isoDate.split('-').map(Number);
  return y * 12 + (m - 1);
}

export function progressOf(purchase: CardInstallmentPurchase, now: Date = new Date()): PurchaseProgress {
  const amounts = installmentAmounts(purchase.total_minor, purchase.installment_count);
  const currentMonth = now.getFullYear() * 12 + now.getMonth();
  const elapsed = currentMonth - monthIndex(purchase.first_statement_month);
  const elapsedStatementCount = Math.max(0, Math.min(purchase.installment_count, elapsed));
  const futureStatementMinor = amounts.slice(elapsedStatementCount).reduce((s, v) => s + v, 0);
  return { purchase, amounts, elapsedStatementCount, futureStatementMinor, monthlyMinor: amounts[0] };
}

export interface StatementLoad {
  /** YYYY-MM-01 */
  month: string;
  minor: number;
}

// Bugünden itibaren ekstre başına taksit yükü (içinde bulunulan ay dahil), en çok `months` ay.
export function statementLoads(purchases: CardInstallmentPurchase[], months = 6, now: Date = new Date()): StatementLoad[] {
  const start = now.getFullYear() * 12 + now.getMonth();
  const loads = Array.from({ length: months }, (_, i) => {
    const idx = start + i;
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    return { month: `${y}-${String(m).padStart(2, '0')}-01`, minor: 0 };
  });
  for (const purchase of purchases) {
    const amounts = installmentAmounts(purchase.total_minor, purchase.installment_count);
    const first = monthIndex(purchase.first_statement_month);
    amounts.forEach((amount, i) => {
      const slot = first + i - start;
      if (slot >= 0 && slot < months) loads[slot].minor += amount;
    });
  }
  return loads;
}

// Henüz hiçbir ekstreye girmemiş taksitlerin toplamı — banka bunları kullanılabilir limitten
// düşer. Kartın güncel borcu bir ekstreye dayanıyorsa (bkz. utils/cardDebt.ts) o ekstrenin
// kesim ayı ve öncesindeki taksitler ekstrenin içindedir; yoksa içinde bulunulan aydan itibaren
// taksitler bekliyor sayılır (progressOf ile aynı takvim kuralı).
export function pendingInstallmentMinor(
  purchases: CardInstallmentPurchase[],
  anchorCutoffDate: string | null,
  now: Date = new Date()
): number {
  const firstPendingMonth = anchorCutoffDate
    ? monthIndex(anchorCutoffDate) + 1
    : now.getFullYear() * 12 + now.getMonth();
  let total = 0;
  for (const purchase of purchases) {
    const amounts = installmentAmounts(purchase.total_minor, purchase.installment_count);
    const first = monthIndex(purchase.first_statement_month);
    amounts.forEach((amount, i) => {
      if (first + i >= firstPendingMonth) total += amount;
    });
  }
  return total;
}

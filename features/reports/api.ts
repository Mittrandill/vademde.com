import { supabase } from '@/services/supabase';
import {
  ACTIVE_OBLIGATION_STATUSES,
  listObligations,
  listInstallmentsDue,
  type ObligationDueItem,
} from '@/features/obligations/api';

export interface DateRange {
  from?: string;
  to?: string;
}

export interface IncomeExpenseTotals {
  incomeMinor: number;
  expenseMinor: number;
}

type RangeTransactionRow = {
  amount_minor: number;
  direction: string;
  account_id: string;
  transfer_to_account_id: string | null;
  occurred_at: string;
};

async function listRangeTransactions(workspaceId: string, range: DateRange): Promise<RangeTransactionRow[]> {
  let query = supabase
    .from('transactions')
    .select('amount_minor, direction, account_id, transfer_to_account_id, occurred_at')
    .eq('workspace_id', workspaceId);
  if (range.from) query = query.gte('occurred_at', range.from);
  if (range.to) query = query.lt('occurred_at', range.to);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getIncomeExpenseTotals(
  workspaceId: string,
  range: DateRange = {}
): Promise<IncomeExpenseTotals> {
  const rows = await listRangeTransactions(workspaceId, range);
  return rows.reduce<IncomeExpenseTotals>(
    (totals, row) => {
      if (row.direction === 'income') totals.incomeMinor += row.amount_minor;
      else if (row.direction === 'expense') totals.expenseMinor += row.amount_minor;
      return totals;
    },
    { incomeMinor: 0, expenseMinor: 0 }
  );
}

export interface MonthlyTotal {
  monthKey: string;
  label: string;
  incomeMinor: number;
  expenseMinor: number;
}

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('tr-TR', { month: 'short' });

// docs/03-bilgi-mimarisi-ekranlar.md §5.10 — Aylık karşılaştırma: son N ayın gelir/gider toplamı.
export async function getMonthlyComparison(workspaceId: string, monthsBack = 6): Promise<MonthlyTotal[]> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);
  const rows = await listRangeTransactions(workspaceId, { from: start.toISOString() });

  const buckets = new Map<string, MonthlyTotal>();
  for (let i = 0; i < monthsBack; i += 1) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1) + i, 1);
    const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
    buckets.set(key, { monthKey: key, label: MONTH_LABEL_FORMATTER.format(monthDate), incomeMinor: 0, expenseMinor: 0 });
  }

  for (const row of rows) {
    if (row.direction !== 'income' && row.direction !== 'expense') continue;
    const occurred = new Date(row.occurred_at);
    const key = `${occurred.getFullYear()}-${String(occurred.getMonth() + 1).padStart(2, '0')}`;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (row.direction === 'income') bucket.incomeMinor += row.amount_minor;
    else bucket.expenseMinor += row.amount_minor;
  }

  return Array.from(buckets.values());
}

export interface CategoryBreakdownItem {
  categoryId: string | null;
  name: string;
  amountMinor: number;
  percentage: number;
}

type CategoryTransactionRow = {
  amount_minor: number;
  category: { id: string; name: string } | null;
};

// docs/03-bilgi-mimarisi-ekranlar.md §5.10 — Kategori bazlı harcamalar/gelirler.
export async function getCategoryBreakdown(
  workspaceId: string,
  direction: 'income' | 'expense',
  range: DateRange = {}
): Promise<CategoryBreakdownItem[]> {
  let query = supabase
    .from('transactions')
    .select('amount_minor, category:categories(id, name)')
    .eq('workspace_id', workspaceId)
    .eq('direction', direction);
  if (range.from) query = query.gte('occurred_at', range.from);
  if (range.to) query = query.lt('occurred_at', range.to);

  const { data, error } = await query;
  if (error) throw error;

  const totals = new Map<string, { name: string; amountMinor: number }>();
  let grandTotal = 0;
  for (const row of data as unknown as CategoryTransactionRow[]) {
    const key = row.category?.id ?? 'uncategorized';
    const name = row.category?.name ?? 'Kategorisiz';
    const existing = totals.get(key) ?? { name, amountMinor: 0 };
    existing.amountMinor += row.amount_minor;
    totals.set(key, existing);
    grandTotal += row.amount_minor;
  }

  return Array.from(totals.entries())
    .map(([categoryId, value]) => ({
      categoryId: categoryId === 'uncategorized' ? null : categoryId,
      name: value.name,
      amountMinor: value.amountMinor,
      percentage: grandTotal > 0 ? value.amountMinor / grandTotal : 0,
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
}

export interface CounterpartyBreakdownItem {
  counterpartyId: string;
  name: string;
  amountMinor: number;
  count: number;
}

type CounterpartyTransactionRow = {
  amount_minor: number;
  counterparty: { id: string; name: string } | null;
};

// docs/03-bilgi-mimarisi-ekranlar.md §5.10 — Kişi/firma bazlı hareketler.
export async function getCounterpartyBreakdown(
  workspaceId: string,
  range: DateRange = {}
): Promise<CounterpartyBreakdownItem[]> {
  let query = supabase
    .from('transactions')
    .select('amount_minor, counterparty:counterparties(id, name)')
    .eq('workspace_id', workspaceId)
    .in('direction', ['income', 'expense'])
    .not('counterparty_id', 'is', null);
  if (range.from) query = query.gte('occurred_at', range.from);
  if (range.to) query = query.lt('occurred_at', range.to);

  const { data, error } = await query;
  if (error) throw error;

  const totals = new Map<string, CounterpartyBreakdownItem>();
  for (const row of data as unknown as CounterpartyTransactionRow[]) {
    if (!row.counterparty) continue;
    const existing = totals.get(row.counterparty.id) ?? {
      counterpartyId: row.counterparty.id,
      name: row.counterparty.name,
      amountMinor: 0,
      count: 0,
    };
    existing.amountMinor += row.amount_minor;
    existing.count += 1;
    totals.set(row.counterparty.id, existing);
  }

  return Array.from(totals.values()).sort((a, b) => b.amountMinor - a.amountMinor);
}

export interface AccountBalanceReportItem {
  accountId: string;
  name: string;
  currencyCode: string;
  balanceMinor: number;
}

// docs/03-bilgi-mimarisi-ekranlar.md §5.10 — Hesap bakiyeleri: açılış bakiyesi + gelir/gider
// + transferlerin hesap bazlı net etkisi (docs/01-finansal-kayit-modeli.md §8 — transfer
// toplam varlığı değiştirmez ama kaynak/hedef hesabı etkiler).
export async function getAccountBalances(workspaceId: string): Promise<AccountBalanceReportItem[]> {
  const [{ data: accounts, error: accountsError }, { data: transactions, error: transactionsError }] =
    await Promise.all([
      supabase
        .from('accounts')
        .select('id, name, currency_code, opening_balance_minor')
        .eq('workspace_id', workspaceId)
        .eq('is_archived', false)
        .order('created_at', { ascending: true }),
      supabase
        .from('transactions')
        .select('account_id, transfer_to_account_id, direction, amount_minor')
        .eq('workspace_id', workspaceId),
    ]);

  if (accountsError) throw accountsError;
  if (transactionsError) throw transactionsError;

  const deltas = new Map<string, number>();
  const addDelta = (accountId: string, delta: number) => deltas.set(accountId, (deltas.get(accountId) ?? 0) + delta);

  for (const tx of transactions) {
    if (tx.direction === 'income') addDelta(tx.account_id, tx.amount_minor);
    else if (tx.direction === 'expense') addDelta(tx.account_id, -tx.amount_minor);
    else if (tx.direction === 'transfer') {
      addDelta(tx.account_id, -tx.amount_minor);
      if (tx.transfer_to_account_id) addDelta(tx.transfer_to_account_id, tx.amount_minor);
    }
  }

  return accounts.map((account) => ({
    accountId: account.id,
    name: account.name,
    currencyCode: account.currency_code,
    balanceMinor: account.opening_balance_minor + (deltas.get(account.id) ?? 0),
  }));
}

// docs/01-finansal-kayit-modeli.md §3.4 — Gecikme: vade geçmiş ve kalan tutar > 0.
// Taksitli bir kredinin toplam bakiyesi yerine gecikmiş taksidin kendi tutarı
// gösterilsin diye (bkz. app/(tabs)/takvim.tsx, app/(tabs)/index.tsx aynı desen) —
// kredinin toplam borcu yalnızca /obligations/[id] detay sayfasında gösterilir.
export async function getOverdueObligations(workspaceId: string): Promise<ObligationDueItem[]> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [obligations, installmentItems] = await Promise.all([
    listObligations({ workspaceId, statuses: ACTIVE_OBLIGATION_STATUSES, dueTo: todayStr, pageSize: 200 }),
    listInstallmentsDue({ workspaceId, statuses: ACTIVE_OBLIGATION_STATUSES, dueTo: todayStr, pageSize: 200 }),
  ]);

  const overdueInstallments = installmentItems.filter(
    (i) => !!i.due_date && i.due_date < todayStr && i.remaining_amount_minor > 0
  );
  const obligationIdsWithInstallments = new Set(overdueInstallments.map((i) => i.id));
  const overdueObligations = obligations.filter(
    (o) =>
      !obligationIdsWithInstallments.has(o.id) &&
      !!o.due_date &&
      o.due_date < todayStr &&
      o.remaining_amount_minor > 0
  );

  return [...overdueObligations, ...overdueInstallments];
}

export interface ReportTransactionRow {
  occurredAt: string;
  description: string | null;
  direction: string;
  amountMinor: number;
  currencyCode: string;
  categoryName: string | null;
  counterpartyName: string | null;
  accountName: string | null;
}

type ExportTransactionRow = {
  occurred_at: string;
  description: string | null;
  direction: string;
  amount_minor: number;
  currency_code: string;
  category: { name: string } | null;
  counterparty: { name: string } | null;
  account: { name: string } | null;
};

// CSV dışa aktarma için tarih aralığındaki hareketleri okunabilir ilişki adlarıyla döndürür.
export async function listTransactionsForExport(
  workspaceId: string,
  range: DateRange = {}
): Promise<ReportTransactionRow[]> {
  let query = supabase
    .from('transactions')
    .select(
      'occurred_at, description, direction, amount_minor, currency_code, category:categories(name), counterparty:counterparties(name), account:accounts!transactions_account_id_fkey(name)'
    )
    .eq('workspace_id', workspaceId)
    .order('occurred_at', { ascending: false });
  if (range.from) query = query.gte('occurred_at', range.from);
  if (range.to) query = query.lt('occurred_at', range.to);

  const { data, error } = await query;
  if (error) throw error;

  return (data as unknown as ExportTransactionRow[]).map((row) => ({
    occurredAt: row.occurred_at,
    description: row.description,
    direction: row.direction,
    amountMinor: row.amount_minor,
    currencyCode: row.currency_code,
    categoryName: row.category?.name ?? null,
    counterpartyName: row.counterparty?.name ?? null,
    accountName: row.account?.name ?? null,
  }));
}

export interface CashFlowBucket {
  label: string;
  fromDay: number;
  toDay: number;
  payableMinor: number;
  receivableMinor: number;
}

const CASH_FLOW_BUCKET_DEFS: Array<Pick<CashFlowBucket, 'label' | 'fromDay' | 'toDay'>> = [
  { label: '0-7 Gün', fromDay: 0, toDay: 7 },
  { label: '8-14 Gün', fromDay: 8, toDay: 14 },
  { label: '15-30 Gün', fromDay: 15, toDay: 30 },
];

// docs/03-bilgi-mimarisi-ekranlar.md §5.10 — Beklenen nakit akışı: önümüzdeki 30 günün
// borç/alacak dağılımı, haftalık gruplarla.
export async function getCashFlowForecast(workspaceId: string, daysAhead = 30): Promise<CashFlowBucket[]> {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + daysAhead);
  const limitStr = limit.toISOString().slice(0, 10);

  const obligations = await listObligations({
    workspaceId,
    statuses: ACTIVE_OBLIGATION_STATUSES,
    dueFrom: todayStr,
    dueTo: limitStr,
    pageSize: 200,
  });

  const buckets: CashFlowBucket[] = CASH_FLOW_BUCKET_DEFS.map((def) => ({ ...def, payableMinor: 0, receivableMinor: 0 }));

  for (const obligation of obligations) {
    if (!obligation.due_date) continue;
    const diffDays = Math.round((new Date(obligation.due_date).getTime() - today.getTime()) / 86_400_000);
    const bucket = buckets.find((b) => diffDays >= b.fromDay && diffDays <= b.toDay);
    if (!bucket) continue;
    if (obligation.direction === 'payable') bucket.payableMinor += obligation.remaining_amount_minor;
    else bucket.receivableMinor += obligation.remaining_amount_minor;
  }

  return buckets;
}

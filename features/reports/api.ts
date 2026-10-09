import { supabase } from '@/services/supabase';
import { fetchAll } from '@/services/fetchAll';
import { computeCardDebt, type CardDebtStatement, type CardDebtTransaction, type CardStatementAnchor } from '@/utils/cardDebt';
import {
  ACTIVE_OBLIGATION_STATUSES,
  listAllObligations,
  listAllInstallmentsDue,
  getDueInfoByObligation,
  localIsoDate,
  type ObligationDueItem,
} from '@/features/obligations/api';
import { listValueUnitRates, sumToReferenceMinor, transactionToReferenceMinor } from '@/features/valueUnits/api';

// Kart ekstresinin tek satırlık toplam borç hareketi ("Kredi Kartı Ekstresi — Banka") bir
// harcama değildir: harcamalar kendi kategorileri ve tarihleriyle ayrı satırlar olarak zaten
// kayıtlıdır; bu toplam satırı kâr/zarar ve kategori raporlarında aynı harcamayı ikinci kez
// saymasın ve "Kategorisiz" kovasını şişirmesin diye analizden hariç tutulur.
export const EXCLUDE_CARD_STATEMENT_LUMP = 'description.is.null,description.not.ilike.Kredi Kartı Ekstresi*';


export interface DateRange {
  from?: string;
  to?: string;
}

export interface IncomeExpenseTotals {
  incomeMinor: number;
  expenseMinor: number;
}

// Hareketin gelir-gider raporuna giren kısmı: anapara payı (kredi/nakit avans/borç verme, bkz.
// transactions.financing_minor) hesap bakiyesini etkiler ama gelir ya da gider değildir. Pay tutarı
// aşamaz (eski sürümler tutarı düşürürken bu kolonu güncellemez — bkz. ilgili migration).
export function profitAndLossMinor(row: { amount_minor: number; financing_minor?: number | null }): number {
  return Math.max(0, row.amount_minor - Math.min(row.financing_minor ?? 0, row.amount_minor));
}

type RangeTransactionRow = {
  amount_minor: number;
  financing_minor: number;
  fx_rate_try_minor: number | null;
  direction: string;
  currency_code: string;
  account_id: string;
  transfer_to_account_id: string | null;
  occurred_at: string;
};

async function listRangeTransactions(workspaceId: string, range: DateRange): Promise<RangeTransactionRow[]> {
  return fetchAll<RangeTransactionRow>((from, to) => {
    let query = supabase
      .from('transactions')
      .select('amount_minor, financing_minor, fx_rate_try_minor, direction, currency_code, account_id, transfer_to_account_id, occurred_at')
      .eq('workspace_id', workspaceId)
      .or(EXCLUDE_CARD_STATEMENT_LUMP);
    if (range.from) query = query.gte('occurred_at', range.from);
    if (range.to) query = query.lt('occurred_at', range.to);
    return query.order('id').range(from, to);
  });
}

export async function getIncomeExpenseTotals(
  workspaceId: string,
  range: DateRange = {}
): Promise<IncomeExpenseTotals> {
  const [rows, rates] = await Promise.all([listRangeTransactions(workspaceId, range), listValueUnitRates()]);
  return rows.reduce<IncomeExpenseTotals>(
    (totals, row) => {
      const refMinor = transactionToReferenceMinor({ amountMinor: profitAndLossMinor(row), unitCode: row.currency_code, fxRateTryMinor: row.fx_rate_try_minor }, rates);
      if (row.direction === 'income') totals.incomeMinor += refMinor;
      else if (row.direction === 'expense') totals.expenseMinor += refMinor;
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
  const [rows, rates] = await Promise.all([
    listRangeTransactions(workspaceId, { from: start.toISOString() }),
    listValueUnitRates(),
  ]);

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
    const refMinor = transactionToReferenceMinor({ amountMinor: profitAndLossMinor(row), unitCode: row.currency_code, fxRateTryMinor: row.fx_rate_try_minor }, rates);
    if (row.direction === 'income') bucket.incomeMinor += refMinor;
    else bucket.expenseMinor += refMinor;
  }

  return Array.from(buckets.values());
}

export interface CategoryBreakdownItem {
  categoryId: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  amountMinor: number;
  percentage: number;
}

type CategoryTransactionRow = {
  amount_minor: number;
  financing_minor: number;
  fx_rate_try_minor: number | null;
  currency_code: string;
  category: { id: string; name: string; icon: string | null; color: string | null } | null;
};

// docs/03-bilgi-mimarisi-ekranlar.md §5.10 — Kategori bazlı harcamalar/gelirler.
export async function getCategoryBreakdown(
  workspaceId: string,
  direction: 'income' | 'expense',
  range: DateRange = {}
): Promise<CategoryBreakdownItem[]> {
  const [data, rates] = await Promise.all([
    fetchAll<CategoryTransactionRow>((from, to) => {
      let query = supabase
        .from('transactions')
        .select('amount_minor, financing_minor, fx_rate_try_minor, currency_code, category:categories(id, name, icon, color)')
        .eq('workspace_id', workspaceId)
        .eq('direction', direction)
        .or(EXCLUDE_CARD_STATEMENT_LUMP);
      if (range.from) query = query.gte('occurred_at', range.from);
      if (range.to) query = query.lt('occurred_at', range.to);
      return query.order('id').range(from, to) as unknown as PromiseLike<{ data: CategoryTransactionRow[] | null; error: never }>;
    }),
    listValueUnitRates(),
  ]);

  const totals = new Map<string, { name: string; icon: string | null; color: string | null; amountMinor: number }>();
  let grandTotal = 0;
  for (const row of data) {
    if (profitAndLossMinor(row) <= 0) continue;
    const key = row.category?.id ?? 'uncategorized';
    const name = row.category?.name ?? 'Kategorisiz';
    const existing =
      totals.get(key) ?? { name, icon: row.category?.icon ?? null, color: row.category?.color ?? null, amountMinor: 0 };
    const refMinor = transactionToReferenceMinor({ amountMinor: profitAndLossMinor(row), unitCode: row.currency_code, fxRateTryMinor: row.fx_rate_try_minor }, rates);
    existing.amountMinor += refMinor;
    totals.set(key, existing);
    grandTotal += refMinor;
  }

  return Array.from(totals.entries())
    .map(([categoryId, value]) => ({
      categoryId: categoryId === 'uncategorized' ? null : categoryId,
      name: value.name,
      icon: value.icon,
      color: value.color,
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
  financing_minor: number;
  fx_rate_try_minor: number | null;
  currency_code: string;
  counterparty: { id: string; name: string } | null;
};

// docs/03-bilgi-mimarisi-ekranlar.md §5.10 — Kişi/firma bazlı hareketler.
export async function getCounterpartyBreakdown(
  workspaceId: string,
  range: DateRange = {}
): Promise<CounterpartyBreakdownItem[]> {
  const [data, rates] = await Promise.all([
    fetchAll<CounterpartyTransactionRow>((from, to) => {
      let query = supabase
        .from('transactions')
        .select('amount_minor, financing_minor, fx_rate_try_minor, currency_code, counterparty:counterparties(id, name)')
        .eq('workspace_id', workspaceId)
        .in('direction', ['income', 'expense'])
        .not('counterparty_id', 'is', null)
        .or(EXCLUDE_CARD_STATEMENT_LUMP);
      if (range.from) query = query.gte('occurred_at', range.from);
      if (range.to) query = query.lt('occurred_at', range.to);
      return query.order('id').range(from, to) as unknown as PromiseLike<{ data: CounterpartyTransactionRow[] | null; error: never }>;
    }),
    listValueUnitRates(),
  ]);

  const totals = new Map<string, CounterpartyBreakdownItem>();
  for (const row of data) {
    if (!row.counterparty || profitAndLossMinor(row) <= 0) continue;
    const existing = totals.get(row.counterparty.id) ?? {
      counterpartyId: row.counterparty.id,
      name: row.counterparty.name,
      amountMinor: 0,
      count: 0,
    };
    existing.amountMinor += transactionToReferenceMinor({ amountMinor: profitAndLossMinor(row), unitCode: row.currency_code, fxRateTryMinor: row.fx_rate_try_minor }, rates);
    existing.count += 1;
    totals.set(row.counterparty.id, existing);
  }

  return Array.from(totals.values()).sort((a, b) => b.amountMinor - a.amountMinor);
}

export interface AccountBalanceReportItem {
  accountId: string;
  name: string;
  type: string;
  bankCode: string | null;
  currencyCode: string;
  balanceMinor: number;
  /** Yalnızca kredi kartında: güncel borcun dayandığı en son ekstre (yoksa null). */
  cardStatement?: CardStatementAnchor | null;
}

type BalanceTransactionRow = CardDebtTransaction;
type StatementRow = {
  id: string;
  account_id: string | null;
  total_amount_minor: number;
  remaining_amount_minor: number;
  due_date: string | null;
  status: string;
  created_at: string;
  payments: { amount_minor: number; transaction: { transfer_to_account_id: string | null } | null }[] | null;
};
type CashAdvanceRow = { account_id: string | null; remaining_amount_minor: number; created_at: string; status: string };

// docs/03-bilgi-mimarisi-ekranlar.md §5.10 — Hesap bakiyeleri: açılış bakiyesi + gelir/gider
// + transferlerin hesap bazlı net etkisi (docs/01-finansal-kayit-modeli.md §8 — transfer
// toplam varlığı değiştirmez ama kaynak/hedef hesabı etkiler). Kredi kartında borç, girilmiş
// en son ekstreye dayanır (bkz. utils/cardDebt.ts — ekstre çapası).
export async function getAccountBalances(workspaceId: string): Promise<AccountBalanceReportItem[]> {
  const [{ data: accounts, error: accountsError }, transactions] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, name, type, bank_code, currency_code, opening_balance_minor, statement_day, payment_due_day, created_at')
      .eq('workspace_id', workspaceId)
      .eq('is_archived', false)
      .order('created_at', { ascending: true }),
    // 1.000 hareketi aşan çalışma alanlarında bakiye eksik hesaplanmasın diye sayfa sayfa okunur.
    fetchAll<BalanceTransactionRow>((from, to) =>
      supabase
        .from('transactions')
        .select('account_id, transfer_to_account_id, direction, amount_minor, occurred_at')
        .eq('workspace_id', workspaceId)
        .order('id')
        .range(from, to)
    ),
  ]);

  if (accountsError) throw accountsError;

  const hasCards = accounts.some((a) => a.type === 'credit_card');
  const [statements, cashAdvances] = hasCards
    ? await Promise.all([
        fetchAll<StatementRow>((from, to) =>
          supabase
            .from('obligations')
            .select('id, account_id, total_amount_minor, remaining_amount_minor, due_date, status, created_at, payments(amount_minor, transaction:transactions(transfer_to_account_id))')
            .eq('workspace_id', workspaceId)
            .eq('document_type', 'kredi_karti_ekstresi')
            .order('id')
            .range(from, to) as unknown as PromiseLike<{ data: StatementRow[] | null; error: never }>
        ),
        fetchAll<CashAdvanceRow>((from, to) =>
          supabase
            .from('obligations')
            .select('account_id, remaining_amount_minor, created_at, status')
            .eq('workspace_id', workspaceId)
            .eq('document_type', 'nakit_avans')
            .order('id')
            .range(from, to)
        ),
      ])
    : [[] as StatementRow[], [] as CashAdvanceRow[]];

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

  return accounts.map((account) => {
    const base = {
      accountId: account.id,
      name: account.name,
      type: account.type,
      bankCode: account.bank_code,
      currencyCode: account.currency_code,
    };
    if (account.type === 'credit_card') {
      // Kredi kartı bir varlık değil borç hesabıdır: harcama borcu artırır, karta ödeme azaltır.
      // opening_balance_minor kart için "güncel kart borcu" olarak pozitif girilir.
      const cardTransactions = transactions.filter(
        (tx) => tx.account_id === account.id || tx.transfer_to_account_id === account.id
      );
      const cardStatements: CardDebtStatement[] = statements
        .filter((o) => o.account_id === account.id)
        .map((o) => ({
          id: o.id,
          total_amount_minor: o.total_amount_minor,
          remaining_amount_minor: o.remaining_amount_minor,
          due_date: o.due_date,
          status: o.status,
          created_at: o.created_at,
          off_card_paid_minor: (o.payments ?? [])
            .filter((p) => p.transaction?.transfer_to_account_id !== account.id)
            .reduce((sum, p) => sum + p.amount_minor, 0),
        }));
      const { debtMinor, anchor } = computeCardDebt(
        account,
        cardTransactions,
        cardStatements,
        cashAdvances.filter((a) => a.account_id === account.id)
      );
      return { ...base, balanceMinor: debtMinor, cardStatement: anchor };
    }
    return { ...base, balanceMinor: account.opening_balance_minor + (deltas.get(account.id) ?? 0) };
  });
}

// docs/01-finansal-kayit-modeli.md §3.4 — Gecikme: vade geçmiş ve kalan tutar > 0.
// Taksitli bir kredinin toplam bakiyesi yerine gecikmiş taksidin kendi tutarı
// gösterilsin diye (bkz. app/(tabs)/takvim.tsx, app/(tabs)/index.tsx aynı desen) —
// kredinin toplam borcu yalnızca /obligations/[id] detay sayfasında gösterilir.
export async function getOverdueObligations(workspaceId: string): Promise<ObligationDueItem[]> {
  const todayStr = localIsoDate();
  const [obligations, installmentItems] = await Promise.all([
    // Tüm sayfalar okunur: sabit 200 sınırı aşılınca taksitli bir kayıt "taksitsiz" sanılıp
    // kalan borcun tamamıyla hayalet bir gecikme satırı olarak görünebiliyordu.
    listAllObligations({ workspaceId, statuses: ACTIVE_OBLIGATION_STATUSES, dueTo: todayStr }),
    listAllInstallmentsDue({ workspaceId, statuses: ACTIVE_OBLIGATION_STATUSES, dueTo: todayStr }),
  ]);

  const overdueInstallments = installmentItems.filter(
    (i) => !!i.due_date && i.due_date < todayStr && i.remaining_amount_minor > 0
  );
  // Taksitli bir kaydın (ör. abonelik) ilk taksidi geçmişte olsa bile, o taksit zaten
  // ödenmişse (remaining 0) obligationIdsWithInstallments eskiden bunu içermiyordu —
  // yalnızca HÂLÂ gecikmiş olan taksitlerden kuruluyordu. Sonuç: geçmiş taksitlerin
  // tamamı ödenmiş ama gelecekteki taksitler yüzünden obligation'ın toplam kalan
  // bakiyesi hâlâ >0 olan bir kayıt, aşağıdaki "düz obligation" dalına düşüp donmuş
  // (ilk taksidin) vade tarihi ve toplam kalan bakiyeyle hayalet bir "gecikmiş" satırı
  // olarak görünüyordu — ödenmiş taksitler de dahil TÜM geçmiş/bugünkü taksitler
  // hariç tutulmalı, obligation'ın kendi satırı yalnızca hiç taksiti olmayan kayıtlarda
  // devreye girsin.
  const obligationIdsWithInstallments = new Set(installmentItems.map((i) => i.id));
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
  const data = await fetchAll((from, to) => {
    let query = supabase
      .from('transactions')
      .select(
        'occurred_at, description, direction, amount_minor, currency_code, category:categories(name), counterparty:counterparties(name), account:accounts!transactions_account_id_fkey(name)'
      )
      .eq('workspace_id', workspaceId)
      .order('occurred_at', { ascending: false }).order('id').range(from, to);
    if (range.from) query = query.gte('occurred_at', range.from);
    if (range.to) query = query.lt('occurred_at', range.to);
    return query;
  });

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
// borç/alacak dağılımı, haftalık gruplarla. Taksitli kayıtlar (kredi, abonelik...) taksit
// vadelerinden gelir: kaydın kendi vadesi ilk taksit tarihidir ve kalan tutarı TÜM taksitleri
// kapsar — onunla hesaplamak ilk taksit tarihine bütün borcu yazar, sonraki taksitleri atlardı.
export async function getCashFlowForecast(workspaceId: string, daysAhead = 30): Promise<CashFlowBucket[]> {
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayStr = localIsoDate(todayMidnight);
  const limit = new Date(todayMidnight);
  limit.setDate(limit.getDate() + daysAhead);
  const limitStr = localIsoDate(limit);

  const [obligations, installmentItems, rates] = await Promise.all([
    listAllObligations({
      workspaceId,
      statuses: ACTIVE_OBLIGATION_STATUSES,
      dueFrom: todayStr,
      dueTo: limitStr,
    }),
    listAllInstallmentsDue({
      workspaceId,
      statuses: ACTIVE_OBLIGATION_STATUSES,
      dueFrom: todayStr,
      dueTo: limitStr,
    }),
    listValueUnitRates(),
  ]);
  const info = await getDueInfoByObligation(workspaceId, obligations);
  const plain = obligations.filter((o) => !info[o.id]?.hasInstallments);

  const buckets: CashFlowBucket[] = CASH_FLOW_BUCKET_DEFS.map((def) => ({ ...def, payableMinor: 0, receivableMinor: 0 }));

  for (const obligation of [...plain, ...installmentItems]) {
    if (!obligation.due_date || obligation.remaining_amount_minor <= 0) continue;
    const [y, m, d] = obligation.due_date.split('-').map(Number);
    const diffDays = Math.round((new Date(y, m - 1, d).getTime() - todayMidnight.getTime()) / 86_400_000);
    const bucket = buckets.find((b) => diffDays >= b.fromDay && diffDays <= b.toDay);
    if (!bucket) continue;
    const refMinor = sumToReferenceMinor(
      [{ amountMinor: obligation.remaining_amount_minor, unitCode: obligation.currency_code }],
      rates
    );
    if (obligation.direction === 'payable') bucket.payableMinor += refMinor;
    else bucket.receivableMinor += refMinor;
  }

  return buckets;
}

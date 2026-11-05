import { supabase } from '@/services/supabase';
import { fetchAll } from '@/services/fetchAll';
import { computeCardDebt, type CardDebtAccount, type CardDebtCharge, type CardDebtStatement, type CardDebtTransaction, type CardStatementAnchor } from '@/utils/cardDebt';
import { projectCardLedger, type LedgerPayment, type StatementProjection } from '@/supabase/functions/_shared/cardLedger';
import { buildCardDueItems } from '@/utils/cardDues';

export interface AccountBalanceReportItem {
  accountId: string;
  name: string;
  type: string;
  bankCode: string | null;
  currencyCode: string;
  balanceMinor: number;
  /** Yalnızca kredi kartında: güncel borcun dayandığı en son ekstre (yoksa null). */
  cardStatement?: CardStatementAnchor | null;
  /** Yalnızca kredi kartında: ekstreyle karşılanmayan borcun kalemleri (son ödeme dağıtımı için). */
  cardCharges?: CardDebtCharge[];
  cardPaymentStatement?: CardStatementAnchor | null;
  cardStatementProjections?: StatementProjection[];
  cardAccount?: CardDebtAccount & { workspace_id: string; name: string; type: string; bank_code: string | null; currency_code: string; is_archived?: boolean };
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
  statement_date?: string | null;
  payments: LedgerPayment[] | null;
  installments?: { id: string }[] | null;
};
type CashAdvanceRow = { account_id: string | null; remaining_amount_minor: number; created_at: string; status: string };

// docs/03-bilgi-mimarisi-ekranlar.md §5.10 — Hesap bakiyeleri: açılış bakiyesi + gelir/gider
// + transferlerin hesap bazlı net etkisi (docs/01-finansal-kayit-modeli.md §8 — transfer
// toplam varlığı değiştirmez ama kaynak/hedef hesabı etkiler). Kredi kartında borç, girilmiş
// en son ekstreye dayanır (bkz. utils/cardDebt.ts — ekstre çapası).
export async function getAccountBalances(workspaceId: string, options: { includeArchived?: boolean } = {}): Promise<AccountBalanceReportItem[]> {
  let accountsRequest = supabase.from('accounts')
    .select('id, workspace_id, name, type, bank_code, currency_code, opening_balance_minor, opening_balance_set_at, statement_day, payment_due_day, created_at, is_archived')
    .eq('workspace_id', workspaceId);
  if (!options.includeArchived) accountsRequest = accountsRequest.eq('is_archived', false);
  const [{ data: accounts, error: accountsError }, transactions] = await Promise.all([
    accountsRequest.order('created_at', { ascending: true }),
    // 1.000 hareketi aşan çalışma alanlarında bakiye eksik hesaplanmasın diye sayfa sayfa okunur.
    fetchAll<BalanceTransactionRow>((from, to) =>
      supabase
        .from('transactions')
        .select('id, account_id, transfer_to_account_id, direction, amount_minor, occurred_at')
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
            .select('id, account_id, total_amount_minor, remaining_amount_minor, due_date, statement_date, status, created_at, installments(id), payments!payments_obligation_id_fkey(id, amount_minor, paid_at, transaction:transactions(id, account_id, transfer_to_account_id, direction, amount_minor, occurred_at))')
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
          statement_date: o.statement_date,
          payments: o.payments ?? [],
          off_card_paid_minor: (o.payments ?? [])
            .filter((p) => p.transaction?.transfer_to_account_id !== account.id)
            .reduce((sum, p) => sum + p.amount_minor, 0),
        }));
      // Historical installment statements are payment plans, not plain monthly
      // snapshots. Keep their existing calculation and schedule together.
      const hasLegacyPlan = statements.some((row) => row.account_id === account.id && row.installments?.length);
      const calculate = hasLegacyPlan ? computeCardDebt : projectCardLedger;
      const inputStatements = hasLegacyPlan ? cardStatements.map((row) => ({ ...row, payments: undefined })) : cardStatements;
      const { debtMinor, anchor, charges, paymentAnchor, statementProjections } = calculate(
        account,
        cardTransactions,
        inputStatements,
        cashAdvances.filter((a) => a.account_id === account.id)
      );
      return { ...base, balanceMinor: debtMinor, cardStatement: anchor, cardCharges: charges,
        cardPaymentStatement: paymentAnchor ?? anchor, cardStatementProjections: statementProjections, cardAccount: account };
    }
    return { ...base, balanceMinor: account.opening_balance_minor + (deltas.get(account.id) ?? 0) };
  });
}

export async function getCardStatementProjectionMap(workspaceId: string): Promise<Map<string, StatementProjection>> {
  return (await getCardFinancialContext(workspaceId)).projections;
}

export async function getCardFinancialContext(workspaceId: string) {
  const balances = await getAccountBalances(workspaceId, { includeArchived: true });
  const projections = new Map(balances.flatMap((balance) => (balance.cardStatementProjections ?? []).map((row) => [row.statementId, row] as const)));
  const accounts = balances.flatMap((balance) => balance.cardAccount && !balance.cardAccount.is_archived ? [balance.cardAccount] : []);
  const statementRefs = balances.flatMap((balance) => (balance.cardStatementProjections ?? []).map((row) => ({
    account_id: balance.accountId, due_date: row.dueDate, statement_date: row.cutoffDate,
    status: row.remainingMinor > 0 ? 'bekliyor' : 'odendi', remaining_amount_minor: row.dueMinor,
  })));
  return { balances, projections, unbilledDues: buildCardDueItems(accounts, balances, statementRefs) };
}

export function applyStatementProjection<T extends { id: string; document_type?: string; remaining_amount_minor: number; total_amount_minor?: number }>(
  row: T, projections: Map<string, StatementProjection>, view: 'due' | 'snapshot' = 'due',
): T & { card_statement_projection?: StatementProjection } {
  const projection = projections.get(row.id);
  if (!projection || (row.document_type && row.document_type !== 'kredi_karti_ekstresi')) return row;
  return { ...row,
    ...(view === 'due' && row.total_amount_minor !== undefined ? { total_amount_minor: projection.introducedMinor } : {}),
    remaining_amount_minor: view === 'due' ? projection.dueMinor : projection.remainingMinor,
    card_statement_projection: projection,
  };
}

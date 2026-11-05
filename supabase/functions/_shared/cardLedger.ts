// Pure read projection shared by mobile totals and server reminders.
// Statements are balance snapshots. No payment, transaction or historical row is rewritten.
export interface LedgerAccount {
  id: string;
  statement_day: number | null;
  payment_due_day: number | null;
}

export interface LedgerTransaction {
  id?: string;
  account_id: string;
  transfer_to_account_id: string | null;
  direction: string;
  amount_minor: number;
  occurred_at: string;
}

export interface LedgerPayment {
  id?: string;
  amount_minor: number;
  paid_at?: string;
  transaction?: ({ transfer_to_account_id: string | null } & Partial<LedgerTransaction>) | null;
}

export interface LedgerStatement {
  id: string;
  total_amount_minor: number;
  remaining_amount_minor: number;
  statement_date?: string | null;
  due_date: string | null;
  created_at: string;
  status: string;
  payments?: LedgerPayment[];
}

export interface StatementProjection {
  statementId: string;
  cutoffDate: string;
  cutoffEstimated: boolean;
  dueDate: string;
  totalMinor: number;
  /** Snapshot balance still outstanding, including unpaid balance carried from earlier cycles. */
  remainingMinor: number;
  /** Only this cycle's outstanding contribution. These contributions can safely be summed. */
  dueMinor: number;
  introducedMinor: number;
  carriedMinor: number;
  carriedIntoStatementId: string | null;
  isFuture?: boolean;
}

export interface CardCredit {
  day: string;
  amountMinor: number;
  source: 'card' | 'off_card' | 'legacy';
}

export interface LedgerBalanceAccount extends LedgerAccount {
  opening_balance_minor: number;
  created_at: string;
  opening_balance_set_at?: string | null;
}

export interface LedgerCashAdvance {
  remaining_amount_minor: number;
  created_at: string;
  status: string;
}

// A payment and its transfer can be read in separate requests. If a transfer was
// committed between those reads, its nested payment relation completes this read.
function completeTransactions(transactions: LedgerTransaction[], statements: LedgerStatement[]): LedgerTransaction[] {
  const result = [...transactions];
  const seen = new Set(transactions.flatMap((tx) => tx.id ? [tx.id] : []));
  for (const statement of statements) for (const payment of statement.payments ?? []) {
    const tx = payment.transaction;
    if (!tx?.id || seen.has(tx.id) || !tx.account_id || !tx.direction || !tx.occurred_at || tx.amount_minor === undefined) continue;
    result.push(tx as LedgerTransaction);
    seen.add(tx.id);
  }
  return result;
}

export function ledgerDebtDelta(cardId: string, tx: LedgerTransaction): number {
  if (tx.direction === 'transfer') {
    if (tx.account_id === cardId) return tx.amount_minor;
    if (tx.transfer_to_account_id === cardId) return -tx.amount_minor;
  } else if (tx.account_id === cardId) {
    if (tx.direction === 'expense') return tx.amount_minor;
    if (tx.direction === 'income') return -tx.amount_minor;
  }
  return 0;
}

export function projectCardLedger(account: LedgerBalanceAccount, transactions: LedgerTransaction[],
  statements: LedgerStatement[], cashAdvances: LedgerCashAdvance[], today: string = ledgerDay(new Date())) {
  const recorded = completeTransactions(transactions, statements).filter((tx) => ledgerDay(tx.occurred_at) <= today);
  const advances = cashAdvances.filter((a) => a.status !== 'iptal_edildi' && a.remaining_amount_minor > 0 && ledgerDay(a.created_at) <= today);
  const projection = projectCardStatements(account, recorded, statements, today);
  const active = projection.active;
  const openingDay = ledgerDay(account.opening_balance_set_at ?? account.created_at);
  const openingIsNewer = account.opening_balance_minor !== 0 && openingDay > (active?.cutoffDate ?? '');
  const cutoff = active && !openingIsNewer ? active.cutoffDate : null;
  const relevantTransactions = cutoff ? recorded.filter((tx) => ledgerDay(tx.occurred_at) > cutoff) : recorded;
  const relevantAdvances = cutoff ? advances.filter((a) => ledgerDay(a.created_at) > cutoff) : advances;
  const offCardPaid = projection.credits.filter((credit) => credit.source !== 'card' && credit.day > (cutoff ?? openingDay))
    .reduce((sum, credit) => sum + credit.amountMinor, 0);
  const debtMinor = (cutoff && active ? active.totalMinor : account.opening_balance_minor) - offCardPaid +
    relevantTransactions.reduce((sum, tx) => sum + ledgerDebtDelta(account.id, tx), 0) +
    relevantAdvances.reduce((sum, advance) => sum + advance.remaining_amount_minor, 0);
  const capped = projectCardStatements(account, recorded, statements, today, Math.max(0, debtMinor));
  const paymentAnchor = capped.active ? {
    statementId: capped.active.statementId, cutoffDate: capped.active.cutoffDate,
    cutoffEstimated: capped.active.cutoffEstimated, dueDate: capped.active.dueDate,
    statementTotalMinor: capped.active.totalMinor, statementRemainingMinor: capped.active.remainingMinor,
  } : null;
  const charges = [
    ...relevantTransactions.map((tx) => ({ day: ledgerDay(tx.occurred_at), amountMinor: ledgerDebtDelta(account.id, tx), isOpening: false }))
      .filter((charge) => charge.amountMinor > 0),
    ...relevantAdvances.map((a) => ({ day: ledgerDay(a.created_at), amountMinor: a.remaining_amount_minor, isOpening: false })),
  ];
  if (!cutoff && account.opening_balance_minor > 0) charges.push({ day: openingDay, amountMinor: account.opening_balance_minor, isOpening: true });
  return { debtMinor, anchor: cutoff ? paymentAnchor : null, paymentAnchor, charges, statementProjections: capped.statements };
}

export function ledgerDay(value: string | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthDay(year: number, month: number, day: number): Date {
  return new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()), 12);
}

function calendarPeriod(account: Pick<LedgerAccount, 'statement_day' | 'payment_due_day'>, year: number, month: number) {
  if (!account.statement_day) return null;
  const cutoff = monthDay(year, month, account.statement_day);
  const dueDay = account.payment_due_day ?? account.statement_day;
  let due = monthDay(year, month, dueDay);
  if (due <= cutoff) due = monthDay(year, month + 1, dueDay);
  return { cutoff, due };
}

/** Retains the historical inference rule for undated statements. */
export function inferCardStatementCutoff(
  account: Pick<LedgerAccount, 'statement_day' | 'payment_due_day'>,
  dueDate: string,
  enteredAt: string,
): { date: string; estimated: boolean } {
  const [year, month, day] = dueDate.slice(0, 10).split('-').map(Number);
  const guessed = ledgerDay(new Date(year, month - 1, day - 10, 12));
  const entered = ledgerDay(enteredAt);
  const estimate = { date: entered < guessed ? entered : guessed, estimated: true };
  if (!account.statement_day) return estimate;
  const same = calendarPeriod(account, year, month - 1);
  const previous = calendarPeriod(account, year, month - 2);
  const chosen = same && ledgerDay(same.due) === dueDate.slice(0, 10) ? same
    : previous && ledgerDay(previous.due) === dueDate.slice(0, 10) ? previous : same;
  if (!chosen || ledgerDay(chosen.cutoff) > dueDate.slice(0, 10)) return estimate;
  return { date: ledgerDay(chosen.cutoff), estimated: false };
}

export function collectCardCredits(
  account: LedgerAccount,
  transactions: LedgerTransaction[],
  statements: LedgerStatement[],
  today: string,
): CardCredit[] {
  const credits: CardCredit[] = [];
  for (const tx of transactions) {
    if ((tx.direction === 'transfer' && tx.transfer_to_account_id === account.id && tx.account_id !== account.id) ||
        (tx.direction === 'income' && tx.account_id === account.id)) {
      const day = ledgerDay(tx.occurred_at);
      if (day <= today) credits.push({ day, amountMinor: tx.amount_minor, source: 'card' });
    }
  }
  const seenPayments = new Set<string>();
  const latestByCutoff = new Map<string, LedgerStatement>();
  for (const statement of [...statements].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))) {
    if (statement.status !== 'iptal_edildi' && statement.due_date) {
      latestByCutoff.set(statement.statement_date ?? inferCardStatementCutoff(account, statement.due_date, statement.created_at).date, statement);
    }
  }
  for (const statement of statements) {
    if (statement.status === 'iptal_edildi' || !statement.due_date) continue;
    let knownPaid = 0;
    for (const payment of statement.payments ?? []) {
      knownPaid += payment.amount_minor;
      if (payment.transaction?.transfer_to_account_id === account.id) continue;
      if (payment.id && seenPayments.has(payment.id)) continue;
      if (payment.id) seenPayments.add(payment.id);
      const day = ledgerDay(payment.paid_at ?? statement.created_at);
      if (day <= today) credits.push({ day, amountMinor: payment.amount_minor, source: 'off_card' });
    }
    // Older imported records can have progress without a corresponding payment row.
    // Honor that progress in the read projection; never invent a persisted cash movement.
    const legacyPaid = Math.max(0, statement.total_amount_minor - statement.remaining_amount_minor - knownPaid);
    if (legacyPaid > 0) {
      const cutoff = statement.statement_date ?? inferCardStatementCutoff(account, statement.due_date, statement.created_at).date;
      if (latestByCutoff.get(cutoff)?.id !== statement.id) continue;
      const date = new Date(`${cutoff}T12:00:00`);
      date.setDate(date.getDate() + 1);
      const day = ledgerDay(date);
      if (day <= today) credits.push({ day, amountMinor: legacyPaid, source: 'legacy' });
    }
  }
  return credits.filter((credit) => credit.amountMinor > 0).sort((a, b) => a.day.localeCompare(b.day));
}

export function projectCardStatements(
  account: LedgerAccount,
  transactions: LedgerTransaction[],
  statements: LedgerStatement[],
  today: string = ledgerDay(new Date()),
  maximumBilledMinor?: number,
): { statements: StatementProjection[]; credits: CardCredit[]; active: StatementProjection | null } {
  const credits = collectCardCredits(account, transactions, statements, today);
  const candidates = statements.filter((s) => s.status !== 'iptal_edildi' && s.due_date).map((statement) => {
    const cutoff = statement.statement_date ? { date: statement.statement_date, estimated: false }
      : inferCardStatementCutoff(account, statement.due_date as string, statement.created_at);
    return { statement, cutoff };
  }).filter((row) => row.cutoff.date <= today).sort((a, b) =>
    a.cutoff.date.localeCompare(b.cutoff.date) || a.statement.created_at.localeCompare(b.statement.created_at) || a.statement.id.localeCompare(b.statement.id));

  // Multiple legacy snapshots on the same closing date are alternatives, not new debt.
  const selected = new Map<string, typeof candidates[number]>();
  for (const row of candidates) selected.set(row.cutoff.date, row);
  const ordered = [...selected.values()];
  const buckets: { statementId: string; dueDate: string; amountMinor: number; introducedMinor: number }[] = [];
  const total = () => buckets.reduce((sum, bucket) => sum + bucket.amountMinor, 0);
  const consume = (amount: number) => {
    let left = amount;
    for (const bucket of [...buckets].sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
      const take = Math.min(left, bucket.amountMinor);
      bucket.amountMinor -= take;
      left -= take;
      if (left <= 0) break;
    }
  };
  let previousCutoff: string | null = null;
  for (const { statement, cutoff } of ordered) {
    if (previousCutoff) {
      consume(credits.filter((credit) => credit.day > (previousCutoff as string) && credit.day <= cutoff.date)
        .reduce((sum, credit) => sum + credit.amountMinor, 0));
    }
    const target = Math.max(0, statement.total_amount_minor);
    const difference = target - total();
    if (difference < 0) consume(-difference);
    buckets.push({ statementId: statement.id, dueDate: statement.due_date as string,
      amountMinor: Math.max(0, difference), introducedMinor: Math.max(0, difference) });
    previousCutoff = cutoff.date;
  }
  if (previousCutoff) {
    consume(credits.filter((credit) => credit.day > (previousCutoff as string)).reduce((sum, credit) => sum + credit.amountMinor, 0));
  }
  // A more recent legacy opening-balance snapshot can further limit the known debt.
  if (maximumBilledMinor !== undefined && total() > Math.max(0, maximumBilledMinor)) consume(total() - Math.max(0, maximumBilledMinor));
  const projections: StatementProjection[] = [];
  let carried = 0;
  ordered.forEach(({ statement, cutoff }, index) => {
    const bucket = buckets[index];
    const remaining = carried + bucket.amountMinor;
    projections.push({ statementId: statement.id, cutoffDate: cutoff.date, cutoffEstimated: cutoff.estimated,
      dueDate: statement.due_date as string, totalMinor: statement.total_amount_minor, remainingMinor: remaining,
      dueMinor: bucket.amountMinor, introducedMinor: bucket.introducedMinor, carriedMinor: carried,
      carriedIntoStatementId: ordered[index + 1]?.statement.id ?? null });
    carried = remaining;
  });
  for (const { statement, cutoff } of candidates) {
    const replacement = selected.get(cutoff.date)?.statement.id;
    if (replacement && replacement !== statement.id) {
      projections.push({ statementId: statement.id, cutoffDate: cutoff.date, cutoffEstimated: cutoff.estimated,
        dueDate: statement.due_date as string, totalMinor: statement.total_amount_minor, remainingMinor: 0,
        dueMinor: 0, introducedMinor: 0, carriedMinor: 0, carriedIntoStatementId: replacement });
    }
  }
  for (const statement of statements) {
    if (statement.status === 'iptal_edildi' || !statement.due_date) continue;
    const cutoff = statement.statement_date ? { date: statement.statement_date, estimated: false }
      : inferCardStatementCutoff(account, statement.due_date, statement.created_at);
    if (cutoff.date > today) projections.push({ statementId: statement.id, cutoffDate: cutoff.date,
      cutoffEstimated: cutoff.estimated, dueDate: statement.due_date, totalMinor: statement.total_amount_minor,
      remainingMinor: 0, dueMinor: 0, introducedMinor: 0, carriedMinor: 0, carriedIntoStatementId: null, isFuture: true });
  }
  return { statements: projections, credits, active: projections.find((row) => row.statementId === ordered.at(-1)?.statement.id) ?? null };
}

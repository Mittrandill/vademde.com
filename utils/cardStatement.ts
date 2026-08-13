export type CardStatementLineKind =
  | 'card_transaction'
  | 'card_purchase'
  | 'card_payment'
  | 'card_refund'
  | 'card_fee'
  | 'card_interest'
  | 'card_cash_advance'
  | 'card_unknown';

export type StatementLine = {
  id: string;
  kind: string;
  amount_minor: number;
  occurred_at: string | null;
  description: string | null;
};

export type StatementMatchTransaction = {
  id: string;
  amount_minor: number;
  occurred_at: string;
  description: string | null;
  category_id?: string | null;
};

export type StatementLineMatch = {
  transaction: StatementMatchTransaction;
  score: number;
  confidence: 'high' | 'possible';
};

const CARD_LINE_KINDS = new Set<CardStatementLineKind>([
  'card_transaction',
  'card_purchase',
  'card_payment',
  'card_refund',
  'card_fee',
  'card_interest',
  'card_cash_advance',
  'card_unknown',
]);

const EXPENSE_LINE_KINDS = new Set<CardStatementLineKind>([
  'card_transaction',
  'card_purchase',
  'card_fee',
  'card_interest',
  'card_cash_advance',
]);

export function isCardStatementLine(line: Pick<StatementLine, 'kind'>): boolean {
  return CARD_LINE_KINDS.has(line.kind as CardStatementLineKind);
}

export function isCardExpenseLine(line: Pick<StatementLine, 'kind'>): boolean {
  return EXPENSE_LINE_KINDS.has(line.kind as CardStatementLineKind);
}

export function cardLineLabel(kind: string): string {
  switch (kind) {
    case 'card_payment':
      return 'Kart ödemesi';
    case 'card_refund':
      return 'İade';
    case 'card_fee':
      return 'Ücret / komisyon';
    case 'card_interest':
      return 'Faiz';
    case 'card_cash_advance':
      return 'Nakit avans';
    case 'card_unknown':
      return 'Kontrol gerekli';
    default:
      return 'Harcama';
  }
}

export function normalizeMerchant(value: string | null | undefined): string {
  return (value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(pos|provizyon|harcama|islem|sanal|kart|tl|try)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function levenshteinDistance(left: string, right: string): number {
  if (!left) return right.length;
  if (!right) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    for (let index = 0; index < current.length; index += 1) previous[index] = current[index]!;
  }
  return previous[right.length]!;
}

export function merchantSimilarity(left: string | null, right: string | null): number {
  const normalizedLeft = normalizeMerchant(left);
  const normalizedRight = normalizeMerchant(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return 0.92;
  const leftTokens = normalizedLeft.split(' ');
  const rightTokens = normalizedRight.split(' ');
  let best = 0;
  for (const leftToken of [normalizedLeft, ...leftTokens]) {
    for (const rightToken of [normalizedRight, ...rightTokens]) {
      const longest = Math.max(leftToken.length, rightToken.length);
      if (longest < 4) continue;
      best = Math.max(best, 1 - levenshteinDistance(leftToken, rightToken) / longest);
    }
  }
  return best;
}

function dateDistanceInDays(left: string | null, right: string): number | null {
  if (!left) return null;
  const leftDate = Date.parse(`${left.slice(0, 10)}T12:00:00.000Z`);
  const rightDate = Date.parse(`${right.slice(0, 10)}T12:00:00.000Z`);
  if (!Number.isFinite(leftDate) || !Number.isFinite(rightDate)) return null;
  return Math.round(Math.abs(leftDate - rightDate) / 86_400_000);
}

export function matchStatementLines(
  lines: StatementLine[],
  transactions: StatementMatchTransaction[],
): Map<string, StatementLineMatch> {
  const result = new Map<string, StatementLineMatch>();
  const assignedTransactionIds = new Set<string>();
  for (const line of lines.filter(isCardExpenseLine)) {
    const ranked = transactions
      .filter(
        (transaction) => transaction.amount_minor === line.amount_minor && !assignedTransactionIds.has(transaction.id),
      )
      .map((transaction) => {
        const dayDistance = dateDistanceInDays(line.occurred_at, transaction.occurred_at);
        if (dayDistance === null || dayDistance > 2) return null;
        const similarity = merchantSimilarity(line.description, transaction.description);
        const dateScore = dayDistance === 0 ? 50 : dayDistance === 1 ? 35 : 20;
        return { transaction, score: Math.round(dateScore + similarity * 50) };
      })
      .filter(
        (
          candidate,
        ): candidate is {
          transaction: StatementMatchTransaction;
          score: number;
        } => !!candidate,
      )
      .sort((left, right) => right.score - left.score);
    const best = ranked[0];
    if (!best || best.score < 60) continue;
    const second = ranked[1];
    const isUnambiguous = !second || best.score - second.score >= 10;
    result.set(line.id, {
      transaction: best.transaction,
      score: best.score,
      confidence: best.score >= 75 && isUnambiguous ? 'high' : 'possible',
    });
    assignedTransactionIds.add(best.transaction.id);
  }
  return result;
}

export function statementMatchDateRange(lines: StatementLine[]): { fromDate: string; toDate: string } | null {
  const timestamps = lines
    .map((line) => (line.occurred_at ? Date.parse(`${line.occurred_at.slice(0, 10)}T12:00:00.000Z`) : NaN))
    .filter(Number.isFinite);
  if (timestamps.length === 0) return null;
  const from = new Date(Math.min(...timestamps) - 2 * 86_400_000);
  const to = new Date(Math.max(...timestamps) + 2 * 86_400_000);
  return {
    fromDate: from.toISOString().slice(0, 10),
    toDate: to.toISOString().slice(0, 10),
  };
}

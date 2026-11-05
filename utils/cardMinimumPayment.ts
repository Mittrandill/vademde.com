import type { CardStatementAnchor } from '@/utils/cardDebt';

/** A user-entered percentage, with either keyboard decimal separator and at most two decimals. */
export function parseMinimumPaymentRate(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,3}(?:[.,]\d{1,2})?$/.test(trimmed)) return null;
  const rate = Number(trimmed.replace(',', '.'));
  return rate > 0 && rate <= 100 ? rate : null;
}

/** Estimate from the original statement, then deduct payments already applied to it.
 * Unbilled purchases must never increase this cycle's minimum payment. */
export function estimateRemainingMinimumPayment(
  statement: Pick<CardStatementAnchor, 'statementTotalMinor' | 'statementRemainingMinor'> | null,
  rate: number | null | undefined,
): number | null {
  if (!statement || rate == null || !Number.isFinite(rate) || rate <= 0 || rate > 100) return null;
  const total = Math.max(0, statement.statementTotalMinor);
  const remaining = Math.max(0, statement.statementRemainingMinor);
  const minimum = Math.round(total * Math.round(rate * 100) / 10_000);
  const paid = Math.max(0, total - remaining);
  return Math.min(remaining, Math.max(0, minimum - paid));
}

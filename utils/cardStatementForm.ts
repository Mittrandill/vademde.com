import { computeStatementPeriod, periodKeyFor, type CreditCardPeriodAccount } from '@/utils/creditCardPeriod';
import { localDay } from '@/utils/cardDebt';

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && localDay(date) === value;
}

export function isStatementPeriod(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function latestClosedStatementPeriod(account: CreditCardPeriodAccount, now = new Date()): string {
  const current = computeStatementPeriod(account, now);
  if (current && localDay(current.statementDate) <= localDay(now)) return current.periodKey;
  return periodKeyFor(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

export function validateStatementDates(period: string, cutoff: string, due: string, today = localDay(new Date())) {
  if (!isStatementPeriod(period) || !isCalendarDate(cutoff) || !isCalendarDate(due)) return 'invalidDates' as const;
  if (cutoff.slice(0, 7) !== period) return 'wrongPeriod' as const;
  if (cutoff > today) return 'notClosed' as const;
  if (due <= cutoff) return 'dueAfterCutoff' as const;
  return null;
}

import type { Account } from '@/features/accounts/api';
import type { AccountBalanceReportItem } from '@/features/accounts/balances';
import type { ObligationDueItem } from '@/features/obligations/api';
import { ACTIVE_OBLIGATION_STATUSES } from '@/features/obligations/statuses';
import { computeStatementPeriod, periodKeyFor, periodKeyForDueDate, periodKeyForStatement } from '@/utils/creditCardPeriod';
import { localDay, type CardDebtCharge } from '@/utils/cardDebt';
import { t } from '@/i18n';

export interface CardStatementRef {
  account_id: string | null;
  due_date: string | null;
  status: string;
  remaining_amount_minor: number;
  statement_date?: string | null;
}

type CardAccount = Pick<
  Account,
  'id' | 'workspace_id' | 'name' | 'type' | 'bank_code' | 'currency_code' | 'statement_day' | 'payment_due_day' | 'created_at'
>;

function clampDay(year: number, monthIndex: number, day: number): Date {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(day, last), 12);
}

type DueSlot = { dueDate: string; periodKey: string };

// Verilen günden (dahil) itibaren kartın son ödeme tarihleri (dönem anahtarıyla), yakından uzağa.
function duesFrom(account: CardAccount, fromDay: string): DueSlot[] {
  const [y, m] = fromDay.split('-').map(Number);
  const result: DueSlot[] = [];
  for (let offset = -1; offset <= 2; offset += 1) {
    const monthDate = new Date(y, m - 1 + offset, 1);
    if (account.statement_day) {
      const period = computeStatementPeriod(account, monthDate);
      if (period) result.push({ dueDate: localDay(period.dueDate), periodKey: period.periodKey });
    } else if (account.payment_due_day) {
      const due = clampDay(monthDate.getFullYear(), monthDate.getMonth(), account.payment_due_day);
      result.push({ dueDate: localDay(due), periodKey: periodKeyFor(due) });
    }
  }
  return result.filter((d) => d.dueDate >= fromDay).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

// Borç kaleminin ödeneceği son ödeme: harcama, kesimi harcama gününde ya da sonrasında olan ilk
// dönemin ekstresine girer. Açılış bakiyesi o güne kadar birikmiş borçtur (kesilmiş ama henüz
// ödenmemiş ekstre dahil olabilir) — girildiği günden sonraki ilk son ödemeye düşer.
function slotForCharge(account: CardAccount, charge: CardDebtCharge): DueSlot | null {
  if (account.statement_day && !charge.isOpening) {
    const [y, m] = charge.day.split('-').map(Number);
    for (let offset = 0; offset <= 1; offset += 1) {
      const period = computeStatementPeriod(account, new Date(y, m - 1 + offset, 1));
      if (period && localDay(period.statementDate) >= charge.day) {
        return { dueDate: localDay(period.dueDate), periodKey: period.periodKey };
      }
    }
    return null;
  }
  return duesFrom(account, charge.day)[0] ?? null;
}

export function statementPeriodKey(account: CardAccount, dueDate: string): string {
  return account.statement_day ? periodKeyForDueDate(account, dueDate) : periodKeyFor(new Date(dueDate));
}

// Ekstreyle karşılanmayan borcun son ödeme günlerine dağılımı (toplamı residualMinor'a eşittir).
export function allocateCardDebt(
  account: CardAccount,
  residualMinor: number,
  charges: CardDebtCharge[],
  coveredPeriods: Set<string>,
  today: string
): { dueDate: string | null; amountMinor: number }[] {
  // Ekstresi girilmiş dönemin borcu o ekstre kaydıyla görünür; o döneme düşen kalem ekstresi
  // henüz olmayan ilk döneme kayar.
  const uncovered = (slot: DueSlot | null): DueSlot | null =>
    slot && coveredPeriods.has(slot.periodKey)
      ? duesFrom(account, slot.dueDate).find((d) => !coveredPeriods.has(d.periodKey)) ?? null
      : slot;

  const buckets = new Map<string, number>();
  for (const charge of charges) {
    const slot = uncovered(slotForCharge(account, charge));
    if (slot) buckets.set(slot.dueDate, (buckets.get(slot.dueDate) ?? 0) + charge.amountMinor);
  }

  // Ödemeler en eski borçtan düşer: kalan borç en yeni son ödemeden geriye doğru doldurulur.
  const result: { dueDate: string | null; amountMinor: number }[] = [];
  let left = residualMinor;
  for (const [dueDate, amountMinor] of [...buckets].sort((a, b) => b[0].localeCompare(a[0]))) {
    if (left <= 0) break;
    const take = Math.min(left, amountMinor);
    result.push({ dueDate, amountMinor: take });
    left -= take;
  }
  // Kalemlerle açıklanamayan borç (ör. ödeme günü girilmemiş kart, ekstre çapası farkı)
  // eskisi gibi sıradaki son ödemeye yazılır.
  if (left > 0) {
    const next = duesFrom(account, today).find((d) => !coveredPeriods.has(d.periodKey))?.dueDate ?? null;
    const same = result.find((r) => r.dueDate === next);
    if (same) same.amountMinor += left;
    else result.push({ dueDate: next, amountMinor: left });
  }
  return result.sort((a, b) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31'));
}

// Takvim/hatırlatma görünümü: vadesi geçmiş ve ödenmemiş kart borcu (sanal kalem ya da ekstre kaydı)
// bankadaki gibi sonraki ekstrelere devreder. Geciken dönem "gecikti" olarak yerinde kalır; ödenmemiş
// tutar ondan sonraki her son ödeme gününde (sıradaki gecikmemiş son ödeme dahil) de görünür. Böylece
// kartın son ödeme günü hiçbir ay takvimden kaybolmaz ve hatırlatma sıradaki son ödemeye kurulur
// (Kasım 2026 kullanıcı geri bildirimi). Toplam borç hesaplarında KULLANILMAZ — orada iki kez sayılır.
type DueRow = { dueDate: string | null; amountMinor: number; carriedMinor?: number };

function carryOverdueForward(
  account: CardAccount,
  allocation: DueRow[],
  overdueStatements: { dueDate: string; amountMinor: number }[],
  coveredPeriods: Set<string>,
  today: string
): DueRow[] {
  const overdue = [
    ...allocation.filter((r): r is { dueDate: string; amountMinor: number } => !!r.dueDate && r.dueDate < today),
    ...overdueStatements,
  ].filter((r) => r.amountMinor > 0);
  if (!overdue.length) return allocation;

  // En eski gecikmeden sonraki tüm son ödeme günleri, sıradaki gecikmemiş son ödemeye kadar.
  const firstOverdue = overdue.reduce((min, r) => (r.dueDate < min ? r.dueDate : min), overdue[0].dueDate);
  const slots: DueSlot[] = [];
  let cursor = firstOverdue;
  for (let guard = 0; guard < 36; guard += 1) {
    const next = duesFrom(account, cursor).find((d) => d.dueDate > cursor);
    if (!next) break;
    slots.push(next);
    if (next.dueDate >= today) break;
    cursor = next.dueDate;
  }

  const result: DueRow[] = allocation.map((r) => ({ ...r }));
  for (const slot of slots) {
    // O dönemin ekstresi girildiyse ekstre kaydı (bankanın devreden bakiye dahil tutarıyla) zaten görünür.
    if (coveredPeriods.has(slot.periodKey)) continue;
    const carriedMinor = overdue.filter((r) => r.dueDate < slot.dueDate).reduce((sum, r) => sum + r.amountMinor, 0);
    if (carriedMinor <= 0) continue;
    const same = result.find((r) => r.dueDate === slot.dueDate);
    if (same) Object.assign(same, { amountMinor: same.amountMinor + carriedMinor, carriedMinor });
    else result.push({ dueDate: slot.dueDate, amountMinor: carriedMinor, carriedMinor });
  }
  return result.sort((a, b) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31'));
}

export function buildCardDueItems(
  accounts: CardAccount[],
  balances: AccountBalanceReportItem[],
  statements: CardStatementRef[],
  today: string = localDay(new Date()),
  options: { carryOverdue?: boolean } = {}
): ObligationDueItem[] {
  const balanceByAccount = new Map(balances.map((b) => [b.accountId, b]));
  const items: ObligationDueItem[] = [];

  for (const account of accounts) {
    if (account.type !== 'credit_card') continue;
    const balance = balanceByAccount.get(account.id);
    const cardStatements = statements.filter((s) => s.account_id === account.id && s.status !== 'iptal_edildi');
    const openStatementsMinor = balance?.cardStatementProjections
      ? balance.cardStatementProjections.reduce((sum, projection) => sum + projection.dueMinor, 0)
      : cardStatements.filter((s) => (ACTIVE_OBLIGATION_STATUSES as string[]).includes(s.status))
        .reduce((sum, s) => sum + Math.max(0, s.remaining_amount_minor), 0);
    const residualMinor = (balance?.balanceMinor ?? 0) - openStatementsMinor;

    const coveredPeriods = new Set(balance?.cardStatementProjections
      ? balance.cardStatementProjections.filter((row) => !row.isFuture).map((row) =>
          account.statement_day ? row.cutoffDate.slice(0, 7) : statementPeriodKey(account, row.dueDate))
      : cardStatements.map((s) => periodKeyForStatement(account, s)).filter((key): key is string => !!key));

    let allocation: DueRow[] =
      residualMinor > 0
        ? allocateCardDebt(account, residualMinor, balance?.cardCharges ?? [], coveredPeriods, today)
        : [];
    if (options.carryOverdue) {
      const overdueStatements = balance?.cardStatementProjections
        ? balance.cardStatementProjections
            .filter((row) => !row.isFuture && row.dueDate.slice(0, 10) < today)
            .map((row) => ({ dueDate: row.dueDate.slice(0, 10), amountMinor: Math.max(0, row.dueMinor) }))
        : cardStatements
            .filter((s) => (ACTIVE_OBLIGATION_STATUSES as string[]).includes(s.status) && !!s.due_date && (s.due_date as string).slice(0, 10) < today)
            .map((s) => ({ dueDate: (s.due_date as string).slice(0, 10), amountMinor: Math.max(0, s.remaining_amount_minor) }));
      allocation = carryOverdueForward(account, allocation, overdueStatements, coveredPeriods, today);
    }

    for (const { dueDate, amountMinor, carriedMinor } of allocation) {
      items.push({
        id: `card-due:${account.id}:${dueDate ?? 'none'}`,
        card_due_account_id: account.id,
        card_due_carried_minor: carriedMinor ?? null,
        asset_id: null,
        document_number: null,
        workspace_id: account.workspace_id,
        direction: 'payable',
        document_type: 'kredi_karti_ekstresi',
        title: t('runtime.cardDueTitle', { account: account.name }),
        // Ödeme günü girilmemiş kartta tarih yoktur: takvimde görünmez ama toplam borca girer.
        due_date: dueDate,
        total_amount_minor: amountMinor,
        remaining_amount_minor: amountMinor,
        currency_code: account.currency_code,
        value_unit_type: 'fiat',
        status: dueDate && dueDate < today ? 'gecikti' : 'bekliyor',
        account_id: account.id,
        bank_code: account.bank_code,
        category_id: null,
        counterparty_id: null,
        notes: null,
        service_code: null,
        parent_obligation_id: null,
        instrument_status: null,
        instrument_status_changed_at: null,
        trial_ends_on: null,
        billing_period: null,
        statement_date: null,
        fx_rate_try_minor: null,
        created_at: account.created_at,
        updated_at: account.created_at,
        category: null,
        counterparty: null,
        account: { name: account.name },
      });
    }
  }
  return items;
}

// Kartın sıradaki (gecikmemiş) son ödemesi — hatırlatmalar buna göre kurulur; geciken dönemin
// hatırlatma günleri zaten geçmiştir.
export function nextCardDue(items: ObligationDueItem[], accountId: string, today: string = localDay(new Date())) {
  return (
    items
      .filter((i) => i.card_due_account_id === accountId && !!i.due_date && (i.due_date as string) >= today)
      .sort((a, b) => (a.due_date as string).localeCompare(b.due_date as string))[0] ?? null
  );
}

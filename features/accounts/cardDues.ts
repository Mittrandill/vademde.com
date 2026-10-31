// Kredi kartı son ödemelerinin takvim/Ana Sayfa'da görünmesi.
//
// Takvim, "Yaklaşan vadeler" ve Ana Sayfa'daki toplam borç yalnızca obligations tablosunu okur.
// Kart borcu ise kart hesabında yaşar (açılış bakiyesi + harcamalar, ekstre girildiyse ekstre
// çapası — bkz. utils/cardDebt.ts). Kullanıcıların çoğu ekstre girmediği için kart borcu bu
// ekranların hiçbirine yansımıyordu. Burada ekstre kaydının KARŞILAMADIĞI borç
// (güncel kart borcu − açık ekstrelerin kalanı; onlar zaten kendi kaydıyla görünür) kartın son
// ödeme günlerine sanal vade kalemleri olarak dağıtılır:
//   - Her borç kalemi (açılış bakiyesi, harcama, nakit avans) düştüğü dönemin son ödeme gününe
//     yazılır: harcama kesim gününe göre, açılış bakiyesi girildiği günden sonraki ilk son ödemeye.
//   - Ödemeler en eski borçtan düşer: kalan borç en yeni dönemden geriye doğru dağıtılır. Böylece
//     ödenmeyen dönem son ödeme günü geçince silinmez, "gecikti" olarak yerinde kalır; kalemlerin
//     toplamı her zaman güncel borca eşittir (ertesi ayın kalemiyle çift sayılmaz).
//   - Kullanıcı kartın güncel borcunu yeniden girerse (açılış bakiyesi değişir) eski dönemler o
//     rakamın içinde sayılır ve borç girildiği günden sonraki ilk son ödemeye taşınır.
// Bu kalemler veritabanı kaydı değildir; dokunulduğunda kart sayfasına gidilir (card_due_account_id).
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/services/supabase';
import { fetchAll } from '@/services/fetchAll';
import { queryKeys } from '@/services/queryKeys';
import { listAccounts, type Account } from '@/features/accounts/api';
import { getAccountBalances, type AccountBalanceReportItem } from '@/features/reports/api';
import { ACTIVE_OBLIGATION_STATUSES, type ObligationDueItem } from '@/features/obligations/api';
import { computeStatementPeriod, periodKeyFor, periodKeyForDueDate } from '@/utils/creditCardPeriod';
import { localDay, type CardDebtCharge } from '@/utils/cardDebt';
import { t, useLanguage } from '@/i18n';

export interface CardStatementRef {
  account_id: string | null;
  due_date: string | null;
  status: string;
  remaining_amount_minor: number;
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

export function buildCardDueItems(
  accounts: CardAccount[],
  balances: AccountBalanceReportItem[],
  statements: CardStatementRef[],
  today: string = localDay(new Date())
): ObligationDueItem[] {
  const balanceByAccount = new Map(balances.map((b) => [b.accountId, b]));
  const items: ObligationDueItem[] = [];

  for (const account of accounts) {
    if (account.type !== 'credit_card') continue;
    const balance = balanceByAccount.get(account.id);
    const cardStatements = statements.filter((s) => s.account_id === account.id && s.status !== 'iptal_edildi');
    const openStatementsMinor = cardStatements
      .filter((s) => (ACTIVE_OBLIGATION_STATUSES as string[]).includes(s.status))
      .reduce((sum, s) => sum + Math.max(0, s.remaining_amount_minor), 0);
    const residualMinor = (balance?.balanceMinor ?? 0) - openStatementsMinor;
    if (residualMinor <= 0) continue;

    const coveredPeriods = new Set(
      cardStatements.filter((s) => !!s.due_date).map((s) => statementPeriodKey(account, s.due_date as string))
    );

    for (const { dueDate, amountMinor } of allocateCardDebt(
      account,
      residualMinor,
      balance?.cardCharges ?? [],
      coveredPeriods,
      today
    )) {
      items.push({
        id: `card-due:${account.id}:${dueDate ?? 'none'}`,
        card_due_account_id: account.id,
        asset_id: null,
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

async function listCardStatementRefs(workspaceId: string): Promise<CardStatementRef[]> {
  return fetchAll<CardStatementRef>((from, to) =>
    supabase
      .from('obligations')
      .select('account_id, due_date, status, remaining_amount_minor')
      .eq('workspace_id', workspaceId)
      .eq('document_type', 'kredi_karti_ekstresi')
      .order('id')
      .range(from, to)
  );
}

// Sorgu anahtarları Ana Sayfa/hesaplar ekranlarıyla aynıdır (önbellek paylaşılır); ekstre
// listesi [ws, 'obligations', ...] altında olduğu için ödeme/kayıt değişikliklerinde tazelenir.
export function useCardDueItems(workspaceId: string | null): { items: ObligationDueItem[]; isSuccess: boolean } {
  const language = useLanguage();
  const accountsQuery = useQuery({
    queryKey: workspaceId ? queryKeys.accounts(workspaceId) : ['accounts', 'disabled'],
    queryFn: () => listAccounts(workspaceId as string),
    enabled: !!workspaceId,
  });
  const hasCards = (accountsQuery.data ?? []).some((a) => a.type === 'credit_card');
  const balancesQuery = useQuery({
    queryKey: workspaceId ? [workspaceId, 'account-balances'] : ['account-balances', 'disabled'],
    queryFn: () => getAccountBalances(workspaceId as string),
    enabled: !!workspaceId,
  });
  const statementsQuery = useQuery({
    queryKey: workspaceId ? [workspaceId, 'obligations', 'card-statement-refs'] : ['card-statement-refs', 'disabled'],
    queryFn: () => listCardStatementRefs(workspaceId as string),
    enabled: !!workspaceId && hasCards,
  });

  const items = useMemo(
    () =>
      hasCards && balancesQuery.data && statementsQuery.data
        ? buildCardDueItems(accountsQuery.data ?? [], balancesQuery.data, statementsQuery.data)
        : [],
    [hasCards, accountsQuery.data, balancesQuery.data, statementsQuery.data, language]
  );

  return {
    items,
    isSuccess: accountsQuery.isSuccess && (!hasCards || (balancesQuery.isSuccess && statementsQuery.isSuccess)),
  };
}

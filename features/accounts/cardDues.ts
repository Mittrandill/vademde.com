// Kredi kartı son ödemelerinin takvim/Ana Sayfa'da görünmesi.
//
// Takvim, "Yaklaşan vadeler" ve Ana Sayfa'daki toplam borç yalnızca obligations tablosunu okur.
// Kart borcu ise kart hesabında yaşar (açılış bakiyesi + harcamalar, ekstre girildiyse ekstre
// çapası — bkz. utils/cardDebt.ts). Kullanıcıların çoğu ekstre girmediği için kart borcu bu
// ekranların hiçbirine yansımıyordu. Burada her kart için, ekstre kaydının KARŞILAMADIĞI borç
// kısmı kartın bir sonraki son ödeme gününde sanal bir vade kalemi olarak üretilir:
//   tutar = güncel kart borcu − açık ekstrelerin kalanı (onlar zaten kendi kaydıyla görünür).
// Bu kalem bir veritabanı kaydı değildir; dokunulduğunda kart sayfasına gidilir (card_due_account_id).
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/services/supabase';
import { fetchAll } from '@/services/fetchAll';
import { queryKeys } from '@/services/queryKeys';
import { listAccounts, type Account } from '@/features/accounts/api';
import { getAccountBalances, type AccountBalanceReportItem } from '@/features/reports/api';
import { ACTIVE_OBLIGATION_STATUSES, type ObligationDueItem } from '@/features/obligations/api';
import { computeStatementPeriod, periodKeyFor, periodKeyForDueDate } from '@/utils/creditCardPeriod';
import { localDay } from '@/utils/cardDebt';

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

// Bugünden itibaren kartın sıradaki son ödeme tarihleri (dönem anahtarıyla), yakından uzağa.
function upcomingDues(account: CardAccount, today: string): { dueDate: string; periodKey: string }[] {
  const [y, m] = today.split('-').map(Number);
  const result: { dueDate: string; periodKey: string }[] = [];
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
  return result.filter((d) => d.dueDate >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function statementPeriodKey(account: CardAccount, dueDate: string): string {
  return account.statement_day ? periodKeyForDueDate(account, dueDate) : periodKeyFor(new Date(dueDate));
}

export function buildCardDueItems(
  accounts: CardAccount[],
  balances: AccountBalanceReportItem[],
  statements: CardStatementRef[],
  today: string = localDay(new Date())
): ObligationDueItem[] {
  const debtByAccount = new Map(balances.map((b) => [b.accountId, b.balanceMinor]));
  const items: ObligationDueItem[] = [];

  for (const account of accounts) {
    if (account.type !== 'credit_card') continue;
    const cardStatements = statements.filter((s) => s.account_id === account.id && s.status !== 'iptal_edildi');
    const openStatementsMinor = cardStatements
      .filter((s) => (ACTIVE_OBLIGATION_STATUSES as string[]).includes(s.status))
      .reduce((sum, s) => sum + Math.max(0, s.remaining_amount_minor), 0);
    const amountMinor = (debtByAccount.get(account.id) ?? 0) - openStatementsMinor;
    if (amountMinor <= 0) continue;

    // Ekstresi girilmiş dönemin son ödemesi o ekstre kaydıyla görünür; kalan borç (kesimden
    // sonraki harcamalar) ekstresi henüz olmayan ilk döneme düşer.
    const coveredPeriods = new Set(
      cardStatements.filter((s) => !!s.due_date).map((s) => statementPeriodKey(account, s.due_date as string))
    );
    const next = upcomingDues(account, today).find((d) => !coveredPeriods.has(d.periodKey));

    items.push({
      id: `card-due:${account.id}`,
      card_due_account_id: account.id,
      workspace_id: account.workspace_id,
      direction: 'payable',
      document_type: 'kredi_karti_ekstresi',
      title: `${account.name} son ödeme`,
      // Ödeme günü girilmemiş kartta tarih yoktur: takvimde görünmez ama toplam borca girer.
      due_date: next?.dueDate ?? null,
      total_amount_minor: amountMinor,
      remaining_amount_minor: amountMinor,
      currency_code: account.currency_code,
      value_unit_type: 'fiat',
      status: 'bekliyor',
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
  return items;
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
    [hasCards, accountsQuery.data, balancesQuery.data, statementsQuery.data]
  );

  return {
    items,
    isSuccess: accountsQuery.isSuccess && (!hasCards || (balancesQuery.isSuccess && statementsQuery.isSuccess)),
  };
}

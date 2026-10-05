import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { listAccounts } from '@/features/accounts/api';
import { getAccountBalances } from '@/features/reports/api';
import {
  ACTIVE_OBLIGATION_STATUSES,
  listInstallmentsDue,
  listObligations,
  type ObligationDueItem,
} from '@/features/obligations/api';
import { queryKeys } from '@/services/queryKeys';
import { projectBalance, type CashForecast, type ForecastItem } from './forecast';

export const FORECAST_DAYS = 30;
/** Bildirim ve uyarı bandı için bakılan pencere. */
export const ALERT_WINDOW_DAYS = 14;

export interface AccountForecast {
  accountId: string;
  name: string;
  bankCode: string | null;
  currentBalanceMinor: number;
  forecast: CashForecast;
}

// Hesap bazlı 30 günlük tahmin. Kredi kartı (borç hesabı) ve TL dışı hesaplar dışarıda bırakılır.
export function useCashForecasts(workspaceId: string | null) {
  const enabled = !!workspaceId;

  const accountsQuery = useQuery({
    queryKey: workspaceId ? queryKeys.accounts(workspaceId) : ['accounts', 'disabled'],
    queryFn: () => listAccounts(workspaceId as string),
    enabled,
  });
  const balancesQuery = useQuery({
    queryKey: workspaceId ? [workspaceId, 'account-balances'] : ['account-balances', 'disabled'],
    queryFn: () => getAccountBalances(workspaceId as string),
    enabled,
  });
  const obligationsQuery = useQuery({
    queryKey: workspaceId ? queryKeys.dashboardActiveObligations(workspaceId) : ['obligations', 'disabled'],
    queryFn: () =>
      listObligations({ workspaceId: workspaceId as string, statuses: ACTIVE_OBLIGATION_STATUSES, pageSize: 200 }),
    enabled,
  });
  const installmentsQuery = useQuery({
    queryKey: workspaceId ? [workspaceId, 'obligations', 'dashboard-installments'] : ['dashboard-installments', 'disabled'],
    queryFn: () =>
      listInstallmentsDue({ workspaceId: workspaceId as string, statuses: ACTIVE_OBLIGATION_STATUSES, pageSize: 200 }),
    enabled,
  });

  const forecasts = useMemo<AccountForecast[]>(() => {
    const installmentItems = installmentsQuery.data ?? [];
    const withInstallments = new Set(installmentItems.map((i) => i.id));
    const plain = (obligationsQuery.data ?? []).filter((o) => !withInstallments.has(o.id));
    const all: ObligationDueItem[] = [...plain, ...installmentItems];

    const balanceById = new Map((balancesQuery.data ?? []).map((b) => [b.accountId, b.balanceMinor]));
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + FORECAST_DAYS);
    const horizonIso = horizon.toISOString().slice(0, 10);

    return (accountsQuery.data ?? [])
      .filter((a) => a.type !== 'credit_card' && a.currency_code === 'TRY')
      .map((account) => {
        const items: ForecastItem[] = all
          .filter(
            (o) =>
              o.account_id === account.id &&
              o.currency_code === 'TRY' &&
              o.remaining_amount_minor > 0 &&
              !!o.due_date &&
              o.due_date <= horizonIso
          )
          .map((o) => ({
            dueDate: o.due_date as string,
            amountMinor: o.remaining_amount_minor,
            direction: o.direction as 'payable' | 'receivable',
            title: o.title,
            obligationId: o.id,
          }));
        const currentBalanceMinor = balanceById.get(account.id) ?? account.opening_balance_minor;
        return {
          accountId: account.id,
          name: account.name,
          bankCode: account.bank_code,
          currentBalanceMinor,
          forecast: projectBalance(currentBalanceMinor, items, FORECAST_DAYS),
        };
      });
  }, [accountsQuery.data, balancesQuery.data, obligationsQuery.data, installmentsQuery.data]);

  const isLoading = accountsQuery.isLoading || balancesQuery.isLoading;
  return { forecasts, isLoading };
}

/** Uyarı penceresinde (14 gün) eksiye düşen hesaplar, en erken önce. */
export function atRiskAccounts(forecasts: AccountForecast[]): AccountForecast[] {
  const limit = new Date();
  limit.setDate(limit.getDate() + ALERT_WINDOW_DAYS);
  const limitIso = limit.toISOString().slice(0, 10);
  return forecasts
    .filter((f) => f.forecast.firstNegative && f.forecast.firstNegative.date <= limitIso)
    .sort((a, b) => (a.forecast.firstNegative!.date).localeCompare(b.forecast.firstNegative!.date));
}

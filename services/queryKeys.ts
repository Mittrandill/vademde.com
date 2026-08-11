import type { QueryClient } from '@tanstack/react-query';

// docs/06-teknik-mimari.md §10.6.1 — sabit queryKey şeması.
export const queryKeys = {
  workspaces: () => ['workspaces'] as const,
  accounts: (workspaceId: string) => [workspaceId, 'accounts'] as const,
  categories: (workspaceId: string, kind?: 'income' | 'expense') =>
    [workspaceId, 'categories', kind ?? 'all'] as const,
  counterparties: (workspaceId: string) => [workspaceId, 'counterparties'] as const,
  counterpartyLedger: (workspaceId: string, counterpartyId: string) =>
    [workspaceId, 'counterparties', counterpartyId, 'ledger'] as const,
  counterpartyObligations: (workspaceId: string, counterpartyId: string) =>
    [workspaceId, 'counterparties', counterpartyId, 'obligations'] as const,
  counterpartyTransactions: (workspaceId: string, counterpartyId: string) =>
    [workspaceId, 'counterparties', counterpartyId, 'transactions'] as const,
  bankSummaries: (workspaceId: string) => [workspaceId, 'banks', 'summaries'] as const,
  bankLoanLedger: (workspaceId: string, bankCode: string) =>
    [workspaceId, 'banks', bankCode, 'ledger'] as const,
  bankLoanObligations: (workspaceId: string, bankCode: string) =>
    [workspaceId, 'banks', bankCode, 'obligations'] as const,
  transactions: (workspaceId: string, direction?: string) =>
    [workspaceId, 'transactions', direction ?? 'all'] as const,
  obligations: (workspaceId: string, direction?: string) =>
    [workspaceId, 'obligations', direction ?? 'all'] as const,
  obligationsByTypeList: (workspaceId: string, filterKey: string) =>
    [workspaceId, 'obligations', 'by-type-list', filterKey] as const,
  obligationsByTypeSummary: (workspaceId: string, filterKey: string) =>
    [workspaceId, 'obligations', 'by-type-summary', filterKey] as const,
  obligationsByTypeOverview: (workspaceId: string, documentType: string) =>
    [workspaceId, 'obligations', 'by-type-overview', documentType] as const,
  obligationTotalsByType: (workspaceId: string) =>
    [workspaceId, 'obligations', 'type-totals'] as const,
  obligationInstallmentSummaries: (workspaceId: string, idsKey: string) =>
    [workspaceId, 'obligations', 'installment-summaries', idsKey] as const,
  document: (workspaceId: string, documentId: string) =>
    [workspaceId, 'financial_documents', documentId] as const,
  dashboardActiveObligations: (workspaceId: string) =>
    [workspaceId, 'obligations', 'dashboard-active'] as const,
  dashboardMonthTransactions: (workspaceId: string, monthKey: string) =>
    [workspaceId, 'transactions', 'dashboard-month', monthKey] as const,
  dashboardAllTimeTotals: (workspaceId: string) =>
    [workspaceId, 'transactions', 'dashboard-all-time'] as const,
  dashboardPendingDocuments: (workspaceId: string) =>
    [workspaceId, 'financial_documents', 'dashboard-pending'] as const,
  recentTransactions: (workspaceId: string) =>
    [workspaceId, 'transactions', 'dashboard-recent'] as const,
  calendarObligations: (workspaceId: string, rangeKey: string) =>
    [workspaceId, 'obligations', 'calendar', rangeKey] as const,
  reportSummary: (workspaceId: string, period: string) => [workspaceId, 'reports', 'summary', period] as const,
  reportCategoryBreakdown: (workspaceId: string, direction: string, period: string) =>
    [workspaceId, 'reports', 'categories', direction, period] as const,
  reportCounterpartyBreakdown: (workspaceId: string, period: string) =>
    [workspaceId, 'reports', 'counterparties', period] as const,
  reportAccountBalances: (workspaceId: string) => [workspaceId, 'reports', 'account-balances'] as const,
  reportOverdueObligations: (workspaceId: string) => [workspaceId, 'reports', 'overdue'] as const,
  reportCashFlow: (workspaceId: string) => [workspaceId, 'reports', 'cash-flow'] as const,
  reportMonthlyComparison: (workspaceId: string) => [workspaceId, 'reports', 'monthly-comparison'] as const,
  remindersCount: (workspaceId: string) => [workspaceId, 'reminders', 'count'] as const,
  reminders: (workspaceId: string, page: number) => [workspaceId, 'reminders', 'list', page] as const,
  valueUnitRates: () => ['value-unit-rates'] as const,
  workspaceMembers: (workspaceId: string) => [workspaceId, 'members'] as const,
  workspaceInvites: (workspaceId: string) => [workspaceId, 'invites'] as const,
  myWorkspaceRole: (workspaceId: string) => [workspaceId, 'my-role'] as const,
  profile: () => ['profile'] as const,
  subscription: () => ['subscription'] as const,
  planLimits: () => ['plan-limits'] as const,
  ocrUsage: (periodMonth: string) => ['ocr-usage', periodMonth] as const,
};

// Bir ödeme kaydedildiğinde/güncellendiğinde/silindiğinde (bkz. features/payments/api.ts)
// DB tarafındaki trigger (payments_recompute_progress → recompute_obligation_progress/
// recompute_installment_progress) obligations.status'ü doğru günceller (ör. 'gecikti' →
// 'odendi'), ama React Query önbelleği kendiliğinden tazelenmez. Önceden çağıran taraflar
// yalnızca [workspaceId, 'obligations'] prefix'ini invalidate ediyordu — bu da 'obligations'
// ile başlamayan [workspaceId, 'reports', ...] sorgularını (Raporlar sekmesindeki "Gecikmiş
// Ödemeler" dahil) asla tazelemiyordu; ödenen kayıt orada eskisi gibi "gecikti" görünmeye
// devam ediyordu. Bu yardımcı, bir ödeme değiştiğinde etkilenebilecek TÜM prefix'leri tek
// yerden invalidate eder — yeni bir ödeme akışı eklendiğinde bir prefix'in unutulmasını önler.
export function invalidatePaymentRelatedQueries(queryClient: QueryClient, workspaceId: string) {
  queryClient.invalidateQueries({ queryKey: [workspaceId, 'obligations'] });
  queryClient.invalidateQueries({ queryKey: [workspaceId, 'transactions'] });
  queryClient.invalidateQueries({ queryKey: [workspaceId, 'account-balances'] });
  queryClient.invalidateQueries({ queryKey: [workspaceId, 'reports'] });
}

// docs/06-teknik-mimari.md §10.6.1 — sabit queryKey şeması.
export const queryKeys = {
  workspaces: () => ['workspaces'] as const,
  accounts: (workspaceId: string) => [workspaceId, 'accounts'] as const,
  categories: (workspaceId: string, kind?: 'income' | 'expense') =>
    [workspaceId, 'categories', kind ?? 'all'] as const,
  counterparties: (workspaceId: string) => [workspaceId, 'counterparties'] as const,
  transactions: (workspaceId: string, direction?: string) =>
    [workspaceId, 'transactions', direction ?? 'all'] as const,
  obligations: (workspaceId: string, direction?: string) =>
    [workspaceId, 'obligations', direction ?? 'all'] as const,
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
  subscription: () => ['subscription'] as const,
  planLimits: () => ['plan-limits'] as const,
  ocrUsage: (periodMonth: string) => ['ocr-usage', periodMonth] as const,
};

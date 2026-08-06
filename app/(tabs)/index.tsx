import { useEffect, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Pressable, Row, Skeleton, Stack, Text } from '@/components/primitives';
import { BalanceHero } from '@/components/finance/BalanceHero';
import { ObligationSummaryCard } from '@/components/finance/ObligationSummaryCard';
import { IncomeExpenseAnalysis } from '@/components/finance/IncomeExpenseAnalysis';
import { UpcomingDueList } from '@/components/finance/UpcomingDueList';
import { PendingReviewQueue } from '@/components/finance/PendingReviewQueue';
import { CreditCardDueWidget } from '@/components/finance/CreditCardDueWidget';
import { RecentTransactionsList } from '@/components/finance/RecentTransactionsList';
import { listMyWorkspaces } from '@/features/workspaces/api';
import { listAccounts } from '@/features/accounts/api';
import {
  listObligations,
  listInstallmentsDue,
  ACTIVE_OBLIGATION_STATUSES,
  type ObligationDueItem,
} from '@/features/obligations/api';
import { listTransactions } from '@/features/transactions/api';
import { getAllTimeIncomeExpenseTotals, getMonthTransactionTotals, getPendingReviewDocuments } from '@/features/dashboard/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { syncCreditCardStatementReminder } from '@/services/creditCardReminders';

export default function HomeScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { activeWorkspaceId, setActiveWorkspaceId, balanceHidden, toggleBalanceHidden } = useWorkspaceStore();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const workspacesQuery = useQuery({
    queryKey: queryKeys.workspaces(),
    queryFn: async () => {
      const data = await listMyWorkspaces();
      if (!activeWorkspaceId && data.length > 0) {
        setActiveWorkspaceId(data[0].id);
      }
      return data;
    },
  });

  const workspaces = workspacesQuery.data ?? [];
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  // Oturum açmış ama hiç çalışma alanı olmayan kullanıcı (ör. yeni kayıt) burada boş bir
  // form yerine doğrudan onboarding'in çalışma alanı kurulum ekranına yönlendirilir.
  useEffect(() => {
    if (workspacesQuery.isSuccess && workspaces.length === 0) {
      router.replace('/workspace-setup');
    }
  }, [workspacesQuery.isSuccess, workspaces.length]);

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;

  const accountsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.accounts(activeWorkspaceId) : ['accounts', 'disabled'],
    queryFn: () => listAccounts(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  // Uygulama her açıldığında (Ana Sayfa mount/hesaplar yenilendiğinde) kredi kartı
  // hesaplarının "ekstre yükle" hatırlatmaları güncel döneme göre yeniden senkronize
  // edilir — böylece aylar geçse bile bildirimler geride kalmaz (bkz. syncObligationReminder
  // ile aynı "her açılışta yeniden planla" deseni).
  useEffect(() => {
    if (!activeWorkspaceId || !accountsQuery.data) return;
    for (const account of accountsQuery.data) {
      if (account.type !== 'credit_card') continue;
      syncCreditCardStatementReminder(activeWorkspaceId, account).catch(() => {});
    }
  }, [activeWorkspaceId, accountsQuery.data]);

  const allTimeTotalsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.dashboardAllTimeTotals(activeWorkspaceId) : ['all-time', 'disabled'],
    queryFn: () => getAllTimeIncomeExpenseTotals(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const monthTotalsQuery = useQuery({
    queryKey: activeWorkspaceId
      ? queryKeys.dashboardMonthTransactions(activeWorkspaceId, monthKey)
      : ['month-totals', 'disabled'],
    queryFn: () => getMonthTransactionTotals(activeWorkspaceId as string, now),
    enabled: !!activeWorkspaceId,
  });

  const activeObligationsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.dashboardActiveObligations(activeWorkspaceId) : ['obligations', 'disabled'],
    queryFn: () =>
      listObligations({ workspaceId: activeWorkspaceId as string, statuses: ACTIVE_OBLIGATION_STATUSES, pageSize: 200 }),
    enabled: !!activeWorkspaceId,
  });

  // Taksitli bir kredinin toplam bakiyesi yerine yaklaşan taksidin kendi tutarı
  // gösterilsin diye (bkz. app/(tabs)/takvim.tsx aynı desen) — kredinin toplam
  // borcu yalnızca /obligations/[id] detay sayfasında gösterilir.
  const dueInstallmentsQuery = useQuery({
    queryKey: activeWorkspaceId
      ? [activeWorkspaceId, 'obligations', 'dashboard-installments']
      : ['dashboard-installments', 'disabled'],
    queryFn: () =>
      listInstallmentsDue({ workspaceId: activeWorkspaceId as string, statuses: ACTIVE_OBLIGATION_STATUSES, pageSize: 200 }),
    enabled: !!activeWorkspaceId,
  });

  const pendingDocumentsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.dashboardPendingDocuments(activeWorkspaceId) : ['documents', 'disabled'],
    queryFn: () => getPendingReviewDocuments(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const recentTransactionsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.recentTransactions(activeWorkspaceId) : ['transactions', 'disabled'],
    queryFn: () => listTransactions({ workspaceId: activeWorkspaceId as string, pageSize: 5 }),
    enabled: !!activeWorkspaceId,
  });

  const totalBalanceMinor = useMemo(() => {
    const openingSum = (accountsQuery.data ?? []).reduce((sum, a) => sum + a.opening_balance_minor, 0);
    const totals = allTimeTotalsQuery.data ?? { incomeMinor: 0, expenseMinor: 0 };
    return openingSum + totals.incomeMinor - totals.expenseMinor;
  }, [accountsQuery.data, allTimeTotalsQuery.data]);

  const monthNetMinor = useMemo(() => {
    const totals = monthTotalsQuery.data ?? { incomeMinor: 0, expenseMinor: 0 };
    return totals.incomeMinor - totals.expenseMinor;
  }, [monthTotalsQuery.data]);

  const activeObligations = useMemo<ObligationDueItem[]>(() => {
    const installmentItems = dueInstallmentsQuery.data ?? [];
    const obligationIdsWithInstallments = new Set(installmentItems.map((i) => i.id));
    const plainObligations = (activeObligationsQuery.data ?? []).filter(
      (o) => !obligationIdsWithInstallments.has(o.id)
    );
    return [...plainObligations, ...installmentItems];
  }, [activeObligationsQuery.data, dueInstallmentsQuery.data]);

  const payableObligations = useMemo(
    () => activeObligations.filter((o) => o.direction === 'payable'),
    [activeObligations]
  );
  const receivableObligations = useMemo(
    () => activeObligations.filter((o) => o.direction === 'receivable'),
    [activeObligations]
  );
  const creditCardObligation = useMemo(
    () => activeObligations.find((o) => o.document_type === 'kredi_karti_ekstresi') ?? null,
    [activeObligations]
  );

  const payableTotalMinor = useMemo(
    () => payableObligations.reduce((sum, o) => sum + o.remaining_amount_minor, 0),
    [payableObligations]
  );
  const receivableTotalMinor = useMemo(
    () => receivableObligations.reduce((sum, o) => sum + o.remaining_amount_minor, 0),
    [receivableObligations]
  );
  const directionalTotalMinor = payableTotalMinor + receivableTotalMinor;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      {!workspacesQuery.isSuccess || workspaces.length === 0 ? (
        <Stack gap="lg" style={{ padding: theme.screenEdge.standard }}>
          <Skeleton height={32} width="60%" />
          <Skeleton height={180} borderRadius={theme.radius.heroWidget} />
          <Skeleton height={100} borderRadius={theme.radius.widget} />
          <Skeleton height={100} borderRadius={theme.radius.widget} />
        </Stack>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: theme.screenEdge.standard,
            // Kayan tab bar'ın altında kalmasın diye normalden fazla alt boşluk
            // (bkz. TabBar.tsx: mutlak konumlu, ~64+inset yükseklik).
            paddingBottom: theme.layout.tabBarClearance,
            gap: theme.spacing.lg,
          }}
        >
          <Stack gap="xs">
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Pressable
                onPress={() => workspaces.length > 1 && setSwitcherOpen((open) => !open)}
                disabled={workspaces.length <= 1}
              >
                <Row gap="xs" align="center">
                  <Text variant="caption" color="textSecondary">
                    ÇALIŞMA ALANI
                  </Text>
                  {workspaces.length > 1 ? (
                    <Ionicons
                      name={switcherOpen ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={theme.colors.textSecondary}
                    />
                  ) : null}
                </Row>
                <Text variant="pageTitle">{activeWorkspace?.name ?? '—'}</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/settings')}
                hitSlop={12}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: theme.radius.input,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Ionicons name="settings-outline" size={22} color={theme.colors.textSecondary} />
              </Pressable>
            </Row>
            {switcherOpen ? (
              <Stack
                gap="xxs"
                style={{ backgroundColor: theme.colors.surfacePrimary, borderRadius: theme.radius.widget, padding: theme.spacing.xs }}
              >
                {workspaces.map((w) => (
                  <Pressable
                    key={w.id}
                    onPress={() => {
                      setActiveWorkspaceId(w.id);
                      setSwitcherOpen(false);
                    }}
                    style={{ padding: theme.spacing.sm }}
                  >
                    <Text variant="body" color={w.id === activeWorkspaceId ? 'brandPrimary' : 'textPrimary'}>
                      {w.name}
                    </Text>
                  </Pressable>
                ))}
              </Stack>
            ) : null}
          </Stack>

          <BalanceHero
            totalBalanceMinor={totalBalanceMinor}
            monthNetMinor={monthNetMinor}
            receivableMinor={receivableTotalMinor}
            payableMinor={payableTotalMinor}
            hidden={balanceHidden}
            onToggleHidden={toggleBalanceHidden}
          />

          <Row gap="sm" align="stretch">
            <ObligationSummaryCard
              direction="payable"
              totalMinor={payableTotalMinor}
              count={payableObligations.length}
              nearestDueDate={payableObligations.find((o) => o.due_date)?.due_date ?? null}
              share={directionalTotalMinor > 0 ? payableTotalMinor / directionalTotalMinor : 0}
            />
            <ObligationSummaryCard
              direction="receivable"
              totalMinor={receivableTotalMinor}
              count={receivableObligations.length}
              nearestDueDate={receivableObligations.find((o) => o.due_date)?.due_date ?? null}
              share={directionalTotalMinor > 0 ? receivableTotalMinor / directionalTotalMinor : 0}
            />
          </Row>

          <IncomeExpenseAnalysis
            incomeMinor={monthTotalsQuery.data?.incomeMinor ?? 0}
            expenseMinor={monthTotalsQuery.data?.expenseMinor ?? 0}
          />

          <UpcomingDueList obligations={activeObligations} />

          <PendingReviewQueue documents={pendingDocumentsQuery.data ?? []} />

          <CreditCardDueWidget obligation={creditCardObligation} />

          {/* Hesaplar/Kişiler/Kategoriler artık "Daha Fazla" sekmesinden erişiliyor. */}
          <RecentTransactionsList transactions={recentTransactionsQuery.data ?? []} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

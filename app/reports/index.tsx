import { useMemo, useState } from 'react';
import { Alert, ScrollView, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { Row, SegmentedControl, Stack, Text } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { IncomeExpenseAnalysis } from '@/components/finance/IncomeExpenseAnalysis';
import { ObligationSummaryCard } from '@/components/finance/ObligationSummaryCard';
import { CategoryBreakdownList } from '@/components/finance/CategoryBreakdownList';
import { CounterpartyBreakdownList } from '@/components/finance/CounterpartyBreakdownList';
import { AccountBalancesList } from '@/components/finance/AccountBalancesList';
import { OverdueObligationsList } from '@/components/finance/OverdueObligationsList';
import { MonthlyComparisonChart } from '@/components/finance/MonthlyComparisonChart';
import { CashFlowForecastList } from '@/components/finance/CashFlowForecastList';
import { CurrentRatesCard } from '@/components/finance/CurrentRatesCard';
import {
  getAccountBalances,
  getCashFlowForecast,
  getCategoryBreakdown,
  getCounterpartyBreakdown,
  getIncomeExpenseTotals,
  getMonthlyComparison,
  getOverdueObligations,
  listTransactionsForExport,
  type DateRange,
} from '@/features/reports/api';
import { exportReportPdf } from '@/features/reports/pdf';
import { ACTIVE_OBLIGATION_STATUSES, listObligations } from '@/features/obligations/api';
import { listValueUnitRates, sumToReferenceMinor } from '@/features/valueUnits/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { toCsv } from '@/utils/csv';
import { getMySubscription, getPlanLimits, type PlanCode } from '@/features/subscriptions/api';
import { fromMinorUnits } from '@/utils/money';

type Period = 'month' | '3m' | 'year' | 'all';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: 'Bu Ay' },
  { key: '3m', label: 'Son 3 Ay' },
  { key: 'year', label: 'Bu Yıl' },
  { key: 'all', label: 'Tümü' },
];

const PERIOD_SUMMARY_TITLE: Record<Period, string> = {
  month: 'Bu Ay Gelir-Gider',
  '3m': 'Son 3 Ay Gelir-Gider',
  year: 'Bu Yıl Gelir-Gider',
  all: 'Tüm Zamanlar Gelir-Gider',
};

const DIRECTION_LABEL: Record<string, string> = {
  income: 'Gelir',
  expense: 'Gider',
  transfer: 'Transfer',
};

function getPeriodRange(period: Period): DateRange {
  const now = new Date();
  if (period === 'month') {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
    };
  }
  if (period === '3m') {
    return { from: new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString() };
  }
  if (period === 'year') {
    return { from: new Date(now.getFullYear(), 0, 1).toISOString() };
  }
  return {};
}

type CategoryDirection = 'expense' | 'income';

const CATEGORY_DIRECTION_OPTIONS: { key: CategoryDirection; label: string }[] = [
  { key: 'expense', label: 'Gider' },
  { key: 'income', label: 'Gelir' },
];

// Daha Fazla > Yönetim'den açılan modal bir ekran (bkz. app/(tabs)/daha-fazla.tsx) —
// önceden yüzen tab bar'ın bir sekmesiydi; kayan alt bar artık yalnızca en sık kullanılan
// beş akışa (Ana Sayfa/Hareketler/Tara/Takvim/Daha Fazla) ayrılmış olduğundan buraya taşındı.
export default function ReportsScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [period, setPeriod] = useState<Period>('month');
  const [categoryDirection, setCategoryDirection] = useState<CategoryDirection>('expense');
  const [isExporting, setIsExporting] = useState(false);

  const range = useMemo(() => getPeriodRange(period), [period]);

  const subscriptionQuery = useQuery({ queryKey: queryKeys.subscription(), queryFn: getMySubscription });
  const planCode: PlanCode = (subscriptionQuery.data?.plan as PlanCode) ?? 'free';
  const planLimitsQuery = useQuery({
    queryKey: [...queryKeys.planLimits(), planCode],
    queryFn: () => getPlanLimits(planCode),
    enabled: subscriptionQuery.isSuccess,
  });
  // Limit bilgisi henüz gelmediyse engellenmez (fail-open) — plan sorgusu yüzünden
  // kullanıcının raporunu alamaması, sızdırmaktan daha kötü bir hata olurdu.
  const unlimitedExport = planLimitsQuery.data?.unlimited_export ?? true;
  const canExportPeriod = unlimitedExport || period === 'month';

  const summaryQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.reportSummary(activeWorkspaceId, period) : ['reports', 'disabled'],
    queryFn: () => getIncomeExpenseTotals(activeWorkspaceId as string, range),
    enabled: !!activeWorkspaceId,
  });

  const categoryQuery = useQuery({
    queryKey: activeWorkspaceId
      ? queryKeys.reportCategoryBreakdown(activeWorkspaceId, categoryDirection, period)
      : ['reports', 'disabled'],
    queryFn: () => getCategoryBreakdown(activeWorkspaceId as string, categoryDirection, range),
    enabled: !!activeWorkspaceId,
  });

  const counterpartyQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.reportCounterpartyBreakdown(activeWorkspaceId, period) : ['reports', 'disabled'],
    queryFn: () => getCounterpartyBreakdown(activeWorkspaceId as string, range),
    enabled: !!activeWorkspaceId,
  });

  const obligationsSummaryQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.dashboardActiveObligations(activeWorkspaceId) : ['reports', 'disabled'],
    queryFn: () => listObligations({ workspaceId: activeWorkspaceId as string, statuses: ACTIVE_OBLIGATION_STATUSES, pageSize: 200 }),
    enabled: !!activeWorkspaceId,
  });

  const accountBalancesQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.reportAccountBalances(activeWorkspaceId) : ['reports', 'disabled'],
    queryFn: () => getAccountBalances(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const overdueQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.reportOverdueObligations(activeWorkspaceId) : ['reports', 'disabled'],
    queryFn: () => getOverdueObligations(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const cashFlowQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.reportCashFlow(activeWorkspaceId) : ['reports', 'disabled'],
    queryFn: () => getCashFlowForecast(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const monthlyComparisonQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.reportMonthlyComparison(activeWorkspaceId) : ['reports', 'disabled'],
    queryFn: () => getMonthlyComparison(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  // Borç/alacak kayıtları farklı değer birimlerinde olabilir (TRY, USD, gram_altin, ...) —
  // toplama girmeden önce her biri güncel TL karşılığına çevrilir (bkz.
  // features/valueUnits/api.ts sumToReferenceMinor, aynı desen app/(tabs)/index.tsx'te).
  const valueUnitRatesQuery = useQuery({
    queryKey: queryKeys.valueUnitRates(),
    queryFn: listValueUnitRates,
  });

  const activeObligations = useMemo(() => obligationsSummaryQuery.data ?? [], [obligationsSummaryQuery.data]);
  const payableObligations = useMemo(() => activeObligations.filter((o) => o.direction === 'payable'), [activeObligations]);
  const receivableObligations = useMemo(
    () => activeObligations.filter((o) => o.direction === 'receivable'),
    [activeObligations]
  );
  const payableTotalMinor = useMemo(
    () =>
      sumToReferenceMinor(
        payableObligations.map((o) => ({ amountMinor: o.remaining_amount_minor, unitCode: o.currency_code })),
        valueUnitRatesQuery.data ?? []
      ),
    [payableObligations, valueUnitRatesQuery.data]
  );
  const receivableTotalMinor = useMemo(
    () =>
      sumToReferenceMinor(
        receivableObligations.map((o) => ({ amountMinor: o.remaining_amount_minor, unitCode: o.currency_code })),
        valueUnitRatesQuery.data ?? []
      ),
    [receivableObligations, valueUnitRatesQuery.data]
  );
  const obligationTotalMinor = payableTotalMinor + receivableTotalMinor;

  async function handleExportCsv() {
    if (!activeWorkspaceId || isExporting) return;
    setIsExporting(true);
    try {
      const rows = await listTransactionsForExport(activeWorkspaceId, range);
      const csv = toCsv(
        ['Tarih', 'Açıklama', 'Yön', 'Tutar', 'Para Birimi', 'Kategori', 'Kişi/Firma', 'Hesap'],
        rows.map((row) => [
          row.occurredAt.slice(0, 10),
          row.description ?? '',
          DIRECTION_LABEL[row.direction] ?? row.direction,
          fromMinorUnits(row.amountMinor).toFixed(2),
          row.currencyCode,
          row.categoryName ?? '',
          row.counterpartyName ?? '',
          row.accountName ?? '',
        ])
      );
      await Share.share({ message: csv, title: 'Vademde Hareket Raporu' });
    } finally {
      setIsExporting(false);
    }
  }

  async function handleExportPdf() {
    if (!activeWorkspaceId || isExporting) return;
    setIsExporting(true);
    try {
      const [expenseCategories, incomeCategories] = await Promise.all([
        getCategoryBreakdown(activeWorkspaceId, 'expense', range),
        getCategoryBreakdown(activeWorkspaceId, 'income', range),
      ]);
      await exportReportPdf({
        periodLabel: PERIOD_SUMMARY_TITLE[period],
        incomeMinor: summaryQuery.data?.incomeMinor ?? 0,
        expenseMinor: summaryQuery.data?.expenseMinor ?? 0,
        payableTotalMinor,
        payableCount: payableObligations.length,
        receivableTotalMinor,
        receivableCount: receivableObligations.length,
        monthlyComparison: monthlyComparisonQuery.data ?? [],
        expenseCategories,
        incomeCategories,
        counterparties: counterpartyQuery.data ?? [],
        accountBalances: accountBalancesQuery.data ?? [],
        overdueObligations: overdueQuery.data ?? [],
        cashFlow: cashFlowQuery.data ?? [],
      });
    } catch (error) {
      Alert.alert('Hata', error instanceof Error ? error.message : 'PDF oluşturulamadı');
    } finally {
      setIsExporting(false);
    }
  }

  function handleExportPress() {
    // docs/10-abonelik-gelir-modeli.md — plan_limits.unlimited_export. Ücretsiz planda
    // rapor çıktısı yalnızca içinde bulunulan ay için alınabilir; daha uzun dönemlerin
    // analiz raporu Plus ve İşletme planlarının özelliğidir.
    //
    // Bu limit KULLANICININ KENDİ VERİSİNİ dışa aktarmasını engellemez — tam veri yedeği
    // (Ayarlar → Verilerimi Dışa Aktar) her planda açıktır, KVKK/GDPR veri taşınabilirliği
    // gereği. Burada sınırlanan yalnızca hazırlanmış ANALİZ raporudur.
    if (!canExportPeriod) {
      Alert.alert(
        'Dönem raporu',
        `"${PERIODS.find((p) => p.key === period)?.label}" raporu Plus planında dışa aktarılabilir. Ücretsiz planda bu ayın raporunu alabilir, tüm verilerinizi Ayarlar → Verilerimi Dışa Aktar'dan her zaman indirebilirsiniz.`,
        [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Planları gör', onPress: () => router.push('/paywall') },
        ]
      );
      return;
    }
    Alert.alert('Raporu Dışa Aktar', 'Hangi formatta paylaşmak istersiniz?', [
      { text: 'CSV', onPress: handleExportCsv },
      { text: 'PDF', onPress: handleExportPdf },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  }

  // Ekran web'de doğrudan bu URL'e gidilerek (sayfa yenileme, deep link) açılırsa
  // stack'te geri gidilecek bir geçmiş olmayabilir (bkz. accounts/credit-cards.tsx'teki
  // aynı koruma) — o durumda Daha Fazla'ya (bu ekranın giriş noktası) düşülür.
  function closeScreen() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/daha-fazla');
    }
  }

  if (!activeWorkspaceId) {
    return (
      <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        <Stack gap="xs" style={{ flex: 1, padding: theme.screenEdge.standard, justifyContent: 'center' }}>
          <Text variant="pageTitle">Raporlar</Text>
          <Text variant="body" color="textSecondary">
            Rapor görmek için önce bir çalışma alanı seçin.
          </Text>
        </Stack>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <Stack gap="lg" style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.md }}>
        <ScreenHeader
          title="Raporlar"
          left={{ icon: 'close', accessibilityLabel: 'Kapat', onPress: closeScreen }}
          right={{ icon: 'share-outline', accessibilityLabel: 'Dışa aktar', onPress: handleExportPress }}
        />
      </Stack>

      <ScrollView
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.lg,
        }}
      >
        <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} scrollable />

        <CurrentRatesCard rates={valueUnitRatesQuery.data ?? []} isLoading={valueUnitRatesQuery.isLoading} />

        <IncomeExpenseAnalysis
          title={PERIOD_SUMMARY_TITLE[period]}
          incomeMinor={summaryQuery.data?.incomeMinor ?? 0}
          expenseMinor={summaryQuery.data?.expenseMinor ?? 0}
        />

        <Stack gap="sm">
          <Text variant="sectionTitle">Borç / Alacak Özeti</Text>
          <Row gap="sm" align="stretch">
            <ObligationSummaryCard
              direction="payable"
              totalMinor={payableTotalMinor}
              count={payableObligations.length}
              nearestDueDate={payableObligations.find((o) => o.due_date)?.due_date ?? null}
              share={obligationTotalMinor > 0 ? payableTotalMinor / obligationTotalMinor : 0}
            />
            <ObligationSummaryCard
              direction="receivable"
              totalMinor={receivableTotalMinor}
              count={receivableObligations.length}
              nearestDueDate={receivableObligations.find((o) => o.due_date)?.due_date ?? null}
              share={obligationTotalMinor > 0 ? receivableTotalMinor / obligationTotalMinor : 0}
            />
          </Row>
        </Stack>

        {monthlyComparisonQuery.data ? <MonthlyComparisonChart data={monthlyComparisonQuery.data} /> : null}

        <CategoryBreakdownList
          title="Kategori Bazlı"
          items={categoryQuery.data ?? []}
          emptyLabel="Bu dönemde kayıt yok."
          headerRight={
            <SegmentedControl
              options={CATEGORY_DIRECTION_OPTIONS}
              value={categoryDirection}
              onChange={setCategoryDirection}
              size="compact"
              trackColor="surfaceElevated"
            />
          }
        />

        <CounterpartyBreakdownList items={counterpartyQuery.data ?? []} />

        <AccountBalancesList items={accountBalancesQuery.data ?? []} />

        <OverdueObligationsList obligations={overdueQuery.data ?? []} />

        <CashFlowForecastList buckets={cashFlowQuery.data ?? []} />
      </ScrollView>
    </SafeAreaView>
  );
}

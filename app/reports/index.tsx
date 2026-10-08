import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { DateRangeSheet, ScrollableTabs, Skeleton, Stack, Text } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { OverdueObligationsList } from '@/components/finance/OverdueObligationsList';
import { ReportExportSheet, type ExportFormat } from '@/components/finance/ReportExportSheet';
import { formatCacheAge } from '@/components/finance/ReferenceValueRow';
import {
  AccountRows,
  CashFlowRows,
  CategoryRows,
  CounterpartyRows,
  DebtMiniCard,
  DeltaText,
  KpiRow,
  MonthBars,
  NetCard,
  RateRows,
  RatesMiniCard,
  ReportCard,
  SectionTitle,
  SideKpis,
  SmartSummary,
} from '@/components/finance/ReportSections';
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
import { exportReportPdf, type ReportPdfSections } from '@/features/reports/pdf';
import { ACTIVE_OBLIGATION_STATUSES, listObligations } from '@/features/obligations/api';
import { VALUE_UNITS } from '@/features/valueUnits/units';
import { listValueUnitRates, sumToReferenceMinor } from '@/features/valueUnits/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { toCsv } from '@/utils/csv';
import { getMySubscription, getPlanLimits, type PlanCode } from '@/features/subscriptions/api';
import { formatMinorAmount, fromMinorUnits } from '@/utils/money';

type Period = 'month' | '3m' | 'year' | 'all' | 'custom';
type CategoryDirection = 'expense' | 'income';
type SectionKey = 'ozet' | 'kategoriler' | 'kisiler' | 'borc' | 'nakit' | 'hesaplar' | 'kurlar';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: 'Bu ay' },
  { key: '3m', label: 'Son 3 ay' },
  { key: 'year', label: 'Bu yıl' },
  { key: 'all', label: 'Tümü' },
];

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'ozet', label: 'Özet' },
  { key: 'kategoriler', label: 'Kategoriler' },
  { key: 'kisiler', label: 'Kişiler' },
  { key: 'borc', label: 'Borç/alacak' },
  { key: 'nakit', label: 'Nakit akışı' },
  { key: 'hesaplar', label: 'Hesaplar' },
  { key: 'kurlar', label: 'Kurlar' },
];

const DIRECTION_LABEL: Record<string, string> = { income: 'Gelir', expense: 'Gider', transfer: 'Transfer' };

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
const monthFormatter = new Intl.DateTimeFormat('tr-TR', { month: 'long' });

interface CustomRange {
  start: string;
  end: string;
}

function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getPeriodRange(period: Period, custom: CustomRange | null): DateRange {
  const now = new Date();
  if (period === 'custom' && custom) {
    const end = isoToLocalDate(custom.end);
    end.setDate(end.getDate() + 1);
    return { from: isoToLocalDate(custom.start).toISOString(), to: end.toISOString() };
  }
  if (period === 'month') {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
    };
  }
  if (period === '3m') return { from: new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString() };
  if (period === 'year') return { from: new Date(now.getFullYear(), 0, 1).toISOString() };
  return {};
}

// Karşılaştırma dönemi: aynı uzunlukta bir önceki dönem; "Tümü"nde yoktur.
function getPreviousRange(period: Period, custom: CustomRange | null): DateRange | null {
  const now = new Date();
  if (period === 'month') {
    return {
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(),
      to: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    };
  }
  if (period === '3m') {
    return {
      from: new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString(),
      to: new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString(),
    };
  }
  if (period === 'year') {
    return { from: new Date(now.getFullYear() - 1, 0, 1).toISOString(), to: new Date(now.getFullYear(), 0, 1).toISOString() };
  }
  if (period === 'custom' && custom) {
    const start = isoToLocalDate(custom.start);
    const endExclusive = isoToLocalDate(custom.end);
    endExclusive.setDate(endExclusive.getDate() + 1);
    const lengthMs = endExclusive.getTime() - start.getTime();
    return { from: new Date(start.getTime() - lengthMs).toISOString(), to: start.toISOString() };
  }
  return null;
}

function rangeLabel(period: Period, custom: CustomRange | null): string {
  const now = new Date();
  if (period === 'custom' && custom) {
    const s = isoToLocalDate(custom.start);
    const e = isoToLocalDate(custom.end);
    return `${dateFormatter.format(s)} – ${dateFormatter.format(e)}`;
  }
  if (period === 'month') {
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return `1 – ${last} ${monthFormatter.format(now)} ${now.getFullYear()}`;
  }
  if (period === '3m') {
    const s = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return `${monthFormatter.format(s)} – ${monthFormatter.format(now)} ${now.getFullYear()}`;
  }
  if (period === 'year') return `${now.getFullYear()} yılı`;
  return 'Tüm zamanlar';
}

// Bölüm başlangıç konumunu ölçen sarmalayıcı (bölüm atlama çipleri için).
function Anchor({
  id,
  onMeasure,
  gap = 'sm',
  children,
}: {
  id: SectionKey;
  onMeasure: (key: SectionKey, y: number) => void;
  gap?: 'sm' | 'md';
  children: React.ReactNode;
}) {
  return (
    <Stack gap={gap} onLayout={(e) => onMeasure(id, e.nativeEvent.layout.y)}>
      {children}
    </Stack>
  );
}

// Daha Fazla > Analiz'den açılan modal bir ekran (bkz. app/(tabs)/daha-fazla.tsx).
export default function ReportsScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [period, setPeriod] = useState<Period>('month');
  const [custom, setCustom] = useState<CustomRange | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [categoryDirection, setCategoryDirection] = useState<CategoryDirection>('expense');
  const [isExporting, setIsExporting] = useState(false);
  const [section, setSection] = useState<SectionKey>('ozet');
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Partial<Record<SectionKey, number>>>({});

  const range = useMemo(() => getPeriodRange(period, custom), [period, custom]);
  const prevRange = useMemo(() => getPreviousRange(period, custom), [period, custom]);
  const periodKey = period === 'custom' && custom ? `custom:${custom.start}:${custom.end}` : period;
  const periodText = rangeLabel(period, custom);

  const subscriptionQuery = useQuery({ queryKey: queryKeys.subscription(), queryFn: getMySubscription });
  const planCode: PlanCode = (subscriptionQuery.data?.plan as PlanCode) ?? 'free';
  const planLimitsQuery = useQuery({
    queryKey: [...queryKeys.planLimits(), planCode],
    queryFn: () => getPlanLimits(planCode),
    enabled: subscriptionQuery.isSuccess,
  });
  // Limit bilgisi henüz gelmediyse engellenmez (fail-open): plan sorgusu yüzünden raporun alınamaması
  // sızdırmaktan daha kötü bir hata olurdu. Bu limit kullanıcının kendi verisini dışa aktarmasını
  // engellemez (Ayarlar → Verilerimi Dışa Aktar her planda açık); yalnızca hazırlanmış analiz raporunu sınırlar.
  const unlimitedExport = planLimitsQuery.data?.unlimited_export ?? true;
  const canExportPeriod = unlimitedExport || period === 'month';

  const enabled = !!activeWorkspaceId;
  const ws = activeWorkspaceId as string;

  const summaryQuery = useQuery({
    queryKey: enabled ? queryKeys.reportSummary(ws, periodKey) : ['reports', 'disabled'],
    queryFn: () => getIncomeExpenseTotals(ws, range),
    enabled,
  });
  const prevSummaryQuery = useQuery({
    queryKey: enabled ? [ws, 'report-summary-prev', periodKey] : ['reports', 'disabled-prev'],
    queryFn: () => getIncomeExpenseTotals(ws, prevRange as DateRange),
    enabled: enabled && !!prevRange,
  });
  const categoryQuery = useQuery({
    queryKey: enabled ? queryKeys.reportCategoryBreakdown(ws, categoryDirection, periodKey) : ['reports', 'disabled'],
    queryFn: () => getCategoryBreakdown(ws, categoryDirection, range),
    enabled,
  });
  const prevCategoryQuery = useQuery({
    queryKey: enabled ? [ws, 'report-category-prev', categoryDirection, periodKey] : ['reports', 'disabled-prev'],
    queryFn: () => getCategoryBreakdown(ws, categoryDirection, prevRange as DateRange),
    enabled: enabled && !!prevRange,
  });
  const expenseCategoryQuery = useQuery({
    queryKey: enabled ? queryKeys.reportCategoryBreakdown(ws, 'expense', periodKey) : ['reports', 'disabled'],
    queryFn: () => getCategoryBreakdown(ws, 'expense', range),
    enabled,
  });
  const prevExpenseCategoryQuery = useQuery({
    queryKey: enabled ? [ws, 'report-category-prev', 'expense', periodKey] : ['reports', 'disabled-prev'],
    queryFn: () => getCategoryBreakdown(ws, 'expense', prevRange as DateRange),
    enabled: enabled && !!prevRange,
  });
  const counterpartyQuery = useQuery({
    queryKey: enabled ? queryKeys.reportCounterpartyBreakdown(ws, periodKey) : ['reports', 'disabled'],
    queryFn: () => getCounterpartyBreakdown(ws, range),
    enabled,
  });
  const obligationsSummaryQuery = useQuery({
    queryKey: enabled ? queryKeys.dashboardActiveObligations(ws) : ['reports', 'disabled'],
    queryFn: () => listObligations({ workspaceId: ws, statuses: ACTIVE_OBLIGATION_STATUSES, pageSize: 200 }),
    enabled,
  });
  const accountBalancesQuery = useQuery({
    queryKey: enabled ? queryKeys.reportAccountBalances(ws) : ['reports', 'disabled'],
    queryFn: () => getAccountBalances(ws),
    enabled,
  });
  const overdueQuery = useQuery({
    queryKey: enabled ? queryKeys.reportOverdueObligations(ws) : ['reports', 'disabled'],
    queryFn: () => getOverdueObligations(ws),
    enabled,
  });
  const cashFlowQuery = useQuery({
    queryKey: enabled ? queryKeys.reportCashFlow(ws) : ['reports', 'disabled'],
    queryFn: () => getCashFlowForecast(ws),
    enabled,
  });
  const monthlyComparisonQuery = useQuery({
    queryKey: enabled ? queryKeys.reportMonthlyComparison(ws) : ['reports', 'disabled'],
    queryFn: () => getMonthlyComparison(ws),
    enabled,
  });
  // Borç/alacak kayıtları farklı değer birimlerinde olabilir; toplama girmeden TL karşılığına çevrilir.
  const valueUnitRatesQuery = useQuery({ queryKey: queryKeys.valueUnitRates(), queryFn: listValueUnitRates });

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

  const income = summaryQuery.data?.incomeMinor ?? 0;
  const expense = summaryQuery.data?.expenseMinor ?? 0;
  const net = income - expense;
  const prev = prevSummaryQuery.data ?? null;
  const savingsRate = income > 0 ? Math.round((net / income) * 100) : null;
  const prevSavingsRate = prev && prev.incomeMinor > 0 ? Math.round(((prev.incomeMinor - prev.expenseMinor) / prev.incomeMinor) * 100) : null;
  const overdueItems = overdueQuery.data ?? [];
  const overdueMinor = overdueItems.reduce((s, o) => s + o.remaining_amount_minor, 0);

  const prevCategoryMap = useMemo(
    () => (prevCategoryQuery.data ? new Map(prevCategoryQuery.data.map((c) => [c.name, c.amountMinor])) : null),
    [prevCategoryQuery.data]
  );

  // Akıllı özet: tamamen deterministik (yapay zekâ çağrısı yok) — yalnızca ekrandaki rakamlardan türer.
  const summaryText = useMemo(() => {
    const parts: string[] = [];
    if (prev && prev.expenseMinor > 0) {
      const pct = Math.round(((expense - prev.expenseMinor) / prev.expenseMinor) * 100);
      if (pct !== 0) {
        const when = period === 'month' ? `${monthFormatter.format(new Date())}'da` : 'Bu dönemde';
        parts.push(`${when} gideri önceki döneme göre %${Math.abs(pct)} ${pct < 0 ? 'azalttın' : 'artırdın'}.`);
      }
    }
    const top = expenseCategoryQuery.data?.[0];
    if (top) parts.push(`En büyük gider kalemi ${top.name}.`);
    const prevMap = prevExpenseCategoryQuery.data ? new Map(prevExpenseCategoryQuery.data.map((c) => [c.name, c.amountMinor])) : null;
    const rising = (expenseCategoryQuery.data ?? [])
      .map((c) => ({ name: c.name, pct: prevMap?.get(c.name) ? Math.round(((c.amountMinor - (prevMap.get(c.name) as number)) / (prevMap.get(c.name) as number)) * 100) : 0 }))
      .filter((c) => c.pct >= 20)
      .sort((a, b) => b.pct - a.pct)[0];
    if (rising) parts.push(`${rising.name} harcaması %${rising.pct} arttı.`);
    return parts.join(' ');
  }, [prev, expense, period, expenseCategoryQuery.data, prevExpenseCategoryQuery.data]);

  async function handleExportCsv() {
    const rows = await listTransactionsForExport(ws, range);
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
  }

  async function handleExportPdf(sections: ReportPdfSections) {
    const [expenseCategories, incomeCategories] = await Promise.all([
      getCategoryBreakdown(ws, 'expense', range),
      getCategoryBreakdown(ws, 'income', range),
    ]);
    await exportReportPdf({
      periodLabel: periodText,
      incomeMinor: income,
      expenseMinor: expense,
      payableTotalMinor,
      payableCount: payableObligations.length,
      receivableTotalMinor,
      receivableCount: receivableObligations.length,
      monthlyComparison: monthlyComparisonQuery.data ?? [],
      expenseCategories,
      incomeCategories,
      counterparties: counterpartyQuery.data ?? [],
      accountBalances: accountBalancesQuery.data ?? [],
      overdueObligations: overdueItems,
      cashFlow: cashFlowQuery.data ?? [],
      sections,
    });
  }

  async function handleExport(format: ExportFormat, sections: ReportPdfSections) {
    if (!enabled || isExporting) return;
    setIsExporting(true);
    try {
      if (format === 'csv') await handleExportCsv();
      else await handleExportPdf(sections);
      setExportOpen(false);
    } catch (error) {
      Alert.alert('Hata', error instanceof Error ? error.message : 'Rapor oluşturulamadı');
    } finally {
      setIsExporting(false);
    }
  }

  function closeScreen() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/daha-fazla');
  }

  const measure = useCallback((key: SectionKey, y: number) => {
    offsets.current[key] = y;
  }, []);

  function jumpTo(key: SectionKey) {
    setSection(key);
    scrollRef.current?.scrollTo({ y: Math.max(0, (offsets.current[key] ?? 0) - 8), animated: true });
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

  const loading = summaryQuery.isLoading;
  const ratesWithData = (valueUnitRatesQuery.data ?? [])
    .filter((r) => VALUE_UNITS.some((u) => u.code === r.unit_code))
    .sort((a, b) => VALUE_UNITS.findIndex((u) => u.code === a.unit_code) - VALUE_UNITS.findIndex((u) => u.code === b.unit_code));
  const newestRate = ratesWithData.reduce<string | null>((n, r) => (!n || r.cached_at > n ? r.cached_at : n), null);

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <View style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.md, gap: theme.spacing.sm }}>
        <ScreenHeader
          title="Raporlar"
          left={{ icon: 'close', accessibilityLabel: 'Kapat', onPress: closeScreen }}
          right={{ icon: 'share-outline', accessibilityLabel: 'Dışa aktar', onPress: () => setExportOpen(true) }}
        />
        <ScrollableTabs
          tabs={[...PERIODS, { key: 'custom', label: 'Özel aralık' }]}
          activeKey={period}
          onChange={(k) => (k === 'custom' ? setRangeOpen(true) : setPeriod(k as Period))}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
          <Ionicons name="calendar-outline" size={theme.iconSize.md} color={theme.colors.textSecondary} />
          <Text variant="caption" color="textSecondary" tabular numberOfLines={1} style={{ flexShrink: 1 }}>
            {periodText}
          </Text>
        </View>
        <ScrollableTabs tabs={SECTIONS} activeKey={section} onChange={(k) => jumpTo(k as SectionKey)} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: theme.screenEdge.standard, paddingBottom: theme.spacing.massive, gap: theme.spacing.xl }}
      >
        <Anchor id="ozet" onMeasure={measure} gap="md">
          {loading ? (
            <Skeleton height={180} borderRadius={theme.radius.widget} />
          ) : (
            <>
              {summaryText ? <SmartSummary text={summaryText} onPress={() => router.push('/insights')} /> : null}

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <NetCard net={net} />
                <SideKpis
                  items={[
                    {
                      key: 'gelir',
                      label: 'Gelir',
                      value: `+${formatMinorAmount(income).replace(/,00(?=\D*$)/, '')}`,
                      valueColor: theme.colors.receivable,
                      icon: 'arrow-up',
                      iconColor: theme.colors.receivable,
                      footer: <DeltaText current={income} previous={prev ? prev.incomeMinor : null} suffix="geçen dön." />,
                    },
                    {
                      key: 'gider',
                      label: 'Gider',
                      value: `−${formatMinorAmount(expense).replace(/,00(?=\D*$)/, '')}`,
                      valueColor: theme.colors.danger,
                      icon: 'arrow-down',
                      iconColor: theme.colors.danger,
                      footer: <DeltaText current={expense} previous={prev ? prev.expenseMinor : null} goodWhenDown suffix="geçen dön." />,
                    },
                    {
                      key: 'tasarruf',
                      label: 'Tasarruf oranı',
                      value: savingsRate === null ? '—' : `%${savingsRate}`,
                      icon: 'pie-chart-outline',
                      iconColor: theme.colors.textSecondary,
                      footer:
                        savingsRate !== null && prevSavingsRate !== null ? (
                          <DeltaText current={savingsRate} previous={prevSavingsRate} suffix="puan farkla" />
                        ) : (
                          <Text variant="caption" color="textSecondary" numberOfLines={1}>
                            Gelir kaydı gerekir
                          </Text>
                        ),
                    },
                  ]}
                />
              </View>

              {monthlyComparisonQuery.data ? (
                <ReportCard title="Son 6 ay">
                  <MonthBars data={monthlyComparisonQuery.data} />
                </ReportCard>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <DebtMiniCard
                  payableMinor={payableTotalMinor}
                  payableCount={payableObligations.length}
                  receivableMinor={receivableTotalMinor}
                  receivableCount={receivableObligations.length}
                  onPress={() => jumpTo('borc')}
                />
                <RatesMiniCard
                  rates={ratesWithData}
                  ageText={newestRate ? `${formatCacheAge(newestRate)} güncellendi` : null}
                  onPress={() => jumpTo('kurlar')}
                />
              </View>
            </>
          )}
        </Anchor>

        <Anchor id="kategoriler" onMeasure={measure}>
          <ReportCard
            title="Kategoriler"
            right={
              <ScrollableTabs
                tabs={[
                  { key: 'expense', label: 'Gider' },
                  { key: 'income', label: 'Gelir' },
                ]}
                activeKey={categoryDirection}
                onChange={(k) => setCategoryDirection(k as CategoryDirection)}
              />
            }
          >
            <CategoryRows
              bare
              items={categoryQuery.data ?? []}
              previous={prevCategoryMap}
              emptyLabel="Bu dönemde kayıt yok."
              goodWhenDown={categoryDirection === 'expense'}
            />
          </ReportCard>
        </Anchor>

        <Anchor id="kisiler" onMeasure={measure}>
          <SectionTitle>Kişi ve firmalar</SectionTitle>
          <CounterpartyRows items={counterpartyQuery.data ?? []} />
        </Anchor>

        <Anchor id="borc" onMeasure={measure}>
          <SectionTitle>Borç ve alacak</SectionTitle>
          <KpiRow
            items={[
              {
                label: 'Ödenecek',
                value: formatMinorAmount(payableTotalMinor),
                footer: (
                  <Text variant="caption" color="textSecondary">
                    {payableObligations.length} kayıt
                  </Text>
                ),
              },
              {
                label: 'Tahsil edilecek',
                value: formatMinorAmount(receivableTotalMinor),
                valueColor: theme.colors.receivable,
                footer: (
                  <Text variant="caption" color="textSecondary">
                    {receivableObligations.length} kayıt
                  </Text>
                ),
              },
              {
                label: 'Gecikmiş',
                value: formatMinorAmount(overdueMinor),
                valueColor: overdueMinor > 0 ? theme.colors.danger : undefined,
                footer: (
                  <Text variant="caption" color="textSecondary">
                    {overdueItems.length} kayıt
                  </Text>
                ),
              },
            ]}
          />
          <OverdueObligationsList obligations={overdueItems} />
        </Anchor>

        <Anchor id="nakit" onMeasure={measure}>
          <SectionTitle>Beklenen nakit akışı</SectionTitle>
          <CashFlowRows buckets={cashFlowQuery.data ?? []} />
        </Anchor>

        <Anchor id="hesaplar" onMeasure={measure}>
          <SectionTitle>Hesap bakiyeleri</SectionTitle>
          <AccountRows items={accountBalancesQuery.data ?? []} />
        </Anchor>

        <Anchor id="kurlar" onMeasure={measure}>
          <SectionTitle>Güncel kurlar</SectionTitle>
          <RateRows rates={ratesWithData} ageText={newestRate ? `${formatCacheAge(newestRate)} güncellendi` : null} />
        </Anchor>
      </ScrollView>

      <DateRangeSheet
        visible={rangeOpen}
        onClose={() => setRangeOpen(false)}
        start={custom?.start ?? null}
        end={custom?.end ?? null}
        onApply={(start, end) => {
          setCustom({ start, end });
          setPeriod('custom');
        }}
      />

      <ReportExportSheet
        visible={exportOpen}
        onClose={() => setExportOpen(false)}
        periodLabel={periodText}
        allowed={canExportPeriod}
        busy={isExporting}
        onExport={handleExport}
        onUpgrade={() => {
          setExportOpen(false);
          router.push('/paywall');
        }}
      />
    </SafeAreaView>
  );
}

import { useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, Share, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import {
  BottomSheet,
  DateRangeSheet,
  GroupedRow,
  GroupedRowIcon,
  GroupedSection,
  Pressable,
  ScrollableTabs,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
} from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { ReportExportSheet, type ExportFormat } from '@/components/finance/ReportExportSheet';
import { formatCacheAge } from '@/components/finance/ReferenceValueRow';
import { FadeIn } from '@/components/finance/GlowSurface';
import {
  AccountRows,
  CashFlowRows,
  CategoryRows,
  ChartLegend,
  CounterpartyRows,
  DebtRows,
  KpiList,
  MonthBars,
  MonthTable,
  NetCard,
  percentChange,
  RateRows,
  ReportCard,
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
import { ACTIVE_OBLIGATION_STATUSES, listAllObligations } from '@/features/obligations/api';
import { VALUE_UNITS } from '@/features/valueUnits/units';
import { listValueUnitRates, sumToReferenceMinor } from '@/features/valueUnits/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { toCsv } from '@/utils/csv';
import { getMySubscription, getPlanLimits, type PlanCode } from '@/features/subscriptions/api';
import { listMyWorkspaces } from '@/features/workspaces/api';
import { formatMinorAmount, fromMinorUnits } from '@/utils/money';
import { friendlyErrorMessage } from '@/utils/alerts';
import { capitalizeUi, formatPercent, localeDateFormatter, zeroFractionPattern } from '@/i18n/format';
import { getLanguage, t } from '@/i18n';
import { localizedRecord } from '@/i18n/localized';

type Period = 'month' | '3m' | 'year' | 'all' | 'custom';
type CategoryDirection = 'expense' | 'income';
type SectionKey = 'ozet' | 'kategoriler' | 'borc' | 'kurlar' | 'diger';
type DetailKey = 'aylar' | 'kategoriler' | 'kisiler' | 'nakit' | 'hesaplar' | 'kurlar';

const PERIODS: { key: Exclude<Period, 'custom'>; readonly label: string }[] = [
  { key: 'month', get label() { return t('reports.screen.thisMonth'); } },
  { key: '3m', get label() { return t('reports.screen.last3Months'); } },
  { key: 'year', get label() { return t('reports.screen.thisYear'); } },
  { key: 'all', get label() { return t('common.all'); } },
];

// Bölüm atlama çipleri: dokununca sayfa ilgili karta kayar.
const SECTION_LABEL_KEY = {
  ozet: 'reports.screen.summary',
  kategoriler: 'reports.screen.categories',
  borc: 'reports.screen.debtShort',
  kurlar: 'reports.screen.ratesShort',
  diger: 'reports.screen.other',
} as const satisfies Record<SectionKey, string>;
const SECTIONS: { key: SectionKey; readonly label: string }[] = (Object.keys(SECTION_LABEL_KEY) as SectionKey[]).map((key) => ({
  key,
  get label() {
    return t(SECTION_LABEL_KEY[key]);
  },
}));

const DETAIL_TITLE_KEY = {
  aylar: 'reports.screen.last6Months',
  kategoriler: 'reports.screen.categories',
  kisiler: 'reports.screen.counterparties',
  nakit: 'reports.screen.cashFlow',
  hesaplar: 'reports.screen.balances',
  kurlar: 'reports.screen.rates',
} as const satisfies Record<DetailKey, string>;

/** Kategoriler kartında gösterilen satır sayısı; tamamı ok düğmesinden açılır. */
const CATEGORY_PREVIEW = 4;

function capitalize(text: string): string {
  return capitalizeUi(text);
}

// Türkçe bulunma eki: "Ekim'de", "Ağustos'ta", "Mart'ta" (ünlü uyumu + sert ünsüz benzeşmesi).
function locative(word: string): string {
  const vowels = word.toLocaleLowerCase('tr-TR').match(/[aeıioöuü]/g) ?? [];
  const back = ['a', 'ı', 'o', 'u'].includes(vowels[vowels.length - 1] ?? 'e');
  const hard = /[çfhkpsşt]$/i.test(word);
  return `${word}’${hard ? 't' : 'd'}${back ? 'a' : 'e'}`;
}

const DIRECTION_LABEL: Record<string, string> = localizedRecord(
  ['income', 'expense', 'transfer'] as const,
  (direction) => t(`common.${direction}`)
);

const dateFormatter = localeDateFormatter({ day: 'numeric', month: 'long', year: 'numeric' });
const monthFormatter = localeDateFormatter({ month: 'long' });

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
    return t('reports.screen.monthRange', { last, month: monthFormatter.format(now), year: now.getFullYear() });
  }
  if (period === '3m') {
    const s = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return t('reports.screen.multiMonthRange', { from: monthFormatter.format(s), to: monthFormatter.format(now), year: now.getFullYear() });
  }
  if (period === 'year') return t('reports.screen.yearLabel', { year: now.getFullYear() });
  return t('reports.screen.allTime');
}

// Daha Fazla > Analiz menüsünden açılan ekran (bkz. app/(tabs)/daha-fazla.tsx).
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
  const [detail, setDetail] = useState<DetailKey | null>(null);
  const [section, setSection] = useState<SectionKey>('ozet');
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Partial<Record<SectionKey, number>>>({});

  const range = useMemo(() => getPeriodRange(period, custom), [period, custom]);
  const prevRange = useMemo(() => getPreviousRange(period, custom), [period, custom]);
  const periodKey = period === 'custom' && custom ? `custom:${custom.start}:${custom.end}` : period;
  const periodText = rangeLabel(period, custom);

  const subscriptionQuery = useQuery({ queryKey: queryKeys.subscription(), queryFn: getMySubscription });
  const workspacesQuery = useQuery({ queryKey: queryKeys.workspaces(), queryFn: listMyWorkspaces });
  const workspaceName = workspacesQuery.data?.find((w) => w.id === activeWorkspaceId)?.name ?? null;
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
    queryFn: () => listAllObligations({ workspaceId: ws, statuses: ACTIVE_OBLIGATION_STATUSES }),
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
        const month = capitalize(monthFormatter.format(new Date()));
        const when = period === 'month' ? (getLanguage() === 'tr' ? locative(month) : t('reports.screen.inMonth', { month })) : t('reports.screen.thisPeriod');
        parts.push(t(pct < 0 ? 'reports.screen.summaryDown' : 'reports.screen.summaryUp', { when, pct: formatPercent(Math.abs(pct)) }));
      }
    }
    const top = expenseCategoryQuery.data?.[0];
    if (top) parts.push(t('reports.screen.topCategory', { name: top.name }));
    const prevMap = prevExpenseCategoryQuery.data ? new Map(prevExpenseCategoryQuery.data.map((c) => [c.name, c.amountMinor])) : null;
    const rising = (expenseCategoryQuery.data ?? [])
      .map((c) => ({ name: c.name, pct: prevMap?.get(c.name) ? Math.round(((c.amountMinor - (prevMap.get(c.name) as number)) / (prevMap.get(c.name) as number)) * 100) : 0 }))
      .filter((c) => c.pct >= 20)
      .sort((a, b) => b.pct - a.pct)[0];
    if (rising) parts.push(t('reports.screen.risingCategory', { name: rising.name, pct: formatPercent(rising.pct) }));
    return parts.join(' ');
  }, [prev, expense, period, expenseCategoryQuery.data, prevExpenseCategoryQuery.data]);

  async function handleExportCsv() {
    const rows = await listTransactionsForExport(ws, range);
    const csv = toCsv(
      [
        t('reports.screen.csvDate'),
        t('reports.screen.csvDescription'),
        t('reports.screen.csvDirection'),
        t('reports.screen.csvAmount'),
        t('reports.screen.csvCurrency'),
        t('reports.screen.csvCategory'),
        t('reports.screen.csvCounterparty'),
        t('reports.screen.csvAccount'),
      ],
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
    await Share.share({ message: csv, title: t('reports.screen.csvTitle') });
  }

  async function handleExportPdf(sections: ReportPdfSections) {
    const [expenseCategories, incomeCategories] = await Promise.all([
      getCategoryBreakdown(ws, 'expense', range),
      getCategoryBreakdown(ws, 'income', range),
    ]);
    await exportReportPdf({
      periodLabel: periodText,
      workspaceName,
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
      Alert.alert(t('common.error'), friendlyErrorMessage(error, t('reports.screen.exportFailed')));
    } finally {
      setIsExporting(false);
    }
  }

  function closeScreen() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/daha-fazla');
  }

  function onSectionLayout(key: SectionKey, e: LayoutChangeEvent) {
    offsets.current[key] = e.nativeEvent.layout.y;
  }

  function jumpTo(key: SectionKey) {
    setSection(key);
    scrollRef.current?.scrollTo({ y: Math.max(0, (offsets.current[key] ?? 0) - 8), animated: true });
  }

  if (!activeWorkspaceId) {
    return (
      <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        <Stack gap="xs" style={{ flex: 1, padding: theme.screenEdge.standard, justifyContent: 'center' }}>
          <Text variant="pageTitle">{t('reports.screen.title')}</Text>
          <Text variant="body" color="textSecondary">
            {t('reports.screen.noWorkspace')}
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
  const rateAgeText = newestRate ? t('reports.screen.rateAge', { age: formatCacheAge(newestRate) }) : null;

  const categories = categoryQuery.data ?? [];
  const cashFlowNet = (cashFlowQuery.data ?? []).reduce((sum, b) => sum + b.receivableMinor - b.payableMinor, 0);
  const counterpartyCount = counterpartyQuery.data?.length ?? 0;
  const accountCount = accountBalancesQuery.data?.length ?? 0;
  const prevSavingsRate =
    prev && prev.incomeMinor > 0 ? Math.round(((prev.incomeMinor - prev.expenseMinor) / prev.incomeMinor) * 100) : null;

  // "%12 geçen döneme göre ↑" gibi değişim cümlesi; önceki dönem yoksa açıklama.
  function changeCaption(current: number, previous: number | null, unit: '%' | 'puan' = '%'): string {
    if (previous === null) return period === 'all' ? t('reports.screen.allTimeTotal') : t('reports.screen.noPrevious');
    if (unit === 'puan') {
      const diff = current - previous;
      return diff === 0 ? t('reports.screen.same') : t(diff > 0 ? 'reports.screen.pointsUp' : 'reports.screen.pointsDown', { count: Math.abs(diff) });
    }
    const pct = percentChange(current, previous);
    if (pct === null) return current > 0 ? t('reports.screen.noPrevious') : t('reports.screen.noActivity');
    if (pct === 0) return t('reports.screen.same');
    return t(pct > 0 ? 'reports.screen.pctUp' : 'reports.screen.pctDown', { pct: formatPercent(Math.abs(pct)) });
  }

  const expenseColor = theme.colors.brandPrimary;
  const incomeColor = theme.colors.receivable;

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingHorizontal: theme.screenEdge.standard, paddingBottom: theme.spacing.massive, gap: theme.spacing.sm }}
      >
        <ScreenHeader
          title={t('reports.screen.title')}
          left={{ icon: 'chevron-back', accessibilityLabel: t('common.back'), onPress: closeScreen }}
          right={{ icon: 'share-outline', accessibilityLabel: t('reports.screen.export'), onPress: () => setExportOpen(true) }}
        />

        {/* Dönem kartı: hazır dönemler + seçili aralık ve özel aralık seçici. */}
        <View style={{ backgroundColor: theme.colors.surfacePrimary, borderRadius: theme.radius.widget, padding: theme.spacing.sm, gap: theme.spacing.sm }}>
          <ScrollableTabs tabs={PERIODS} activeKey={period} onChange={(k) => setPeriod(k as Period)} />
          <View style={{ height: 1, backgroundColor: theme.colors.separator }} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('reports.screen.periodA11y', { period: periodText })}
            onPress={() => setRangeOpen(true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, paddingHorizontal: 4, minHeight: 36 }}
          >
            <Ionicons name="calendar-outline" size={20} color={theme.colors.textSecondary} />
            <Text tabular numberOfLines={1} style={{ flex: 1, fontSize: 16, fontWeight: '600' }}>
              {periodText}
            </Text>
            <View style={{ width: 1, height: 20, backgroundColor: theme.colors.separator }} />
            <Text style={{ fontSize: 15, color: period === 'custom' ? theme.colors.attentionMarker : theme.colors.textSecondary }}>
              {t('reports.screen.chooseRange')}
            </Text>
            <Ionicons name="chevron-down" size={16} color={theme.colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollableTabs tabs={SECTIONS} activeKey={section} onChange={(k) => jumpTo(k as SectionKey)} />

        <View onLayout={(e) => onSectionLayout('ozet', e)} style={{ gap: theme.spacing.sm }}>
          {loading ? (
            <Skeleton height={320} borderRadius={theme.radius.widget} />
          ) : (
            <>
              {summaryText ? (
                <FadeIn>
                  <SmartSummary text={summaryText} onPress={() => router.push('/insights')} />
                </FadeIn>
              ) : null}
              <FadeIn delay={70}>
                <NetCard net={net} onPress={monthlyComparisonQuery.data ? () => setDetail('aylar') : undefined} />
              </FadeIn>
              <KpiList
                items={[
                  {
                    key: 'gelir',
                    label: t('common.income'),
                    value: formatMinorAmount(income),
                    valueColor: incomeColor,
                    icon: 'arrow-up',
                    iconColor: incomeColor,
                    caption: changeCaption(income, prev ? prev.incomeMinor : null),
                  },
                  {
                    key: 'gider',
                    label: t('common.expense'),
                    value: expense > 0 ? `−${formatMinorAmount(expense)}` : formatMinorAmount(expense),
                    valueColor: theme.colors.danger,
                    icon: 'arrow-down',
                    iconColor: theme.colors.danger,
                    caption: changeCaption(expense, prev ? prev.expenseMinor : null),
                  },
                  {
                    key: 'tasarruf',
                    label: t('reports.screen.savingsRate'),
                    value: savingsRate === null ? '—' : formatPercent(savingsRate),
                    icon: 'pie-chart-outline',
                    iconColor: theme.colors.textSecondary,
                    caption:
                      savingsRate === null
                        ? t('reports.screen.savingsHint')
                        : changeCaption(savingsRate, prevSavingsRate, 'puan'),
                  },
                ]}
              />
              {monthlyComparisonQuery.data ? (
                <ReportCard
                  title={t('reports.screen.last6Months')}
                  right={
                    <ChartLegend
                      items={[
                        { label: t('common.expense'), color: expenseColor },
                        { label: t('common.income'), color: incomeColor },
                      ]}
                    />
                  }
                  onMore={() => setDetail('aylar')}
                  moreLabel={t('reports.screen.openMonthly')}
                >
                  <MonthBars data={monthlyComparisonQuery.data} expenseColor={expenseColor} incomeColor={incomeColor} />
                </ReportCard>
              ) : null}
            </>
          )}
        </View>

        <View onLayout={(e) => onSectionLayout('kategoriler', e)}>
          <ReportCard
            title={t('reports.screen.categories')}
            right={
              <View style={{ width: 128 }}>
                <SegmentedControl
                  size="compact"
                  options={[
                    { key: 'expense', label: t('common.expense') },
                    { key: 'income', label: t('common.income') },
                  ]}
                  value={categoryDirection}
                  onChange={(k) => setCategoryDirection(k as CategoryDirection)}
                  stretch
                />
              </View>
            }
            onMore={categories.length > 0 ? () => setDetail('kategoriler') : undefined}
            moreLabel={t('reports.screen.openCategories')}
          >
            <CategoryRows
              items={categories}
              previous={prevCategoryMap}
              emptyLabel={t('reports.screen.noRecords')}
              goodWhenDown={categoryDirection === 'expense'}
              barColor={categoryDirection === 'expense' ? expenseColor : incomeColor}
              limit={CATEGORY_PREVIEW}
            />
          </ReportCard>
        </View>

        <View onLayout={(e) => onSectionLayout('borc', e)}>
          <ReportCard title={t('reports.screen.debt')} onMore={() => router.push('/obligations')} moreLabel={t('reports.screen.openDebt')}>
            <DebtRows
              payableMinor={payableTotalMinor}
              payableCount={payableObligations.length}
              receivableMinor={receivableTotalMinor}
              receivableCount={receivableObligations.length}
              overdueMinor={overdueMinor}
              overdueCount={overdueItems.length}
              onPress={(key) => router.push(key === 'overdue' ? '/obligations?status=overdue' : '/obligations')}
            />
          </ReportCard>
        </View>

        <View onLayout={(e) => onSectionLayout('kurlar', e)}>
          <ReportCard title={t('reports.screen.rates')} onMore={() => setDetail('kurlar')} moreLabel={t('reports.screen.openRates')}>
            <RateRows rates={ratesWithData} ageText={rateAgeText} limit={3} />
          </ReportCard>
        </View>

        <View onLayout={(e) => onSectionLayout('diger', e)} style={{ marginTop: theme.spacing.xs }}>
          <GroupedSection title={t('reports.screen.otherReports')}>
            <GroupedRow
              leading={<GroupedRowIcon name="people" />}
              title={t('reports.screen.counterparties')}
              value={counterpartyCount > 0 ? t('reports.screen.peopleCount', { count: counterpartyCount }) : undefined}
              onPress={() => setDetail('kisiler')}
            />
            <GroupedRow
              leading={<GroupedRowIcon name="trending-up" tone="success" />}
              title={t('reports.screen.cashFlow')}
              subtitle={t('reports.screen.next30Days')}
              trailing={
                cashFlowQuery.data ? (
                  <Text tabular style={{ fontSize: 15, color: cashFlowNet >= 0 ? theme.colors.receivable : theme.colors.danger }}>
                    {cashFlowNet >= 0 ? '+' : '−'}
                    {formatMinorAmount(Math.abs(cashFlowNet)).replace(zeroFractionPattern(), '')}
                  </Text>
                ) : undefined
              }
              onPress={() => setDetail('nakit')}
            />
            <GroupedRow
              leading={<GroupedRowIcon name="wallet" tone="violet" />}
              title={t('reports.screen.balances')}
              value={accountCount > 0 ? t('reports.screen.accountCount', { count: accountCount }) : undefined}
              onPress={() => setDetail('hesaplar')}
            />
          </GroupedSection>
        </View>
      </ScrollView>

      <BottomSheet visible={!!detail} onClose={() => setDetail(null)} title={detail ? t(DETAIL_TITLE_KEY[detail]) : undefined}>
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: theme.spacing.sm }}>
          {detail === 'aylar' ? <MonthTable data={monthlyComparisonQuery.data ?? []} /> : null}
          {detail === 'kategoriler' ? (
            <>
              <Text variant="caption" color="textSecondary" style={{ marginBottom: 6 }}>
                {t(categoryDirection === 'expense' ? 'reports.screen.expenseCategories' : 'reports.screen.incomeCategories', { period: periodText })}
              </Text>
              <CategoryRows
                items={categories}
                previous={prevCategoryMap}
                emptyLabel={t('reports.screen.noRecords')}
                goodWhenDown={categoryDirection === 'expense'}
                barColor={categoryDirection === 'expense' ? expenseColor : incomeColor}
                limit={categories.length}
              />
            </>
          ) : null}
          {detail === 'kisiler' ? (
            <>
              <Text variant="caption" color="textSecondary" style={{ marginBottom: 6 }}>
                {t('reports.screen.mostActive', { period: periodText })}
              </Text>
              <CounterpartyRows items={counterpartyQuery.data ?? []} />
            </>
          ) : null}
          {detail === 'nakit' ? <CashFlowRows buckets={cashFlowQuery.data ?? []} /> : null}
          {detail === 'hesaplar' ? <AccountRows items={accountBalancesQuery.data ?? []} /> : null}
          {detail === 'kurlar' ? <RateRows rates={ratesWithData} ageText={rateAgeText} /> : null}
        </ScrollView>
      </BottomSheet>

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

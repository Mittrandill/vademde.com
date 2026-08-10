import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Card, Divider, Pressable, ProgressRing, Row, SegmentedControl, Stack, Text } from '@/components/primitives';
import { Amount, type AmountDirection } from '@/components/finance/Amount';
import { CalendarMonthGrid } from '@/components/finance/CalendarMonthGrid';
import { CalendarAgendaList } from '@/components/finance/CalendarAgendaList';
import { CalendarObligationRow } from '@/components/finance/CalendarObligationRow';
import {
  listObligations,
  listInstallmentsDue,
  ACTIVE_OBLIGATION_STATUSES,
  type ObligationDueItem,
} from '@/features/obligations/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { addMonths, getMonthGridWeeks, isSameMonth, toDateKey } from '@/utils/calendar';

type ViewMode = 'month' | 'liste';

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: 'month', label: 'Ay' },
  { key: 'liste', label: 'Liste' },
];

const dayTitleFormatter = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
const monthLabelFormatter = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' });

export default function TakvimScreen() {
  const theme = useTheme();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const today = useMemo(() => new Date(), []);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [monthDate, setMonthDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);

  const weeks = useMemo(() => getMonthGridWeeks(monthDate), [monthDate]);
  const gridStart = weeks[0][0];
  const gridEnd = weeks[weeks.length - 1][6];
  const rangeKey = `${toDateKey(gridStart)}_${toDateKey(gridEnd)}`;

  const obligationsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.calendarObligations(activeWorkspaceId, rangeKey) : ['calendar', 'disabled'],
    queryFn: () =>
      listObligations({
        workspaceId: activeWorkspaceId as string,
        statuses: ACTIVE_OBLIGATION_STATUSES,
        dueFrom: toDateKey(gridStart),
        dueTo: toDateKey(gridEnd),
        pageSize: 200,
      }),
    enabled: !!activeWorkspaceId,
  });

  // Taksitli kredi/borçlarda her taksit kendi vadesinde ayrı gösterilir (bkz.
  // listInstallmentsDue) — bu obligation'ların tekil listObligations satırı (ilk
  // taksidin vadesi) aşağıda dışlanır, aksi halde ilk taksit iki kez görünür.
  const installmentsQuery = useQuery({
    queryKey: activeWorkspaceId
      ? [activeWorkspaceId, 'obligations', 'calendar-installments', rangeKey]
      : ['calendar-installments', 'disabled'],
    queryFn: () =>
      listInstallmentsDue({
        workspaceId: activeWorkspaceId as string,
        statuses: ACTIVE_OBLIGATION_STATUSES,
        dueFrom: toDateKey(gridStart),
        dueTo: toDateKey(gridEnd),
        pageSize: 500,
      }),
    enabled: !!activeWorkspaceId,
  });

  const obligations = useMemo<ObligationDueItem[]>(() => {
    const installmentItems = installmentsQuery.data ?? [];
    const obligationIdsWithInstallments = new Set(installmentItems.map((i) => i.id));
    const plainObligations = (obligationsQuery.data ?? []).filter((o) => !obligationIdsWithInstallments.has(o.id));
    return [...plainObligations, ...installmentItems];
  }, [obligationsQuery.data, installmentsQuery.data]);

  const obligationsByDay = useMemo(() => {
    const map = new Map<string, typeof obligations>();
    for (const obligation of obligations) {
      if (!obligation.due_date) continue;
      const key = toDateKey(new Date(obligation.due_date));
      const existing = map.get(key);
      if (existing) existing.push(obligation);
      else map.set(key, [obligation]);
    }
    return map;
  }, [obligations]);

  const selectedDayItems = obligationsByDay.get(toDateKey(selectedDate)) ?? [];
  const payableTotal = selectedDayItems
    .filter((o) => o.direction === 'payable')
    .reduce((sum, o) => sum + o.remaining_amount_minor, 0);
  const receivableTotal = selectedDayItems
    .filter((o) => o.direction === 'receivable')
    .reduce((sum, o) => sum + o.remaining_amount_minor, 0);
  const netTotal = receivableTotal - payableTotal;

  function handleSelectDate(day: Date) {
    setSelectedDate(day);
    if (!isSameMonth(day, monthDate)) {
      setMonthDate(new Date(day.getFullYear(), day.getMonth(), 1));
    }
  }

  function handlePrevMonth() {
    const next = addMonths(monthDate, -1);
    setMonthDate(next);
    setSelectedDate(next);
  }

  function handleNextMonth() {
    const next = addMonths(monthDate, 1);
    setMonthDate(next);
    setSelectedDate(next);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          // Kayan tab bar'ın altında kalmasın diye normalden fazla alt boşluk
          // (bkz. TabBar.tsx: mutlak konumlu, ~64+inset yükseklik).
          paddingBottom: theme.layout.tabBarClearance,
          gap: theme.spacing.lg,
        }}
      >
        <Row align="center">
          <Text variant="pageTitle" style={{ flex: 1 }}>
            Takvim
          </Text>
        </Row>

        <SegmentedControl options={VIEW_MODES} value={viewMode} onChange={setViewMode} />

        {obligationsQuery.error || installmentsQuery.error ? (
          <Text variant="body" color="danger">
            {(obligationsQuery.error ?? installmentsQuery.error) instanceof Error
              ? ((obligationsQuery.error ?? installmentsQuery.error) as Error).message
              : 'Takvim yüklenemedi'}
          </Text>
        ) : null}

        {viewMode === 'month' ? (
          <>
            <CalendarMonthGrid
              monthDate={monthDate}
              obligationsByDay={obligationsByDay}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              onPrevMonth={handlePrevMonth}
              onNextMonth={handleNextMonth}
            />

            <Stack gap="sm">
              <Text variant="sectionTitle">{dayTitleFormatter.format(selectedDate)}</Text>

              <DaySummaryCard payableMinor={payableTotal} receivableMinor={receivableTotal} netMinor={netTotal} />

              {selectedDayItems.length === 0 ? (
                <Card>
                  <Text variant="body" color="textSecondary">
                    Bu tarihte vadesi gelen kayıt yok.
                  </Text>
                </Card>
              ) : (
                <Stack gap="xs">
                  {selectedDayItems.map((obligation) => (
                    <CalendarObligationRow
                      key={obligation.id}
                      workspaceId={activeWorkspaceId as string}
                      obligation={obligation}
                    />
                  ))}
                </Stack>
              )}
            </Stack>
          </>
        ) : (
          <>
            {/* Ay grid'indeki üst gezinme başlığıyla aynı dil: dairesel ikon
                butonları + Card yüzeyi (bkz. CalendarMonthGrid.tsx). Eskiden burada
                çıplak metin linkleri vardı — tema token'larından kopuk, tasarım
                sisteminin geri kalanıyla uyuşmuyordu. */}
            <Card>
              <Row align="center">
                <Pressable
                  onPress={handlePrevMonth}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Önceki ay"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: theme.radius.input,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.colors.surfaceElevated,
                  }}
                >
                  <Ionicons name="chevron-back" size={18} color={theme.colors.textPrimary} />
                </Pressable>
                <Text variant="sectionTitle" style={{ flex: 1, textAlign: 'center' }}>
                  {monthLabelFormatter.format(monthDate)}
                </Text>
                <Pressable
                  onPress={handleNextMonth}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Sonraki ay"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: theme.radius.input,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.colors.surfaceElevated,
                  }}
                >
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textPrimary} />
                </Pressable>
              </Row>
            </Card>
            <CalendarAgendaList workspaceId={activeWorkspaceId as string} obligations={obligations} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const DAY_SUMMARY_RING_SIZE = 52;
const DAY_SUMMARY_RING_STROKE = 6;

interface DaySummaryCardProps {
  payableMinor: number;
  receivableMinor: number;
  netMinor: number;
}

// components/finance/IncomeExpenseAnalysis.tsx'teki halka+ikon+tutar üçlüsüyle aynı görsel
// dil (docs/08-tasarim-sistemi.md — tek bir düz metin satırı yerine, uygulama genelinde
// zaten kurulu olan bu desen tekrar kullanılır). Borç kırmızı değildir — kırmızı yalnızca
// gecikme anlamı taşır (bkz. ObligationSummaryCard'daki aynı not); bu yüzden ÖDENECEK nötr,
// TAHSİL EDİLECEK yeşil renktedir.
function DaySummaryCard({ payableMinor, receivableMinor, netMinor }: DaySummaryCardProps) {
  const theme = useTheme();
  const volume = payableMinor + receivableMinor;
  const share = (value: number) => (volume > 0 ? Math.abs(value) / volume : 0);

  return (
    <Card>
      <Row align="stretch">
        <DayMetricColumn
          label="ÖDENECEK"
          amountMinor={payableMinor}
          direction="payable"
          progress={share(payableMinor)}
          color={theme.colors.textSecondary}
          icon="arrow-down-circle"
        />
        <Divider orientation="vertical" style={{ marginHorizontal: theme.spacing.xs }} />
        <DayMetricColumn
          label="TAHSİL EDİLECEK"
          amountMinor={receivableMinor}
          direction="receivable"
          progress={share(receivableMinor)}
          color={theme.colors.success}
          icon="arrow-up-circle"
        />
        <Divider orientation="vertical" style={{ marginHorizontal: theme.spacing.xs }} />
        <DayMetricColumn
          label="NET"
          amountMinor={Math.abs(netMinor)}
          direction={netMinor >= 0 ? 'receivable' : 'payable'}
          progress={share(netMinor)}
          color={netMinor >= 0 ? theme.colors.success : theme.colors.textSecondary}
          icon={netMinor >= 0 ? 'trending-up' : 'trending-down'}
        />
      </Row>
    </Card>
  );
}

interface DayMetricColumnProps {
  label: string;
  amountMinor: number;
  direction: AmountDirection;
  progress: number;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}

function DayMetricColumn({ label, amountMinor, direction, progress, color, icon }: DayMetricColumnProps) {
  const theme = useTheme();
  // "TAHSİL EDİLECEK" iki satıra sarıyor, "ÖDENECEK"/"NET" tek satır kalıyor — sabit
  // yükseklikli (2 satırlık) bir kutuya ortalanmadan halkalar sütunlar arasında kayıyordu.
  const labelHeight = (theme.typography.caption.lineHeight ?? 18) * 2;

  return (
    <Stack gap="xs" align="center" style={{ flex: 1 }}>
      <View style={{ height: labelHeight, justifyContent: 'center' }}>
        <Text variant="caption" color="textSecondary" numberOfLines={2} style={{ textAlign: 'center' }}>
          {label}
        </Text>
      </View>
      <ProgressRing
        size={DAY_SUMMARY_RING_SIZE}
        strokeWidth={DAY_SUMMARY_RING_STROKE}
        progress={progress}
        color={color}
        trackColor={withAlpha(color, 0.18)}
        cap
      >
        <Ionicons name={icon} size={18} color={color} />
      </ProgressRing>
      <Amount
        amountMinor={amountMinor}
        direction={direction}
        variant="cardTitle"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={{ alignSelf: 'stretch', textAlign: 'center' }}
      />
    </Stack>
  );
}

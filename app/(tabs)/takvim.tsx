import { useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Card, Pressable, Row, SegmentedControl, Stack, Text } from '@/components/primitives';
import { Amount } from '@/components/finance/Amount';
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
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'calendar-installments', rangeKey] : ['calendar-installments', 'disabled'],
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
          paddingBottom: theme.spacing.huge,
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

              <Card>
                <Row>
                  <Stack gap="xxs" style={{ flex: 1 }}>
                    <Text variant="caption" color="textSecondary">
                      ÖDENECEK
                    </Text>
                    <Amount amountMinor={payableTotal} direction="payable" variant="cardTitle" />
                  </Stack>
                  <Stack gap="xxs" style={{ flex: 1 }}>
                    <Text variant="caption" color="textSecondary">
                      TAHSİL EDİLECEK
                    </Text>
                    <Amount amountMinor={receivableTotal} direction="receivable" variant="cardTitle" />
                  </Stack>
                  <Stack gap="xxs" style={{ flex: 1 }}>
                    <Text variant="caption" color="textSecondary">
                      NET
                    </Text>
                    <Amount
                      amountMinor={Math.abs(netTotal)}
                      direction={netTotal >= 0 ? 'receivable' : 'payable'}
                      variant="cardTitle"
                    />
                  </Stack>
                </Row>
              </Card>

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
            <Row align="center">
              <Pressable onPress={handlePrevMonth} hitSlop={12}>
                <Text variant="body" color="textSecondary">
                  ‹ Önceki Ay
                </Text>
              </Pressable>
              <Text variant="sectionTitle" style={{ flex: 1, textAlign: 'center' }}>
                {monthLabelFormatter.format(monthDate)}
              </Text>
              <Pressable onPress={handleNextMonth} hitSlop={12}>
                <Text variant="body" color="textSecondary">
                  Sonraki Ay ›
                </Text>
              </Pressable>
            </Row>
            <CalendarAgendaList workspaceId={activeWorkspaceId as string} obligations={obligations} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

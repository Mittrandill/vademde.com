import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Card, Divider, Pressable, Row, Stack, Text } from '@/components/primitives';
import { getMonthGridWeeks, isSameDay, isSameMonth, toDateKey } from '@/utils/calendar';
import type { ObligationDueItem } from '@/features/obligations/api';

export interface CalendarMonthGridProps {
  monthDate: Date;
  obligationsByDay: Map<string, ObligationDueItem[]>;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

const WEEKDAY_LABELS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];
const monthLabelFormatter = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' });
const STRONG_DOCUMENT_TYPES = new Set(['cek', 'senet']);
// Seçili gün sarı dolu; sarı (kredi) noktası da kaybolmasın diye noktalar ince koyu halkayla çizilir.
const selectedDotRing = { borderWidth: 1, borderColor: 'rgba(0,0,0,0.55)' } as const;
const LOAN_DOCUMENT_TYPES = new Set(['kredi']);

export function CalendarMonthGrid({
  monthDate,
  obligationsByDay,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
}: CalendarMonthGridProps) {
  const theme = useTheme();
  const weeks = getMonthGridWeeks(monthDate);
  const today = new Date();

  return (
    <Card>
      <Stack gap="md">
        <Row align="center">
          <Pressable
            onPress={onPrevMonth}
            hitSlop={12}
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
            onPress={onNextMonth}
            hitSlop={12}
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

        <Row>
          {WEEKDAY_LABELS.map((label) => (
            <Text
              key={label}
              variant="caption"
              color="textSecondary"
              style={{ flex: 1, textAlign: 'center', fontWeight: '600' }}
            >
              {label}
            </Text>
          ))}
        </Row>

        <Divider />

        <Stack gap="xs">
          {weeks.map((week, weekIndex) => (
            <Row key={weekIndex} gap="xs">
              {week.map((day) => {
                const dateKey = toDateKey(day);
                const items = obligationsByDay.get(dateKey) ?? [];
                const hasPayable = items.some((o) => o.direction === 'payable');
                const hasReceivable = items.some((o) => o.direction === 'receivable');
                const hasStrong = items.some((o) => STRONG_DOCUMENT_TYPES.has(o.document_type));
                const hasLoan = items.some((o) => LOAN_DOCUMENT_TYPES.has(o.document_type));
                const inCurrentMonth = isSameMonth(day, monthDate);
                const isSelected = isSameDay(day, selectedDate);
                const isToday = isSameDay(day, today);

                return (
                  <Pressable key={dateKey} onPress={() => onSelectDate(day)} style={{ flex: 1, aspectRatio: 1 }}>
                    <View
                      style={{
                        flex: 1,
                        borderRadius: theme.radius.input,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isSelected ? theme.colors.brandPrimary : 'transparent',
                      }}
                    >
                      <Text
                        variant="body"
                        style={{
                          color: isSelected
                            ? theme.colors.brandPrimaryText
                            : isToday
                              ? theme.colors.brandPrimary
                              : inCurrentMonth
                                ? theme.colors.textPrimary
                                : theme.colors.textSecondary,
                          fontWeight: isToday || isSelected ? '700' : '400',
                          opacity: inCurrentMonth ? 1 : 0.35,
                        }}
                      >
                        {day.getDate()}
                      </Text>
                      {hasPayable || hasReceivable || hasStrong || hasLoan ? (
                        <Row gap="xxs" style={{ marginTop: 3 }}>
                          {hasPayable ? (
                            <View
                              style={{
                                width: 5,
                                height: 5,
                                borderRadius: 3,
                                backgroundColor: theme.colors.danger,
                                ...(isSelected ? selectedDotRing : null),
                              }}
                            />
                          ) : null}
                          {hasReceivable ? (
                            <View
                              style={{
                                width: 5,
                                height: 5,
                                borderRadius: 3,
                                backgroundColor: theme.colors.success,
                                ...(isSelected ? selectedDotRing : null),
                              }}
                            />
                          ) : null}
                          {hasStrong ? (
                            <View
                              style={{
                                width: 5,
                                height: 5,
                                borderRadius: 3,
                                backgroundColor: theme.colors.accentViolet,
                                ...(isSelected ? selectedDotRing : null),
                              }}
                            />
                          ) : null}
                          {hasLoan ? (
                            <View
                              style={{
                                width: 5,
                                height: 5,
                                borderRadius: 3,
                                backgroundColor: theme.colors.attentionMarker,
                                ...(isSelected ? selectedDotRing : null),
                              }}
                            />
                          ) : null}
                        </Row>
                      ) : (
                        <View style={{ height: 5, marginTop: 3 }} />
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </Row>
          ))}
        </Stack>

        <Divider />

        <Row align="center" style={{ justifyContent: 'space-between' }}>
          {[
            { label: 'Ödenecek', color: theme.colors.danger },
            { label: 'Tahsil Edilecek', color: theme.colors.success },
            { label: 'Çek / Senet', color: theme.colors.accentViolet },
            { label: 'Kredi', color: theme.colors.attentionMarker },
          ].map((item) => (
            <Row key={item.label} gap="xxs" align="center">
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: item.color }} />
              <Text color="textSecondary" numberOfLines={1} style={{ fontSize: 11 }}>
                {item.label}
              </Text>
            </Row>
          ))}
        </Row>
      </Stack>
    </Card>
  );
}

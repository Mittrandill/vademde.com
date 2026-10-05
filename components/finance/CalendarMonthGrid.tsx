import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Pressable, Row, Stack, Text } from '@/components/primitives';
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
    <View>
      <Stack gap="md">
        <Row align="center">
          <Pressable
            onPress={onPrevMonth}
            hitSlop={12}
            style={{
              width: theme.touchTarget.minimum,
              height: theme.touchTarget.minimum,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.surfacePrimary,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Ionicons name="chevron-back" size={18} color={theme.colors.textPrimary} />
          </Pressable>
          <Text variant="cardTitle" style={{ flex: 1, textAlign: 'center', fontSize: 17 }}>
            {monthLabelFormatter.format(monthDate)}
          </Text>
          <Pressable
            onPress={onNextMonth}
            hitSlop={12}
            style={{
              width: theme.touchTarget.minimum,
              height: theme.touchTarget.minimum,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.surfacePrimary,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textPrimary} />
          </Pressable>
        </Row>

        <Row>
          {WEEKDAY_LABELS.map((label) => (
            <Text key={label} variant="label" color="textSecondary" style={{ flex: 1, textAlign: 'center' }}>
              {label}
            </Text>
          ))}
        </Row>

        <Stack gap="xs">
          {weeks.map((week, weekIndex) => (
            <Row key={weekIndex} gap="xs">
              {week.map((day) => {
                const dateKey = toDateKey(day);
                const items = obligationsByDay.get(dateKey) ?? [];
                const hasPayable = items.some((o) => o.direction === 'payable');
                const hasReceivable = items.some((o) => o.direction === 'receivable');
                const hasStrong = items.some((o) => STRONG_DOCUMENT_TYPES.has(o.document_type));
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
                        backgroundColor: isSelected ? theme.colors.action : 'transparent',
                        borderWidth: hasStrong || (isToday && !isSelected) ? 1.5 : 0,
                        borderColor: hasStrong ? theme.colors.mutedControl : theme.colors.textPrimary,
                      }}
                    >
                      <Text
                        variant="body"
                        tabular
                        style={{
                          color: isSelected
                            ? theme.colors.onAction
                            : inCurrentMonth
                                ? theme.colors.textPrimary
                                : theme.colors.textSecondary,
                          fontWeight: isToday || isSelected ? '700' : '400',
                          opacity: inCurrentMonth ? 1 : 0.35,
                        }}
                      >
                        {day.getDate()}
                      </Text>
                      {hasPayable || hasReceivable ? (
                        <Row gap="xxs" style={{ marginTop: 3 }}>
                          {hasPayable ? (
                            <View
                              style={{
                                width: 5,
                                height: 5,
                                borderRadius: 3,
                                backgroundColor: isSelected ? theme.colors.onAction : theme.colors.payable,
                              }}
                            />
                          ) : null}
                          {hasReceivable ? (
                            <View
                              style={{
                                width: 5,
                                height: 5,
                                borderRadius: 3,
                                backgroundColor: isSelected ? theme.colors.onAction : theme.colors.receivable,
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

        <Row gap="md" align="center">
          <Row gap="xxs" align="center">
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.payable }} />
            <Text variant="caption" color="textSecondary">
              Ödenecek
            </Text>
          </Row>
          <Row gap="xxs" align="center">
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.receivable }} />
            <Text variant="caption" color="textSecondary">
              Tahsil Edilecek
            </Text>
          </Row>
          <Row gap="xxs" align="center">
            <View
              style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: theme.colors.mutedControl }}
            />
            <Text variant="caption" color="textSecondary">
              Çek / Senet
            </Text>
          </Row>
        </Row>
      </Stack>
    </View>
  );
}

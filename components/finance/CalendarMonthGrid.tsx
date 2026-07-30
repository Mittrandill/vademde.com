import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Pressable, Row, Stack, Text } from '@/components/primitives';
import { getMonthGridWeeks, isSameDay, isSameMonth, toDateKey } from '@/utils/calendar';
import type { ObligationWithRelations } from '@/features/obligations/api';

export interface CalendarMonthGridProps {
  monthDate: Date;
  obligationsByDay: Map<string, ObligationWithRelations[]>;
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
    <Stack gap="sm">
      <Row align="center">
        <Pressable onPress={onPrevMonth} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.textPrimary} />
        </Pressable>
        <Text variant="sectionTitle" style={{ flex: 1, textAlign: 'center' }}>
          {monthLabelFormatter.format(monthDate)}
        </Text>
        <Pressable onPress={onNextMonth} hitSlop={12}>
          <Ionicons name="chevron-forward" size={22} color={theme.colors.textPrimary} />
        </Pressable>
      </Row>

      <Row>
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} variant="caption" color="textSecondary" style={{ flex: 1, textAlign: 'center' }}>
            {label}
          </Text>
        ))}
      </Row>

      <Stack gap="xxs">
        {weeks.map((week, weekIndex) => (
          <Row key={weekIndex} gap="xxs">
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
                <Pressable
                  key={dateKey}
                  onPress={() => onSelectDate(day)}
                  style={{ flex: 1, aspectRatio: 1 }}
                >
                  <View
                    style={{
                      flex: 1,
                      borderRadius: theme.radius.input,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isSelected ? theme.colors.brandPrimary : 'transparent',
                      borderWidth: hasStrong ? 2 : isToday ? 1 : 0,
                      borderColor: hasStrong
                        ? theme.colors.accentViolet
                        : isToday
                          ? theme.colors.textSecondary
                          : 'transparent',
                    }}
                  >
                    <Text
                      variant="body"
                      style={{
                        color: isSelected
                          ? theme.colors.brandPrimaryText
                          : inCurrentMonth
                            ? theme.colors.textPrimary
                            : theme.colors.textSecondary,
                        opacity: inCurrentMonth ? 1 : 0.4,
                      }}
                    >
                      {day.getDate()}
                    </Text>
                    {hasPayable || hasReceivable ? (
                      <Row gap="xxs" style={{ marginTop: 2 }}>
                        {hasPayable ? (
                          <View
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: 3,
                              backgroundColor: isSelected ? theme.colors.brandPrimaryText : theme.colors.danger,
                            }}
                          />
                        ) : null}
                        {hasReceivable ? (
                          <View
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: 3,
                              backgroundColor: isSelected ? theme.colors.brandPrimaryText : theme.colors.success,
                            }}
                          />
                        ) : null}
                      </Row>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </Row>
        ))}
      </Stack>
    </Stack>
  );
}

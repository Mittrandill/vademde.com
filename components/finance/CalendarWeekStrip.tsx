import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Card, Pressable, Row, Stack, Text } from '@/components/primitives';
import { isSameDay, toDateKey } from '@/utils/calendar';
import type { ObligationDueItem } from '@/features/obligations/api';

export interface CalendarWeekStripProps {
  weekDays: Date[];
  obligationsByDay: Map<string, ObligationDueItem[]>;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
}

const WEEKDAY_LABELS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];
// docs/03-bilgi-mimarisi-ekranlar.md §5.9 — "Çek ve senet vadeleri ... güçlü biçimde
// öne çıkarılır"; CalendarMonthGrid'deki aynı vurgu kuralı (kalın çerçeve) burada da
// kullanılır ki iki görünüm arasında tutarlı bir görsel dil korunsun.
const STRONG_DOCUMENT_TYPES = new Set(['cek', 'senet']);
const weekRangeFormatter = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });
const weekRangeFormatterWithYear = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

export function CalendarWeekStrip({
  weekDays,
  obligationsByDay,
  selectedDate,
  onSelectDate,
  onPrevWeek,
  onNextWeek,
}: CalendarWeekStripProps) {
  const theme = useTheme();
  const today = new Date();
  const rangeStart = weekDays[0];
  const rangeEnd = weekDays[weekDays.length - 1];
  const sameYear = rangeStart.getFullYear() === rangeEnd.getFullYear();
  const rangeLabel = `${weekRangeFormatter.format(rangeStart)} – ${
    sameYear ? weekRangeFormatter.format(rangeEnd) : weekRangeFormatterWithYear.format(rangeEnd)
  }${sameYear ? `, ${rangeEnd.getFullYear()}` : ''}`;

  return (
    <Card>
      <Stack gap="md">
        <Row align="center">
          <Pressable
            onPress={onPrevWeek}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Önceki hafta"
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
          <Text variant="sectionTitle" style={{ flex: 1, textAlign: 'center' }} numberOfLines={1}>
            {rangeLabel}
          </Text>
          <Pressable
            onPress={onNextWeek}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Sonraki hafta"
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

        <Row gap="xs">
          {weekDays.map((day, index) => {
            const dateKey = toDateKey(day);
            const items = obligationsByDay.get(dateKey) ?? [];
            const hasPayable = items.some((o) => o.direction === 'payable');
            const hasReceivable = items.some((o) => o.direction === 'receivable');
            const hasStrong = items.some((o) => STRONG_DOCUMENT_TYPES.has(o.document_type));
            const isSelected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, today);

            return (
              <Pressable key={dateKey} onPress={() => onSelectDate(day)} style={{ flex: 1 }}>
                <Stack gap="xxs" align="center">
                  <Text variant="caption" color="textSecondary">
                    {WEEKDAY_LABELS[index]}
                  </Text>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: theme.radius.input,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isSelected ? theme.colors.brandPrimary : 'transparent',
                      borderWidth: hasStrong ? 2 : 0,
                      borderColor: theme.colors.accentViolet,
                    }}
                  >
                    <Text
                      variant="body"
                      style={{
                        color: isSelected
                          ? theme.colors.brandPrimaryText
                          : isToday
                            ? theme.colors.brandPrimary
                            : theme.colors.textPrimary,
                        fontWeight: isToday || isSelected ? '700' : '400',
                      }}
                    >
                      {day.getDate()}
                    </Text>
                  </View>
                  {hasPayable || hasReceivable ? (
                    <Row gap="xxs">
                      {hasPayable ? (
                        <View
                          style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.danger }}
                        />
                      ) : null}
                      {hasReceivable ? (
                        <View
                          style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.success }}
                        />
                      ) : null}
                    </Row>
                  ) : (
                    <View style={{ height: 5 }} />
                  )}
                </Stack>
              </Pressable>
            );
          })}
        </Row>
      </Stack>
    </Card>
  );
}

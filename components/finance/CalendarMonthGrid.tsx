import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Card, Divider, Pressable, Row, Stack, Text } from '@/components/primitives';
import { getMonthGridWeeks, isSameDay, isSameMonth, toDateKey } from '@/utils/calendar';
import type { ObligationDueItem } from '@/features/obligations/api';
import { localeDateFormatter } from '@/i18n/format';
import { t } from '@/i18n';
import { calendarMarkerColor, calendarMarkerKinds } from '@/utils/calendarMarker';

export interface CalendarMonthGridProps {
  monthDate: Date;
  obligationsByDay: Map<string, ObligationDueItem[]>;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

const monthLabelFormatter = localeDateFormatter({ month: 'long', year: 'numeric' });
// Seçili gün sarı dolu; sarı (kredi) noktası da kaybolmasın diye noktalar ince koyu halkayla çizilir.
const selectedDotRing = { borderWidth: 1, borderColor: 'rgba(0,0,0,0.55)' } as const;

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
          {t('ui.weekdaysShort').split(',').map((label) => (
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
                const markerKinds = calendarMarkerKinds(items);
                const markerColor = calendarMarkerColor(markerKinds, theme.colors);
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
                      {markerColor ? (
                        <View accessible accessibilityLabel={markerKinds.map((kind) => t(`calendar.legend${kind}`)).join(' · ')}
                          style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: markerColor, marginTop: 3, ...(isSelected ? selectedDotRing : null) }} />
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

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 8 }}>
          {[
            { label: t('calendar.legendPayable'), color: theme.colors.danger },
            { label: t('calendar.legendReceivable'), color: theme.colors.success },
            { label: t('calendar.legendInstruments'), color: theme.colors.accentViolet },
            { label: t('calendar.legendLoan'), color: theme.colors.attentionMarker },
            { label: t('calendar.legendCreditCard'), color: theme.colors.accentAqua },
          ].map((item) => (
            <Row key={item.label} gap="xxs" align="center">
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: item.color }} />
              <Text color="textSecondary" numberOfLines={1} style={{ fontSize: 11 }}>
                {item.label}
              </Text>
            </Row>
          ))}
        </View>
      </Stack>
    </Card>
  );
}

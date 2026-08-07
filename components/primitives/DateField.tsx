import { useMemo, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Pressable } from './Pressable';
import { Row, Stack } from './Stack';
import { Text } from './Text';
import { TextField } from './TextField';
import type { StyleProp, ViewStyle } from 'react-native';

export interface DateFieldProps {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
}

const WEEKDAY_LABELS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];
const MONTH_LABELS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(m) - 1 || date.getDate() !== Number(d)) {
    return null;
  }
  return date;
}

function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Pazartesi başlangıçlı 6x7 ay ızgarası; hücre boşlukları önceki/sonraki aya taşmaz (null).
function buildMonthGrid(cursor: Date): (Date | null)[][] {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const jsWeekday = firstOfMonth.getDay();
  const leadingEmpty = (jsWeekday + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [
    ...Array(leadingEmpty).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

// docs/08-tasarim-sistemi.md — hazır sistem tarih seçici yerine tema tokenlarına bağlı
// bir takvim modalı; alan yine de düz metin girişi kalır, kullanıcı elle de yazabilir.
export function DateField({ label, value, onChangeText, placeholder = 'YYYY-AA-GG', style }: DateFieldProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState<Date>(() => parseIsoDate(value) ?? new Date());

  const selected = useMemo(() => parseIsoDate(value), [value]);
  const today = useMemo(() => new Date(), []);
  const weeks = useMemo(() => buildMonthGrid(cursor), [cursor]);

  function openPicker() {
    setCursor(selected ?? new Date());
    setOpen(true);
  }

  function selectDay(date: Date) {
    onChangeText(formatIsoDate(date));
    setOpen(false);
  }

  return (
    <>
      <TextField
        label={label}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        rightIcon="calendar-outline"
        onRightIconPress={openPicker}
        style={style}
      />

      {/* Modal yalnızca açıkken mount edilir. `visible={false}` ile ağaçta bırakmak tek
          örnekte zararsız görünür ama bu alan listelerde tekrarlanıyor (ör. belge onay
          ekranındaki 36 taksitlik kredi tablosu = 36 DateField); iOS'ta her Modal ayrı bir
          UIViewController açtığından hepsi birden mount'luyken bellek şişip uygulama
          çöküyordu. Aynı düzeltme SearchablePicker'da da var. */}
      {open ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable
            accessibilityLabel="Kapat"
            onPress={() => setOpen(false)}
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay }]}
          />
          <View
            style={{
              backgroundColor: theme.colors.surfaceElevated,
              borderTopLeftRadius: theme.radius.heroWidget,
              borderTopRightRadius: theme.radius.heroWidget,
              padding: theme.screenEdge.standard,
              paddingBottom: insets.bottom + theme.spacing.lg,
              gap: theme.spacing.md,
            }}
          >
            <Row style={{ justifyContent: 'space-between' }} align="center">
              <Pressable
                accessibilityLabel="Önceki ay"
                onPress={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
                hitSlop={12}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.surfacePrimary,
                }}
              >
                <Ionicons name="chevron-back" size={20} color={theme.colors.textPrimary} />
              </Pressable>
              <Text variant="cardTitle">
                {MONTH_LABELS[cursor.getMonth()]} {cursor.getFullYear()}
              </Text>
              <Pressable
                accessibilityLabel="Sonraki ay"
                onPress={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
                hitSlop={12}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.surfacePrimary,
                }}
              >
                <Ionicons name="chevron-forward" size={20} color={theme.colors.textPrimary} />
              </Pressable>
            </Row>

            <Row gap="xxs">
              {WEEKDAY_LABELS.map((weekday) => (
                <View key={weekday} style={{ flex: 1, alignItems: 'center' }}>
                  <Text variant="caption" color="textSecondary">
                    {weekday}
                  </Text>
                </View>
              ))}
            </Row>

            <Stack gap="xxs">
              {weeks.map((week, weekIndex) => (
                <Row key={weekIndex} gap="xxs">
                  {week.map((date, dayIndex) => {
                    if (!date) return <View key={dayIndex} style={{ flex: 1, aspectRatio: 1 }} />;
                    const isSelected = selected ? isSameDay(date, selected) : false;
                    const isToday = isSameDay(date, today);
                    return (
                      <Pressable
                        key={dayIndex}
                        onPress={() => selectDay(date)}
                        style={{
                          flex: 1,
                          aspectRatio: 1,
                          borderRadius: theme.radius.input,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: isSelected ? theme.colors.brandPrimary : 'transparent',
                          borderWidth: isToday && !isSelected ? 1 : 0,
                          borderColor: theme.colors.brandPrimary,
                        }}
                      >
                        <Text
                          variant="body"
                          tabular
                          style={{ color: isSelected ? theme.colors.brandPrimaryText : theme.colors.textPrimary }}
                        >
                          {date.getDate()}
                        </Text>
                      </Pressable>
                    );
                  })}
                </Row>
              ))}
            </Stack>

            <Pressable
              onPress={() => selectDay(new Date())}
              style={{
                height: theme.controlHeight.segmented,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radius.widget,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text variant="body" style={{ color: theme.colors.brandPrimary }}>
                Bugün
              </Text>
            </Pressable>
          </View>
        </View>
        </Modal>
      ) : null}
    </>
  );
}

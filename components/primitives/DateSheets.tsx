import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { MONTH_NAMES, MonthStepper } from './MonthStepper';
import { Pressable } from './Pressable';
import { Text } from './Text';

// HANDOFF §3 — DatePickerSheet, DateRangeSheet, MonthYearSheet, DayOfMonthSheet.
// Tarihler yerel ISO (YYYY-MM-DD) metni; saat dilimi kayması olmasın diye Date yalnızca
// takvim hesabı için kullanılır. Vade noktaları `dueDates` ile payable renginde işaretlenir.

const WEEKDAYS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];

export function toIso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function todayIso(): string {
  const now = new Date();
  return toIso(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseIso(value: string | null | undefined): { year: number; month: number } | null {
  const m = value ? /^(\d{4})-(\d{2})-\d{2}$/.exec(value) : null;
  return m ? { year: Number(m[1]), month: Number(m[2]) - 1 } : null;
}

// Pazartesi başlangıçlı hücre listesi: baştaki boşluklar null.
function buildCells(year: number, month: number): (number | null)[] {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  return [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
}

interface MonthGridProps {
  year: number;
  month: number;
  onPickDay: (iso: string) => void;
  isSelected: (iso: string) => boolean;
  isInRange?: (iso: string) => boolean;
  dueDates?: readonly string[];
}

function MonthGrid({ year, month, onPickDay, isSelected, isInRange, dueDates }: MonthGridProps) {
  const theme = useTheme();
  const cells = useMemo(() => buildCells(year, month), [year, month]);
  const due = useMemo(() => new Set(dueDates ?? []), [dueDates]);
  const today = todayIso();

  return (
    <View>
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAYS.map((d) => (
          <Text key={d} variant="label" color="textSecondary" style={{ flex: 1, textAlign: 'center' }}>
            {d}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: theme.spacing.xxs }}>
        {cells.map((day, index) => {
          if (day === null) return <View key={`e${index}`} style={{ width: `${100 / 7}%`, height: 46 }} />;
          const iso = toIso(year, month, day);
          const selected = isSelected(iso);
          const inRange = !selected && !!isInRange?.(iso);
          return (
            <View key={iso} style={{ width: `${100 / 7}%`, height: 46, alignItems: 'center' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${day} ${MONTH_NAMES[month]} ${year}${due.has(iso) ? ', vade var' : ''}`}
                accessibilityState={{ selected }}
                onPress={() => onPickDay(iso)}
                style={{
                  width: theme.touchTarget.minimum,
                  height: 42,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected
                    ? theme.colors.action
                    : inRange
                      ? theme.colors.backgroundPrimary
                      : 'transparent',
                  borderWidth: iso === today && !selected ? 1 : 0,
                  borderColor: theme.colors.textPrimary,
                }}
              >
                <Text
                  variant="body"
                  tabular
                  style={{
                    color: selected ? theme.colors.onAction : theme.colors.textPrimary,
                    fontWeight: selected ? '700' : '500',
                  }}
                >
                  {day}
                </Text>
                {due.has(iso) ? (
                  <View
                    style={{
                      position: 'absolute',
                      bottom: 4,
                      width: 5,
                      height: 5,
                      borderRadius: 3,
                      backgroundColor: selected ? theme.colors.onAction : theme.colors.payable,
                    }}
                  />
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function useCursor(initialIso: string | null | undefined) {
  const start = parseIso(initialIso) ?? parseIso(todayIso())!;
  return useState(start);
}

export interface DatePickerSheetProps {
  visible: boolean;
  onClose: () => void;
  value: string | null;
  onChange: (iso: string) => void;
  title?: string;
  dueDates?: readonly string[];
}

export function DatePickerSheet({ visible, onClose, value, onChange, title = 'Tarih seç', dueDates }: DatePickerSheetProps) {
  const [cursor, setCursor] = useCursor(value);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <MonthStepper year={cursor.year} month={cursor.month} onChange={setCursor} />
      <View style={{ height: 8 }} />
      <MonthGrid
        year={cursor.year}
        month={cursor.month}
        dueDates={dueDates}
        isSelected={(iso) => iso === value}
        onPickDay={(iso) => {
          onChange(iso);
          onClose();
        }}
      />
    </BottomSheet>
  );
}

export interface DateRangeSheetProps {
  visible: boolean;
  onClose: () => void;
  start: string | null;
  end: string | null;
  onApply: (start: string, end: string) => void;
  title?: string;
}

// İki dokunuşla aralık: ilk dokunuş başlangıç, ikinci bitiş (ikinci tarih öndeyse yer değiştirir).
export function DateRangeSheet({ visible, onClose, start, end, onApply, title = 'Tarih aralığı' }: DateRangeSheetProps) {
  const [cursor, setCursor] = useCursor(start);
  const [draftStart, setDraftStart] = useState<string | null>(start);
  const [draftEnd, setDraftEnd] = useState<string | null>(end);

  const pick = (iso: string) => {
    if (!draftStart || draftEnd) {
      setDraftStart(iso);
      setDraftEnd(null);
    } else if (iso < draftStart) {
      setDraftEnd(draftStart);
      setDraftStart(iso);
    } else {
      setDraftEnd(iso);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <MonthStepper year={cursor.year} month={cursor.month} onChange={setCursor} />
      <View style={{ height: 8 }} />
      <MonthGrid
        year={cursor.year}
        month={cursor.month}
        isSelected={(iso) => iso === draftStart || iso === draftEnd}
        isInRange={(iso) => !!draftStart && !!draftEnd && iso > draftStart && iso < draftEnd}
        onPickDay={pick}
      />
      <View style={{ height: 12 }} />
      <Button
        label="Uygula"
        disabled={!draftStart}
        onPress={() => {
          if (!draftStart) return;
          onApply(draftStart, draftEnd ?? draftStart);
          onClose();
        }}
      />
    </BottomSheet>
  );
}

export interface MonthYearSheetProps {
  visible: boolean;
  onClose: () => void;
  year: number;
  month: number;
  onChange: (next: { year: number; month: number }) => void;
}

export function MonthYearSheet({ visible, onClose, year, month, onChange }: MonthYearSheetProps) {
  const theme = useTheme();
  const [shownYear, setShownYear] = useState(year);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Ay ve yıl">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {([-1, 1] as const).map((delta) => (
          <Pressable
            key={delta}
            accessibilityRole="button"
            accessibilityLabel={delta < 0 ? 'Önceki yıl' : 'Sonraki yıl'}
            onPress={() => setShownYear((y) => y + delta)}
            style={{
              width: theme.touchTarget.minimum,
              height: theme.touchTarget.minimum,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="cardTitle">{delta < 0 ? '‹' : '›'}</Text>
          </Pressable>
        ))}
        <Text variant="cardTitle" tabular pointerEvents="none" style={{ fontSize: 17, position: 'absolute', alignSelf: 'center', left: 0, right: 0, textAlign: 'center' }}>
          {shownYear}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: theme.spacing.sm }}>
        {MONTH_NAMES.map((name, index) => {
          const active = shownYear === year && index === month;
          return (
            <View key={name} style={{ width: '33.33%', padding: 4 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  onChange({ year: shownYear, month: index });
                  onClose();
                }}
                style={{
                  height: theme.touchTarget.minimum + 4,
                  borderRadius: theme.radius.input,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? theme.colors.action : theme.colors.backgroundPrimary,
                }}
              >
                <Text
                  variant="cardTitle"
                  style={{ color: active ? theme.colors.onAction : theme.colors.textPrimary }}
                >
                  {name}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </BottomSheet>
  );
}

export interface DayOfMonthSheetProps {
  visible: boolean;
  onClose: () => void;
  value: number | null;
  onChange: (day: number) => void;
  title?: string;
}

export function DayOfMonthSheet({ visible, onClose, value, onChange, title = 'Ayın günü' }: DayOfMonthSheetProps) {
  const theme = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
          const active = day === value;
          return (
            <View key={day} style={{ width: `${100 / 7}%`, padding: 2, alignItems: 'center' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Ayın ${day}. günü`}
                accessibilityState={{ selected: active }}
                onPress={() => {
                  onChange(day);
                  onClose();
                }}
                style={{
                  width: theme.touchTarget.minimum,
                  height: theme.touchTarget.minimum,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? theme.colors.action : 'transparent',
                }}
              >
                <Text
                  variant="body"
                  tabular
                  style={{ color: active ? theme.colors.onAction : theme.colors.textPrimary }}
                >
                  {day}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </BottomSheet>
  );
}

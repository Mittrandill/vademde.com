import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Pressable } from './Pressable';
import { Text } from './Text';

export const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

export interface MonthStepperProps {
  year: number;
  /** 0 tabanlı (Ocak = 0). */
  month: number;
  onChange: (next: { year: number; month: number }) => void;
  /** Ortadaki etikete dokunulunca (ör. MonthYearSheet açmak için). */
  onPressLabel?: () => void;
}

// HANDOFF §3 — ay atlama (Hareketler, Takvim): ‹ Ekim 2026 ›
export function MonthStepper({ year, month, onChange, onPressLabel }: MonthStepperProps) {
  const theme = useTheme();

  const shift = (delta: number) => {
    const index = year * 12 + month + delta;
    onChange({ year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 });
  };

  const button = (icon: 'chevron-back' | 'chevron-forward', label: string, delta: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => shift(delta)}
      style={{
        width: theme.touchTarget.minimum,
        height: theme.touchTarget.minimum,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfacePrimary,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icon} size={theme.iconSize.lg} color={theme.colors.textPrimary} />
    </Pressable>
  );

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      {button('chevron-back', 'Önceki ay', -1)}
      <Pressable
        accessibilityRole={onPressLabel ? 'button' : 'text'}
        onPress={onPressLabel}
        disabled={!onPressLabel}
        style={{ minHeight: theme.touchTarget.minimum, justifyContent: 'center' }}
      >
        <Text variant="cardTitle" style={{ fontSize: 17 }}>
          {MONTH_NAMES[month]} {year}
        </Text>
      </Pressable>
      {button('chevron-forward', 'Sonraki ay', 1)}
    </View>
  );
}

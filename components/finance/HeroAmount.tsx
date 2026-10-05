import { View } from 'react-native';

import { Text } from '@/components/primitives';
import type { ThemeColors } from '@/theme/colors';
import { formatMinorAmount } from '@/utils/money';

export interface HeroAmountProps {
  amountMinor: number;
  currencyCode?: string;
  /** Başlangıç punto (varsayılan 56; tasarım aralığı 52–60). */
  baseSize?: number;
  color?: keyof ThemeColors;
  /** Tutar gizleme açıkken rakamlar yerine nokta gösterilir ve ekran okuyucu tutarı okumaz. */
  hidden?: boolean;
}

// HANDOFF §2 — tam kısım 7 karakteri aşarsa font `base × 7 / uzunluk` oranında küçülür (tek satır).
const FULL_PART_LIMIT = 7;

// "₺99.521,05" → tam: "₺99.521", kuruş: ",05", sonek: "" (sonek yalnızca ISO kodlu yedek biçimde dolu).
function splitAmount(formatted: string) {
  const match = /^(.*?)(,\d{1,2})(\D*)$/.exec(formatted);
  return match
    ? { whole: match[1], fraction: match[2], suffix: match[3] }
    : { whole: formatted, fraction: '', suffix: '' };
}

export function HeroAmount({
  amountMinor,
  currencyCode = 'TRY',
  baseSize = 56,
  color = 'textPrimary',
  hidden,
}: HeroAmountProps) {
  const formatted = formatMinorAmount(amountMinor, currencyCode);
  const { whole, fraction, suffix } = splitAmount(formatted);

  const shown = hidden ? '••••••' : whole;
  const size = Math.floor(baseSize * Math.min(1, FULL_PART_LIMIT / Math.max(shown.length, 1)));

  return (
    <View
      accessible
      accessibilityLabel={hidden ? 'Tutar gizli' : formatted}
      style={{ flexDirection: 'row', alignItems: 'baseline' }}
    >
      <Text
        variant="displayBalance"
        color={color}
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ fontSize: size, lineHeight: Math.round(size * 1.05), flexShrink: 1 }}
      >
        {shown}
      </Text>
      {!hidden && fraction ? (
        <Text
          variant="displayBalance"
          color="textSecondary"
          style={{
            fontSize: Math.round(size / 2),
            lineHeight: Math.round(size * 0.55),
            fontWeight: '600',
          }}
        >
          {fraction}
          {suffix}
        </Text>
      ) : null}
    </View>
  );
}

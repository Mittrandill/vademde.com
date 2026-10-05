import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import type { ThemeColors } from '@/theme/colors';
import { Stack, Text } from '@/components/primitives';

export interface FinanceListHeroMetric {
  label: string;
  value: ReactNode;
  caption: string;
  valueColor?: keyof ThemeColors;
}

export interface FinanceListHeroProps {
  label: string;
  description: string;
  amountText: string;
  amountColor?: keyof ThemeColors;
  metrics: FinanceListHeroMetric[];
}

// HANDOFF §2 ölçek kuralı: tam kısım 7 karakteri aşarsa font küçülür (tek satır).
const BASE_SIZE = 52;
const FULL_PART_LIMIT = 7;

function splitAmountText(text: string) {
  const match = /^(.*?)(,\d{1,2})(\D*)$/.exec(text);
  return match ? { whole: match[1], fraction: match[2] + match[3] } : { whole: text, fraction: '' };
}

// Liste ekranları hero'su (design Krediler/VadeliKayitlar): kartsız etiket + büyük tutar +
// ince çizgiyle ayrılmış metrik satırı. Tüm finans liste ekranları bu bileşeni kullanır.
export function FinanceListHero({
  label,
  description,
  amountText,
  amountColor = 'textPrimary',
  metrics,
}: FinanceListHeroProps) {
  const theme = useTheme();
  const { whole, fraction } = splitAmountText(amountText);
  const size = Math.floor(BASE_SIZE * Math.min(1, FULL_PART_LIMIT / Math.max(whole.length, 1)));
  const shown = metrics.slice(0, 4);
  const columns = shown.length > 3 ? 2 : Math.max(shown.length, 1);

  return (
    <Stack gap="md">
      <Stack gap="xxs">
        <Text variant="label" color="textSecondary">
          {label}
        </Text>
        <Text variant="caption" color="textSecondary">
          {description}
        </Text>
      </Stack>

      <View accessible accessibilityLabel={amountText} style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text
          variant="displayBalance"
          color={amountColor}
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{ fontSize: size, lineHeight: Math.round(size * 1.05), flexShrink: 1 }}
        >
          {whole}
        </Text>
        {fraction ? (
          <Text
            variant="displayBalance"
            color="textSecondary"
            style={{ fontSize: Math.round(size / 2), lineHeight: Math.round(size * 0.55), fontWeight: '600' }}
          >
            {fraction}
          </Text>
        ) : null}
      </View>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
          paddingVertical: theme.spacing.xs,
        }}
      >
        {shown.map((metric, index) => (
          <View
            key={`${metric.label}-${index}`}
            style={{
              width: `${100 / columns}%`,
              gap: 4,
              paddingVertical: theme.spacing.xs,
              paddingRight: theme.spacing.xs,
            }}
          >
            <Text variant="label" color="textSecondary" numberOfLines={1}>
              {metric.label}
            </Text>
            <Text
              variant="cardTitle"
              color={metric.valueColor}
              tabular
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.68}
            >
              {metric.value}
            </Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {metric.caption}
            </Text>
          </View>
        ))}
      </View>
    </Stack>
  );
}

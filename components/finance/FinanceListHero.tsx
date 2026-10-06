import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import type { ThemeColors } from '@/theme/colors';
import { Card, Text } from '@/components/primitives';

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

function splitAmountText(text: string) {
  const match = /^(.*?)(,\d{1,2})(\D*)$/.exec(text);
  return match ? { whole: match[1], fraction: match[2] + match[3] } : { whole: text, fraction: '' };
}

// Tuval liste özeti (Hesaplar "Toplam varlık", Çeklerim özet kartı): tek kartta küçük etiket, 32 pt tutar
// ve altında sayaç sütunları. Tüm finans liste ekranları bu bileşeni kullanır.
export function FinanceListHero({
  label,
  description,
  amountText,
  amountColor = 'textPrimary',
  metrics,
}: FinanceListHeroProps) {
  const theme = useTheme();
  const { whole, fraction } = splitAmountText(amountText);
  const size = Math.floor(32 * Math.min(1, 9 / Math.max(whole.length, 1)));
  const shown = metrics.slice(0, 4);

  return (
    <Card style={{ gap: 4 }}>
      <Text color="textSecondary" style={{ fontSize: 13 }}>
        {label[0] + label.slice(1).toLocaleLowerCase('tr-TR')}
      </Text>
      <View accessible accessibilityLabel={amountText} style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text
          variant="displayAmount"
          color={amountColor}
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{ fontSize: size, lineHeight: Math.round(size * 1.15), flexShrink: 1 }}
        >
          {whole}
        </Text>
        {fraction ? (
          <Text
            variant="displayAmount"
            color="textSecondary"
            style={{ fontSize: size, lineHeight: Math.round(size * 1.15), fontWeight: '600' }}
          >
            {fraction}
          </Text>
        ) : null}
      </View>
      <Text variant="caption" color="textSecondary">
        {description}
      </Text>

      {shown.length > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            marginTop: theme.spacing.sm,
            paddingTop: theme.spacing.sm,
            borderTopWidth: 1,
            borderTopColor: theme.colors.separator,
            gap: theme.spacing.sm,
          }}
        >
          {shown.map((metric, index) => (
            <View key={`${metric.label}-${index}`} style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ fontSize: 12 }}>
                {metric.label[0] + metric.label.slice(1).toLocaleLowerCase('tr-TR')}
              </Text>
              <Text
                color={metric.valueColor}
                tabular
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.68}
                style={{ fontWeight: '600' }}
              >
                {metric.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';
import type { ThemeColors } from '@/theme/colors';
import { Card, Stack, Text } from '@/components/primitives';

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

// Kişiler ekranında onaylanan liste hero'sunun tek kaynağı. Tüm finans liste ekranları
// aynı ışımayı, başlık/tutar aralığını ve 2x2 metrik ızgarasını bu bileşenden alır.
export function FinanceListHero({
  label,
  description,
  amountText,
  amountColor = 'textPrimary',
  metrics,
}: FinanceListHeroProps) {
  const theme = useTheme();

  return (
    <Card variant="hero" style={{ paddingBottom: 0, overflow: 'hidden' }}>
      <Svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
      >
        <Defs>
          <RadialGradient
            id="financeListHeroGlow"
            gradientUnits="userSpaceOnUse"
            cx={1000}
            cy={0}
            fx={1000}
            fy={0}
            rx={880}
            ry={600}
          >
            <Stop
              offset="0%"
              stopColor={theme.colors.brandPrimary}
              stopOpacity={theme.scheme === 'dark' ? 0.18 : 0.126}
            />
            <Stop
              offset="34%"
              stopColor={theme.colors.brandPrimary}
              stopOpacity={theme.scheme === 'dark' ? 0.099 : 0.0675}
            />
            <Stop
              offset="70%"
              stopColor={theme.colors.brandPrimary}
              stopOpacity={theme.scheme === 'dark' ? 0.0315 : 0.0225}
            />
            <Stop offset="100%" stopColor={theme.colors.brandPrimary} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#financeListHeroGlow)" />
      </Svg>

      <Stack gap="xl" style={{ zIndex: 1 }}>
        <Stack gap="xs">
          <Text variant="cardTitle" color="textSecondary" style={{ letterSpacing: 1.8, fontSize: 14 }}>
            {label}
          </Text>
          <Text variant="body" color="textSecondary">
            {description}
          </Text>
        </Stack>

        <Text
          variant="displayBalance"
          color={amountColor}
          tabular
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.62}
        >
          {amountText}
        </Text>

        <View
          style={{
            marginHorizontal: -theme.spacing.lg,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            flexDirection: 'row',
            flexWrap: 'wrap',
          }}
        >
          {metrics.slice(0, 4).map((metric, index) => (
            <FinanceListHeroMetricCell key={`${metric.label}-${index}`} metric={metric} index={index} />
          ))}
        </View>
      </Stack>
    </Card>
  );
}

function FinanceListHeroMetricCell({ metric, index }: { metric: FinanceListHeroMetric; index: number }) {
  const theme = useTheme();
  const isLeft = index % 2 === 0;
  const isTop = index < 2;

  return (
    <Stack
      gap="xs"
      style={{
        width: '50%',
        minHeight: 118,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        borderRightWidth: isLeft ? 1 : 0,
        borderRightColor: theme.colors.border,
        borderBottomWidth: isTop ? 1 : 0,
        borderBottomColor: theme.colors.border,
      }}
    >
      <Text variant="caption" color="textSecondary" style={{ letterSpacing: 1.2, fontWeight: '600' }}>
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
    </Stack>
  );
}

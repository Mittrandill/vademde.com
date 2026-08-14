import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Card, Divider, Row, SegmentedControl, Stack, Text } from '@/components/primitives';

export interface FinanceDetailHeroStat {
  label: string;
  value: string;
}

export interface FinanceDetailHeroProps {
  icon: ReactNode;
  eyebrow?: string;
  title: string;
  status?: ReactNode;
  amountLabel: string;
  amount: string;
  amountColor: string;
  progress?: number;
  progressLabel?: string;
  progressColor?: string;
  stats: [FinanceDetailHeroStat, FinanceDetailHeroStat, FinanceDetailHeroStat];
}

/**
 * Finansal detay ekranlarının tek hero kaynağı. Kredi detayında onaylanan nötr
 * yüzey, sağ üst safran ışıma, ilerleme çubuğu ve tek sıradaki üçlü istatistik
 * düzenini bütün kayıt türlerinde aynı ölçülerle korur.
 */
export function FinanceDetailHero({
  icon,
  eyebrow = 'FİNANSAL DURUM',
  title,
  status,
  amountLabel,
  amount,
  amountColor,
  progress,
  progressLabel = 'Ödeme ilerlemesi',
  progressColor,
  stats,
}: FinanceDetailHeroProps) {
  const theme = useTheme();
  const normalizedProgress = progress === undefined ? undefined : Math.max(0, Math.min(1, progress));
  const progressPercent = Math.round((normalizedProgress ?? 0) * 100);

  return (
    <Card variant="hero" style={{ borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' }}>
      <Svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
      >
        <Defs>
          <RadialGradient
            id="financeDetailHeroGlow"
            gradientUnits="userSpaceOnUse"
            cx={1000}
            cy={0}
            fx={1000}
            fy={0}
            rx={880}
            ry={600}
          >
            <Stop offset="0%" stopColor={theme.colors.brandPrimary} stopOpacity={theme.scheme === 'dark' ? 0.18 : 0.126} />
            <Stop offset="34%" stopColor={theme.colors.brandPrimary} stopOpacity={theme.scheme === 'dark' ? 0.099 : 0.0675} />
            <Stop offset="70%" stopColor={theme.colors.brandPrimary} stopOpacity={theme.scheme === 'dark' ? 0.0315 : 0.0225} />
            <Stop offset="100%" stopColor={theme.colors.brandPrimary} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#financeDetailHeroGlow)" />
      </Svg>

      <Stack gap="xl" style={{ zIndex: 1 }}>
        <Row gap="sm" align="center">
          {icon}
          <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
            <Text
              variant="caption"
              color="textSecondary"
              numberOfLines={1}
              style={{ letterSpacing: 1.8, fontWeight: '600' }}
            >
              {eyebrow}
            </Text>
            <Text variant="cardTitle" numberOfLines={1}>
              {title}
            </Text>
          </Stack>
          {status}
        </Row>

        <Stack gap="md">
          <Stack gap="xs">
            <Text variant="caption" color="textSecondary" style={{ letterSpacing: 1.6, fontWeight: '600' }}>
              {amountLabel}
            </Text>
            <Text
              variant="displayBalance"
              tabular
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.55}
              style={{ color: amountColor }}
            >
              {amount}
            </Text>
          </Stack>

          {normalizedProgress !== undefined ? (
            <Stack gap="xs">
              <Row gap="sm" style={{ justifyContent: 'space-between' }}>
                <Text variant="caption" color="textSecondary" style={{ fontWeight: '600' }}>
                  {progressLabel}
                </Text>
                <Text variant="caption" color="textSecondary" tabular style={{ fontWeight: '600' }}>
                  %{progressPercent}
                </Text>
              </Row>
              <View
                style={{
                  height: 7,
                  overflow: 'hidden',
                  borderRadius: theme.radius.pill,
                  backgroundColor: withAlpha(theme.colors.textSecondary, 0.14),
                }}
              >
                <View
                  style={{
                    width: `${progressPercent}%`,
                    height: '100%',
                    borderRadius: theme.radius.pill,
                    backgroundColor: progressColor ?? theme.colors.brandPrimary,
                  }}
                />
              </View>
            </Stack>
          ) : null}
        </Stack>

        <Divider />

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          {stats.map((stat) => (
            <Stack key={stat.label} gap="xs" style={{ flex: 1, minWidth: 0 }}>
              <Text
                variant="caption"
                color="textSecondary"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.55}
                style={{ fontWeight: '600' }}
              >
                {stat.label}
              </Text>
              <Text variant="cardTitle" tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}>
                {stat.value}
              </Text>
            </Stack>
          ))}
        </View>
      </Stack>
    </Card>
  );
}

export interface FinanceDetailTabOption<T extends string> {
  key: T;
  label: string;
}

export function FinanceDetailTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: FinanceDetailTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return <SegmentedControl options={options} value={value} onChange={onChange} stretch />;
}

export interface FinanceDetailInfoRow {
  label: string;
  value: string;
}

export function FinanceDetailInfoCard({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: FinanceDetailInfoRow[];
}) {
  const theme = useTheme();

  return (
    <Card variant="hero" style={{ padding: 0, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border }}>
      <Stack gap="xs" style={{ padding: theme.spacing.lg }}>
        <Text variant="cardTitle">{title}</Text>
        <Text variant="body" color="textSecondary">
          {description}
        </Text>
      </Stack>
      <Divider />
      {rows.map((row, index) => (
        <View key={`${row.label}-${index}`}>
          {index > 0 ? <Divider /> : null}
          <Row gap="md" style={{ minHeight: 64, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm }}>
            <Text variant="body" color="textSecondary" style={{ flex: 1 }}>
              {row.label}
            </Text>
            <Text
              variant="body"
              tabular
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              style={{ maxWidth: '58%', textAlign: 'right', fontWeight: '600' }}
            >
              {row.value}
            </Text>
          </Row>
        </View>
      ))}
    </Card>
  );
}

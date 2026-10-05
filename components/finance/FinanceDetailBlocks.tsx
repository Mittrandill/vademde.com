import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { ScrollableTabs, Stack, Text } from '@/components/primitives';

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

// HANDOFF §2 ölçek kuralı: tam kısım 7 karakteri aşarsa font küçülür (tek satır).
const BASE_SIZE = 52;
const FULL_PART_LIMIT = 7;

function splitAmountText(text: string) {
  const match = /^(.*?)(,\d{1,2})(\D*)$/.exec(text);
  return match ? { whole: match[1], fraction: match[2] + match[3] } : { whole: text, fraction: '' };
}

/**
 * Finansal detay ekranlarının tek hero kaynağı (kredi, kart, hesap, banka, cari, kayıt). Yeni
 * tasarımda kartsız: ikon + başlık + durum, mono etiket, büyük tutar, ince ilerleme çubuğu ve
 * çizgiyle ayrılmış üçlü istatistik satırı.
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
  const { whole, fraction } = splitAmountText(amount);
  const size = Math.floor(BASE_SIZE * Math.min(1, FULL_PART_LIMIT / Math.max(whole.length, 1)));

  return (
    <Stack gap="lg">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        {icon}
        <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
          <Text variant="label" color="textSecondary" numberOfLines={1}>
            {eyebrow}
          </Text>
          <Text variant="cardTitle" numberOfLines={1} style={{ fontSize: 17 }}>
            {title}
          </Text>
        </Stack>
        {status}
      </View>

      <Stack gap="xs">
        <Text variant="label" color="textSecondary">
          {amountLabel}
        </Text>
        <View accessible accessibilityLabel={amount} style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text
            variant="displayBalance"
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ fontSize: size, lineHeight: Math.round(size * 1.05), color: amountColor, flexShrink: 1 }}
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
      </Stack>

      {normalizedProgress !== undefined ? (
        <Stack gap="xs">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="caption" color="textSecondary">
              {progressLabel}
            </Text>
            <Text variant="label" color="textSecondary" tabular style={{ textTransform: 'none' }}>
              %{progressPercent}
            </Text>
          </View>
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: progressPercent }}
            style={{ height: 8, overflow: 'hidden', borderRadius: 4, backgroundColor: theme.colors.border }}
          >
            <View
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                borderRadius: 4,
                backgroundColor: progressColor ?? theme.colors.textPrimary,
              }}
            />
          </View>
        </Stack>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          gap: theme.spacing.sm,
          paddingVertical: theme.spacing.md,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        {stats.map((stat) => (
          <Stack key={stat.label} gap="xs" style={{ flex: 1, minWidth: 0 }}>
            <Text variant="label" color="textSecondary" numberOfLines={2}>
              {stat.label}
            </Text>
            <Text variant="cardTitle" tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {stat.value}
            </Text>
          </Stack>
        ))}
      </View>
    </Stack>
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
  return <ScrollableTabs tabs={options} activeKey={value} onChange={(key) => onChange(key as T)} />;
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
    <Stack gap="xs">
      <Stack gap="xxs">
        <Text variant="sectionTitle">{title}</Text>
        <Text variant="caption" color="textSecondary">
          {description}
        </Text>
      </Stack>
      <View>
        {rows.map((row, index) => (
          <View
            key={`${row.label}-${index}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              minHeight: 52,
              paddingVertical: theme.spacing.xs,
              borderBottomWidth: index === rows.length - 1 ? 0 : 1,
              borderBottomColor: theme.colors.border,
            }}
          >
            <Text variant="label" color="textSecondary" style={{ flex: 1 }}>
              {row.label}
            </Text>
            <Text variant="cardTitle" tabular style={{ maxWidth: '60%', textAlign: 'right' }}>
              {row.value}
            </Text>
          </View>
        ))}
      </View>
    </Stack>
  );
}

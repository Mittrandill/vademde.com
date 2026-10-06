import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { useTheme } from '@/theme';
import { Card, Group, Pressable, Text } from '@/components/primitives';

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

function splitAmountText(text: string) {
  const match = /^(.*?)(,\d{1,2})(\D*)$/.exec(text);
  return match ? { whole: match[1], fraction: match[2] + match[3] } : { whole: text, fraction: '' };
}

// Tuval detay ekranları (YukumlulukDetay, KrediDetay, HesapDetay): ortalanmış 56 pt ikon, ikincil başlık,
// 38 pt tutar (kuruş ikincil), durum etiketi; altında ilerleme çubuğu + üçlü istatistik tek kartta.
export function FinanceDetailHero({
  icon,
  eyebrow,
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
  const size = Math.floor(38 * Math.min(1, 8 / Math.max(whole.length, 1)));

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ alignItems: 'center', gap: 6, paddingTop: 4 }}>
        {icon}
        <Text color="textSecondary" numberOfLines={2} style={{ fontSize: 13, marginTop: 6, textAlign: 'center' }}>
          {eyebrow ? `${eyebrow} · ${title}` : title}
        </Text>
        <Text color="textSecondary" style={{ fontSize: 12 }}>
          {amountLabel}
        </Text>
        <View accessible accessibilityLabel={amount} style={{ flexDirection: 'row', alignItems: 'baseline', maxWidth: '100%' }}>
          <Text
            variant="displayBalance"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            style={{ fontSize: size, lineHeight: Math.round(size * 1.1), color: amountColor, flexShrink: 1 }}
          >
            {whole}
          </Text>
          {fraction ? (
            <Text variant="displayBalance" color="textSecondary" style={{ fontSize: size, lineHeight: Math.round(size * 1.1), fontWeight: '600' }}>
              {fraction}
            </Text>
          ) : null}
        </View>
        {status}
      </View>

      <Card style={{ gap: 12 }}>
        {normalizedProgress !== undefined ? (
          <View style={{ gap: 6 }}>
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: progressPercent }}
              style={{ height: 8, overflow: 'hidden', borderRadius: 4, backgroundColor: theme.colors.fill }}
            >
              <View
                style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  borderRadius: 4,
                  backgroundColor: progressColor ?? theme.colors.brandPrimary,
                }}
              />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="caption" color="textSecondary">
                {progressLabel}
              </Text>
              <Text variant="caption" color="textSecondary" tabular>
                %{progressPercent}
              </Text>
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          {stats.map((stat) => (
            <View key={stat.label} style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text variant="caption" color="textSecondary" numberOfLines={2} style={{ fontSize: 12 }}>
                {stat.label}
              </Text>
              <Text tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontWeight: '600' }}>
                {stat.value}
              </Text>
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}

export interface FinanceDetailTabOption<T extends string> {
  key: T;
  label: string;
}

// vademde.css .utabs: metin sekmeleri, seçili olanın altında 2.5 pt Saffron çizgi.
export function FinanceDetailTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: FinanceDetailTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: theme.colors.separator }}
      contentContainerStyle={{ gap: 22 }}
    >
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.key)}
            style={{ paddingTop: 12, paddingBottom: 11, minHeight: 44 }}
          >
            <Text style={{ fontSize: 15, fontWeight: selected ? '600' : '500', color: selected ? theme.colors.textPrimary : theme.colors.textSecondary }}>
              {option.label}
            </Text>
            {selected ? (
              <View
                style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2.5, borderRadius: 2, backgroundColor: theme.colors.brandPrimary }}
              />
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export interface FinanceDetailInfoRow {
  label: string;
  value: string;
}

// Tuval "Bilgiler": büyük harf küçük başlık + etiket solda / değer sağda gruplu satırlar.
export function FinanceDetailInfoCard({
  title,
  description,
  rows,
}: {
  title: string;
  description?: string;
  rows: FinanceDetailInfoRow[];
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Text variant="label" color="textSecondary">
          {title}
        </Text>
        {description ? (
          <Text variant="caption" color="textSecondary">
            {description}
          </Text>
        ) : null}
      </View>
      <Group inset={16}>
        {rows.map((row, index) => (
          <View
            key={`${row.label}-${index}`}
            style={{ minHeight: 56, paddingVertical: 10, paddingHorizontal: theme.spacing.md, flexDirection: 'row', alignItems: 'center', gap: 12 }}
          >
            <Text color="textSecondary" style={{ flex: 1 }}>
              {row.label}
            </Text>
            <Text tabular style={{ maxWidth: '60%', textAlign: 'right' }}>
              {row.value}
            </Text>
          </View>
        ))}
      </Group>
    </View>
  );
}

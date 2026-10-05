import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Stack, Text } from '@/components/primitives';
import { formatMinorAmount } from '@/utils/money';
import { CategoryIcon } from './CategoryIcon';
import { PersonAvatar } from './PersonAvatar';
import { BankLogo } from './BankLogo';
import { ValueUnitBadge } from './ValueUnitPicker';
import { getValueUnit } from '@/features/valueUnits/units';
import { isRateStale, type ValueUnitRate } from '@/features/valueUnits/api';
import type {
  AccountBalanceReportItem,
  CashFlowBucket,
  CategoryBreakdownItem,
  CounterpartyBreakdownItem,
  MonthlyTotal,
} from '@/features/reports/api';

const wholeAmount = (minor: number, currency = 'TRY') => formatMinorAmount(minor, currency).replace(/,00(?=\D*$)/, '');

export function SectionTitle({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <Text variant="sectionTitle" style={{ flexShrink: 1 }}>
        {children}
      </Text>
      {right}
    </View>
  );
}

// Önceki döneme göre değişim: yüzde + ok. `goodWhenDown` giderde azalmanın olumlu sayılması içindir;
// renk tek başına anlam taşımaz (ok ve işaret her zaman yazılı).
export function DeltaText({
  current,
  previous,
  goodWhenDown = false,
  suffix = 'geçen döneme göre',
}: {
  current: number;
  previous: number | null;
  goodWhenDown?: boolean;
  suffix?: string;
}) {
  const theme = useTheme();
  if (previous === null || previous === 0) {
    return (
      <Text variant="caption" color="textSecondary">
        {previous === 0 && current > 0 ? 'önceki dönemde kayıt yok' : ''}
      </Text>
    );
  }
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
  const up = pct > 0;
  const good = pct === 0 ? null : goodWhenDown ? !up : up;
  const color = good === null ? theme.colors.textSecondary : good ? theme.colors.receivable : theme.colors.textPrimary;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Ionicons
        name={pct === 0 ? 'remove-outline' : up ? 'caret-up' : 'caret-down'}
        size={theme.iconSize.sm}
        color={color}
      />
      <Text variant="label" tabular style={{ textTransform: 'none', color }}>
        %{Math.abs(pct)}
      </Text>
      <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
        {suffix}
      </Text>
    </View>
  );
}

export interface KpiProps {
  label: string;
  value: string;
  valueColor?: string;
  footer: ReactNode;
}

export function KpiRow({ items }: { items: KpiProps[] }) {
  const theme = useTheme();
  return (
    <View>
      {items.map((item, index) => (
        <View
          key={item.label}
          style={{
            gap: 4,
            paddingVertical: theme.spacing.sm,
            borderBottomWidth: index === items.length - 1 ? 0 : 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <Text variant="label" color="textSecondary">
              {item.label}
            </Text>
            <Text variant="cardTitle" tabular style={{ color: item.valueColor }}>
              {item.value}
            </Text>
          </View>
          {item.footer}
        </View>
      ))}
    </View>
  );
}

export function SmartSummary({ text, onPress }: { text: string; onPress?: () => void }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
        borderRadius: theme.radius.widget,
        backgroundColor: theme.colors.surfacePrimary,
      }}
    >
      <Ionicons name="analytics-outline" size={22} color={theme.colors.textPrimary} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="label" color="textSecondary">
          Özet
        </Text>
        <Text variant="body">{text}</Text>
        {onPress ? (
          <Text variant="cardTitle" onPress={onPress} accessibilityRole="link" style={{ fontSize: 14 }}>
            Önerileri gör →
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// Son 6 ay: gider (payable moru değil, nötr) ve gelir (receivable) çift sütun.
export function MonthBars({ data }: { data: MonthlyTotal[] }) {
  const theme = useTheme();
  const max = Math.max(1, ...data.flatMap((d) => [d.incomeMinor, d.expenseMinor]));
  const barHeight = 96;
  return (
    <View>
      <View
        accessible
        accessibilityLabel={data.map((m) => `${m.label}: gelir ${wholeAmount(m.incomeMinor)}, gider ${wholeAmount(m.expenseMinor)}`).join('. ')}
        style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: barHeight }}
      >
        {data.map((m) => (
          <View key={m.monthKey} style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: barHeight }}>
            <View
              style={{
                flex: 1,
                height: Math.max(3, (m.expenseMinor / max) * barHeight),
                borderTopLeftRadius: 3,
                borderTopRightRadius: 3,
                backgroundColor: theme.colors.textPrimary,
              }}
            />
            <View
              style={{
                flex: 1,
                height: Math.max(3, (m.incomeMinor / max) * barHeight),
                borderTopLeftRadius: 3,
                borderTopRightRadius: 3,
                backgroundColor: theme.colors.receivable,
              }}
            />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
        {data.map((m) => (
          <Text key={m.monthKey} variant="label" color="textSecondary" style={{ flex: 1, textAlign: 'center', textTransform: 'none' }}>
            {m.label}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
        {[
          { label: 'Gider', color: theme.colors.textPrimary },
          { label: 'Gelir', color: theme.colors.receivable },
        ].map((l) => (
          <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: l.color }} />
            <Text variant="caption" color="textSecondary">
              {l.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function CategoryRows({
  items,
  previous,
  emptyLabel,
  goodWhenDown,
}: {
  items: CategoryBreakdownItem[];
  /** Önceki dönemin kategori toplamları (ad → kuruş). */
  previous: Map<string, number> | null;
  emptyLabel: string;
  goodWhenDown: boolean;
}) {
  const theme = useTheme();
  if (items.length === 0) {
    return (
      <Text variant="body" color="textSecondary">
        {emptyLabel}
      </Text>
    );
  }
  return (
    <View>
      {items.slice(0, 8).map((item, index) => {
        const before = previous?.get(item.name) ?? null;
        const pct = before && before > 0 ? Math.round(((item.amountMinor - before) / before) * 100) : null;
        return (
          <View
            key={item.categoryId ?? 'uncategorized'}
            accessible
            accessibilityLabel={`${item.name}: ${wholeAmount(item.amountMinor)}, toplamın yüzde ${Math.round(item.percentage * 100)}${pct !== null ? `, önceki döneme göre yüzde ${pct}` : ''}`}
            style={{
              gap: 6,
              paddingVertical: 10,
              borderBottomWidth: index === Math.min(items.length, 8) - 1 ? 0 : 1,
              borderBottomColor: theme.colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <CategoryIcon icon={item.icon} color={item.color} size={32} />
              <Text variant="cardTitle" numberOfLines={1} style={{ flex: 1 }}>
                {item.name}
              </Text>
              {pct !== null ? (
                <Text
                  variant="label"
                  tabular
                  style={{
                    textTransform: 'none',
                    color:
                      pct === 0
                        ? theme.colors.textSecondary
                        : (goodWhenDown ? pct < 0 : pct > 0)
                          ? theme.colors.receivable
                          : theme.colors.textPrimary,
                  }}
                >
                  {pct > 0 ? '+' : pct < 0 ? '−' : '±'}%{Math.abs(pct)}
                </Text>
              ) : null}
              <Text variant="cardTitle" tabular>
                {wholeAmount(item.amountMinor)}
              </Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.border, overflow: 'hidden' }}>
              <View
                style={{
                  width: `${Math.max(2, item.percentage * 100)}%`,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: theme.colors.textPrimary,
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function CounterpartyRows({ items }: { items: CounterpartyBreakdownItem[] }) {
  const theme = useTheme();
  if (items.length === 0) {
    return (
      <Text variant="body" color="textSecondary">
        Bu dönemde kişi veya firma hareketi yok.
      </Text>
    );
  }
  return (
    <View>
      {items.slice(0, 6).map((item, index) => (
        <View
          key={item.counterpartyId}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            paddingVertical: 10,
            borderBottomWidth: index === Math.min(items.length, 6) - 1 ? 0 : 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          <PersonAvatar name={item.name} size={36} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="cardTitle" numberOfLines={1}>
              {item.name}
            </Text>
            <Text variant="caption" color="textSecondary">
              {item.count} hareket
            </Text>
          </View>
          <Text variant="cardTitle" tabular>
            {wholeAmount(item.amountMinor)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function CashFlowRows({ buckets }: { buckets: CashFlowBucket[] }) {
  const theme = useTheme();
  const hasData = buckets.some((b) => b.payableMinor > 0 || b.receivableMinor > 0);
  if (!hasData) {
    return (
      <Text variant="body" color="textSecondary">
        Önümüzdeki 30 günde vadesi gelen kayıt yok.
      </Text>
    );
  }
  const max = Math.max(1, ...buckets.flatMap((b) => [b.payableMinor, b.receivableMinor]));
  return (
    <View>
      {buckets.map((b, index) => {
        const net = b.receivableMinor - b.payableMinor;
        return (
          <View
            key={b.label}
            accessible
            accessibilityLabel={`${b.label}: çıkış ${wholeAmount(b.payableMinor)}, giriş ${wholeAmount(b.receivableMinor)}`}
            style={{
              gap: 6,
              paddingVertical: 10,
              borderBottomWidth: index === buckets.length - 1 ? 0 : 1,
              borderBottomColor: theme.colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="label" color="textSecondary" style={{ textTransform: 'none' }}>
                {b.label}
              </Text>
              <Text variant="cardTitle" tabular style={{ color: net >= 0 ? theme.colors.receivable : theme.colors.textPrimary }}>
                {net >= 0 ? '+' : '−'}
                {wholeAmount(Math.abs(net))}
              </Text>
            </View>
            {[
              { value: b.payableMinor, color: theme.colors.payable },
              { value: b.receivableMinor, color: theme.colors.receivable },
            ].map((bar, i) => (
              <View key={i} style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.border, overflow: 'hidden' }}>
                <View style={{ width: `${Math.max(bar.value > 0 ? 2 : 0, (bar.value / max) * 100)}%`, height: 6, backgroundColor: bar.color }} />
              </View>
            ))}
          </View>
        );
      })}
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
        {[
          { label: 'Çıkış', color: theme.colors.payable },
          { label: 'Giriş', color: theme.colors.receivable },
        ].map((l) => (
          <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: l.color }} />
            <Text variant="caption" color="textSecondary">
              {l.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function AccountRows({ items }: { items: AccountBalanceReportItem[] }) {
  const theme = useTheme();
  if (items.length === 0) {
    return (
      <Text variant="body" color="textSecondary">
        Henüz hesap yok.
      </Text>
    );
  }
  return (
    <View>
      {items.map((item, index) => (
        <View
          key={item.accountId}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            paddingVertical: 10,
            borderBottomWidth: index === items.length - 1 ? 0 : 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          <BankLogo bankCode={item.bankCode} fallbackIcon="wallet-outline" size={36} />
          <Text variant="cardTitle" numberOfLines={1} style={{ flex: 1 }}>
            {item.name}
          </Text>
          <Text variant="cardTitle" tabular>
            {formatMinorAmount(item.balanceMinor, item.currencyCode)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function RateRows({ rates, ageText }: { rates: ValueUnitRate[]; ageText: string | null }) {
  const theme = useTheme();
  if (rates.length === 0) {
    return (
      <Text variant="body" color="textSecondary">
        Kur bilgisi bulunamadı.
      </Text>
    );
  }
  return (
    <Stack gap="xxs">
      {rates.map((rate, index) => {
        const stale = isRateStale(rate.cached_at);
        return (
          <View
            key={rate.unit_code}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              paddingVertical: 8,
              borderBottomWidth: index === rates.length - 1 ? 0 : 1,
              borderBottomColor: theme.colors.border,
            }}
          >
            <ValueUnitBadge unitCode={rate.unit_code} size={32} />
            <Text variant="cardTitle" numberOfLines={1} style={{ flex: 1 }}>
              {getValueUnit(rate.unit_code).name}
            </Text>
            {stale ? (
              <Text variant="label" style={{ textTransform: 'none', color: theme.colors.attentionMarker }}>
                eski
              </Text>
            ) : null}
            <Text variant="cardTitle" tabular>
              {formatMinorAmount(rate.try_equivalent_minor)}
            </Text>
          </View>
        );
      })}
      {ageText ? (
        <Text variant="caption" color="textSecondary">
          {ageText}
        </Text>
      ) : null}
    </Stack>
  );
}

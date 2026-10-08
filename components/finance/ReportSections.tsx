import type { ReactNode } from 'react';
import { Image, View, type ImageSourcePropType } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Pressable, Stack, Text } from '@/components/primitives';
import { HeroAmount } from './HeroAmount';
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

// Tuval Raporlar: liste blokları tek yüzeyde (14 radius), satır arası ince ayırıcı.
const panelStyle = (theme: ReturnType<typeof useTheme>) => ({
  backgroundColor: theme.colors.surfacePrimary,
  borderRadius: theme.radius.group,
  paddingHorizontal: theme.spacing.md,
  overflow: 'hidden' as const,
});

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
    <View style={panelStyle(theme)}>
      {items.map((item, index) => (
        <View
          key={item.label}
          style={{
            gap: 4,
            paddingVertical: theme.spacing.sm,
            borderBottomWidth: index === items.length - 1 ? 0 : 1,
            borderBottomColor: theme.colors.separator,
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

function Art({ source, width, ratio = 1 }: { source: ImageSourcePropType; width: number; ratio?: number }) {
  return <Image source={source} accessible={false} resizeMode="contain" style={{ width, height: width * ratio }} />;
}

// Yüzey kartı: başlık + sağda isteğe bağlı aksiyon; Raporlar'daki tüm bloklar bu kabı paylaşır.
export function ReportCard({
  title,
  right,
  children,
  gap = 12,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  gap?: number;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surfacePrimary,
        borderRadius: theme.radius.group,
        padding: theme.spacing.md,
        gap,
        overflow: 'hidden',
      }}
    >
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text variant="sectionTitle" style={{ flexShrink: 1 }}>
            {title}
          </Text>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

// Akıllı özet: yalnızca ekrandaki rakamlardan türeyen metin (yapay zekâ çağrısı yok); sağda illüstrasyon.
export function SmartSummary({ text, onPress }: { text: string; onPress?: () => void }) {
  const theme = useTheme();
  const brand = theme.colors.brandPrimary;
  return (
    <View
      style={{
        borderRadius: theme.radius.widget,
        backgroundColor: withAlpha(brand, 0.1),
        borderWidth: 1,
        borderColor: withAlpha(brand, 0.35),
        padding: theme.spacing.md,
        minHeight: 168,
        overflow: 'hidden',
      }}
    >
      <View pointerEvents="none" style={{ position: 'absolute', right: -24, bottom: -18 }}>
        <Art source={require('@/assets/reports/summary.png')} width={170} />
      </View>
      <View style={{ gap: 8, paddingRight: 96 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="sparkles" size={14} color={brand} />
          <Text variant="label" style={{ color: brand }}>
            Özet
          </Text>
        </View>
        <Text style={{ fontSize: 17, lineHeight: 23, fontWeight: '600' }}>{text}</Text>
        {onPress ? (
          <Pressable
            accessibilityRole="link"
            onPress={onPress}
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              height: 34,
              paddingHorizontal: 14,
              borderRadius: 17,
              borderWidth: 1,
              borderColor: withAlpha(brand, 0.6),
              marginTop: 4,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: brand }}>Önerileri gör</Text>
            <Ionicons name="arrow-forward" size={14} color={brand} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// Net: büyük rakam + altta yeşil trend illüstrasyonu (sol yarı).
export function NetCard({ net }: { net: number }) {
  const theme = useTheme();
  const positive = net >= 0;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.surfacePrimary,
        borderRadius: theme.radius.group,
        padding: theme.spacing.md,
        overflow: 'hidden',
        minHeight: 180,
      }}
    >
      <View pointerEvents="none" style={{ position: 'absolute', right: -30, bottom: -10, opacity: 0.9 }}>
        <Art source={require('@/assets/reports/net.png')} width={190} ratio={0.75} />
      </View>
      <Text variant="caption" color="textSecondary">
        Net
      </Text>
      <HeroAmount amountMinor={Math.abs(net)} baseSize={28} color={positive ? 'receivable' : 'textPrimary'} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: withAlpha(positive ? theme.colors.receivable : theme.colors.danger, 0.18),
          }}
        >
          <Ionicons
            name={positive ? 'arrow-up' : 'arrow-down'}
            size={14}
            color={positive ? theme.colors.receivable : theme.colors.danger}
          />
        </View>
        <Text variant="caption" style={{ color: positive ? theme.colors.receivable : theme.colors.textSecondary, flexShrink: 1 }}>
          {positive ? 'Gelir gideri aştı' : 'Gider geliri aştı'}
        </Text>
      </View>
    </View>
  );
}

export interface SideKpi {
  key: string;
  label: string;
  value: string;
  valueColor?: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  footer: ReactNode;
}

// Net'in yanındaki Gelir / Gider / Tasarruf oranı: ikon dairesi + etiket + tutar, altında değişim.
export function SideKpis({ items }: { items: SideKpi[] }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.surfacePrimary,
        borderRadius: theme.radius.group,
        paddingHorizontal: theme.spacing.sm,
        justifyContent: 'center',
      }}
    >
      {items.map((item, index) => (
        <View
          key={item.key}
          style={{
            flexDirection: 'row',
            gap: 8,
            paddingVertical: 10,
            borderBottomWidth: index === items.length - 1 ? 0 : 1,
            borderBottomColor: theme.colors.separator,
          }}
        >
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: withAlpha(item.iconColor, 0.18),
            }}
          >
            <Ionicons name={item.icon} size={16} color={item.iconColor} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '500' }} numberOfLines={1}>
                {item.label}
              </Text>
              <Text tabular style={{ fontSize: 13, fontWeight: '600', color: item.valueColor }} numberOfLines={1}>
                {item.value}
              </Text>
            </View>
            {item.footer}
          </View>
        </View>
      ))}
    </View>
  );
}

// Özet'in altında yan yana iki kart: Borç ve alacak | Güncel kurlar (kısa).
export function DebtMiniCard({
  payableMinor,
  payableCount,
  receivableMinor,
  receivableCount,
  onPress,
}: {
  payableMinor: number;
  payableCount: number;
  receivableMinor: number;
  receivableCount: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const rows = [
    { label: 'Ödenecek', count: payableCount, value: payableMinor, icon: 'arrow-up' as const, color: theme.colors.danger, valueColor: theme.colors.danger },
    { label: 'Tahsil edilecek', count: receivableCount, value: receivableMinor, icon: 'arrow-down' as const, color: theme.colors.receivable, valueColor: theme.colors.receivable },
  ];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Borç ve alacak"
      onPress={onPress}
      style={{ flex: 1, backgroundColor: theme.colors.surfacePrimary, borderRadius: theme.radius.group, padding: theme.spacing.md, gap: 10, overflow: 'hidden' }}
    >
      <Text variant="sectionTitle" style={{ fontSize: 17 }}>
        Borç ve alacak
      </Text>
      {rows.map((r) => (
        <View key={r.label} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: withAlpha(r.color, 0.18),
              }}
            >
              <Ionicons name={r.icon} size={15} color={r.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '500' }} numberOfLines={1}>
                {r.label}
              </Text>
              <Text variant="caption" color="textSecondary">
                {r.count} kayıt
              </Text>
            </View>
          </View>
          <Text tabular style={{ fontSize: 15, fontWeight: '700', color: r.valueColor }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {wholeAmount(r.value)}
          </Text>
        </View>
      ))}
    </Pressable>
  );
}

export function RatesMiniCard({ rates, ageText, onPress }: { rates: ValueUnitRate[]; ageText: string | null; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Güncel kurlar"
      onPress={onPress}
      style={{ flex: 1, backgroundColor: theme.colors.surfacePrimary, borderRadius: theme.radius.group, padding: theme.spacing.md, gap: 8, overflow: 'hidden' }}
    >
      <Text variant="sectionTitle" style={{ fontSize: 17 }}>
        Güncel kurlar
      </Text>
      {rates.slice(0, 3).map((rate) => (
        <View key={rate.unit_code} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ValueUnitBadge unitCode={rate.unit_code} size={26} />
          <Text style={{ flex: 1, fontSize: 13 }} numberOfLines={1}>
            {getValueUnit(rate.unit_code).name}
          </Text>
          <Text tabular style={{ fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
            {wholeAmount(rate.try_equivalent_minor)}
          </Text>
        </View>
      ))}
      {ageText ? (
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {ageText}
        </Text>
      ) : null}
    </Pressable>
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
                backgroundColor: theme.colors.accentViolet,
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
          { label: 'Gider', color: theme.colors.accentViolet },
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
  bare = false,
}: {
  /** true: ReportCard içinde kullanılır, kendi yüzeyini çizmez. */
  bare?: boolean;
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
    <View style={bare ? undefined : panelStyle(theme)}>
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
              borderBottomColor: theme.colors.separator,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <CategoryIcon icon={item.icon} color={item.color} size={32} />
              <Text numberOfLines={1} style={{ flex: 1, fontWeight: '500' }}>
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
            <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.fill, overflow: 'hidden' }}>
              <View
                style={{
                  width: `${Math.max(2, item.percentage * 100)}%`,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: theme.colors.accentViolet,
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
    <View style={panelStyle(theme)}>
      {items.slice(0, 6).map((item, index) => (
        <View
          key={item.counterpartyId}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            paddingVertical: 10,
            borderBottomWidth: index === Math.min(items.length, 6) - 1 ? 0 : 1,
            borderBottomColor: theme.colors.separator,
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
    <View style={panelStyle(theme)}>
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
              borderBottomColor: theme.colors.separator,
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
              <View key={i} style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.fill, overflow: 'hidden' }}>
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
    <View style={panelStyle(theme)}>
      {items.map((item, index) => (
        <View
          key={item.accountId}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            paddingVertical: 10,
            borderBottomWidth: index === items.length - 1 ? 0 : 1,
            borderBottomColor: theme.colors.separator,
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
              borderBottomColor: theme.colors.separator,
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

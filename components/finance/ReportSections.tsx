import type { ReactNode } from 'react';
import { Image, View, type ImageSourcePropType } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Pressable, Tag, Text } from '@/components/primitives';
import { formatMinorAmount } from '@/utils/money';
import { FadedArt, GlowBackground, GlowChevron } from './GlowSurface';
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

// Raporlar (görsel referans: koyu tema finans raporları): her blok kendi kartında, kart başlığı
// solda, sağda açıklama/segment ve ayrıntıyı açan daire ok düğmesi. Satır arası ince ayırıcı.
const wholeAmount = (minor: number, currency = 'TRY') => formatMinorAmount(minor, currency).replace(/,00(?=\D*$)/, '');

/** Önceki döneme göre yüzde değişim; önceki değer yoksa ya da sıfırsa null. */
export function percentChange(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

function Art({ source, width, ratio = 1 }: { source: ImageSourcePropType; width: number; ratio?: number }) {
  return <Image source={source} accessible={false} resizeMode="contain" style={{ width, height: width * ratio }} />;
}

/** Kart başlığının sağındaki daire ok: kartın ayrıntısını (alt sayfa ya da liste) açar. */
export function MoreButton({ onPress, label }: { onPress: () => void; label: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.fill,
      }}
    >
      <Ionicons name="chevron-forward" size={16} color={theme.colors.textPrimary} />
    </Pressable>
  );
}

/** Yüzey kartı: başlık + sağda isteğe bağlı içerik ve ok düğmesi. */
export function ReportCard({
  title,
  right,
  onMore,
  moreLabel,
  children,
  gap = 12,
}: {
  title?: string;
  right?: ReactNode;
  onMore?: () => void;
  moreLabel?: string;
  children: ReactNode;
  gap?: number;
}) {
  const theme = useTheme();
  return (
    <View style={{ backgroundColor: theme.colors.surfacePrimary, borderRadius: theme.radius.widget, padding: theme.spacing.md, gap }}>
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 }}>
          <Text style={{ fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: -0.3, flexShrink: 1 }} numberOfLines={1}>
            {title}
          </Text>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>{right}</View>
          {onMore ? <MoreButton onPress={onMore} label={moreLabel ?? `${title} ayrıntısı`} /> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

// Akıllı özet: yalnızca ekrandaki rakamlardan türeyen metin (yapay zekâ çağrısı yok, bu yüzden "AI"
// etiketi taşımaz). Ana Sayfa uyarı kartlarıyla aynı stil: degrade + ışıma zemin, sağ altta
// illüstrasyon, sağ üstte daire ok; yüzdeler kart tonunda vurgulu.
export function SmartSummary({ text, onPress }: { text: string; onPress?: () => void }) {
  const theme = useTheme();
  const tone = theme.colors.attentionMarker;
  // İlk cümle başlık, kalanı alt metin.
  const firstStop = text.indexOf('. ');
  const headline = firstStop >= 0 ? text.slice(0, firstStop + 1) : text;
  const body = firstStop >= 0 ? text.slice(firstStop + 2) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Akıllı özet. ${text}`}
      onPress={onPress}
      disabled={!onPress}
      style={{
        minHeight: 176,
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: theme.colors.surfacePrimary,
        borderWidth: 1,
        borderColor: withAlpha(tone, 0.32),
      }}
    >
      <GlowBackground id="r-summary" tone={tone} />
      <FadedArt id="r-summary-art" source={require('@/assets/reports/summary.png')} width={230} height={230} right={-46} bottom={-56} />
      <View style={{ padding: 20, gap: 4, flex: 1, maxWidth: '68%' }}>
        <Text color="textSecondary" style={{ fontSize: 13, fontWeight: '500' }}>
          Akıllı özet
        </Text>
        <Text style={{ fontSize: 18, fontWeight: '700', lineHeight: 23 }}>
          {headline.split(/(%\d+)/).map((part, i) =>
            /^%\d+$/.test(part) ? (
              <Text key={i} style={{ fontSize: 18, fontWeight: '700', color: tone }}>
                {part}
              </Text>
            ) : (
              part
            )
          )}
        </Text>
        {body ? (
          <Text variant="caption" color="textSecondary" numberOfLines={3}>
            {body}
          </Text>
        ) : null}
        <View style={{ flex: 1 }} />
        {onPress ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
            <Text style={{ color: tone, fontWeight: '600', fontSize: 15 }}>Önerileri gör</Text>
            <Ionicons name="arrow-forward" size={15} color={tone} />
          </View>
        ) : null}
      </View>
      {onPress ? <GlowChevron /> : null}
    </Pressable>
  );
}

// Net: Ana Sayfa uyarı kartı stilinde; ton net pozitifse yeşil, negatifse kırmızı. Büyük tutar tonda,
// altında yön cümlesi; sağ altta trend illüstrasyonu. Dokununca aylık tablo açılır.
export function NetCard({ net, onPress }: { net: number; onPress?: () => void }) {
  const theme = useTheme();
  const positive = net >= 0;
  const tone = positive ? theme.colors.receivable : theme.colors.danger;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Net ${net < 0 ? 'eksi ' : ''}${formatMinorAmount(Math.abs(net))}`}
      onPress={onPress}
      disabled={!onPress}
      style={{
        minHeight: 168,
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: theme.colors.surfacePrimary,
        borderWidth: 1,
        borderColor: withAlpha(tone, 0.32),
      }}
    >
      <GlowBackground id="r-net" tone={tone} />
      <View pointerEvents="none" style={{ position: 'absolute', right: -30, bottom: -62, opacity: positive ? 1 : 0.45 }}>
        <Art source={require('@/assets/reports/net.png')} width={290} ratio={0.75} />
      </View>
      <View style={{ padding: 20, gap: 4, flex: 1, maxWidth: '78%' }}>
        <Text color="textSecondary" style={{ fontSize: 13, fontWeight: '500' }}>
          Net
        </Text>
        <Text
          variant="displayAmount"
          tabular
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          style={{ fontSize: 34, lineHeight: 40, color: tone }}
        >
          {net < 0 ? '−' : ''}
          {formatMinorAmount(Math.abs(net))}
        </Text>
        <Text variant="caption" color="textSecondary">
          {net === 0 ? 'Gelir ve gider denk.' : positive ? 'Bu dönemde gelir gideri aştı.' : 'Bu dönemde gider geliri aştı.'}
        </Text>
        <View style={{ flex: 1 }} />
        {onPress ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
            <Text style={{ color: tone, fontWeight: '600', fontSize: 15 }}>Aylık tabloyu gör</Text>
            <Ionicons name="arrow-forward" size={15} color={tone} />
          </View>
        ) : null}
      </View>
      {onPress ? <GlowChevron /> : null}
    </Pressable>
  );
}

export interface KpiItem {
  key: string;
  label: string;
  value: string;
  valueColor?: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  caption: string;
}

// Gelir / Gider / Tasarruf oranı: ikon dairesi, etiket ve değişim cümlesi solda, tutar sağda.
export function KpiList({ items }: { items: KpiItem[] }) {
  const theme = useTheme();
  return (
    <View style={{ backgroundColor: theme.colors.surfacePrimary, borderRadius: theme.radius.widget, paddingHorizontal: theme.spacing.md }}>
      {items.map((item, index) => (
        <View
          key={item.key}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            paddingVertical: 12,
            borderTopWidth: index === 0 ? 0 : 1,
            borderTopColor: theme.colors.separator,
          }}
        >
          <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(item.iconColor, 0.18) }}>
            <Ionicons name={item.icon} size={20} color={item.iconColor} />
          </View>
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <Text style={{ fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
              {item.label}
            </Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {item.caption}
            </Text>
          </View>
          <Text tabular style={{ fontSize: 18, fontWeight: '700', color: item.valueColor }} numberOfLines={1}>
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Kart başlığındaki renk açıklaması (● Gider ● Gelir). */
export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      {items.map((l) => (
        <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: l.color }} />
          <Text variant="caption" color="textSecondary">
            {l.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

// Eksen etiketi: 60B (bin), 1,5Mn (milyon).
function compactAxis(valueTl: number): string {
  if (valueTl === 0) return '0';
  const trim = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
  if (valueTl >= 1_000_000) return `${trim(valueTl / 1_000_000)}Mn`;
  if (valueTl >= 1000) return `${trim(valueTl / 1000)}B`;
  return trim(valueTl);
}

// Son 6 ay: sol eksen + kılavuz çizgileriyle gider ve gelir çift sütun; son ay etiketi vurgulu.
export function MonthBars({ data, expenseColor, incomeColor }: { data: MonthlyTotal[]; expenseColor: string; incomeColor: string }) {
  const theme = useTheme();
  const maxTl = Math.max(1, ...data.flatMap((d) => [d.incomeMinor, d.expenseMinor])) / 100;
  // Eksen üçe bölünür; adım 10'un katına yuvarlanır (60B → 40B → 20B → 0).
  const unit = Math.pow(10, Math.floor(Math.log10(Math.max(maxTl, 3) / 3)));
  const axisMax = Math.max(3 * unit, Math.ceil(maxTl / (3 * unit)) * 3 * unit);
  const ticks = [3, 2, 1, 0].map((i) => (axisMax * i) / 3);
  const barHeight = 104;
  const axisWidth = 36;
  const barOf = (minor: number) => Math.max(minor > 0 ? 3 : 0, (minor / 100 / axisMax) * barHeight);
  const last = data.length - 1;
  return (
    <View>
      <View
        accessible
        accessibilityLabel={data.map((m) => `${m.label}: gelir ${wholeAmount(m.incomeMinor)}, gider ${wholeAmount(m.expenseMinor)}`).join('. ')}
        style={{ height: barHeight + 8, paddingTop: 4 }}
      >
        {ticks.map((tick, i) => (
          <View
            key={i}
            pointerEvents="none"
            style={{ position: 'absolute', left: 0, right: 0, top: 4 + (i / 3) * barHeight - 8, height: 16, flexDirection: 'row', alignItems: 'center' }}
          >
            <Text variant="caption" color="textSecondary" tabular style={{ width: axisWidth }}>
              {compactAxis(tick)}
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.separator }} />
          </View>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: barHeight, marginLeft: axisWidth }}>
          {data.map((m) => (
            <View key={m.monthKey} style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3 }}>
              <View style={{ width: 13, height: barOf(m.expenseMinor), borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: expenseColor }} />
              <View style={{ width: 13, height: barOf(m.incomeMinor), borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: incomeColor }} />
            </View>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginLeft: axisWidth, marginTop: 6 }}>
        {data.map((m, i) => (
          <Text
            key={m.monthKey}
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 12,
              fontWeight: i === last ? '600' : '400',
              color: i === last ? theme.colors.textPrimary : theme.colors.textSecondary,
            }}
          >
            {m.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

// Son 6 ayın tablo hâli (ok düğmesinden açılan alt sayfa): ay, gelir, gider, net.
export function MonthTable({ data }: { data: MonthlyTotal[] }) {
  const theme = useTheme();
  const rows = [...data].reverse();
  const cell = { width: 92, textAlign: 'right' as const, fontSize: 14 };
  return (
    <View style={{ backgroundColor: theme.colors.backgroundPrimary, borderRadius: theme.radius.group, paddingHorizontal: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', paddingVertical: 10 }}>
        <Text variant="caption" color="textSecondary" style={{ flex: 1, fontWeight: '600' }}>
          Ay
        </Text>
        <Text variant="caption" color="textSecondary" style={{ ...cell, fontSize: 12, fontWeight: '600' }}>
          Gelir
        </Text>
        <Text variant="caption" color="textSecondary" style={{ ...cell, fontSize: 12, fontWeight: '600' }}>
          Gider
        </Text>
        <Text variant="caption" color="textSecondary" style={{ ...cell, fontSize: 12, fontWeight: '600' }}>
          Net
        </Text>
      </View>
      {rows.map((m) => {
        const net = m.incomeMinor - m.expenseMinor;
        return (
          <View key={m.monthKey} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.colors.separator }}>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '500' }}>{m.label}</Text>
            <Text tabular style={{ ...cell, color: theme.colors.receivable }}>
              {wholeAmount(m.incomeMinor)}
            </Text>
            <Text tabular style={cell}>
              {wholeAmount(m.expenseMinor)}
            </Text>
            <Text tabular style={{ ...cell, fontWeight: '600', color: net < 0 ? theme.colors.danger : theme.colors.textPrimary }}>
              {net < 0 ? '−' : ''}
              {wholeAmount(Math.abs(net))}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function CategoryRows({
  items,
  previous,
  emptyLabel,
  goodWhenDown,
  barColor,
  limit = 8,
}: {
  items: CategoryBreakdownItem[];
  /** Önceki dönemin kategori toplamları (ad → kuruş). */
  previous: Map<string, number> | null;
  emptyLabel: string;
  goodWhenDown: boolean;
  barColor: string;
  limit?: number;
}) {
  const theme = useTheme();
  if (items.length === 0) {
    return (
      <Text variant="body" color="textSecondary">
        {emptyLabel}
      </Text>
    );
  }
  const shown = items.slice(0, limit);
  return (
    <View>
      {shown.map((item, index) => {
        const before = previous?.get(item.name) ?? null;
        const pct = before && before > 0 ? Math.round(((item.amountMinor - before) / before) * 100) : null;
        return (
          <View
            key={item.categoryId ?? 'uncategorized'}
            accessible
            accessibilityLabel={`${item.name}: ${wholeAmount(item.amountMinor)}, toplamın yüzde ${Math.round(item.percentage * 100)}${pct !== null ? `, önceki döneme göre yüzde ${pct}` : ''}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              paddingVertical: 10,
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: theme.colors.separator,
            }}
          >
            <CategoryIcon icon={item.icon} color={item.color} size={40} />
            <View style={{ flex: 1, gap: 8, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text numberOfLines={1} style={{ flex: 1, fontWeight: '500' }}>
                  {item.name}
                </Text>
                {pct !== null && pct !== 0 ? (
                  <Text
                    tabular
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: (goodWhenDown ? pct < 0 : pct > 0) ? theme.colors.receivable : theme.colors.textSecondary,
                    }}
                  >
                    {pct > 0 ? '+' : '−'}%{Math.abs(pct)}
                  </Text>
                ) : null}
                <Text tabular style={{ fontWeight: '600' }}>
                  {formatMinorAmount(item.amountMinor)}
                </Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.fill, overflow: 'hidden' }}>
                <View style={{ width: `${Math.max(2, item.percentage * 100)}%`, height: 6, borderRadius: 3, backgroundColor: barColor }} />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// Borç ve alacak: Ödenecek, Tahsil edilecek ve (varsa) Gecikmiş; her satır kayıt sayısıyla.
export function DebtRows({
  payableMinor,
  payableCount,
  receivableMinor,
  receivableCount,
  overdueMinor,
  overdueCount,
  onPress,
}: {
  payableMinor: number;
  payableCount: number;
  receivableMinor: number;
  receivableCount: number;
  overdueMinor: number;
  overdueCount: number;
  onPress: (key: 'payable' | 'receivable' | 'overdue') => void;
}) {
  const theme = useTheme();
  const rows: { key: 'payable' | 'receivable' | 'overdue'; label: string; count: number; value: number; icon: keyof typeof Ionicons.glyphMap; tone: string }[] = [
    { key: 'payable', label: 'Ödenecek', count: payableCount, value: payableMinor, icon: 'arrow-up', tone: theme.colors.danger },
    { key: 'receivable', label: 'Tahsil edilecek', count: receivableCount, value: receivableMinor, icon: 'arrow-down', tone: theme.colors.receivable },
  ];
  if (overdueCount > 0) {
    rows.push({ key: 'overdue', label: 'Gecikmiş', count: overdueCount, value: overdueMinor, icon: 'time', tone: theme.colors.danger });
  }
  return (
    <View>
      {rows.map((r, index) => (
        <Pressable
          key={r.key}
          accessibilityRole="button"
          accessibilityLabel={`${r.label}: ${formatMinorAmount(r.value)}, ${r.count} kayıt`}
          onPress={() => onPress(r.key)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            paddingVertical: 10,
            borderTopWidth: index === 0 ? 0 : 1,
            borderTopColor: theme.colors.separator,
          }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(r.tone, 0.18) }}>
            <Ionicons name={r.icon} size={18} color={r.tone} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontWeight: '500' }} numberOfLines={1}>
              {r.label}
            </Text>
            <Text variant="caption" color="textSecondary">
              {r.count} kayıt
            </Text>
          </View>
          <Text tabular style={{ fontSize: 17, fontWeight: '700', color: r.tone }} numberOfLines={1}>
            {formatMinorAmount(r.value)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function EmptyText({ text }: { text: string }) {
  return (
    <Text variant="body" color="textSecondary" style={{ paddingVertical: 8 }}>
      {text}
    </Text>
  );
}

export function CounterpartyRows({ items }: { items: CounterpartyBreakdownItem[] }) {
  const theme = useTheme();
  if (items.length === 0) return <EmptyText text="Bu dönemde kişi veya firma hareketi yok." />;
  return (
    <View>
      {items.map((item, index) => (
        <View
          key={item.counterpartyId}
          style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: 10, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: theme.colors.separator }}
        >
          <PersonAvatar name={item.name} size={36} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontWeight: '500' }}>
              {item.name}
            </Text>
            <Text variant="caption" color="textSecondary">
              {item.count} hareket
            </Text>
          </View>
          <Text tabular style={{ fontWeight: '600' }}>
            {formatMinorAmount(item.amountMinor)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function CashFlowRows({ buckets }: { buckets: CashFlowBucket[] }) {
  const theme = useTheme();
  const hasData = buckets.some((b) => b.payableMinor > 0 || b.receivableMinor > 0);
  if (!hasData) return <EmptyText text="Önümüzdeki 30 günde vadesi gelen kayıt yok." />;
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
            style={{ gap: 6, paddingVertical: 10, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: theme.colors.separator }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '500' }}>{b.label}</Text>
              <Text tabular style={{ fontWeight: '600', color: net >= 0 ? theme.colors.receivable : theme.colors.danger }}>
                {net >= 0 ? '+' : '−'}
                {formatMinorAmount(Math.abs(net))}
              </Text>
            </View>
            {[
              { value: b.payableMinor, color: theme.colors.danger },
              { value: b.receivableMinor, color: theme.colors.receivable },
            ].map((bar, i) => (
              <View key={i} style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.fill, overflow: 'hidden' }}>
                <View style={{ width: `${Math.max(bar.value > 0 ? 2 : 0, (bar.value / max) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: bar.color }} />
              </View>
            ))}
          </View>
        );
      })}
      <View style={{ paddingTop: 10 }}>
        <ChartLegend
          items={[
            { label: 'Çıkış', color: theme.colors.danger },
            { label: 'Giriş', color: theme.colors.receivable },
          ]}
        />
      </View>
    </View>
  );
}

export function AccountRows({ items }: { items: AccountBalanceReportItem[] }) {
  const theme = useTheme();
  if (items.length === 0) return <EmptyText text="Henüz hesap yok." />;
  return (
    <View>
      {items.map((item, index) => (
        <View
          key={item.accountId}
          style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: 10, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: theme.colors.separator }}
        >
          <BankLogo bankCode={item.bankCode} fallbackIcon="wallet-outline" size={36} />
          <Text numberOfLines={1} style={{ flex: 1, fontWeight: '500' }}>
            {item.name}
          </Text>
          <Text tabular style={{ fontWeight: '600', color: item.balanceMinor < 0 ? theme.colors.danger : theme.colors.textPrimary }}>
            {formatMinorAmount(item.balanceMinor, item.currencyCode)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function RateRows({ rates, ageText, limit }: { rates: ValueUnitRate[]; ageText: string | null; limit?: number }) {
  const theme = useTheme();
  if (rates.length === 0) return <EmptyText text="Kur bilgisi bulunamadı." />;
  const shown = limit ? rates.slice(0, limit) : rates;
  return (
    <View>
      {shown.map((rate, index) => {
        const stale = isRateStale(rate.cached_at);
        return (
          <View
            key={rate.unit_code}
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: 9, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: theme.colors.separator }}
          >
            <ValueUnitBadge unitCode={rate.unit_code} size={28} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 15 }}>
              {getValueUnit(rate.unit_code).name}
            </Text>
            {stale ? <Tag label="eski" tone="brand" /> : null}
            <Text tabular style={{ fontSize: 15, fontWeight: '600' }}>
              {formatMinorAmount(rate.try_equivalent_minor)}
            </Text>
          </View>
        );
      })}
      {ageText ? (
        <Text variant="caption" color="textSecondary" style={{ textAlign: 'right', marginTop: 4 }}>
          {ageText}
        </Text>
      ) : null}
    </View>
  );
}

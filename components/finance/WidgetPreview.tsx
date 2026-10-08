import type { ReactNode } from 'react';
import { Image, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { darkColors, withAlpha } from '@/theme/colors';
import { Text } from '@/components/primitives';
import { BANK_LOGOS } from '@/features/banks/banks';

export type WidgetKind =
  | 'next'
  | 'week'
  | 'upcoming'
  | 'summary'
  | 'lockDays'
  | 'lockNext'
  | 'lockInline'
  | 'lockNet';

// Ayarlar › Widget'lar önizlemesi: targets/widget/Widgets.swift'in RN karşılığı. Widget'lar her
// zaman koyu çizildiği için uygulamanın temasından bağımsız olarak koyu renklerle çizilir.
const c = darkColors;
const LOCK_INK = '#FFFFFF';
const LOCK_SURFACE = 'rgba(255,255,255,0.18)';

const SAMPLE = [
  { date: 'Yarın', title: 'Kuzey Lojistik', kind: 'çek', when: 'yarın', amount: '₺48.250', bank: 'akbank', tint: c.brandPrimary },
  { date: '9 Eki', title: 'Anadolu Ambalaj', kind: 'senet', when: '4 gün', amount: '+₺18.000', receivable: true, tint: c.textSecondary },
  { date: '12 Eki', title: 'Konut kredisi', kind: 'kredi', when: '7 gün', amount: '₺14.872', bank: 'turkiye-garanti-bankasi', tint: c.textSecondary },
  { date: '15 Eki', title: 'Bonus ekstresi', kind: 'ekstre', when: '10 gün', amount: '₺23.419', bank: 'turkiye-garanti-bankasi', tint: c.textSecondary },
];

function Card({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  return (
    <View style={{ width, height, borderRadius: 22, padding: 14, backgroundColor: c.surfacePrimary, overflow: 'hidden' }}>
      {children}
    </View>
  );
}

function Label({ children }: { children: string }) {
  return <Text style={{ fontSize: 11, fontWeight: '600', color: c.textSecondary }}>{children}</Text>;
}

function Mark({ bank, receivable, size = 24 }: { bank?: string; receivable?: boolean; size?: number }) {
  const source = bank ? BANK_LOGOS[bank] : undefined;
  if (source) {
    return <Image source={source} style={{ width: size, height: size, borderRadius: size * 0.25 }} />;
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.25,
        backgroundColor: c.fill,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={receivable ? 'arrow-down' : 'arrow-up'} size={size * 0.5} color={receivable ? c.receivable : c.payable} />
    </View>
  );
}

function Lock({ width, height, round, children }: { width: number; height: number; round?: boolean; children: ReactNode }) {
  return (
    <View
      style={{
        width,
        height,
        borderRadius: round ? height / 2 : 14,
        backgroundColor: LOCK_SURFACE,
        alignItems: round ? 'center' : 'flex-start',
        justifyContent: 'center',
        paddingHorizontal: round ? 0 : 12,
      }}
    >
      {children}
    </View>
  );
}

export function WidgetPreview({ kind }: { kind: WidgetKind }) {
  const first = SAMPLE[0];
  switch (kind) {
    case 'next':
      return (
        <Card width={158} height={158}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Mark bank={first.bank} />
            <View style={{ height: 20, paddingHorizontal: 7, borderRadius: 6, justifyContent: 'center', backgroundColor: withAlpha(c.brandPrimary, 0.14) }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: c.brandPrimary }}>Yarın</Text>
            </View>
          </View>
          <View style={{ flex: 1 }} />
          <Label>Sıradaki vade</Label>
          <Text tabular style={{ fontSize: 22, fontWeight: '700', color: c.textPrimary, marginTop: 2 }}>
            {first.amount}
          </Text>
          <Text numberOfLines={1} style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>
            {first.title} · {first.kind}
          </Text>
        </Card>
      );
    case 'week':
      return (
        <Card width={158} height={158}>
          <Label>Bu hafta</Label>
          <View style={{ marginTop: 8, gap: 2 }}>
            <Text style={{ fontSize: 12, color: c.textSecondary }}>Ödenecek</Text>
            <Text tabular style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary }}>₺48.250</Text>
          </View>
          <View style={{ marginTop: 8, gap: 2 }}>
            <Text style={{ fontSize: 12, color: c.textSecondary }}>Tahsil edilecek</Text>
            <Text tabular style={{ fontSize: 17, fontWeight: '700', color: c.receivable }}>₺18.000</Text>
          </View>
          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: 'row', height: 5, borderRadius: 3, overflow: 'hidden' }}>
            <View style={{ flex: 73, backgroundColor: c.textSecondary }} />
            <View style={{ flex: 27, backgroundColor: c.receivable }} />
          </View>
        </Card>
      );
    case 'upcoming':
      return (
        <Card width={338} height={158}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Label>Yaklaşan vadeler</Label>
            <Image source={require('@/assets/icon.png')} style={{ width: 18, height: 18, borderRadius: 5 }} />
          </View>
          <View style={{ marginTop: 12, gap: 8 }}>
            {SAMPLE.slice(0, 3).map((row) => (
              <View key={row.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text tabular style={{ width: 44, fontSize: 13, fontWeight: '700', color: row.tint }}>
                  {row.date}
                </Text>
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: c.textSecondary }}>
                  {row.title} · {row.kind}
                </Text>
                <Text tabular style={{ fontSize: 15, fontWeight: '600', color: row.receivable ? c.receivable : c.textPrimary }}>
                  {row.amount}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      );
    case 'summary':
      return (
        <Card width={338} height={330}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Label>Çalışma alanınız</Label>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: c.brandPrimary }}>
              <Ionicons name="scan-outline" size={13} color={c.brandPrimaryText} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: c.brandPrimaryText }}>Tara</Text>
            </View>
          </View>
          <Text style={{ fontSize: 12, color: c.textSecondary, marginTop: 8 }}>Toplam bakiye</Text>
          <Text tabular style={{ fontSize: 30, fontWeight: '700', color: c.textPrimary }}>₺99.521,05</Text>
          <Text style={{ fontSize: 12, color: c.textSecondary, marginTop: 8 }}>
            Alacak <Text style={{ fontSize: 12, fontWeight: '600', color: c.receivable }}>₺18.000</Text>
            {'    '}Borç <Text style={{ fontSize: 12, fontWeight: '600', color: c.textPrimary }}>₺101.590</Text>
          </Text>
          <View style={{ height: 1, backgroundColor: c.separator, marginTop: 12 }} />
          <View style={{ marginTop: 12, gap: 10 }}>
            {SAMPLE.map((row) => (
              <View key={row.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Mark bank={row.bank} receivable={row.receivable} />
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: c.textPrimary }}>
                  {row.title} · {row.when}
                </Text>
                <Text tabular style={{ fontSize: 15, fontWeight: '600', color: row.receivable ? c.receivable : c.textPrimary }}>
                  {row.amount}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      );
    case 'lockDays':
      return (
        <Lock width={72} height={72} round>
          <View style={{ position: 'absolute', top: 6, left: 6, right: 6, bottom: 6, borderRadius: 30, borderWidth: 5, borderColor: withAlpha(LOCK_INK, 0.9) }} />
          <Text style={{ fontSize: 20, fontWeight: '700', color: LOCK_INK, lineHeight: 22 }}>1</Text>
          <Text style={{ fontSize: 9, fontWeight: '600', color: LOCK_INK }}>GÜN</Text>
        </Lock>
      );
    case 'lockNext':
      return (
        <Lock width={170} height={72}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: 0.8 }}>
            <Ionicons name="calendar" size={11} color={LOCK_INK} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: LOCK_INK }}>SIRADAKİ VADE</Text>
          </View>
          <Text tabular style={{ fontSize: 16, fontWeight: '700', color: LOCK_INK }}>₺48.250,00</Text>
          <Text numberOfLines={1} style={{ fontSize: 12, color: LOCK_INK, opacity: 0.85 }}>
            Kuzey Lojistik · yarın
          </Text>
        </Lock>
      );
    case 'lockInline':
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="document-text" size={15} color={LOCK_INK} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: LOCK_INK }}>Çek yarın ₺48.250</Text>
        </View>
      );
    case 'lockNet':
      return (
        <Lock width={72} height={72} round>
          <Text style={{ fontSize: 9, fontWeight: '700', color: LOCK_INK, opacity: 0.8 }}>BU AY</Text>
          <Text style={{ fontSize: 15, fontWeight: '700', color: LOCK_INK }}>+35K</Text>
          <Text style={{ fontSize: 9, fontWeight: '600', color: LOCK_INK, opacity: 0.8 }}>NET</Text>
        </Lock>
      );
  }
}

/** Önizlemenin arkasındaki sahne: ana ekran widget'ları koyu zeminde, kilit ekranı widget'ları duvar kâğıdı tonunda. */
export function WidgetStage({ lock, children }: { lock?: boolean; children: ReactNode }) {
  return (
    <View
      style={{
        borderRadius: 20,
        paddingVertical: 24,
        paddingHorizontal: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: lock ? '#3A3550' : c.backgroundPrimary,
      }}
    >
      {children}
    </View>
  );
}

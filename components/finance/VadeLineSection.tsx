import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Pressable, Text } from '@/components/primitives';
import { sumToReferenceMinor } from '@/features/valueUnits/api';
import type { ObligationDueItem } from '@/features/obligations/api';
import { VadeLine, type VadeLineDay } from './VadeLine';

type Rates = Parameters<typeof sumToReferenceMinor>[1];

const RANGES = [
  { key: 7, label: '7G' },
  { key: 30, label: '30G' },
  { key: 90, label: '90G' },
] as const;

// Çok sütunda barlar ince kalır; 90 günde 3'er günlük kovalar kullanılır.
const BUCKET_DAYS: Record<number, number> = { 7: 1, 30: 1, 90: 3 };

function iso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export interface VadeLineSectionProps {
  obligations: ObligationDueItem[];
  rates: Rates;
}

// Ana sayfadaki "Vade hattı": bugünden itibaren bekleyen kayıtların gün gün ödenecek/tahsil dağılımı.
// Gecikmiş kayıtlar (bugünden önce) hatta girmez; onlar özet bölümündeki gecikme satırında.
export function VadeLineSection({ obligations, rates }: VadeLineSectionProps) {
  const theme = useTheme();
  const [range, setRange] = useState<7 | 30 | 90>(30);

  const days = useMemo<VadeLineDay[]>(() => {
    const bucketSize = BUCKET_DAYS[range];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const count = Math.ceil(range / bucketSize);

    const buckets = Array.from({ length: count }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i * bucketSize);
      return { date: iso(d), payable: [] as ObligationDueItem[], receivable: [] as ObligationDueItem[] };
    });

    for (const o of obligations) {
      if (!o.due_date || o.remaining_amount_minor <= 0) continue;
      const due = new Date(o.due_date);
      due.setHours(0, 0, 0, 0);
      const offset = Math.round((due.getTime() - start.getTime()) / 86_400_000);
      if (offset < 0 || offset >= range) continue;
      const bucket = buckets[Math.floor(offset / bucketSize)];
      (o.direction === 'payable' ? bucket.payable : bucket.receivable).push(o);
    }

    const sum = (items: ObligationDueItem[]) =>
      sumToReferenceMinor(
        items.map((o) => ({ amountMinor: o.remaining_amount_minor, unitCode: o.currency_code })),
        rates
      );

    return buckets.map((b) => ({
      date: b.date,
      payableMinor: sum(b.payable),
      receivableMinor: sum(b.receivable),
    }));
  }, [obligations, rates, range]);

  return (
    <View style={{ gap: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="sectionTitle">Vade hattı</Text>
        <View style={{ flexDirection: 'row', gap: 2 }}>
          {RANGES.map((r) => {
            const active = r.key === range;
            return (
              <Pressable
                key={r.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${r.key} gün`}
                onPress={() => setRange(r.key)}
                style={{
                  minWidth: theme.touchTarget.minimum,
                  height: theme.touchTarget.minimum,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 8,
                  backgroundColor: active ? theme.colors.surfacePrimary : 'transparent',
                }}
              >
                <Text
                  variant="label"
                  style={{
                    textTransform: 'none',
                    fontSize: 12,
                    color: active ? theme.colors.textPrimary : theme.colors.textSecondary,
                    fontWeight: active ? '600' : '500',
                  }}
                >
                  {r.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <VadeLine days={days} />
    </View>
  );
}

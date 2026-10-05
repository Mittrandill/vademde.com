import { View } from 'react-native';

import { Text } from '@/components/primitives';
import { MONTH_NAMES } from '@/components/primitives/MonthStepper';
import { useTheme } from '@/theme';
import { formatMinorAmount } from '@/utils/money';

export interface VadeLineDay {
  /** YYYY-MM-DD */
  date: string;
  /** Ödenecek (eksenin üstü, payable). */
  payableMinor: number;
  /** Tahsil edilecek (eksenin altı, receivable). */
  receivableMinor: number;
}

export interface VadeLineProps {
  /** Soldan sağa ardışık günler; ilk gün "bugün" kabul edilir. */
  days: VadeLineDay[];
  currencyCode?: string;
  /** Eksenin her bir yarısının yüksekliği. */
  halfHeight?: number;
}

const wholeAmount = (minor: number, currency: string) =>
  formatMinorAmount(minor, currency).replace(/,00(?=\D*$)/, '');

function dayLabel(iso: string) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTH_NAMES[m - 1].slice(0, 3)}`;
}

// HANDOFF §3 — Vade hattı: eksenin üstü payable, altı receivable, solda "bugün" işareti.
// Gün başına bir sütun; yükseklik, görünür aralıktaki en büyük günlük tutara göre ölçeklenir.
export function VadeLine({ days, currencyCode = 'TRY', halfHeight = 64 }: VadeLineProps) {
  const theme = useTheme();
  if (days.length === 0) return null;

  const max = Math.max(1, ...days.flatMap((d) => [d.payableMinor, d.receivableMinor]));
  const totalPayable = days.reduce((s, d) => s + d.payableMinor, 0);
  const totalReceivable = days.reduce((s, d) => s + d.receivableMinor, 0);
  const peak = days.reduce((best, d) => (d.payableMinor > best.payableMinor ? d : best), days[0]);

  // Etiketler: bugün + dört eşit aralıklı gün (sütun sayısından bağımsız).
  const labelIdx = Array.from(new Set([0, 1, 2, 3, 4].map((i) => Math.round((i * (days.length - 1)) / 4))));

  const summary = `Ödenecek ${wholeAmount(totalPayable, currencyCode)}, tahsil ${wholeAmount(totalReceivable, currencyCode)}`;

  return (
    <View accessible accessibilityLabel={`Vade hattı. ${summary}`} style={{ gap: theme.spacing.xs }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="label" color="textSecondary" tabular style={{ textTransform: 'none' }}>
          Ödenecek {wholeAmount(totalPayable, currencyCode)}
        </Text>
        {peak.payableMinor > 0 ? (
          <Text variant="label" color="textSecondary" tabular style={{ textTransform: 'none' }}>
            en yüksek: {dayLabel(peak.date)}
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 3 }}>
        {days.map((d, index) => {
          const up = Math.round((d.payableMinor / max) * halfHeight);
          const down = Math.round((d.receivableMinor / max) * halfHeight);
          return (
            <View key={d.date} style={{ flex: 1, alignItems: 'center' }}>
              <View style={{ height: halfHeight, width: '100%', justifyContent: 'flex-end' }}>
                {up > 0 ? (
                  <View
                    style={{
                      height: Math.max(up, 3),
                      backgroundColor: theme.colors.payable,
                      borderTopLeftRadius: 3,
                      borderTopRightRadius: 3,
                    }}
                  />
                ) : null}
              </View>
              {/* Eksen çentiği: yalnızca "bugün" görünür. */}
              <View
                style={{
                  height: 9,
                  width: 1,
                  marginVertical: -4,
                  backgroundColor: index === 0 ? theme.colors.textPrimary : 'transparent',
                }}
              />
              <View style={{ height: halfHeight, width: '100%' }}>
                {down > 0 ? (
                  <View
                    style={{
                      height: Math.max(down, 3),
                      backgroundColor: theme.colors.receivable,
                      borderBottomLeftRadius: 3,
                      borderBottomRightRadius: 3,
                    }}
                  />
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {labelIdx.map((i) => (
          <Text
            key={i}
            variant="label"
            color={i === 0 ? 'textPrimary' : 'textSecondary'}
            tabular
            style={{ textTransform: 'none', fontWeight: i === 0 ? '600' : '500' }}
          >
            {i === 0 ? 'Bugün' : dayLabel(days[i].date)}
          </Text>
        ))}
      </View>

      <Text variant="label" color="textSecondary" tabular style={{ textTransform: 'none' }}>
        Tahsil {wholeAmount(totalReceivable, currencyCode)}
      </Text>
    </View>
  );
}

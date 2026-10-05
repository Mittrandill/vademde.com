import { View } from 'react-native';

import { Text } from '@/components/primitives';
import { useTheme } from '@/theme';

export type InstallmentStatus = 'paid' | 'next' | 'upcoming' | 'overdue';

export interface InstallmentStripItem {
  status: InstallmentStatus;
  /** YYYY-MM-DD — yalnızca >24 taksitte yıl işaretleri için gerekir. */
  dueDate?: string;
}

export interface InstallmentStripProps {
  items: InstallmentStripItem[];
  height?: number;
}

// HANDOFF §3 — ≤24 taksit parçalı; >24 taksitte yıl işaretli sürekli çubuk.
export const SEGMENTED_LIMIT = 24;

export function InstallmentStrip({ items, height = 10 }: InstallmentStripProps) {
  const theme = useTheme();
  if (items.length === 0) return null;

  const paid = items.filter((i) => i.status === 'paid').length;
  const summary = `${items.length} taksitin ${paid} tanesi ödendi`;

  const colorOf = (status: InstallmentStatus) =>
    status === 'paid'
      ? theme.colors.textPrimary
      : status === 'next'
        ? theme.colors.payable
        : status === 'overdue'
          ? theme.colors.danger
          : theme.colors.mutedControl;

  if (items.length <= SEGMENTED_LIMIT) {
    return (
      <View accessible accessibilityLabel={summary} style={{ flexDirection: 'row', gap: 3, height }}>
        {items.map((item, index) => (
          <View
            key={index}
            style={{
              flex: 1,
              borderRadius: height / 2,
              backgroundColor: item.status === 'upcoming' ? 'transparent' : colorOf(item.status),
              borderWidth: item.status === 'upcoming' ? 1.5 : 0,
              borderColor: theme.colors.mutedControl,
            }}
          />
        ))}
      </View>
    );
  }

  // Sürekli çubuk: ödenen kısım dolu, sıradaki taksit payable işareti, kalan iz rengi.
  const pct = (n: number) => `${(n / items.length) * 100}%` as const;
  const nextIndex = items.findIndex((i) => i.status === 'next');
  const overdueCount = items.filter((i) => i.status === 'overdue').length;

  // Yıl işaretleri: yılın değiştiği ilk taksitin konumunda.
  const yearMarks: { left: `${number}%`; year: string }[] = [];
  let lastYear = '';
  items.forEach((item, index) => {
    const year = item.dueDate?.slice(0, 4);
    if (year && year !== lastYear) {
      yearMarks.push({ left: pct(index) as `${number}%`, year });
      lastYear = year;
    }
  });

  return (
    <View accessible accessibilityLabel={summary} style={{ gap: theme.spacing.xxs }}>
      <View
        style={{
          height,
          borderRadius: height / 2,
          backgroundColor: theme.colors.border,
          overflow: 'hidden',
          flexDirection: 'row',
        }}
      >
        <View style={{ width: pct(paid), backgroundColor: theme.colors.textPrimary }} />
        {overdueCount > 0 ? (
          <View style={{ width: pct(overdueCount), backgroundColor: theme.colors.danger }} />
        ) : null}
        {nextIndex >= 0 ? (
          <View style={{ width: pct(1), minWidth: 3, backgroundColor: theme.colors.payable }} />
        ) : null}
      </View>
      <View style={{ height: 14 }}>
        {yearMarks.map((mark) => (
          <Text
            key={mark.year}
            variant="label"
            color="textSecondary"
            tabular
            style={{ position: 'absolute', left: mark.left, fontSize: 10, textTransform: 'none' }}
          >
            {mark.year}
          </Text>
        ))}
      </View>
    </View>
  );
}

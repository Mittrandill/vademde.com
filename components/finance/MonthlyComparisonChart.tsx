import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Card, Row, Stack, Text } from '@/components/primitives';
import { Amount } from './Amount';
import { formatMinorAmount } from '@/utils/money';
import type { MonthlyTotal } from '@/features/reports/api';

export interface MonthlyComparisonChartProps {
  data: MonthlyTotal[];
}

// docs/08-tasarim-sistemi.md §12.19 — "Grafiklerin metinsel özeti": her satır net tutarı
// metin olarak da gösterir ve accessibilityLabel ile gelir/gider değerlerini okutur.
export function MonthlyComparisonChart({ data }: MonthlyComparisonChartProps) {
  const theme = useTheme();
  const maxValue = Math.max(1, ...data.flatMap((d) => [d.incomeMinor, d.expenseMinor]));

  return (
    <Card>
      <Stack gap="md">
        <Text variant="sectionTitle">Aylık Karşılaştırma</Text>
        <Stack gap="md">
          {data.map((month) => {
            const netMinor = month.incomeMinor - month.expenseMinor;
            return (
              <Row
                key={month.monthKey}
                gap="sm"
                align="center"
                accessibilityLabel={`${month.label}: gelir ${formatMinorAmount(month.incomeMinor)}, gider ${formatMinorAmount(month.expenseMinor)}`}
              >
                <Text variant="caption" color="textSecondary" style={{ width: 32 }}>
                  {month.label}
                </Text>
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.border, overflow: 'hidden' }}>
                    <View
                      style={{
                        height: '100%',
                        width: `${Math.max(2, (month.incomeMinor / maxValue) * 100)}%`,
                        borderRadius: 3,
                        backgroundColor: theme.colors.success,
                      }}
                    />
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.border, overflow: 'hidden' }}>
                    <View
                      style={{
                        height: '100%',
                        width: `${Math.max(2, (month.expenseMinor / maxValue) * 100)}%`,
                        borderRadius: 3,
                        backgroundColor: theme.colors.accentAqua,
                      }}
                    />
                  </View>
                </Stack>
                <Amount
                  amountMinor={Math.abs(netMinor)}
                  direction={netMinor >= 0 ? 'income' : 'expense'}
                  variant="caption"
                  style={{ width: 76, textAlign: 'right' }}
                />
              </Row>
            );
          })}
        </Stack>
        <Row gap="md" align="center">
          <Row gap="xxs" align="center">
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.success }} />
            <Text variant="caption" color="textSecondary">
              Gelir
            </Text>
          </Row>
          <Row gap="xxs" align="center">
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.accentAqua }} />
            <Text variant="caption" color="textSecondary">
              Gider
            </Text>
          </Row>
        </Row>
      </Stack>
    </Card>
  );
}

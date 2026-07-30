import { Card, Row, Stack, Text } from '@/components/primitives';
import { Amount } from './Amount';
import type { CashFlowBucket } from '@/features/reports/api';

export interface CashFlowForecastListProps {
  buckets: CashFlowBucket[];
}

export function CashFlowForecastList({ buckets }: CashFlowForecastListProps) {
  const hasData = buckets.some((b) => b.payableMinor > 0 || b.receivableMinor > 0);

  return (
    <Card>
      <Stack gap="sm">
        <Text variant="sectionTitle">Beklenen Nakit Akışı (30 Gün)</Text>
        {!hasData ? (
          <Text variant="body" color="textSecondary">
            Önümüzdeki 30 günde vadesi gelen kayıt yok.
          </Text>
        ) : (
          <Stack gap="sm">
            {buckets.map((bucket) => {
              const netMinor = bucket.receivableMinor - bucket.payableMinor;
              return (
                <Stack key={bucket.label} gap="xxs">
                  <Row align="center">
                    <Text variant="body" style={{ flex: 1 }}>
                      {bucket.label}
                    </Text>
                    <Amount amountMinor={Math.abs(netMinor)} direction={netMinor >= 0 ? 'income' : 'expense'} variant="body" />
                  </Row>
                  <Row gap="md">
                    <Text variant="caption" color="textSecondary">
                      Alacak <Amount amountMinor={bucket.receivableMinor} direction="receivable" variant="caption" />
                    </Text>
                    <Text variant="caption" color="textSecondary">
                      Borç <Amount amountMinor={bucket.payableMinor} direction="payable" variant="caption" />
                    </Text>
                  </Row>
                </Stack>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

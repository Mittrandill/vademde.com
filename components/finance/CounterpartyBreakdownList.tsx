import { Card, Row, Stack, Text } from '@/components/primitives';
import { formatMinorAmount } from '@/utils/money';
import type { CounterpartyBreakdownItem } from '@/features/reports/api';

export interface CounterpartyBreakdownListProps {
  items: CounterpartyBreakdownItem[];
  limit?: number;
}

export function CounterpartyBreakdownList({ items, limit = 6 }: CounterpartyBreakdownListProps) {
  const visible = items.slice(0, limit);
  const remaining = items.length - visible.length;

  return (
    <Card>
      <Stack gap="sm">
        <Text variant="sectionTitle">Kişi / Firma Bazlı Hareketler</Text>
        {visible.length === 0 ? (
          <Text variant="body" color="textSecondary">
            Bu dönemde kişi/firma ile ilişkili hareket yok.
          </Text>
        ) : (
          <Stack gap="xs">
            {visible.map((item) => (
              <Row key={item.counterpartyId} align="center">
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="body">{item.name}</Text>
                  <Text variant="caption" color="textSecondary">
                    {item.count} hareket
                  </Text>
                </Stack>
                <Text variant="body" tabular>
                  {formatMinorAmount(item.amountMinor)}
                </Text>
              </Row>
            ))}
            {remaining > 0 ? (
              <Text variant="caption" color="textSecondary">
                +{remaining} kişi/firma daha
              </Text>
            ) : null}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

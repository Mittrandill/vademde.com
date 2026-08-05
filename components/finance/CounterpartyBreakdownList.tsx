import { Card, Row, Stack, Text } from '@/components/primitives';
import { Amount } from './Amount';
import { PersonAvatar } from './PersonAvatar';
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
              <Row key={item.counterpartyId} gap="sm" align="center">
                <PersonAvatar name={item.name} size={36} />
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="body">{item.name}</Text>
                  <Text variant="caption" color="textSecondary">
                    {item.count} hareket
                  </Text>
                </Stack>
                <Amount amountMinor={item.amountMinor} variant="body" />
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

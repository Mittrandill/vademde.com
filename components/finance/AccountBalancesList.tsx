import { Card, Row, Stack, Text } from '@/components/primitives';
import { formatMinorAmount } from '@/utils/money';
import type { AccountBalanceReportItem } from '@/features/reports/api';

export interface AccountBalancesListProps {
  items: AccountBalanceReportItem[];
}

export function AccountBalancesList({ items }: AccountBalancesListProps) {
  return (
    <Card>
      <Stack gap="sm">
        <Text variant="sectionTitle">Hesap Bakiyeleri</Text>
        {items.length === 0 ? (
          <Text variant="body" color="textSecondary">
            Henüz hesap yok.
          </Text>
        ) : (
          <Stack gap="xs">
            {items.map((item) => (
              <Row key={item.accountId} align="center">
                <Text variant="body" style={{ flex: 1 }}>
                  {item.name}
                </Text>
                <Text variant="body" tabular color={item.balanceMinor < 0 ? 'danger' : 'textPrimary'}>
                  {formatMinorAmount(item.balanceMinor, item.currencyCode)}
                </Text>
              </Row>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

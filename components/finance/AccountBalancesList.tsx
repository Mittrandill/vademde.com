import { Card, Row, Stack, Text } from '@/components/primitives';
import { Amount } from './Amount';
import { BankLogo } from './BankLogo';
import { ValueUnitBadge } from './ValueUnitPicker';
import { getValueUnit } from '@/features/valueUnits/units';
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
              <Row key={item.accountId} gap="sm" align="center">
                {item.type === 'cash' ? (
                  <ValueUnitBadge unitCode={item.currencyCode} size={36} />
                ) : (
                  <BankLogo bankCode={item.bankCode} fallbackName={!item.bankCode ? item.name : null} size={36} />
                )}
                <Text variant="body" style={{ flex: 1 }}>
                  {item.name}
                </Text>
                <Amount
                  amountMinor={item.balanceMinor}
                  currencyCode={item.currencyCode}
                  valueUnitType={item.type === 'cash' ? getValueUnit(item.currencyCode).unitType : undefined}
                  overdue={item.balanceMinor < 0}
                  variant="body"
                />
              </Row>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

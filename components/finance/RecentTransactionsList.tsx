import { router } from 'expo-router';

import { Card, Pressable, Row, Stack, Text } from '@/components/primitives';
import { Amount } from './Amount';
import type { TransactionWithRelations } from '@/features/transactions/api';

export interface RecentTransactionsListProps {
  transactions: TransactionWithRelations[];
}

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' });

export function RecentTransactionsList({ transactions }: RecentTransactionsListProps) {
  return (
    <Stack gap="sm">
      <Row align="center">
        <Text variant="sectionTitle" style={{ flex: 1 }}>
          Son Hareketler
        </Text>
        <Pressable onPress={() => router.push('/(tabs)/hareketler')} hitSlop={12}>
          <Text variant="caption" color="textSecondary">
            Tümünü Gör
          </Text>
        </Pressable>
      </Row>

      {transactions.length === 0 ? (
        <Card>
          <Text variant="body" color="textSecondary">
            Henüz hareket yok.
          </Text>
        </Card>
      ) : (
        <Stack gap="xs">
          {transactions.map((t) => (
            <Card key={t.id}>
              <Row>
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="cardTitle">
                    {t.description?.trim() ||
                      t.category?.name ||
                      (t.direction === 'transfer' ? 'Transfer' : t.direction === 'income' ? 'Gelir' : 'Gider')}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {t.counterparty?.name || t.account?.name || dateFormatter.format(new Date(t.occurred_at))}
                  </Text>
                </Stack>
                <Amount
                  amountMinor={t.amount_minor}
                  currencyCode={t.currency_code}
                  direction={t.direction as 'income' | 'expense' | 'transfer'}
                  variant="body"
                />
              </Row>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

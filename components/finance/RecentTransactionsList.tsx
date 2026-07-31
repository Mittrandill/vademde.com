import { router } from 'expo-router';

import { Card, EmptyState, Row, SectionHeader, Stack, Text } from '@/components/primitives';
import { Amount } from './Amount';
import type { TransactionWithRelations } from '@/features/transactions/api';

export interface RecentTransactionsListProps {
  transactions: TransactionWithRelations[];
}

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' });

export function RecentTransactionsList({ transactions }: RecentTransactionsListProps) {
  return (
    <Stack gap="sm">
      <SectionHeader
        title="Son Hareketler"
        actionLabel="Tümünü Gör"
        onActionPress={() => router.push('/(tabs)/hareketler')}
      />

      {transactions.length === 0 ? (
        <EmptyState icon="receipt-outline" message="Henüz hareket yok." />
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

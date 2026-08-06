import { View } from 'react-native';
import { router } from 'expo-router';
import type { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Card, Divider, EmptyState, Pressable, Row, SectionHeader, Stack, Text } from '@/components/primitives';
import { AccountLabelRow } from './AccountLabelRow';
import { Amount } from './Amount';
import { BankLogo } from './BankLogo';
import { CategoryIcon } from './CategoryIcon';
import { DateBlock } from './DateBlock';
import { PersonAvatar } from './PersonAvatar';
import type { TransactionWithRelations } from '@/features/transactions/api';

export interface RecentTransactionsListProps {
  transactions: TransactionWithRelations[];
}

const DIRECTION_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  income: 'arrow-down-circle-outline',
  expense: 'arrow-up-circle-outline',
  transfer: 'swap-horizontal-outline',
};

export function RecentTransactionsList({ transactions }: RecentTransactionsListProps) {
  const theme = useTheme();

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
        // Hareketler sekmesindeki listeyle aynı desen: tek arka plan üzerinde satır
        // araları çizgiyle ayrılır, her satır ayrı bir kart olmaz.
        <Card style={{ padding: 0 }}>
          {transactions.map((t, index) => (
            <View key={t.id}>
              <Pressable
                onPress={() => router.push(`/transactions/${t.id}`)}
                style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm }}
              >
                <Row gap="sm" align="center">
                  <DateBlock date={t.occurred_at} />
                  {t.category?.icon ? (
                    <CategoryIcon icon={t.category.icon} size={36} />
                  ) : t.counterparty ? (
                    <PersonAvatar name={t.counterparty.name} size={36} />
                  ) : (
                    <BankLogo
                      bankCode={null}
                      fallbackName={t.account?.name}
                      fallbackIcon={DIRECTION_ICON[t.direction] ?? 'ellipse-outline'}
                      size={36}
                    />
                  )}
                  <Stack gap="xxs" style={{ flex: 1 }}>
                    <Text variant="cardTitle">
                      {t.description?.trim() ||
                        t.category?.name ||
                        (t.direction === 'transfer' ? 'Transfer' : t.direction === 'income' ? 'Gelir' : 'Gider')}
                    </Text>
                    {t.counterparty ? (
                      <Text variant="caption" color="textSecondary">
                        {t.counterparty.name}
                      </Text>
                    ) : t.account ? (
                      <AccountLabelRow
                        bankCode={t.account.bank_code}
                        accountName={t.account.name}
                        accountType={t.account.type}
                        cardLastFour={t.account.card_last_four}
                      />
                    ) : null}
                  </Stack>
                  <Amount
                    amountMinor={t.amount_minor}
                    currencyCode={t.currency_code}
                    direction={t.direction as 'income' | 'expense' | 'transfer'}
                    variant="body"
                  />
                </Row>
              </Pressable>
              {index < transactions.length - 1 ? (
                <Divider style={{ marginHorizontal: theme.spacing.md }} />
              ) : null}
            </View>
          ))}
        </Card>
      )}
    </Stack>
  );
}

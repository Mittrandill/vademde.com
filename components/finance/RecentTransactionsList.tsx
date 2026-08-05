import { router } from 'expo-router';
import type { Ionicons } from '@expo/vector-icons';

import { Card, Divider, EmptyState, Pressable, Row, SectionHeader, Stack, Text } from '@/components/primitives';
import { AccountLabelRow } from './AccountLabelRow';
import { Amount } from './Amount';
import { BankLogo } from './BankLogo';
import { CategoryIcon } from './CategoryIcon';
import { PersonAvatar } from './PersonAvatar';
import type { TransactionWithRelations } from '@/features/transactions/api';

export interface RecentTransactionsListProps {
  transactions: TransactionWithRelations[];
}

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' });

const DIRECTION_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  income: 'arrow-down-circle-outline',
  expense: 'arrow-up-circle-outline',
  transfer: 'swap-horizontal-outline',
};

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
            <Pressable key={t.id} onPress={() => router.push(`/transactions/${t.id}`)}>
              <Card>
                <Row gap="sm">
                  {(t.payments?.length ?? 0) > 0 ? (
                    // Bir borç/alacak ödemesinden otomatik oluşturulan hareket — kategorisi
                    // ne olursa olsun (belge türü kategori değildir) ödemenin yapıldığı
                    // hesabın banka logosu gösterilir.
                    <BankLogo bankCode={t.account?.bank_code} fallbackName={t.account?.name} size={36} />
                  ) : t.category?.icon ? (
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
                      <>
                        <Divider style={{ marginVertical: 2 }} />
                        <AccountLabelRow
                          bankCode={t.account.bank_code}
                          accountName={t.account.name}
                          accountType={t.account.type}
                          cardLastFour={t.account.card_last_four}
                        />
                      </>
                    ) : (
                      <Text variant="caption" color="textSecondary">
                        {dateFormatter.format(new Date(t.occurred_at))}
                      </Text>
                    )}
                  </Stack>
                  <Amount
                    amountMinor={t.amount_minor}
                    currencyCode={t.currency_code}
                    direction={t.direction as 'income' | 'expense' | 'transfer'}
                    variant="body"
                  />
                </Row>
              </Card>
            </Pressable>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

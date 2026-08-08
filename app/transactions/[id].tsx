import { useState } from 'react';
import { Alert, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ActionSheet, Card, Divider, Row, Stack, Text } from '@/components/primitives';
import { DetailScaffold } from '@/components/navigation/DetailScaffold';
import { DetailHeroCard, DetailIdentityRow } from '@/components/finance/DetailHero';
import { AccountLabelRow } from '@/components/finance/AccountLabelRow';
import { Amount } from '@/components/finance/Amount';
import { BankLogo } from '@/components/finance/BankLogo';
import { CategoryIcon } from '@/components/finance/CategoryIcon';
import { PersonAvatar } from '@/components/finance/PersonAvatar';
import { deleteTransaction, getTransactionWithRelations } from '@/features/transactions/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';
import { showSuccessAlert } from '@/utils/alerts';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });

const DIRECTION_LABEL: Record<string, string> = {
  income: 'Gelir',
  expense: 'Gider',
  transfer: 'Transfer',
};

const DIRECTION_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  income: 'arrow-down-circle-outline',
  expense: 'arrow-up-circle-outline',
  transfer: 'swap-horizontal-outline',
};

export default function TransactionDetailScreen() {
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [menuOpen, setMenuOpen] = useState(false);

  const transactionQuery = useQuery({
    queryKey: ['transaction', id, 'detail'],
    queryFn: () => getTransactionWithRelations(id as string),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTransaction(id as string),
    onSuccess: () => {
      if (activeWorkspaceId) {
        queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'transactions'] });
      }
      showSuccessAlert('Hareket başarıyla silindi.', () => router.replace('/(tabs)/hareketler'));
    },
  });

  function confirmDelete() {
    Alert.alert('Hareketi Sil', 'Bu hareket kalıcı olarak silinecek. Emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  }

  const transaction = transactionQuery.data;

  async function handleShare() {
    if (!transaction) return;
    const title =
      transaction.description?.trim() || transaction.category?.name || DIRECTION_LABEL[transaction.direction] || 'Hareket';
    const parts = [
      title,
      formatMinorAmount(transaction.amount_minor, transaction.currency_code),
      dateFormatter.format(new Date(transaction.occurred_at)),
      transaction.account?.name,
    ].filter(Boolean);
    try {
      await Share.share({ message: parts.join(' — ') });
    } catch {
      // Kullanıcı paylaşım sayfasını kapattıysa (iptal) sessizce yok sayılır.
    }
  }

  if (transactionQuery.isLoading || !transaction) {
    return (
      <DetailScaffold
        header={{ title: '' }}
        isLoading
        error={transactionQuery.error}
        errorFallbackMessage="Hareket yüklenemedi"
      >
        {null}
      </DetailScaffold>
    );
  }

  const title =
    transaction.description?.trim() || transaction.category?.name || DIRECTION_LABEL[transaction.direction] || 'Hareket';
  const isObligationPayment = (transaction.payments?.length ?? 0) > 0;

  return (
    <>
      <DetailScaffold
        header={{
          title,
          right: {
            icon: 'ellipsis-horizontal',
            accessibilityLabel: 'Diğer seçenekler',
            onPress: () => setMenuOpen(true),
          },
        }}
        isLoading={false}
      >
        <DetailHeroCard
          sections={[
            <DetailIdentityRow
              key="identity"
              circleBackground={false}
              icon={
                isObligationPayment ? (
                  <BankLogo bankCode={transaction.account?.bank_code} fallbackName={transaction.account?.name} size={44} />
                ) : transaction.category?.icon ? (
                  <CategoryIcon icon={transaction.category.icon} color={transaction.category.color} size={44} />
                ) : transaction.counterparty ? (
                  <PersonAvatar name={transaction.counterparty.name} size={44} />
                ) : (
                  <BankLogo
                    bankCode={transaction.account?.bank_code}
                    fallbackName={transaction.account?.name}
                    fallbackIcon={DIRECTION_ICON[transaction.direction] ?? 'ellipse-outline'}
                    size={44}
                  />
                )
              }
              title={title}
              subtitle={dateFormatter.format(new Date(transaction.occurred_at))}
            />,
            <Amount
              key="amount"
              amountMinor={transaction.amount_minor}
              currencyCode={transaction.currency_code}
              direction={transaction.direction as 'income' | 'expense' | 'transfer'}
              variant="displayAmount"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            />,
          ]}
        />

        <Card>
          <Stack gap="md">
            {transaction.category ? (
              <Row gap="sm" align="center">
                <CategoryIcon icon={transaction.category.icon} color={transaction.category.color} size={36} />
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="caption" color="textSecondary" style={{ letterSpacing: 0.6 }}>
                    KATEGORİ
                  </Text>
                  <Text variant="body">{transaction.category.name}</Text>
                </Stack>
              </Row>
            ) : null}

            {transaction.category ? <Divider /> : null}

            <Row gap="sm" align="center">
              <BankLogo
                bankCode={transaction.account?.bank_code}
                fallbackName={transaction.account?.name}
                size={36}
              />
              <Stack gap="xxs" style={{ flex: 1 }}>
                <Text variant="caption" color="textSecondary" style={{ letterSpacing: 0.6 }}>
                  HESAP
                </Text>
                <AccountLabelRow
                  bankCode={transaction.account?.bank_code}
                  accountName={transaction.account?.name}
                  accountType={transaction.account?.type}
                  cardLastFour={transaction.account?.card_last_four}
                />
              </Stack>
            </Row>

            {transaction.direction === 'transfer' && transaction.transferToAccount ? (
              <>
                <Divider />
                <Row gap="sm" align="center">
                  <BankLogo
                    bankCode={transaction.transferToAccount.bank_code}
                    fallbackName={transaction.transferToAccount.name}
                    size={36}
                  />
                  <Stack gap="xxs" style={{ flex: 1 }}>
                    <Text variant="caption" color="textSecondary" style={{ letterSpacing: 0.6 }}>
                      HEDEF HESAP
                    </Text>
                    <Text variant="body">{transaction.transferToAccount.name}</Text>
                  </Stack>
                </Row>
              </>
            ) : null}

            {transaction.counterparty ? (
              <>
                <Divider />
                <Row gap="sm" align="center">
                  <PersonAvatar name={transaction.counterparty.name} size={36} />
                  <Stack gap="xxs" style={{ flex: 1 }}>
                    <Text variant="caption" color="textSecondary" style={{ letterSpacing: 0.6 }}>
                      KİŞİ / FİRMA
                    </Text>
                    <Text variant="body">{transaction.counterparty.name}</Text>
                  </Stack>
                </Row>
              </>
            ) : null}
          </Stack>
        </Card>
      </DetailScaffold>

      <ActionSheet
        visible={menuOpen}
        title="Hareket"
        onClose={() => setMenuOpen(false)}
        options={[
          {
            key: 'edit',
            label: 'Düzenle',
            icon: 'create-outline',
            onPress: () => router.push({ pathname: '/transactions/new', params: { id: transaction.id } }),
          },
          { key: 'share', label: 'Paylaş', icon: 'share-outline', onPress: handleShare },
          { key: 'delete', label: 'Sil', icon: 'trash-outline', danger: true, onPress: confirmDelete },
        ]}
      />
    </>
  );
}

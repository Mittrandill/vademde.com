import { useState } from 'react';
import { Alert, ScrollView, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { ActionSheet, Card, Divider, Pressable, Row, Stack, Text } from '@/components/primitives';
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
  const theme = useTheme();
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
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        <Stack style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          {transactionQuery.error ? (
            <Text variant="body" color="danger">
              {transactionQuery.error instanceof Error ? transactionQuery.error.message : 'Hareket yüklenemedi'}
            </Text>
          ) : null}
        </Stack>
      </SafeAreaView>
    );
  }

  const title =
    transaction.description?.trim() || transaction.category?.name || DIRECTION_LABEL[transaction.direction] || 'Hareket';
  const isObligationPayment = (transaction.payments?.length ?? 0) > 0;
  const chipStyle = {
    width: 44,
    height: 44,
    borderRadius: theme.radius.input,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.surfaceElevated,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView contentContainerStyle={{ padding: theme.screenEdge.standard, paddingBottom: theme.spacing.huge }}>
        <Stack gap="lg">
          <Row align="center">
            <Pressable accessibilityLabel="Geri" onPress={() => router.back()} hitSlop={8} style={chipStyle}>
              <Ionicons name="chevron-back" size={22} color={theme.colors.textPrimary} />
            </Pressable>
            <Text variant="pageTitle" style={{ flex: 1, marginLeft: theme.spacing.sm }} numberOfLines={1}>
              {title}
            </Text>
            <Pressable accessibilityLabel="Diğer seçenekler" onPress={() => setMenuOpen(true)} hitSlop={8} style={chipStyle}>
              <Ionicons name="ellipsis-horizontal" size={22} color={theme.colors.textPrimary} />
            </Pressable>
          </Row>

          <Card variant="hero">
            <Stack gap="lg">
              <Row gap="sm" align="center">
                {isObligationPayment ? (
                  <BankLogo bankCode={transaction.account?.bank_code} fallbackName={transaction.account?.name} size={44} />
                ) : transaction.category?.icon ? (
                  <CategoryIcon icon={transaction.category.icon} size={44} />
                ) : transaction.counterparty ? (
                  <PersonAvatar name={transaction.counterparty.name} size={44} />
                ) : (
                  <BankLogo
                    bankCode={transaction.account?.bank_code}
                    fallbackName={transaction.account?.name}
                    fallbackIcon={DIRECTION_ICON[transaction.direction] ?? 'ellipse-outline'}
                    size={44}
                  />
                )}
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="cardTitle" numberOfLines={2}>
                    {title}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {dateFormatter.format(new Date(transaction.occurred_at))}
                  </Text>
                </Stack>
              </Row>

              <Divider />

              <Amount
                amountMinor={transaction.amount_minor}
                currencyCode={transaction.currency_code}
                direction={transaction.direction as 'income' | 'expense' | 'transfer'}
                variant="displayAmount"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              />
            </Stack>
          </Card>

          <Card>
            <Stack gap="md">
              {transaction.category ? (
                <Row gap="sm" align="center">
                  <CategoryIcon icon={transaction.category.icon} size={36} />
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
        </Stack>
      </ScrollView>

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
    </SafeAreaView>
  );
}

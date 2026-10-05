import { useState } from 'react';
import { Alert, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { ActionSheet, Card, Divider, Pressable, Row, Stack, Text } from '@/components/primitives';
import { DetailScaffold } from '@/components/navigation/DetailScaffold';
import { DetailHeroCard, DetailIdentityRow } from '@/components/finance/DetailHero';
import { AccountIcon } from '@/components/finance/AccountIcon';
import { AccountLabelRow } from '@/components/finance/AccountLabelRow';
import { Amount } from '@/components/finance/Amount';
import { BankLogo } from '@/components/finance/BankLogo';
import { CategoryIcon } from '@/components/finance/CategoryIcon';
import { PersonAvatar } from '@/components/finance/PersonAvatar';
import { deleteTransaction, getTransactionWithRelations } from '@/features/transactions/api';
import { getTransactionReceipt, openReceipt } from '@/features/receipts/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';
import { showSaveSuccess, showErrorAlert } from '@/utils/alerts';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });

const LOCKED_SOURCE_TYPES = new Set(['avans', 'nakit_avans', 'borc_verme']);

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

  // Bu harekete bağlı dekont (Plus). Yoksa ya da dosya saklanmıyorsa satır hiç görünmez.
  const receiptQuery = useQuery({
    queryKey: ['transaction-receipt', id],
    queryFn: () => getTransactionReceipt(id as string),
    enabled: !!id,
  });

  async function handleOpenReceipt() {
    if (!receiptQuery.data) return;
    try {
      await openReceipt(receiptQuery.data.id);
    } catch {
      Alert.alert('Dekont açılamadı', 'Dosya bulunamadı ya da bağlantı kurulamadı.');
    }
  }

  const deleteMutation = useMutation({
    mutationFn: () => deleteTransaction(id as string),
    onSuccess: () => {
      showSaveSuccess('Hareket başarıyla silindi.', () => router.replace('/(tabs)/hareketler'), () => {
        if (activeWorkspaceId) {
          queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'transactions'] });
        }
      });
    },
    onError: (error) => showErrorAlert(error),
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
  const linkedPayment = transaction.payments?.[0];
  // Avans / nakit avans / borç verme hareketi kaydın kendisiyle birlikte doğar ve silinir (bkz.
  // source_obligation_id); tek başına değişirse kayıt ile hesap bakiyesi kopar. Ekstreden
  // kategorilere ayrılmış kart harcamaları ise serbestçe düzenlenebilir kalır.
  const lockedSource =
    transaction.sourceObligation && LOCKED_SOURCE_TYPES.has(transaction.sourceObligation.document_type)
      ? transaction.sourceObligation.id
      : null;
  const linkedObligationId = linkedPayment?.obligation_id ?? lockedSource;

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
              <AccountIcon
                bankCode={transaction.account?.bank_code}
                accountType={transaction.account?.type}
                currencyCode={transaction.account?.currency_code}
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
                  currencyCode={transaction.account?.currency_code}
                />
              </Stack>
            </Row>

            {transaction.direction === 'transfer' && transaction.transferToAccount ? (
              <>
                <Divider />
                <Row gap="sm" align="center">
                  <AccountIcon
                    bankCode={transaction.transferToAccount.bank_code}
                    accountType={transaction.transferToAccount.type}
                    currencyCode={transaction.transferToAccount.currency_code}
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

            {receiptQuery.data ? (
              <>
                <Divider />
                <Pressable accessibilityRole="button" accessibilityLabel="Dekontu aç" onPress={handleOpenReceipt}>
                  <Row gap="sm" align="center">
                    <Ionicons name="attach" size={24} color={theme.colors.textPrimary} style={{ width: 36, textAlign: 'center' }} />
                    <Stack gap="xxs" style={{ flex: 1 }}>
                      <Text variant="caption" color="textSecondary" style={{ letterSpacing: 0.6 }}>
                        DEKONT
                      </Text>
                      <Text variant="body">Dekontu aç</Text>
                    </Stack>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                  </Row>
                </Pressable>
              </>
            ) : null}
          </Stack>
        </Card>
      </DetailScaffold>

      <ActionSheet
        visible={menuOpen}
        title="Hareket"
        onClose={() => setMenuOpen(false)}
        // Bir borç/alacak ödemesinden (fatura, çek, senet, kredi, kart ödemesi...) oluşan hareket
        // burada düzenlenmez/silinmez: silinirse ödeme kaydı kalır ve borç "ödendi" görünürken para
        // hesaba geri döner; tutarı değişirse borcun kalanı ile hesap bakiyesi birbirinden kopar.
        // Değişiklik ödemenin kendisinden (kayıt detayı → Ödeme Geçmişi) yapılır; orası ödeme ile
        // hareketi birlikte günceller/siler (bkz. features/payments/api.ts updatePayment/deletePayment).
        options={
          linkedObligationId
            ? [
                {
                  key: 'obligation',
                  label: 'Bağlı Kayda Git',
                  description: 'Bu hareket bir ödemeye bağlı; düzenleme ve silme ödeme geçmişinden yapılır.',
                  icon: 'document-text-outline',
                  onPress: () => router.push(`/obligations/${linkedObligationId}`),
                },
                { key: 'share', label: 'Paylaş', icon: 'share-outline', onPress: handleShare },
              ]
            : [
                {
                  key: 'edit',
                  label: 'Düzenle',
                  icon: 'create-outline',
                  onPress: () => router.push({ pathname: '/transactions/new', params: { id: transaction.id } }),
                },
                { key: 'share', label: 'Paylaş', icon: 'share-outline', onPress: handleShare },
                { key: 'delete', label: 'Sil', icon: 'trash-outline', danger: true, onPress: confirmDelete },
              ]
        }
      />
    </>
  );
}

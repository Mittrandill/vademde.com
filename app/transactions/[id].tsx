import { useState, type ReactNode } from 'react';
import { Alert, Share, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { ActionSheet, Group, Pressable, Text } from '@/components/primitives';
import { DetailScaffold } from '@/components/navigation/DetailScaffold';
import { DetailHeroCard, DetailIdentityRow } from '@/components/finance/DetailHero';
import { AccountLabelRow } from '@/components/finance/AccountLabelRow';
import { Amount } from '@/components/finance/Amount';
import { BankLogo } from '@/components/finance/BankLogo';
import { CategoryIcon } from '@/components/finance/CategoryIcon';
import { PersonAvatar } from '@/components/finance/PersonAvatar';
import { deleteTransaction, getTransactionWithRelations, LOCKED_SOURCE_TYPES } from '@/features/transactions/api';
import { getTransactionReceipt, openReceipt } from '@/features/receipts/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';
import { showSaveSuccess, showErrorAlert } from '@/utils/alerts';

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
          title: '',
          inline: true,
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

        <Group inset={16}>
          <InfoRow label="Hesap">
            <AccountLabelRow
              bankCode={transaction.account?.bank_code}
              accountName={transaction.account?.name}
              accountType={transaction.account?.type}
              cardLastFour={transaction.account?.card_last_four}
              currencyCode={transaction.account?.currency_code}
            />
          </InfoRow>
          {transaction.direction === 'transfer' && transaction.transferToAccount ? (
            <InfoRow label="Hedef hesap">
              <Text>{transaction.transferToAccount.name}</Text>
            </InfoRow>
          ) : null}
          {transaction.category ? (
            <InfoRow label="Kategori">
              <Text>{transaction.category.name}</Text>
            </InfoRow>
          ) : null}
          {transaction.counterparty ? (
            <InfoRow label="Kişi / firma">
              <Text>{transaction.counterparty.name}</Text>
            </InfoRow>
          ) : null}
          {transaction.description?.trim() ? (
            <InfoRow label="Not">
              <Text numberOfLines={2} style={{ textAlign: 'right' }}>
                {transaction.description.trim()}
              </Text>
            </InfoRow>
          ) : null}
        </Group>

        {receiptQuery.data ? (
          <View style={{ gap: 10 }}>
            <Text variant="label" color="textSecondary">
              Belge
            </Text>
            <Group inset={16}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dekontu aç"
                onPress={handleOpenReceipt}
                style={{ minHeight: 56, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
              >
                <Ionicons name="attach" size={22} color={theme.colors.textPrimary} />
                <Text style={{ flex: 1, fontWeight: '500' }}>Dekontu aç</Text>
                <Ionicons name="chevron-forward" size={14} color={theme.colors.mutedControl} />
              </Pressable>
            </Group>
          </View>
        ) : null}
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

// Tuval satırı (.row): etiket solda ikincil, değer sağda.
function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ minHeight: 56, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text color="textSecondary" style={{ flex: 1 }}>
        {label}
      </Text>
      <View style={{ maxWidth: '62%', alignItems: 'flex-end' }}>{children}</View>
    </View>
  );
}

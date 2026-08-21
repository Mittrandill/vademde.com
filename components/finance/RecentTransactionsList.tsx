import { View } from 'react-native';
import { router } from 'expo-router';
import type { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Card, Divider, EmptyState, Pressable, Row, SectionHeader, Stack, Text } from '@/components/primitives';
import { AccountIcon } from './AccountIcon';
import { AccountLabelRow } from './AccountLabelRow';
import { Amount } from './Amount';
import { BankLogo } from './BankLogo';
import { CategoryIcon } from './CategoryIcon';
import { DateBlock } from './DateBlock';
import { ObligationIcon } from './ObligationIcon';
import { PersonAvatar } from './PersonAvatar';
import { getPaymentObligation, type TransactionWithRelations } from '@/features/transactions/api';

export interface RecentTransactionsListProps {
  transactions: TransactionWithRelations[];
}

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
        // Hareketler sekmesindeki listeyle aynı desen: tek arka plan üzerinde satır
        // araları çizgiyle ayrılır, her satır ayrı bir kart olmaz.
        <Card style={{ padding: 0 }}>
          {transactions.map((t, index) => (
            <RecentTransactionRow key={t.id} transaction={t} isLast={index === transactions.length - 1} />
          ))}
        </Card>
      )}
    </Stack>
  );
}

interface RecentTransactionRowProps {
  transaction: TransactionWithRelations;
  isLast: boolean;
}

function RecentTransactionRow({ transaction: t, isLast }: RecentTransactionRowProps) {
  const theme = useTheme();
  // Bu işlem bir borç/taksit ödemesinden otomatik oluştuysa, ana ikon o borcun/servisin
  // kendi kimliğini gösterir (ör. bir abonelik ödemesinde Youtube logosu) — ödemenin
  // yapıldığı hesap zaten alt başlıkta (AccountLabelRow) ayrıca gösterildiği için burada
  // tekrar banka logosu kullanılmaz.
  const paymentObligation = getPaymentObligation(t);

  return (
    <View>
      <Pressable
        onPress={() => router.push(`/transactions/${t.id}`)}
        style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm }}
      >
        <Row gap="sm" align="center">
          <DateBlock date={t.occurred_at} />
          {paymentObligation ? (
            <ObligationIcon
              documentType={paymentObligation.document_type}
              bankCode={paymentObligation.bank_code}
              serviceCode={paymentObligation.service_code}
              fallbackName={paymentObligation.title}
              size={36}
            />
          ) : t.category?.icon ? (
            <CategoryIcon icon={t.category.icon} color={t.category.color} size={36} />
          ) : t.direction === 'transfer' && t.transferToAccount ? (
            // Transferde asıl ikon paranın gittiği hesabı temsil eder (ör. bir kredi kartı
            // ödemesinde asıl ikon kartın kendi logosudur) — kaynak hesap alt satırda kalır.
            <AccountIcon
              bankCode={t.transferToAccount.bank_code}
              accountType={t.transferToAccount.type}
              currencyCode={t.transferToAccount.currency_code}
              fallbackName={t.transferToAccount.name}
              size={36}
            />
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
              {t.counterparty?.name ||
                t.description?.trim() ||
                t.category?.name ||
                (t.direction === 'transfer' ? 'Transfer' : t.direction === 'income' ? 'Gelir' : 'Gider')}
            </Text>
            {/* Alt satır her zaman işlemin geçtiği hesabı gösterir (kategori/kişi zaten üstteki
                ikon ve başlıkla anlatılır) — kişi/firma adı yalnızca hiç hesap yoksa buraya düşer. */}
            {t.account ? (
              <AccountLabelRow
                bankCode={t.account.bank_code}
                accountName={t.account.name}
                accountType={t.account.type}
                cardLastFour={t.account.card_last_four}
                currencyCode={t.account.currency_code}
              />
            ) : t.counterparty ? (
              <Text variant="caption" color="textSecondary">
                {t.counterparty.name}
              </Text>
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
      {!isLast ? <Divider style={{ marginHorizontal: theme.spacing.md }} /> : null}
    </View>
  );
}

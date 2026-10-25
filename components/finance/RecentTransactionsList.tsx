import { View } from 'react-native';
import { router } from 'expo-router';
import type { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { EmptyState, Group, Pressable, Row, SectionHeader, Text } from '@/components/primitives';
import { AccountIcon } from './AccountIcon';
import { AccountLabelRow } from './AccountLabelRow';
import { Amount } from './Amount';
import { BankLogo } from './BankLogo';
import { CategoryIcon } from './CategoryIcon';
import { ObligationIcon } from './ObligationIcon';
import { PersonAvatar } from './PersonAvatar';
import { getPaymentObligation, type TransactionWithRelations } from '@/features/transactions/api';
import { t } from '@/i18n';

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
    <View>
      <SectionHeader title={t('home.recent.title')} actionLabel={t('common.all')} onActionPress={() => router.push('/(tabs)/hareketler')} />

      {transactions.length === 0 ? (
        <EmptyState icon="receipt-outline" message={t('home.recent.empty')} />
      ) : (
        <Group inset={62}>
          {transactions.map((transaction) => (
            <RecentTransactionRow key={transaction.id} transaction={transaction} isLast={false} />
          ))}
        </Group>
      )}
    </View>
  );
}

interface RecentTransactionRowProps {
  transaction: TransactionWithRelations;
  isLast: boolean;
}

function RecentTransactionRow({ transaction: tx, isLast }: RecentTransactionRowProps) {
  const theme = useTheme();
  // Bu işlem bir borç/taksit ödemesinden otomatik oluştuysa, ana ikon o borcun/servisin
  // kendi kimliğini gösterir (ör. bir abonelik ödemesinde Youtube logosu) — ödemenin
  // yapıldığı hesap zaten alt başlıkta (AccountLabelRow) ayrıca gösterildiği için burada
  // tekrar banka logosu kullanılmaz.
  const paymentObligation = getPaymentObligation(tx);

  return (
    <View>
      <Pressable
        onPress={() => router.push(`/transactions/${tx.id}`)}
        style={{ minHeight: 56, paddingHorizontal: theme.spacing.md, paddingVertical: 10 }}
      >
        <Row gap="sm" align="center" style={{ gap: 12 }}>
          {paymentObligation ? (
            <ObligationIcon
              documentType={paymentObligation.document_type}
              bankCode={paymentObligation.bank_code}
              serviceCode={paymentObligation.service_code}
              fallbackName={paymentObligation.title}
              size={34}
            />
          ) : tx.category?.icon ? (
            <CategoryIcon icon={tx.category.icon} color={tx.category.color} size={34} />
          ) : tx.direction === 'transfer' && tx.transferToAccount ? (
            // Transferde asıl ikon paranın gittiği hesabı temsil eder (ör. bir kredi kartı
            // ödemesinde asıl ikon kartın kendi logosudur) — kaynak hesap alt satırda kalır.
            <AccountIcon
              bankCode={tx.transferToAccount.bank_code}
              accountType={tx.transferToAccount.type}
              currencyCode={tx.transferToAccount.currency_code}
              fallbackName={tx.transferToAccount.name}
              size={34}
            />
          ) : tx.counterparty ? (
            <PersonAvatar name={tx.counterparty.name} size={34} />
          ) : (
            <BankLogo
              bankCode={null}
              fallbackName={tx.account?.name}
              fallbackIcon={DIRECTION_ICON[tx.direction] ?? 'ellipse-outline'}
              size={34}
            />
          )}
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text numberOfLines={1} style={{ fontWeight: '500' }}>
              {tx.counterparty?.name ||
                tx.description?.trim() ||
                tx.category?.name ||
                (tx.direction === 'transfer' ? t('common.transfer') : tx.direction === 'income' ? t('common.income') : t('common.expense'))}
            </Text>
            {/* Alt satır her zaman işlemin geçtiği hesabı gösterir (kategori/kişi zaten üstteki
                ikon ve başlıkla anlatılır) — kişi/firma adı yalnızca hiç hesap yoksa buraya düşer. */}
            {tx.account ? (
              <AccountLabelRow
                bankCode={tx.account.bank_code}
                accountName={tx.account.name}
                accountType={tx.account.type}
                cardLastFour={tx.account.card_last_four}
                currencyCode={tx.account.currency_code}
              />
            ) : tx.counterparty ? (
              <Text variant="caption" color="textSecondary">
                {tx.counterparty.name}
              </Text>
            ) : null}
          </View>
          <Amount
            amountMinor={tx.amount_minor}
            currencyCode={tx.currency_code}
            direction={tx.direction as 'income' | 'expense' | 'transfer'}
            variant="body"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={{ maxWidth: '38%' }}
          />
        </Row>
      </Pressable>
    </View>
  );
}

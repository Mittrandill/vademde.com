import { Alert, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Pressable, Row, Stack, Text } from '@/components/primitives';
import { BankLogo } from '@/components/finance/BankLogo';
import { archiveAccount, getAccount, type Account } from '@/features/accounts/api';
import { getAccountBalances } from '@/features/reports/api';
import { listTransactions, type TransactionWithRelations } from '@/features/transactions/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';
import { maskIban } from '@/utils/iban';
import { queryKeys } from '@/services/queryKeys';

const TYPE_ICON: Record<Account['type'], keyof typeof Ionicons.glyphMap> = {
  cash: 'cash-outline',
  bank: 'business-outline',
  wallet: 'wallet-outline',
};

const TYPE_LABEL: Record<Account['type'], string> = {
  cash: 'Kasa',
  bank: 'Banka',
  wallet: 'Cüzdan',
};

export default function AccountDetailScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const accountQuery = useQuery({
    queryKey: ['account', id],
    queryFn: () => getAccount(id as string),
    enabled: !!id,
  });

  const balancesQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'account-balances'] : ['account-balances', 'disabled'],
    queryFn: () => getAccountBalances(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const transactionsQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'transactions', 'account', id] : ['transactions', 'disabled'],
    queryFn: () => listTransactions({ workspaceId: activeWorkspaceId as string, accountId: id as string }),
    enabled: !!activeWorkspaceId && !!id,
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveAccount(id as string),
    onSuccess: () => {
      if (activeWorkspaceId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts(activeWorkspaceId) });
        queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'account-balances'] });
      }
      queryClient.removeQueries({ queryKey: ['account', id] });
      router.back();
    },
  });

  function confirmArchive() {
    Alert.alert('Hesabı Arşivle', 'Bu hesap listeden kaldırılacak, geçmiş hareketleri korunur. Emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Arşivle', style: 'destructive', onPress: () => archiveMutation.mutate() },
    ]);
  }

  if (accountQuery.isLoading || !accountQuery.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        <Stack style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          {accountQuery.error ? (
            <Text variant="body" color="danger">
              {accountQuery.error instanceof Error ? accountQuery.error.message : 'Hesap yüklenemedi'}
            </Text>
          ) : null}
        </Stack>
      </SafeAreaView>
    );
  }

  const account = accountQuery.data;
  const type = account.type as Account['type'];
  const balanceMinor =
    balancesQuery.data?.find((b) => b.accountId === account.id)?.balanceMinor ?? account.opening_balance_minor;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <FlatList
        data={transactionsQuery.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: theme.screenEdge.standard, gap: theme.spacing.sm }}
        ListHeaderComponent={
          <Stack gap="lg" style={{ marginBottom: theme.spacing.lg }}>
            <Row align="center">
              <Pressable onPress={() => router.back()} hitSlop={12}>
                <Ionicons name="chevron-back" size={26} color={theme.colors.textPrimary} />
              </Pressable>
              <Text variant="pageTitle" style={{ flex: 1, marginLeft: theme.spacing.sm }} numberOfLines={1}>
                {account.name}
              </Text>
              <Pressable onPress={() => router.push({ pathname: '/accounts/new', params: { id: account.id } })} hitSlop={12}>
                <Ionicons name="pencil" size={22} color={theme.colors.textPrimary} />
              </Pressable>
            </Row>

            <Row gap="sm" align="center">
              <BankLogo bankCode={account.bank_code} fallbackIcon={TYPE_ICON[type]} size={28} />
              <Stack gap="xxs">
                <Text variant="caption" color="textSecondary">
                  {TYPE_LABEL[type]}
                </Text>
                {account.iban ? (
                  <Text variant="caption" color="textSecondary" tabular>
                    {maskIban(account.iban)}
                  </Text>
                ) : null}
              </Stack>
            </Row>

            <Stack
              gap="xxs"
              style={{ backgroundColor: theme.colors.surfacePrimary, borderRadius: theme.radius.widget, padding: theme.spacing.lg }}
            >
              <Text variant="caption" color="textSecondary">
                GÜNCEL BAKİYE
              </Text>
              <Text variant="displayAmount" tabular>
                {formatMinorAmount(balanceMinor, account.currency_code)}
              </Text>
            </Stack>

            <Text variant="sectionTitle">Hareketler</Text>
          </Stack>
        }
        renderItem={({ item }) => <TransactionRow item={item} />}
        ListEmptyComponent={
          <Text variant="body" color="textSecondary">
            Bu hesapta henüz hareket yok.
          </Text>
        }
        ListFooterComponent={
          <Pressable onPress={confirmArchive} style={{ marginTop: theme.spacing.xl }}>
            <Text variant="body" color="danger" style={{ textAlign: 'center' }}>
              Hesabı Arşivle
            </Text>
          </Pressable>
        }
      />
    </SafeAreaView>
  );
}

function TransactionRow({ item }: { item: TransactionWithRelations }) {
  const theme = useTheme();
  const sign = item.direction === 'expense' ? -1 : item.direction === 'income' ? 1 : 0;
  return (
    <Row
      align="center"
      style={{ backgroundColor: theme.colors.surfacePrimary, borderRadius: theme.radius.widget, padding: theme.spacing.md }}
    >
      <Stack gap="xxs" style={{ flex: 1 }}>
        <Text variant="body" numberOfLines={1}>
          {item.description || item.category?.name || item.counterparty?.name || 'Hareket'}
        </Text>
        <Text variant="caption" color="textSecondary">
          {new Date(item.occurred_at).toLocaleDateString('tr-TR')}
        </Text>
      </Stack>
      <Text
        variant="body"
        tabular
        style={{ color: sign > 0 ? theme.colors.success : sign < 0 ? theme.colors.danger : theme.colors.textPrimary }}
      >
        {sign > 0 ? '+' : sign < 0 ? '−' : ''}
        {formatMinorAmount(item.amount_minor, item.currency_code)}
      </Text>
    </Row>
  );
}

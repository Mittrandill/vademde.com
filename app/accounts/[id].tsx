import { useState } from 'react';
import { Alert, SectionList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Card, Divider, EmptyState, Pagination, Pressable, Row, SectionHeader, Stack, Text } from '@/components/primitives';
import { Amount } from '@/components/finance/Amount';
import { BankLogo } from '@/components/finance/BankLogo';
import { archiveAccount, getAccount, type Account } from '@/features/accounts/api';
import { getAccountBalances } from '@/features/reports/api';
import { listTransactions, type TransactionWithRelations } from '@/features/transactions/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { maskIban } from '@/utils/iban';
import { queryKeys } from '@/services/queryKeys';
import { groupByDay } from '@/utils/groupByDay';

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

const PAGE_SIZE = 10;

export default function AccountDetailScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [page, setPage] = useState(0);

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

  const allTransactions = transactionsQuery.data ?? [];
  const totalPages = Math.max(1, Math.ceil(allTransactions.length / PAGE_SIZE));
  const effectivePage = Math.min(page, totalPages - 1);
  const pagedTransactions = allTransactions.slice(effectivePage * PAGE_SIZE, effectivePage * PAGE_SIZE + PAGE_SIZE);
  const sections = groupByDay(pagedTransactions, (item) => item.occurred_at);

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
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.xs,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
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

            {/* Hero: banka logosu, hesap türü/IBAN kimliği ve güncel bakiye tek kartta —
                sayfanın tek büyük rakamı. */}
            <Card style={{ borderRadius: theme.radius.heroWidget, padding: theme.spacing.lg }}>
              <Stack gap="lg">
                <Row gap="sm" align="center">
                  <BankLogo bankCode={account.bank_code} fallbackIcon={TYPE_ICON[type]} size={44} />
                  <Stack gap="xxs" style={{ flex: 1 }}>
                    <Row gap="xs" align="center">
                      <View
                        style={{
                          paddingHorizontal: theme.spacing.xs,
                          paddingVertical: 2,
                          borderRadius: 999,
                          backgroundColor: withAlpha(theme.colors.textSecondary, 0.14),
                        }}
                      >
                        <Text variant="caption" color="textSecondary">
                          {TYPE_LABEL[type]}
                        </Text>
                      </View>
                    </Row>
                    {account.iban ? (
                      <Text variant="caption" color="textSecondary" tabular>
                        {maskIban(account.iban)}
                      </Text>
                    ) : null}
                  </Stack>
                </Row>

                <Divider />

                <Stack gap="xxs">
                  <Text variant="caption" color="textSecondary" style={{ letterSpacing: 0.6 }}>
                    GÜNCEL BAKİYE
                  </Text>
                  <Amount
                    amountMinor={balanceMinor}
                    currencyCode={account.currency_code}
                    variant="displayAmount"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                    style={{ color: balanceMinor < 0 ? theme.colors.danger : theme.colors.textPrimary }}
                  />
                </Stack>
              </Stack>
            </Card>

            <Text variant="sectionTitle">Hareketler</Text>
          </Stack>
        }
        renderSectionHeader={({ section }) => (
          <View style={{ paddingTop: theme.spacing.sm }}>
            <SectionHeader title={section.title} />
          </View>
        )}
        renderItem={({ item }) => <TransactionRow item={item} />}
        ListEmptyComponent={<EmptyState icon="receipt-outline" message="Bu hesapta henüz hareket yok." />}
        ListFooterComponent={
          <Stack gap="lg" style={{ marginTop: theme.spacing.sm }}>
            {totalPages > 1 ? <Pagination page={effectivePage} totalPages={totalPages} onChange={setPage} /> : null}
            <Pressable
              onPress={confirmArchive}
              style={{
                height: theme.controlHeight.segmented,
                borderRadius: theme.radius.widget,
                borderWidth: 1,
                borderColor: theme.colors.danger,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: theme.spacing.xxs,
              }}
            >
              <Ionicons name="archive-outline" size={16} color={theme.colors.danger} />
              <Text variant="body" color="danger">
                Hesabı Arşivle
              </Text>
            </Pressable>
          </Stack>
        }
      />
    </SafeAreaView>
  );
}

function TransactionRow({ item }: { item: TransactionWithRelations }) {
  const sign = item.direction === 'expense' ? -1 : item.direction === 'income' ? 1 : 0;

  return (
    <Card>
      <Row align="center">
        <Stack gap="xxs" style={{ flex: 1 }}>
          <Text variant="body" numberOfLines={1}>
            {item.description || item.category?.name || item.counterparty?.name || 'Hareket'}
          </Text>
          <Text variant="caption" color="textSecondary">
            {item.category?.name ?? (sign > 0 ? 'Gelir' : sign < 0 ? 'Gider' : 'Transfer')}
          </Text>
        </Stack>
        <Amount
          amountMinor={item.amount_minor}
          currencyCode={item.currency_code}
          direction={item.direction as 'income' | 'expense' | 'transfer'}
          variant="body"
        />
      </Row>
    </Card>
  );
}

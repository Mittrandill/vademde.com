import { useMemo, useState } from 'react';
import { FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Pressable, Row, SegmentedControl, Stack, Text, TextField } from '@/components/primitives';
import { BankLogo } from '@/components/finance/BankLogo';
import { listAccounts, type Account } from '@/features/accounts/api';
import { getAccountBalances } from '@/features/reports/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';
import { maskIban } from '@/utils/iban';
import { queryKeys } from '@/services/queryKeys';
import { matchesSearch, normalizeForSearch } from '@/utils/search';

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

type TypeFilterKey = 'all' | Account['type'];

const TYPE_FILTERS: { key: TypeFilterKey; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'cash', label: 'Kasa' },
  { key: 'bank', label: 'Banka' },
  { key: 'wallet', label: 'Cüzdan' },
];

export default function AccountsScreen() {
  const theme = useTheme();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilterKey>('all');

  const accountsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.accounts(activeWorkspaceId) : ['accounts', 'disabled'],
    queryFn: () => listAccounts(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const allAccounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);

  const accounts = useMemo(() => {
    const query = normalizeForSearch(search);
    return allAccounts.filter((a) => {
      if (typeFilter !== 'all' && a.type !== typeFilter) return false;
      return matchesSearch(a.name, query) || matchesSearch(a.iban, query);
    });
  }, [allAccounts, search, typeFilter]);

  const balancesQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'account-balances'] : ['account-balances', 'disabled'],
    queryFn: () => getAccountBalances(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });
  const balanceByAccountId = new Map((balancesQuery.data ?? []).map((b) => [b.accountId, b.balanceMinor]));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <Stack gap="lg" style={{ flex: 1, paddingTop: theme.spacing.md }}>
        <Row style={{ paddingHorizontal: theme.screenEdge.standard }} align="center">
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
          </Pressable>
          <Text variant="pageTitle" style={{ flex: 1, marginLeft: theme.spacing.sm }}>
            Hesaplar
          </Text>
          <Pressable onPress={() => router.push('/accounts/new')} hitSlop={12}>
            <Ionicons name="add-circle" size={30} color={theme.colors.brandPrimary} />
          </Pressable>
        </Row>

        <Stack gap="sm" style={{ paddingHorizontal: theme.screenEdge.standard }}>
          <TextField
            placeholder="Hesap adı veya IBAN'da ara"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCorrect={false}
          />
          <SegmentedControl
            options={TYPE_FILTERS}
            value={typeFilter}
            onChange={setTypeFilter}
            size="compact"
            stretch
          />
        </Stack>

        {accountsQuery.error ? (
          <Text
            variant="body"
            color="danger"
            style={{ paddingHorizontal: theme.screenEdge.standard }}
          >
            {accountsQuery.error instanceof Error ? accountsQuery.error.message : 'Hesaplar yüklenemedi'}
          </Text>
        ) : null}

        {accountsQuery.isSuccess && accounts.length === 0 ? (
          <Stack
            gap="xs"
            style={{ flex: 1, justifyContent: 'center', paddingHorizontal: theme.screenEdge.standard }}
          >
            <Text variant="cardTitle">{allAccounts.length === 0 ? 'Henüz hesap yok' : 'Sonuç bulunamadı'}</Text>
            <Text variant="body" color="textSecondary">
              {allAccounts.length === 0
                ? 'Kasa, banka veya cüzdan hesabı ekleyerek başlayın.'
                : 'Arama terimini veya filtreyi değiştirin.'}
            </Text>
          </Stack>
        ) : (
          <FlatList
            data={accounts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              paddingHorizontal: theme.screenEdge.standard,
              gap: theme.spacing.sm,
              paddingBottom: theme.spacing.xxl,
            }}
            renderItem={({ item }) => (
              <Pressable onPress={() => router.push(`/accounts/${item.id}`)}>
                <Row
                  style={{
                    backgroundColor: theme.colors.surfacePrimary,
                    borderRadius: theme.radius.widget,
                    padding: theme.spacing.md,
                  }}
                  gap="sm"
                  align="center"
                >
                  <BankLogo bankCode={item.bank_code} fallbackIcon={TYPE_ICON[item.type as Account['type']]} size={28} />
                  <Stack gap="xxs" style={{ flex: 1 }}>
                    <Text variant="cardTitle">{item.name}</Text>
                    <Text variant="caption" color="textSecondary">
                      {TYPE_LABEL[item.type as Account['type']]}
                    </Text>
                    {item.iban ? (
                      <Text variant="caption" color="textSecondary" tabular>
                        {maskIban(item.iban)}
                      </Text>
                    ) : null}
                  </Stack>
                  <Text variant="body" tabular>
                    {formatMinorAmount(balanceByAccountId.get(item.id) ?? item.opening_balance_minor, item.currency_code)}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                </Row>
              </Pressable>
            )}
          />
        )}
      </Stack>
    </SafeAreaView>
  );
}

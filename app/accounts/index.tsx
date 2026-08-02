import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Card, Pagination, Pressable, Row, SegmentedControl, Stack, Text, TextField } from '@/components/primitives';
import { Amount } from '@/components/finance/Amount';
import { BankLogo } from '@/components/finance/BankLogo';
import { listAccounts, type Account } from '@/features/accounts/api';
import { getAccountBalances } from '@/features/reports/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
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

const PAGE_SIZE = 10;

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
  const [page, setPage] = useState(0);

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

  // Arama veya filtre değiştiğinde geçerli sayfa anlamsızlaşır — her zaman 1. sayfaya
  // dönülür (obligations/index.tsx'teki aynı render-sırasında-sıfırlama deseni).
  const resetKey = `${search}|${typeFilter}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(accounts.length / PAGE_SIZE));
  const effectivePage = Math.min(page, totalPages - 1);
  const pagedAccounts = accounts.slice(effectivePage * PAGE_SIZE, effectivePage * PAGE_SIZE + PAGE_SIZE);

  const balancesQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'account-balances'] : ['account-balances', 'disabled'],
    queryFn: () => getAccountBalances(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });
  const balanceByAccountId = new Map((balancesQuery.data ?? []).map((b) => [b.accountId, b.balanceMinor]));

  // Toplam bakiye tüm hesapların (filtreden bağımsız) kuruş cinsinden toplamıdır —
  // dashboard'daki BalanceHero ile aynı kural: farklı para birimleri karışsa da tek bir
  // varsayılan para biriminde (TRY) özetlenir.
  const totalBalanceMinor = allAccounts.reduce(
    (sum, a) => sum + (balanceByAccountId.get(a.id) ?? a.opening_balance_minor),
    0
  );

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

        {allAccounts.length > 0 ? (
          <Stack style={{ paddingHorizontal: theme.screenEdge.standard }}>
            <Card style={{ borderRadius: theme.radius.heroWidget, padding: theme.spacing.lg }}>
              <Stack gap="xs">
                <Text variant="caption" color="textSecondary" style={{ letterSpacing: 0.6 }}>
                  TOPLAM BAKİYE
                </Text>
                <Amount
                  amountMinor={totalBalanceMinor}
                  variant="displayAmount"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                />
                <Text variant="caption" color="textSecondary">
                  {allAccounts.length} hesap
                </Text>
              </Stack>
            </Card>
          </Stack>
        ) : null}

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
          <>
          <FlatList
            data={pagedAccounts}
            keyExtractor={(item) => item.id}
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: theme.screenEdge.standard,
              gap: theme.spacing.sm,
              paddingBottom: theme.spacing.xxl,
            }}
            renderItem={({ item }) => {
              const balanceMinor = balanceByAccountId.get(item.id) ?? item.opening_balance_minor;
              const type = item.type as Account['type'];

              return (
                <Pressable onPress={() => router.push(`/accounts/${item.id}`)}>
                  <Card>
                    <Row gap="sm" align="center">
                      <BankLogo bankCode={item.bank_code} fallbackIcon={TYPE_ICON[type]} size={40} />
                      <Stack gap="xxs" style={{ flex: 1 }}>
                        <Text variant="cardTitle" numberOfLines={1}>
                          {item.name}
                        </Text>
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
                          {item.iban ? (
                            <Text variant="caption" color="textSecondary" tabular numberOfLines={1}>
                              {maskIban(item.iban)}
                            </Text>
                          ) : null}
                        </Row>
                      </Stack>
                      <Amount
                        amountMinor={balanceMinor}
                        currencyCode={item.currency_code}
                        variant="cardTitle"
                        numberOfLines={1}
                        style={{ color: balanceMinor < 0 ? theme.colors.danger : undefined }}
                      />
                    </Row>
                  </Card>
                </Pressable>
              );
            }}
          />
          {totalPages > 1 ? (
            <View
              style={{
                paddingHorizontal: theme.screenEdge.standard,
                paddingTop: theme.spacing.sm,
                paddingBottom: theme.spacing.xs,
                borderTopWidth: 1,
                borderTopColor: theme.colors.border,
              }}
            >
              <Pagination page={effectivePage} totalPages={totalPages} onChange={setPage} />
            </View>
          ) : null}
          </>
        )}
      </Stack>
    </SafeAreaView>
  );
}

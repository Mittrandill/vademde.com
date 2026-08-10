import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import {
  Card,
  EmptyState,
  Pagination,
  Pressable,
  Row,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  TextField,
} from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { Amount } from '@/components/finance/Amount';
import { BankLogo } from '@/components/finance/BankLogo';
import { ValueUnitBadge } from '@/components/finance/ValueUnitPicker';
import { HeroStatCard } from '@/components/finance/HeroStatCard';
import { listAccounts, type Account } from '@/features/accounts/api';
import { getAccountBalances } from '@/features/reports/api';
import { getValueUnit } from '@/features/valueUnits/units';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { maskIban } from '@/utils/iban';
import { queryKeys } from '@/services/queryKeys';
import { matchesSearch, normalizeForSearch } from '@/utils/search';

const TYPE_ICON: Record<Account['type'], keyof typeof Ionicons.glyphMap> = {
  cash: 'cash-outline',
  bank: 'business-outline',
  wallet: 'wallet-outline',
  credit_card: 'card-outline',
  pos: 'storefront-outline',
};

const TYPE_LABEL: Record<Account['type'], string> = {
  cash: 'Kasa',
  bank: 'Banka',
  wallet: 'Cüzdan',
  credit_card: 'Kredi Kartı',
  pos: 'POS',
};

const PAGE_SIZE = 10;

type TypeFilterKey = 'all' | Account['type'];

const TYPE_FILTERS: { key: TypeFilterKey; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'cash', label: 'Kasa' },
  { key: 'bank', label: 'Banka' },
  { key: 'wallet', label: 'Cüzdan' },
  { key: 'credit_card', label: 'Kredi Kartı' },
  { key: 'pos', label: 'POS' },
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
  // varsayılan para biriminde (TRY) özetlenir. Kredi kartı hariç: kart borcu zaten
  // Kredilerim'de obligation olarak ayrıca takip ediliyor, buraya karışırsa nakit/banka
  // bakiyeleriyle karışıp yanlış bir toplam çıkar.
  const totalBalanceMinor = allAccounts
    .filter((a) => a.type !== 'credit_card')
    .reduce((sum, a) => sum + (balanceByAccountId.get(a.id) ?? a.opening_balance_minor), 0);

  // Tek dikey scroll sahibi: başlık, hero bakiye kartı, arama ve filtre FlatList'in
  // ListHeaderComponent'ine taşınır ki liste kaydırıldığında hepsi tek parça halinde
  // birlikte kaysın — üstte sabit kalıp listeyi küçük bir kutuya sıkıştırmasınlar.
  const listHeader = (
    <Stack gap="lg" style={{ paddingTop: theme.spacing.md, paddingBottom: theme.spacing.md }}>
      <ScreenHeader
        title="Hesaplar"
        left={{ icon: 'close', accessibilityLabel: 'Kapat', onPress: () => router.back() }}
        right={{
          icon: 'add',
          accessibilityLabel: 'Yeni hesap',
          variant: 'accent',
          onPress: () => router.push('/accounts/new'),
        }}
      />

      {allAccounts.length > 0 ? (
        <HeroStatCard
          label="TOPLAM BAKİYE"
          amountMinor={totalBalanceMinor}
          caption={`${allAccounts.length} hesap`}
        />
      ) : null}

      {allAccounts.length > 1 ? (
        <Pressable
          onPress={() => router.push('/transactions/new?direction=transfer')}
          style={{
            height: theme.controlHeight.segmented,
            borderRadius: theme.radius.widget,
            borderWidth: 1,
            borderColor: theme.colors.brandPrimary,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: theme.spacing.xxs,
          }}
        >
          <Ionicons name="swap-horizontal-outline" size={16} color={theme.colors.brandPrimary} />
          <Text variant="body" color="brandPrimary">
            Hesaplar Arası Transfer
          </Text>
        </Pressable>
      ) : null}

      <Stack gap="sm">
        <TextField
          placeholder="Hesap adı veya IBAN'da ara"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
        />
        <SegmentedControl options={TYPE_FILTERS} value={typeFilter} onChange={setTypeFilter} size="compact" stretch />
      </Stack>

      {accountsQuery.error ? (
        <Text variant="body" color="danger">
          {accountsQuery.error instanceof Error ? accountsQuery.error.message : 'Hesaplar yüklenemedi'}
        </Text>
      ) : null}
    </Stack>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <FlatList
        data={pagedAccounts}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: theme.screenEdge.standard,
          gap: theme.spacing.sm,
          paddingBottom: theme.spacing.xxl,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => {
          const balanceMinor = balanceByAccountId.get(item.id) ?? item.opening_balance_minor;
          const type = item.type as Account['type'];

          return (
            <Pressable onPress={() => router.push(`/accounts/${item.id}`)}>
              <Card>
                <Row gap="sm" align="center">
                  {type === 'cash' ? (
                    <ValueUnitBadge unitCode={item.currency_code} size={36} />
                  ) : (
                    <BankLogo bankCode={item.bank_code} fallbackIcon={TYPE_ICON[type]} size={36} />
                  )}
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
                    valueUnitType={type === 'cash' ? getValueUnit(item.currency_code).unitType : undefined}
                    variant="cardTitle"
                    numberOfLines={1}
                    overdue={balanceMinor < 0}
                  />
                </Row>
              </Card>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !accountsQuery.isSuccess ? (
            <Stack gap="sm">
              <Skeleton height={64} borderRadius={theme.radius.widget} />
              <Skeleton height={64} borderRadius={theme.radius.widget} />
              <Skeleton height={64} borderRadius={theme.radius.widget} />
            </Stack>
          ) : (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <EmptyState
                icon="wallet-outline"
                title={allAccounts.length === 0 ? 'Henüz hesap yok' : 'Sonuç bulunamadı'}
                message={
                  allAccounts.length === 0
                    ? 'Kasa, banka veya cüzdan hesabı ekleyerek başlayın.'
                    : 'Arama terimini veya filtreyi değiştirin.'
                }
              />
            </View>
          )
        }
        ListFooterComponent={
          totalPages > 1 ? (
            <View
              style={{
                paddingTop: theme.spacing.sm,
                borderTopWidth: 1,
                borderTopColor: theme.colors.border,
              }}
            >
              <Pagination page={effectivePage} totalPages={totalPages} onChange={setPage} />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

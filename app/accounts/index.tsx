import {AssetSummary} from '@/features/assets/Summary';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import {
  Divider,
  Pressable,
  Skeleton,
  Stack,
  Text,
} from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { Amount } from '@/components/finance/Amount';
import { BankLogo } from '@/components/finance/BankLogo';
import { FinanceFilterCard } from '@/components/finance/FinanceFilterCard';
import { FinanceListHero } from '@/components/finance/FinanceListHero';
import { FinanceListEmptyState, FinanceListSurface } from '@/components/finance/FinanceListSurface';
import { ValueUnitBadge } from '@/components/finance/ValueUnitPicker';
import { listAccounts, type Account } from '@/features/accounts/api';
import { getAccountBalances } from '@/features/reports/api';
import { listValueUnitRates, sumToReferenceMinor } from '@/features/valueUnits/api';
import { getValueUnit } from '@/features/valueUnits/units';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { maskIban } from '@/utils/iban';
import { queryKeys } from '@/services/queryKeys';
import { matchesSearch, normalizeForSearch } from '@/utils/search';
import { formatMinorAmount } from '@/utils/money';
import { friendlyErrorMessage } from '@/utils/alerts';
import { t } from '@/i18n';
import { ACCOUNT_TYPE_LABEL } from '@/features/accounts/accountTypes';

const TYPE_ICON: Record<Account['type'], keyof typeof Ionicons.glyphMap> = {
  cash: 'cash-outline',
  bank: 'business-outline',
  wallet: 'wallet-outline',
  credit_card: 'card-outline',
  pos: 'storefront-outline',
};


const PAGE_SIZE = 10;

type TypeFilterKey = 'all' | Account['type'];

const TYPE_FILTERS: { key: TypeFilterKey; readonly label: string }[] = [
  { key: 'all', get label() { return t('common.all'); } },
  ...(['cash', 'bank', 'wallet', 'credit_card', 'pos'] as const).map((key) => ({
    key,
    get label() {
      return ACCOUNT_TYPE_LABEL[key];
    },
  })),
];

export default function AccountsScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
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

  // Hesaplar farklı değer birimlerinde olabilir (TRY, USD, gram_altin, ...) — bkz.
  // features/valueUnits/units.ts. Toplama girmeden önce her hesap güncel TL karşılığına
  // çevrilir (bkz. features/valueUnits/api.ts sumToReferenceMinor, aynı desen
  // obligation toplamlarında kullanılıyor).
  const valueUnitRatesQuery = useQuery({
    queryKey: queryKeys.valueUnitRates(),
    queryFn: listValueUnitRates,
  });

  // Toplam bakiye tüm hesapların (filtreden bağımsız) TL karşılığının toplamıdır. Kredi
  // kartı hariç: kart borcu zaten Kredilerim'de obligation olarak ayrıca takip ediliyor,
  // buraya karışırsa nakit/banka bakiyeleriyle karışıp yanlış bir toplam çıkar.
  const totalBalanceMinor = sumToReferenceMinor(
    allAccounts
      .filter((a) => a.type !== 'credit_card')
      .map((a) => ({
        amountMinor: balanceByAccountId.get(a.id) ?? a.opening_balance_minor,
        unitCode: a.currency_code,
      })),
    valueUnitRatesQuery.data ?? []
  );

  const openNewAccount = () => router.push('/accounts/new');
  const footerLabel = accounts.length
    ? t('accounts.list.footer', {
        from: effectivePage * PAGE_SIZE + 1,
        to: Math.min((effectivePage + 1) * PAGE_SIZE, accounts.length),
        count: accounts.length,
      })
    : t('accounts.list.noneShown');
  const isFiltered = search.trim().length > 0 || typeFilter !== 'all';
  const cashCount = allAccounts.filter((account) => account.type === 'cash').length;
  const bankCount = allAccounts.filter((account) => account.type === 'bank').length;
  const otherCount = allAccounts.length - cashCount - bankCount;

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.screenEdge.standard,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.xxl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Stack gap="lg">
          <ScreenHeader
            title={t('accounts.list.title')}
            left={{ icon: 'close', accessibilityLabel: t('common.close'), onPress: () => router.back() }}
            right={{ icon: 'add', accessibilityLabel: t('accounts.list.newAccount'), variant: 'accent', onPress: openNewAccount }}
          />

          <FinanceListHero
            label={t('accounts.list.totalBalanceUpper')}
            description={t('accounts.list.totalBalanceHint')}
            amountText={formatMinorAmount(totalBalanceMinor)}
            amountColor={totalBalanceMinor < 0 ? 'textPrimary' : 'success'}
            metrics={[
              { label: t('accounts.list.totalAccountsUpper'), value: allAccounts.length, caption: t('accounts.list.allRecords') },
              { label: t('accounts.list.cashUpper'), value: cashCount, caption: t('accounts.list.cashHint') },
              { label: t('accounts.list.bankUpper'), value: bankCount, caption: t('accounts.list.bankHint') },
              { label: t('accounts.list.otherUpper'), value: otherCount, caption: t('accounts.list.otherHint') },
            ]}
          />

          <AssetSummary />
          <FinanceFilterCard
            title={t('accounts.list.typeUpper')}
            description={t('accounts.list.typeHint')}
            options={TYPE_FILTERS}
            value={typeFilter}
            onChange={setTypeFilter}
          />

          <FinanceListSurface
            searchPlaceholder={t('accounts.list.searchPlaceholder')}
            searchValue={search}
            onSearchChange={setSearch}
            footerLabel={pagedAccounts.length > 0 ? footerLabel : undefined}
            actionLabel={pagedAccounts.length > 0 ? t('accounts.list.newAccount') : undefined}
            onActionPress={pagedAccounts.length > 0 ? openNewAccount : undefined}
            page={effectivePage}
            totalPages={totalPages}
            onPageChange={setPage}
          >
            {accountsQuery.error ? (
              <Text variant="body" color="danger" style={{ padding: theme.spacing.lg }}>
                {friendlyErrorMessage(accountsQuery.error, t('accounts.list.loadFailed'))}
              </Text>
            ) : !accountsQuery.isSuccess ? (
              <Stack gap="sm" style={{ padding: theme.spacing.lg }}>
                <Skeleton height={64} borderRadius={theme.radius.widget} />
                <Skeleton height={64} borderRadius={theme.radius.widget} />
                <Skeleton height={64} borderRadius={theme.radius.widget} />
              </Stack>
            ) : pagedAccounts.length === 0 ? (
              <FinanceListEmptyState
                icon={isFiltered ? 'search-outline' : 'wallet-outline'}
                title={allAccounts.length === 0 ? t('accounts.list.emptyTitle') : t('accounts.list.noResults')}
                message={allAccounts.length === 0 ? t('accounts.list.emptyBody') : t('accounts.list.noResultsBody')}
                actionLabel={isFiltered ? undefined : t('accounts.list.newAccount')}
                onActionPress={isFiltered ? undefined : openNewAccount}
              />
            ) : (
              pagedAccounts.map((item, index) => (
                <View key={item.id}>
                  {index > 0 ? <Divider /> : null}
                  <AccountRow
                    account={item}
                    balanceMinor={balanceByAccountId.get(item.id) ?? item.opening_balance_minor}
                  />
                </View>
              ))
            )}
          </FinanceListSurface>
        </Stack>
      </ScrollView>
    </SafeAreaView>
  );
}

function AccountRow({
  account,
  balanceMinor,
}: {
  account: Account;
  balanceMinor: number;
}) {
  const theme = useTheme();
  const type = account.type as Account['type'];
  const detail = account.iban ? `${ACCOUNT_TYPE_LABEL[type]} · ${maskIban(account.iban)}` : ACCOUNT_TYPE_LABEL[type];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('accounts.list.openDetailA11y', { name: account.name })}
      onPress={() => router.push(`/accounts/${account.id}`)}
      style={{
        minHeight: 60,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
      }}
    >
      {type === 'cash' ? (
        <ValueUnitBadge unitCode={account.currency_code} size={34} />
      ) : (
        <BankLogo bankCode={account.bank_code} fallbackIcon={TYPE_ICON[type]} size={34} />
      )}
      <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
        <Text variant="cardTitle" numberOfLines={1}>{account.name}</Text>
        <Text variant="caption" color="textSecondary" tabular numberOfLines={1}>{detail}</Text>
      </Stack>
      <Amount
        amountMinor={balanceMinor}
        currencyCode={account.currency_code}
        valueUnitType={type === 'cash' ? getValueUnit(account.currency_code).unitType : undefined}
        variant="cardTitle"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.68}
        style={{ maxWidth: '34%' }}
      />
      <Ionicons name="chevron-forward" size={14} color={theme.colors.mutedControl} />
    </Pressable>
  );
}

import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
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
import { ReferenceValueRow } from '@/components/finance/ReferenceValueRow';
import { listAccounts, type Account } from '@/features/accounts/api';
import { getAccountBalances } from '@/features/reports/api';
import { listValueUnitRates, sumToReferenceMinor } from '@/features/valueUnits/api';
import { getValueUnit } from '@/features/valueUnits/units';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { maskIban } from '@/utils/iban';
import { queryKeys } from '@/services/queryKeys';
import { matchesSearch, normalizeForSearch } from '@/utils/search';
import { formatMinorAmount } from '@/utils/money';

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
    ? `${effectivePage * PAGE_SIZE + 1}–${Math.min((effectivePage + 1) * PAGE_SIZE, accounts.length)} / ${accounts.length} hesap`
    : '0 hesap gösteriliyor';
  const isFiltered = search.trim().length > 0 || typeFilter !== 'all';
  const cashCount = allAccounts.filter((account) => account.type === 'cash').length;
  const bankCount = allAccounts.filter((account) => account.type === 'bank').length;
  const otherCount = allAccounts.length - cashCount - bankCount;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
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
            title="Hesaplar"
            left={{ icon: 'close', accessibilityLabel: 'Kapat', onPress: () => router.back() }}
            right={{ icon: 'add', accessibilityLabel: 'Yeni hesap', variant: 'accent', onPress: openNewAccount }}
          />

          <FinanceListHero
            label="TOPLAM BAKİYE"
            description="Kredi kartları hariç hesap bakiyelerinizin TL karşılığı"
            amountText={formatMinorAmount(totalBalanceMinor)}
            amountColor={totalBalanceMinor < 0 ? 'danger' : 'success'}
            metrics={[
              { label: 'TOPLAM HESAP', value: allAccounts.length, caption: 'Tüm kayıtlar' },
              { label: 'KASA', value: cashCount, caption: 'Nakit hesap' },
              { label: 'BANKA', value: bankCount, caption: 'Banka hesabı' },
              { label: 'DİĞER', value: otherCount, caption: 'Cüzdan, kart ve POS' },
            ]}
          />

          <FinanceFilterCard
            title="HESAP TÜRÜ"
            description="Listede görmek istediğiniz hesap türünü seçin."
            options={TYPE_FILTERS}
            value={typeFilter}
            onChange={setTypeFilter}
          />

          <FinanceListSurface
            searchPlaceholder="Hesap adı veya IBAN'da ara"
            searchValue={search}
            onSearchChange={setSearch}
            footerLabel={pagedAccounts.length > 0 ? footerLabel : undefined}
            actionLabel={pagedAccounts.length > 0 ? 'Yeni hesap' : undefined}
            onActionPress={pagedAccounts.length > 0 ? openNewAccount : undefined}
            page={effectivePage}
            totalPages={totalPages}
            onPageChange={setPage}
          >
            {accountsQuery.error ? (
              <Text variant="body" color="danger" style={{ padding: theme.spacing.lg }}>
                {accountsQuery.error instanceof Error ? accountsQuery.error.message : 'Hesaplar yüklenemedi'}
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
                title={allAccounts.length === 0 ? 'Henüz hesap yok' : 'Sonuç bulunamadı'}
                message={allAccounts.length === 0 ? 'Kasa, banka veya cüzdan hesabı ekleyerek başlayın.' : 'Arama terimini veya filtreyi değiştirin.'}
                actionLabel={isFiltered ? undefined : 'Yeni hesap'}
                onActionPress={isFiltered ? undefined : openNewAccount}
              />
            ) : (
              pagedAccounts.map((item, index) => (
                <View key={item.id}>
                  {index > 0 ? <Divider /> : null}
                  <AccountRow
                    account={item}
                    balanceMinor={balanceByAccountId.get(item.id) ?? item.opening_balance_minor}
                    rates={valueUnitRatesQuery.data}
                    ratesLoading={valueUnitRatesQuery.isLoading}
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
  rates,
  ratesLoading,
}: {
  account: Account;
  balanceMinor: number;
  rates: Parameters<typeof ReferenceValueRow>[0]['rates'];
  ratesLoading: boolean;
}) {
  const theme = useTheme();
  const type = account.type as Account['type'];
  const detail = account.iban ? `${TYPE_LABEL[type]} · ${maskIban(account.iban)}` : TYPE_LABEL[type];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${account.name} hesap detayını aç`}
      onPress={() => router.push(`/accounts/${account.id}`)}
      style={{
        minHeight: 86,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
      }}
    >
      {type === 'cash' ? (
        <ValueUnitBadge unitCode={account.currency_code} size={48} />
      ) : (
        <BankLogo bankCode={account.bank_code} fallbackIcon={TYPE_ICON[type]} size={48} />
      )}
      <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
        <Text variant="cardTitle" numberOfLines={1}>{account.name}</Text>
        <Text variant="caption" color="textSecondary" tabular numberOfLines={1}>{detail}</Text>
        {type === 'cash' && account.currency_code !== 'TRY' ? (
          <ReferenceValueRow amountMinor={balanceMinor} unitCode={account.currency_code} rates={rates} isLoading={ratesLoading} />
        ) : null}
      </Stack>
      <Amount
        amountMinor={balanceMinor}
        currencyCode={account.currency_code}
        valueUnitType={type === 'cash' ? getValueUnit(account.currency_code).unitType : undefined}
        variant="cardTitle"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.68}
        style={{ maxWidth: '34%', color: balanceMinor < 0 ? theme.colors.danger : theme.colors.success }}
      />
      <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
    </Pressable>
  );
}

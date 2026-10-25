import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { Divider, Pressable, Skeleton, Stack, Text } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { Amount } from '@/components/finance/Amount';
import { BankLogo } from '@/components/finance/BankLogo';
import { FinanceFilterCard } from '@/components/finance/FinanceFilterCard';
import { FinanceListHero } from '@/components/finance/FinanceListHero';
import { FinanceListEmptyState, FinanceListSurface } from '@/components/finance/FinanceListSurface';
import { listBankSummaries, type BankSummary } from '@/features/banks/api';
import { BANK_NAME } from '@/features/banks/banks';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { matchesSearch, normalizeForSearch } from '@/utils/search';
import { formatMinorAmount } from '@/utils/money';
import { friendlyErrorMessage } from '@/utils/alerts';
import { t } from '@/i18n';

const PAGE_SIZE = 10;

type BankFilterKey = 'all' | 'account' | 'card' | 'loan' | 'overdue';

const BANK_FILTERS: { key: BankFilterKey; readonly label: string }[] = [
  { key: 'all', get label() { return t('common.all'); } },
  { key: 'account', get label() { return t('banks.filterAccount'); } },
  { key: 'card', get label() { return t('banks.filterCard'); } },
  { key: 'loan', get label() { return t('banks.filterLoan'); } },
  { key: 'overdue', get label() { return t('banks.filterOverdue'); } },
];

// Bankalar kullanıcı tarafından doğrudan oluşturulmaz; hesap, kredi kartı ve kredi
// kayıtlarındaki banka kodlarından türetilir. Görsel iskelet Kredilerim ekranıyla aynıdır:
// finansal hero, tek filtre kartı ve bölücülü tek liste yüzeyi.
export default function BanksScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<BankFilterKey>('all');
  const [sortAscending, setSortAscending] = useState(true);
  const [page, setPage] = useState(0);

  const banksQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.bankSummaries(activeWorkspaceId) : ['bank-summaries', 'disabled'],
    queryFn: () => listBankSummaries(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const allBanks = useMemo(() => banksQuery.data ?? [], [banksQuery.data]);
  const totals = useMemo(
    () =>
      allBanks.reduce(
        (result, bank) => ({
          accountCount: result.accountCount + bank.accountCount,
          cardCount: result.cardCount + bank.cardCount,
          loanCount: result.loanCount + bank.loanCount,
          overdueLoanCount: result.overdueLoanCount + bank.overdueLoanCount,
          loanDebtMinor: result.loanDebtMinor + bank.loanDebtMinor,
        }),
        { accountCount: 0, cardCount: 0, loanCount: 0, overdueLoanCount: 0, loanDebtMinor: 0 }
      ),
    [allBanks]
  );

  const banks = useMemo(() => {
    const query = normalizeForSearch(search);
    const filtered = allBanks.filter((bank) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'account' && bank.accountCount > 0) ||
        (filter === 'card' && bank.cardCount > 0) ||
        (filter === 'loan' && bank.loanCount > 0) ||
        (filter === 'overdue' && bank.overdueLoanCount > 0);
      return matchesFilter && matchesSearch(BANK_NAME[bank.bankCode] ?? bank.bankCode, query);
    });

    return filtered.sort((a, b) => {
      const aName = BANK_NAME[a.bankCode] ?? a.bankCode;
      const bName = BANK_NAME[b.bankCode] ?? b.bankCode;
      const order = aName.localeCompare(bName, 'tr');
      return sortAscending ? order : -order;
    });
  }, [allBanks, filter, search, sortAscending]);

  const resetKey = `${filter}|${search}|${sortAscending ? 'asc' : 'desc'}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(banks.length / PAGE_SIZE));
  const effectivePage = Math.min(page, totalPages - 1);
  const pagedBanks = banks.slice(effectivePage * PAGE_SIZE, effectivePage * PAGE_SIZE + PAGE_SIZE);
  const isFiltered = search.trim().length > 0 || filter !== 'all';
  const footerLabel = banks.length
    ? t('banks.footer', {
        from: effectivePage * PAGE_SIZE + 1,
        to: Math.min((effectivePage + 1) * PAGE_SIZE, banks.length),
        count: banks.length,
      })
    : t('banks.noneShown');

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
            title={t('banks.title')}
            left={{ icon: 'close', accessibilityLabel: t('common.close'), onPress: () => router.back() }}
          />

          <FinanceListHero
            label={t('banks.totalLoanUpper')}
            description={t('banks.totalLoanHint')}
            amountText={formatMinorAmount(totals.loanDebtMinor)}
            // Kırmızı yalnızca gecikme içindir (HANDOFF §1); borç tutarı nötr kalır.
            amountColor={totals.overdueLoanCount > 0 ? 'danger' : 'textPrimary'}
            metrics={[
              { label: t('banks.totalBanksUpper'), value: allBanks.length, caption: t('banks.linkedInstitutions') },
              { label: t('banks.accountsUpper'), value: totals.accountCount, caption: t('banks.bankAccounts') },
              { label: t('banks.cardsUpper'), value: totals.cardCount, caption: t('banks.linkedCards') },
              {
                label: t('banks.openLoansUpper'),
                value: totals.loanCount,
                caption: totals.overdueLoanCount > 0 ? t('banks.overdueCount', { count: totals.overdueLoanCount }) : t('banks.activeLoans'),
                valueColor: totals.overdueLoanCount > 0 ? 'danger' : undefined,
              },
            ]}
          />

          <FinanceFilterCard
            title={t('banks.statusUpper')}
            description={t('banks.statusHint')}
            options={BANK_FILTERS}
            value={filter}
            onChange={setFilter}
          />

          <FinanceListSurface
            searchPlaceholder={t('banks.searchPlaceholder')}
            searchValue={search}
            onSearchChange={setSearch}
            sortAction={{
              label: t('banks.sortBank'),
              accessibilityLabel: t('banks.sortByName'),
              icon: sortAscending ? 'arrow-up' : 'arrow-down',
              onPress: () => setSortAscending((value) => !value),
            }}
            footerLabel={pagedBanks.length > 0 ? footerLabel : undefined}
            page={effectivePage}
            totalPages={totalPages}
            onPageChange={setPage}
          >
            {banksQuery.error ? (
              <Text variant="body" color="danger" style={{ padding: theme.spacing.lg }}>
                {friendlyErrorMessage(banksQuery.error, t('banks.loadFailed'))}
              </Text>
            ) : !banksQuery.isSuccess ? (
              <Stack gap="sm" style={{ padding: theme.spacing.lg }}>
                <Skeleton height={72} borderRadius={theme.radius.widget} />
                <Skeleton height={72} borderRadius={theme.radius.widget} />
                <Skeleton height={72} borderRadius={theme.radius.widget} />
              </Stack>
            ) : pagedBanks.length === 0 ? (
              <FinanceListEmptyState
                icon={isFiltered ? 'search-outline' : 'business-outline'}
                title={allBanks.length === 0 ? t('banks.emptyTitle') : t('banks.noResults')}
                message={allBanks.length === 0 ? t('banks.emptyBody') : t('banks.noResultsBody')}
              />
            ) : (
              pagedBanks.map((bank, index) => (
                <View key={bank.bankCode}>
                  {index > 0 ? <Divider /> : null}
                  <BankRow bank={bank} />
                </View>
              ))
            )}
          </FinanceListSurface>
        </Stack>
      </ScrollView>
    </SafeAreaView>
  );
}

function BankRow({ bank }: { bank: BankSummary }) {
  const theme = useTheme();
  const bankName = BANK_NAME[bank.bankCode] ?? bank.bankCode;
  const detailParts = [
    bank.accountCount > 0 ? t('banks.accountCount', { count: bank.accountCount }) : null,
    bank.cardCount > 0 ? t('banks.cardCount', { count: bank.cardCount }) : null,
    bank.loanCount > 0
      ? `${t('banks.loanCount', { count: bank.loanCount })}${
          bank.overdueLoanCount > 0 ? ` · ${t('banks.overdueCount', { count: bank.overdueLoanCount })}` : ''
        }`
      : null,
  ].filter(Boolean);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('banks.openDetailA11y', { name: bankName })}
      onPress={() => router.push(`/banks/${bank.bankCode}`)}
      style={{
        minHeight: 60,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <BankLogo bankCode={bank.bankCode} fallbackName={bankName} size={34} />
      <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
        <Text variant="cardTitle" numberOfLines={1}>
          {bankName}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {detailParts.length > 0 ? detailParts.join(' · ') : t('banks.noRecords')}
        </Text>
      </Stack>
      <Amount
        amountMinor={bank.loanDebtMinor}
        variant="cardTitle"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.68}
        style={{
          maxWidth: '30%',
          color: bank.loanDebtMinor > 0 ? theme.colors.textPrimary : theme.colors.textSecondary,
        }}
      />
      <Ionicons name="chevron-forward" size={14} color={theme.colors.mutedControl} />
    </Pressable>
  );
}

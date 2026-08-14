import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
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

const PAGE_SIZE = 10;

type BankFilterKey = 'all' | 'account' | 'card' | 'loan' | 'overdue';

const BANK_FILTERS: { key: BankFilterKey; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'account', label: 'Hesabı Olan' },
  { key: 'card', label: 'Kartı Olan' },
  { key: 'loan', label: 'Kredisi Olan' },
  { key: 'overdue', label: 'Gecikmiş' },
];

// Bankalar kullanıcı tarafından doğrudan oluşturulmaz; hesap, kredi kartı ve kredi
// kayıtlarındaki banka kodlarından türetilir. Görsel iskelet Kredilerim ekranıyla aynıdır:
// finansal hero, tek filtre kartı ve bölücülü tek liste yüzeyi.
export default function BanksScreen() {
  const theme = useTheme();
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
    ? `${effectivePage * PAGE_SIZE + 1}–${Math.min((effectivePage + 1) * PAGE_SIZE, banks.length)} / ${banks.length} banka`
    : '0 banka gösteriliyor';

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
            title="Bankalar"
            left={{ icon: 'close', accessibilityLabel: 'Kapat', onPress: () => router.back() }}
          />

          <FinanceListHero
            label="TOPLAM KREDİ BORCU"
            description="Bankalarınıza bağlı açık kredilerin kalan toplamı"
            amountText={formatMinorAmount(totals.loanDebtMinor)}
            amountColor={totals.loanDebtMinor > 0 ? 'danger' : 'textPrimary'}
            metrics={[
              { label: 'TOPLAM BANKA', value: allBanks.length, caption: 'Bağlı kurumlar' },
              { label: 'HESAP', value: totals.accountCount, caption: 'Banka hesapları' },
              { label: 'KREDİ KARTI', value: totals.cardCount, caption: 'Bağlı kartlar' },
              {
                label: 'AÇIK KREDİ',
                value: totals.loanCount,
                caption: totals.overdueLoanCount > 0 ? `${totals.overdueLoanCount} gecikmiş` : 'Aktif krediler',
                valueColor: totals.overdueLoanCount > 0 ? 'danger' : undefined,
              },
            ]}
          />

          <FinanceFilterCard
            title="BANKA DURUMU"
            description="Listede görmek istediğiniz banka bağlantısını seçin."
            options={BANK_FILTERS}
            value={filter}
            onChange={setFilter}
          />

          <FinanceListSurface
            searchPlaceholder="Banka adında ara"
            searchValue={search}
            onSearchChange={setSearch}
            sortAction={{
              label: 'Banka',
              accessibilityLabel: 'Banka adına göre sırala',
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
                {banksQuery.error instanceof Error ? banksQuery.error.message : 'Bankalar yüklenemedi'}
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
                title={allBanks.length === 0 ? 'Henüz banka yok' : 'Sonuç bulunamadı'}
                message={
                  allBanks.length === 0
                    ? 'Bir hesap, kredi kartı veya krediye banka bağladığınızda burada görünür.'
                    : 'Arama terimini veya filtreyi değiştirin.'
                }
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
    bank.accountCount > 0 ? `${bank.accountCount} hesap` : null,
    bank.cardCount > 0 ? `${bank.cardCount} kart` : null,
    bank.loanCount > 0
      ? `${bank.loanCount} kredi${bank.overdueLoanCount > 0 ? ` · ${bank.overdueLoanCount} gecikmiş` : ''}`
      : null,
  ].filter(Boolean);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${bankName} detayını aç`}
      onPress={() => router.push(`/banks/${bank.bankCode}`)}
      style={{
        minHeight: 86,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
      }}
    >
      <BankLogo bankCode={bank.bankCode} fallbackName={bankName} size={48} />
      <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
        <Text variant="cardTitle" numberOfLines={1}>
          {bankName}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {detailParts.length > 0 ? detailParts.join(' · ') : 'Kayıt yok'}
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
          color: bank.loanDebtMinor > 0 ? theme.colors.danger : theme.colors.textSecondary,
        }}
      />
      <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
    </Pressable>
  );
}

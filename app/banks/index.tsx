import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Card, EmptyState, Pagination, Pressable, Row, Skeleton, Stack, Text, TextField } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { Amount } from '@/components/finance/Amount';
import { BankLogo } from '@/components/finance/BankLogo';
import { HeroStatCard } from '@/components/finance/HeroStatCard';
import { listBankSummaries, type BankSummary } from '@/features/banks/api';
import { BANK_NAME } from '@/features/banks/banks';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { matchesSearch, normalizeForSearch } from '@/utils/search';

const PAGE_SIZE = 10;

// Kişi/Firmalar ekranındaki cari listesinin banka karşılığı: en az bir hesabı, kredi
// kartı ya da kredisi olan her banka burada listelenir. Banka bir belge/kayıt türü değil
// (CLAUDE.md kural #2), Kişiler gibi bir taraf/kurum gruplaması olduğundan Daha Fazla >
// Yönetim'den erişilir — Kayıt Türleri ızgarasında değil. Görsel/etkileşim deseni
// app/accounts/index.tsx ile bilinçli olarak aynı (hero + arama + FlatList + sayfalama).
export default function BanksScreen() {
  const theme = useTheme();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const banksQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.bankSummaries(activeWorkspaceId) : ['bank-summaries', 'disabled'],
    queryFn: () => listBankSummaries(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const allBanks = useMemo(() => banksQuery.data ?? [], [banksQuery.data]);

  const banks = useMemo(() => {
    const query = normalizeForSearch(search);
    return allBanks.filter((b) => matchesSearch(BANK_NAME[b.bankCode] ?? b.bankCode, query));
  }, [allBanks, search]);

  // Arama değiştiğinde geçerli sayfa anlamsızlaşır — her zaman 1. sayfaya dönülür
  // (accounts/index.tsx'teki aynı render-sırasında-sıfırlama deseni).
  const resetKey = search;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(banks.length / PAGE_SIZE));
  const effectivePage = Math.min(page, totalPages - 1);
  const pagedBanks = banks.slice(effectivePage * PAGE_SIZE, effectivePage * PAGE_SIZE + PAGE_SIZE);

  const totalLoanDebtMinor = allBanks.reduce((sum, b) => sum + b.loanDebtMinor, 0);

  const listHeader = (
    <Stack gap="lg" style={{ paddingTop: theme.spacing.md, paddingBottom: theme.spacing.md }}>
      <ScreenHeader
        title="Bankalar"
        left={{ icon: 'close', accessibilityLabel: 'Kapat', onPress: () => router.back() }}
      />

      {allBanks.length > 0 ? (
        <HeroStatCard
          label="TOPLAM KREDİ BORCU"
          amountMinor={totalLoanDebtMinor}
          caption={`${allBanks.length} banka`}
        />
      ) : null}

      {allBanks.length > 0 ? (
        <TextField
          placeholder="Banka adında ara"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
        />
      ) : null}

      {banksQuery.error ? (
        <Text variant="body" color="danger">
          {banksQuery.error instanceof Error ? banksQuery.error.message : 'Bankalar yüklenemedi'}
        </Text>
      ) : null}
    </Stack>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <FlatList
        data={pagedBanks}
        keyExtractor={(item) => item.bankCode}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: theme.screenEdge.standard,
          gap: theme.spacing.sm,
          paddingBottom: theme.spacing.xxl,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => <BankRow bank={item} />}
        ListEmptyComponent={
          !banksQuery.isSuccess ? (
            <Stack gap="sm">
              <Skeleton height={64} borderRadius={theme.radius.widget} />
              <Skeleton height={64} borderRadius={theme.radius.widget} />
            </Stack>
          ) : (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <EmptyState
                icon="business-outline"
                title={allBanks.length === 0 ? 'Henüz banka yok' : 'Sonuç bulunamadı'}
                message={
                  allBanks.length === 0
                    ? 'Bir hesap, kredi kartı veya kredi ekleyip banka seçtiğinizde burada görünür.'
                    : 'Arama terimini değiştirin.'
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

function BankRow({ bank }: { bank: BankSummary }) {
  const theme = useTheme();
  const bankName = BANK_NAME[bank.bankCode] ?? bank.bankCode;
  const detailParts = [
    bank.accountCount > 0 ? `${bank.accountCount} hesap` : null,
    bank.cardCount > 0 ? `${bank.cardCount} kart` : null,
    bank.loanCount > 0
      ? `${bank.loanCount} kredi${bank.overdueLoanCount > 0 ? ` (${bank.overdueLoanCount} gecikmiş)` : ''}`
      : null,
  ].filter(Boolean);

  return (
    <Pressable onPress={() => router.push(`/banks/${bank.bankCode}`)}>
      <Card>
        <Row gap="sm" align="center">
          <BankLogo bankCode={bank.bankCode} fallbackName={bankName} size={36} />
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="cardTitle" numberOfLines={1}>
              {bankName}
            </Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {detailParts.length > 0 ? detailParts.join(' · ') : 'Kayıt yok'}
            </Text>
          </Stack>
          {bank.loanDebtMinor > 0 ? (
            <Amount amountMinor={bank.loanDebtMinor} variant="cardTitle" numberOfLines={1} overdue />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
          )}
        </Row>
      </Card>
    </Pressable>
  );
}

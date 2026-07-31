import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Button, Pressable, Row, SegmentedControl, Stack, Text, TextField } from '@/components/primitives';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { ObligationIcon } from '@/components/finance/ObligationIcon';
import { BankLogo } from '@/components/finance/BankLogo';
import { listTransactions, TRANSACTIONS_PAGE_SIZE } from '@/features/transactions/api';
import { listObligations, listInstallmentsDue, OBLIGATIONS_PAGE_SIZE } from '@/features/obligations/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';

type FilterKey = 'all' | 'income' | 'expense' | 'payable' | 'receivable' | 'transfer';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'Tümü' },
  { key: 'income', label: 'Gelir' },
  { key: 'expense', label: 'Gider' },
  { key: 'payable', label: 'Borç' },
  { key: 'receivable', label: 'Alacak' },
  { key: 'transfer', label: 'Transfer' },
];

interface HareketRow {
  id: string;
  kind: 'transaction' | 'obligation';
  title: string;
  subtitle: string;
  date: string;
  amountMinor: number;
  currencyCode: string;
  direction: string;
  status?: string;
  documentType?: string;
  bankCode?: string | null;
  installmentId?: string | null;
}

const DIRECTION_PREFIX: Record<string, string> = {
  income: '+',
  expense: '-',
  transfer: '⇄',
};

const DIRECTION_COLOR: Record<string, 'success' | 'textPrimary' | 'textSecondary'> = {
  income: 'success',
  expense: 'textPrimary',
  transfer: 'textSecondary',
};

const TRANSACTION_DIRECTION_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  income: 'arrow-down-circle-outline',
  expense: 'arrow-up-circle-outline',
  transfer: 'swap-horizontal-outline',
};

export default function HareketlerScreen() {
  const theme = useTheme();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const wantsTransactions = filter === 'all' || ['income', 'expense', 'transfer'].includes(filter);
  const wantsObligations = filter === 'all' || ['payable', 'receivable'].includes(filter);
  const transactionDirection = wantsTransactions && filter !== 'all' ? (filter as 'income' | 'expense' | 'transfer') : undefined;
  const obligationDirection = wantsObligations && filter !== 'all' ? (filter as 'payable' | 'receivable') : undefined;

  const transactionsQuery = useInfiniteQuery({
    queryKey: [activeWorkspaceId, 'transactions', 'infinite', transactionDirection ?? 'all', search],
    queryFn: ({ pageParam }) =>
      listTransactions({
        workspaceId: activeWorkspaceId as string,
        direction: transactionDirection,
        search: search || undefined,
        page: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === TRANSACTIONS_PAGE_SIZE ? allPages.length : undefined,
    enabled: !!activeWorkspaceId && wantsTransactions,
  });

  const obligationsQuery = useInfiniteQuery({
    queryKey: [activeWorkspaceId, 'obligations', 'infinite', obligationDirection ?? 'all', search],
    queryFn: ({ pageParam }) =>
      listObligations({
        workspaceId: activeWorkspaceId as string,
        direction: obligationDirection,
        search: search || undefined,
        page: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === OBLIGATIONS_PAGE_SIZE ? allPages.length : undefined,
    enabled: !!activeWorkspaceId && wantsObligations,
  });

  // Taksitli kredi/borçlarda her taksit ayrı satır olarak görünür (bkz. listInstallmentsDue);
  // bu obligation'ların tekil listObligations satırı aşağıda dışlanır. Arama, sadece taksitsiz
  // kayıtlarda ve işlemlerde uygulanır — taksitlere metin araması eklenmemiştir.
  const installmentsQuery = useInfiniteQuery({
    queryKey: [activeWorkspaceId, 'obligations', 'installments-infinite', obligationDirection ?? 'all'],
    queryFn: ({ pageParam }) =>
      listInstallmentsDue({
        workspaceId: activeWorkspaceId as string,
        direction: obligationDirection,
        page: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === OBLIGATIONS_PAGE_SIZE ? allPages.length : undefined,
    enabled: !!activeWorkspaceId && wantsObligations && !search,
  });

  const rows = useMemo<HareketRow[]>(() => {
    const transactionRows: HareketRow[] = wantsTransactions
      ? (transactionsQuery.data?.pages.flat() ?? []).map((t) => ({
          id: t.id,
          kind: 'transaction',
          title:
            t.description?.trim() ||
            t.category?.name ||
            (t.direction === 'transfer' ? 'Transfer' : t.direction === 'income' ? 'Gelir' : 'Gider'),
          subtitle: t.counterparty?.name || t.account?.name || '',
          date: t.occurred_at,
          amountMinor: t.amount_minor,
          currencyCode: t.currency_code,
          direction: t.direction,
          bankCode: t.account?.bank_code ?? null,
        }))
      : [];

    const installmentItems = wantsObligations ? (installmentsQuery.data?.pages.flat() ?? []) : [];
    const obligationIdsWithInstallments = new Set(installmentItems.map((i) => i.id));

    const obligationRows: HareketRow[] = wantsObligations
      ? (obligationsQuery.data?.pages.flat() ?? [])
          .filter((o) => !obligationIdsWithInstallments.has(o.id))
          .map((o) => ({
            id: o.id,
            kind: 'obligation',
            title: o.title,
            subtitle: o.counterparty?.name || o.category?.name || '',
            date: o.due_date ?? o.created_at,
            amountMinor: o.total_amount_minor,
            currencyCode: o.currency_code,
            direction: o.direction,
            status: o.status,
            documentType: o.document_type,
            bankCode: o.bank_code,
          }))
      : [];

    const installmentRows: HareketRow[] = installmentItems.map((o) => ({
      id: o.id,
      kind: 'obligation',
      title: `${o.title} — ${o.installment_number}. Taksit`,
      subtitle: o.counterparty?.name || o.category?.name || '',
      date: o.due_date ?? o.created_at,
      amountMinor: o.total_amount_minor,
      currencyCode: o.currency_code,
      direction: o.direction,
      status: o.status,
      documentType: o.document_type,
      bankCode: o.bank_code,
      installmentId: o.installment_id,
    }));

    return [...transactionRows, ...obligationRows, ...installmentRows].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [transactionsQuery.data, obligationsQuery.data, installmentsQuery.data, wantsTransactions, wantsObligations]);

  const hasNextPage =
    (wantsTransactions && transactionsQuery.hasNextPage) ||
    (wantsObligations && (obligationsQuery.hasNextPage || installmentsQuery.hasNextPage));
  const isFetchingNextPage =
    transactionsQuery.isFetchingNextPage || obligationsQuery.isFetchingNextPage || installmentsQuery.isFetchingNextPage;

  function loadMore() {
    if (wantsTransactions && transactionsQuery.hasNextPage) transactionsQuery.fetchNextPage();
    if (wantsObligations && obligationsQuery.hasNextPage) obligationsQuery.fetchNextPage();
    if (wantsObligations && installmentsQuery.hasNextPage) installmentsQuery.fetchNextPage();
  }

  const error = transactionsQuery.error || obligationsQuery.error || installmentsQuery.error;
  const isLoading = transactionsQuery.isLoading || obligationsQuery.isLoading || (wantsObligations && !search && installmentsQuery.isLoading);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' }),
    []
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <Stack gap="md" style={{ flex: 1, paddingTop: theme.spacing.md }}>
        <Row style={{ paddingHorizontal: theme.screenEdge.standard }} align="center">
          <Text variant="pageTitle" style={{ flex: 1 }}>
            Hareketler
          </Text>
          <Pressable
            onPress={() =>
              Alert.alert('Yeni Kayıt', 'Ne eklemek istersiniz?', [
                { text: 'İşlem (Gelir/Gider/Transfer)', onPress: () => router.push('/transactions/new') },
                { text: 'Borç / Alacak', onPress: () => router.push('/obligations/new') },
                { text: 'Vazgeç', style: 'cancel' },
              ])
            }
            hitSlop={12}
          >
            <Ionicons name="add-circle" size={30} color={theme.colors.brandPrimary} />
          </Pressable>
        </Row>

        <Row style={{ paddingHorizontal: theme.screenEdge.standard }} align="center">
          <TextField
            placeholder="Açıklama veya başlıkta ara"
            value={searchInput}
            onChangeText={setSearchInput}
            returnKeyType="search"
            autoCorrect={false}
            style={{ flex: 1 }}
          />
        </Row>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ paddingHorizontal: theme.screenEdge.standard }}
        >
          <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />
        </ScrollView>

        {error ? (
          <Text variant="body" color="danger" style={{ paddingHorizontal: theme.screenEdge.standard }}>
            {error instanceof Error ? error.message : 'Hareketler yüklenemedi'}
          </Text>
        ) : null}

        {!isLoading && rows.length === 0 ? (
          <Stack
            gap="xs"
            style={{ flex: 1, justifyContent: 'center', paddingHorizontal: theme.screenEdge.standard }}
          >
            <Text variant="cardTitle">{search ? 'Sonuç bulunamadı' : 'Henüz hareket yok'}</Text>
            <Text variant="body" color="textSecondary">
              {search ? 'Farklı bir arama terimi deneyin.' : 'Sağ üstteki + ile ilk kaydınızı ekleyin.'}
            </Text>
          </Stack>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => `${item.kind}-${item.id}${item.installmentId ? `-${item.installmentId}` : ''}`}
            contentContainerStyle={{
              paddingHorizontal: theme.screenEdge.standard,
              gap: theme.spacing.sm,
              paddingBottom: 120,
            }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() =>
                  item.kind === 'obligation'
                    ? router.push(`/obligations/${item.id}`)
                    : router.push({ pathname: '/transactions/new', params: { id: item.id } })
                }
              >
                <Row
                  gap="sm"
                  align="center"
                  style={{
                    backgroundColor: theme.colors.surfacePrimary,
                    borderRadius: theme.radius.widget,
                    padding: theme.spacing.md,
                  }}
                >
                {item.kind === 'obligation' ? (
                  <ObligationIcon documentType={item.documentType ?? 'diger'} bankCode={item.bankCode} size={28} />
                ) : (
                  <BankLogo bankCode={item.bankCode} fallbackIcon={TRANSACTION_DIRECTION_ICON[item.direction]} size={28} />
                )}
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="cardTitle">{item.title}</Text>
                  <Row gap="xs">
                    {item.subtitle ? (
                      <Text variant="caption" color="textSecondary">
                        {item.subtitle}
                      </Text>
                    ) : null}
                    <Text variant="caption" color="textSecondary">
                      {dateFormatter.format(new Date(item.date))}
                    </Text>
                  </Row>
                  {item.status ? <StatusBadge status={item.status} /> : null}
                </Stack>
                <Text
                  variant="body"
                  tabular
                  color={item.kind === 'transaction' ? DIRECTION_COLOR[item.direction] : 'textPrimary'}
                >
                  {item.kind === 'transaction' ? DIRECTION_PREFIX[item.direction] : ''}
                  {formatMinorAmount(item.amountMinor, item.currencyCode)}
                </Text>
                </Row>
              </Pressable>
            )}
            ListFooterComponent={
              hasNextPage ? (
                <Button
                  label="Daha Fazla Yükle"
                  variant="secondary"
                  onPress={loadMore}
                  loading={isFetchingNextPage}
                />
              ) : null
            }
          />
        )}
      </Stack>
    </SafeAreaView>
  );
}

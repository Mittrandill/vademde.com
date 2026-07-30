import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Button, Pressable, Row, Stack, Text, TextField } from '@/components/primitives';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { listTransactions, TRANSACTIONS_PAGE_SIZE } from '@/features/transactions/api';
import { listObligations, OBLIGATIONS_PAGE_SIZE } from '@/features/obligations/api';
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
        }))
      : [];

    const obligationRows: HareketRow[] = wantsObligations
      ? (obligationsQuery.data?.pages.flat() ?? []).map((o) => ({
          id: o.id,
          kind: 'obligation',
          title: o.title,
          subtitle: o.counterparty?.name || o.category?.name || '',
          date: o.due_date ?? o.created_at,
          amountMinor: o.total_amount_minor,
          currencyCode: o.currency_code,
          direction: o.direction,
          status: o.status,
        }))
      : [];

    return [...transactionRows, ...obligationRows].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [transactionsQuery.data, obligationsQuery.data, wantsTransactions, wantsObligations]);

  const hasNextPage =
    (wantsTransactions && transactionsQuery.hasNextPage) || (wantsObligations && obligationsQuery.hasNextPage);
  const isFetchingNextPage = transactionsQuery.isFetchingNextPage || obligationsQuery.isFetchingNextPage;

  function loadMore() {
    if (wantsTransactions && transactionsQuery.hasNextPage) transactionsQuery.fetchNextPage();
    if (wantsObligations && obligationsQuery.hasNextPage) obligationsQuery.fetchNextPage();
  }

  const error = transactionsQuery.error || obligationsQuery.error;
  const isLoading = transactionsQuery.isLoading || obligationsQuery.isLoading;

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
          contentContainerStyle={{
            paddingHorizontal: theme.screenEdge.standard,
            gap: theme.spacing.xs,
            alignItems: 'center',
          }}
        >
          {FILTERS.map((item) => {
            const selected = item.key === filter;
            return (
              <Pressable
                key={item.key}
                onPress={() => setFilter(item.key)}
                style={{
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.xs,
                  borderRadius: 999,
                  backgroundColor: selected ? theme.colors.brandPrimary : theme.colors.surfacePrimary,
                }}
              >
                <Text
                  variant="body"
                  style={{ color: selected ? theme.colors.brandPrimaryText : theme.colors.textSecondary }}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
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
            keyExtractor={(item) => `${item.kind}-${item.id}`}
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
                  style={{
                    backgroundColor: theme.colors.surfacePrimary,
                    borderRadius: theme.radius.widget,
                    padding: theme.spacing.md,
                  }}
                >
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

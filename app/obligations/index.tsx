import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Card, Pressable, Row, SegmentedControl, Stack, Text, TextField } from '@/components/primitives';
import { Amount } from '@/components/finance/Amount';
import { ObligationIcon } from '@/components/finance/ObligationIcon';
import { StatusBadge } from '@/components/finance/StatusBadge';
import {
  listObligations,
  getObligationSummary,
  ACTIVE_OBLIGATION_STATUSES,
  CLOSED_OBLIGATION_STATUSES,
  OBLIGATIONS_PAGE_SIZE,
  type Obligation,
} from '@/features/obligations/api';
import { DOCUMENT_TYPE_LABEL } from '@/features/obligations/documentTypes';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });

type DirectionKey = 'all' | 'payable' | 'receivable';
type StatusKey = 'active' | 'overdue' | 'closed' | 'all';

const STATUS_OPTIONS: { key: StatusKey; label: string }[] = [
  { key: 'active', label: 'Aktif' },
  { key: 'overdue', label: 'Gecikmiş' },
  { key: 'closed', label: 'Kapanmış' },
  { key: 'all', label: 'Hepsi' },
];

const STATUSES_BY_KEY: Record<StatusKey, Obligation['status'][] | undefined> = {
  active: ACTIVE_OBLIGATION_STATUSES,
  overdue: ['gecikti'],
  closed: CLOSED_OBLIGATION_STATUSES,
  all: undefined,
};

// Tek ekran tüm belge türlerini karşılar: başlık ve boş-durum metni `type` parametresinden
// türetilir (docs/01-finansal-kayit-modeli.md §3.2). Yeni bir belge türü eklemek için
// documentTypes.ts'e satır eklemek yeterlidir, yeni ekran gerekmez.
export default function ObligationsByTypeScreen() {
  const theme = useTheme();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const { type } = useLocalSearchParams<{ type?: string }>();
  const documentType = typeof type === 'string' ? type : undefined;
  const title = documentType ? (DOCUMENT_TYPE_LABEL[documentType] ?? 'Kayıtlar') : 'Tüm Kayıtlar';

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [directionKey, setDirectionKey] = useState<DirectionKey>('all');
  const [statusKey, setStatusKey] = useState<StatusKey>('active');

  // hareketler.tsx ile aynı desen: her tuşta sorgu atmamak için 300ms debounce.
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const direction = directionKey === 'all' ? undefined : directionKey;
  const statuses = STATUSES_BY_KEY[statusKey];
  const enabled = !!activeWorkspaceId && !!documentType;

  const filterKey = `${documentType ?? 'all'}|${directionKey}|${statusKey}|${search}`;

  const obligationsQuery = useInfiniteQuery({
    queryKey: activeWorkspaceId
      ? queryKeys.obligationsByTypeList(activeWorkspaceId, filterKey)
      : ['obligations-by-type', 'disabled'],
    queryFn: ({ pageParam }) =>
      listObligations({
        workspaceId: activeWorkspaceId as string,
        documentType,
        direction,
        statuses,
        search: search || undefined,
        page: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === OBLIGATIONS_PAGE_SIZE ? allPages.length : undefined,
    enabled,
  });

  const summaryQuery = useQuery({
    queryKey: activeWorkspaceId
      ? queryKeys.obligationsByTypeSummary(activeWorkspaceId, filterKey)
      : ['obligations-by-type-summary', 'disabled'],
    queryFn: () =>
      getObligationSummary({
        workspaceId: activeWorkspaceId as string,
        documentType,
        direction,
        statuses,
        search: search || undefined,
      }),
    enabled,
  });

  const rows = useMemo(() => obligationsQuery.data?.pages.flat() ?? [], [obligationsQuery.data]);
  const summary = summaryQuery.data;
  const isFiltered = search.length > 0 || directionKey !== 'all' || statusKey !== 'active';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <Stack gap="md" style={{ flex: 1, paddingTop: theme.spacing.md }}>
        <Row style={{ paddingHorizontal: theme.screenEdge.standard }} align="center">
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
          </Pressable>
          <Text variant="pageTitle" style={{ flex: 1, marginLeft: theme.spacing.sm }} numberOfLines={1}>
            {title}
          </Text>
          <Pressable onPress={() => router.push('/obligations/new')} hitSlop={12}>
            <Ionicons name="add-circle" size={30} color={theme.colors.brandPrimary} />
          </Pressable>
        </Row>

        <Row style={{ paddingHorizontal: theme.screenEdge.standard }}>
          <TextField
            placeholder="Başlıkta ara"
            value={searchInput}
            onChangeText={setSearchInput}
            returnKeyType="search"
            autoCorrect={false}
            style={{ flex: 1 }}
          />
        </Row>

        {/* Tek filtre satırı: durum. Yön filtresi ayrı bir kontrol satırı yerine aşağıdaki
            özet kartının hücrelerine gömülü — kullanıcı zaten baktığı rakama dokunarak
            filtreliyor, böylece iki ayrı kapsül satırı üst üste yığılmıyor. */}
        <Stack style={{ paddingHorizontal: theme.screenEdge.standard }}>
          <SegmentedControl
            options={STATUS_OPTIONS}
            value={statusKey}
            onChange={setStatusKey}
            size="compact"
            stretch
          />
        </Stack>

        {obligationsQuery.error ? (
          <Text variant="body" color="danger" style={{ paddingHorizontal: theme.screenEdge.standard }}>
            {obligationsQuery.error instanceof Error ? obligationsQuery.error.message : 'Kayıtlar yüklenemedi'}
          </Text>
        ) : null}

        {summary && summary.count > 0 ? (
          <Card style={{ marginHorizontal: theme.screenEdge.standard, padding: theme.spacing.xs }}>
            <Row gap="xxs">
              <SummaryCell
                label="BORÇ"
                selected={directionKey === 'payable'}
                onPress={() => setDirectionKey(directionKey === 'payable' ? 'all' : 'payable')}
              >
                <Amount
                  amountMinor={summary.payableMinor}
                  direction="payable"
                  variant="cardTitle"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                />
              </SummaryCell>
              <SummaryCell
                label="ALACAK"
                selected={directionKey === 'receivable'}
                onPress={() => setDirectionKey(directionKey === 'receivable' ? 'all' : 'receivable')}
              >
                <Amount
                  amountMinor={summary.receivableMinor}
                  direction="receivable"
                  variant="cardTitle"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                />
              </SummaryCell>
              <SummaryCell
                label="GECİKEN"
                selected={statusKey === 'overdue'}
                onPress={() => setStatusKey(statusKey === 'overdue' ? 'active' : 'overdue')}
              >
                <Text variant="cardTitle" color={summary.overdueCount > 0 ? 'danger' : 'textPrimary'} tabular>
                  {summary.overdueCount}
                </Text>
              </SummaryCell>
            </Row>
          </Card>
        ) : null}

        {/* Özet listeden değil ayrı bir sorgudan gelir; sayfalandırmadan etkilenmez. */}
        {summary ? (
          <Text variant="caption" color="textSecondary" style={{ paddingHorizontal: theme.screenEdge.standard }}>
            {summary.count} kayıt
          </Text>
        ) : null}

        {!obligationsQuery.isLoading && rows.length === 0 ? (
          <Stack gap="xs" style={{ flex: 1, justifyContent: 'center', paddingHorizontal: theme.screenEdge.standard }}>
            <Text variant="cardTitle">{isFiltered ? 'Sonuç bulunamadı' : `Henüz ${title.toLocaleLowerCase('tr-TR')} kaydı yok`}</Text>
            <Text variant="body" color="textSecondary">
              {isFiltered
                ? 'Arama terimini veya filtreleri değiştirin.'
                : 'Belge tarayarak veya manuel giriş yaparak ekleyebilirsiniz.'}
            </Text>
          </Stack>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              paddingHorizontal: theme.screenEdge.standard,
              gap: theme.spacing.sm,
              paddingBottom: theme.spacing.huge,
            }}
            onEndReached={() => {
              if (obligationsQuery.hasNextPage && !obligationsQuery.isFetchingNextPage) {
                obligationsQuery.fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.4}
            renderItem={({ item }) => (
              <Pressable onPress={() => router.push(`/obligations/${item.id}`)}>
                <Card>
                  <Row gap="sm">
                    <ObligationIcon documentType={item.document_type} bankCode={item.bank_code} size={28} />
                    <Stack gap="xxs" style={{ flex: 1 }}>
                      <Text variant="cardTitle" numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Row gap="xs">
                        <Text variant="caption" color="textSecondary">
                          {item.due_date ? dateFormatter.format(new Date(item.due_date)) : 'Vade yok'}
                        </Text>
                        <StatusBadge status={item.status} />
                      </Row>
                      {item.counterparty?.name ? (
                        <Text variant="caption" color="textSecondary" numberOfLines={1}>
                          {item.counterparty.name}
                        </Text>
                      ) : null}
                    </Stack>
                    <Amount
                      amountMinor={item.remaining_amount_minor}
                      currencyCode={item.currency_code}
                      direction={item.direction as 'payable' | 'receivable'}
                      overdue={item.status === 'gecikti'}
                      variant="body"
                    />
                  </Row>
                </Card>
              </Pressable>
            )}
            ListFooterComponent={
              obligationsQuery.isFetchingNextPage ? (
                <Row style={{ justifyContent: 'center', paddingVertical: theme.spacing.md }}>
                  <ActivityIndicator color={theme.colors.textSecondary} />
                </Row>
              ) : obligationsQuery.hasNextPage ? (
                <Pressable
                  onPress={() => obligationsQuery.fetchNextPage()}
                  style={{
                    alignSelf: 'center',
                    marginTop: theme.spacing.xs,
                    paddingHorizontal: theme.spacing.lg,
                    paddingVertical: theme.spacing.sm,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Text variant="body" color="textSecondary">
                    Daha Fazla Yükle
                  </Text>
                </Pressable>
              ) : null
            }
          />
        )}
      </Stack>
    </SafeAreaView>
  );
}

interface SummaryCellProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
}

// Özet hücresi aynı zamanda filtre düğmesi: gösterdiği rakama dokunmak o kesite filtreler.
function SummaryCell({ label, selected, onPress, children }: SummaryCellProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{
        flex: 1,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.input,
        backgroundColor: selected ? withAlpha(theme.colors.brandPrimary, 0.16) : 'transparent',
      }}
    >
      <Stack gap="xxs">
        <Text variant="caption" color={selected ? 'brandPrimary' : 'textSecondary'} numberOfLines={1}>
          {label}
        </Text>
        {children}
      </Stack>
    </Pressable>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, InteractionManager, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Button, Card, Divider, Pressable, Row, SegmentedControl, Stack, Text, TextField } from '@/components/primitives';
import { Amount } from '@/components/finance/Amount';
import { ObligationIcon } from '@/components/finance/ObligationIcon';
import { StatusBadge } from '@/components/finance/StatusBadge';
import {
  listObligations,
  getObligationSummary,
  getObligationInstallmentSummaries,
  deleteObligation,
  ACTIVE_OBLIGATION_STATUSES,
  CLOSED_OBLIGATION_STATUSES,
  OBLIGATIONS_PAGE_SIZE,
  type Obligation,
  type ObligationInstallmentSummary,
  type ObligationWithRelations,
} from '@/features/obligations/api';
import { DOCUMENT_TYPE_LABEL, DOCUMENT_TYPE_LABEL_PLURAL, DOCUMENT_TYPE_ICON } from '@/features/obligations/documentTypes';
import { BANK_NAME } from '@/features/banks/banks';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { cancelObligationReminder } from '@/services/notifications';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });

type DirectionKey = 'all' | 'payable' | 'receivable';
type StatusKey = 'active' | 'overdue' | 'closed' | 'all';

const DIRECTION_OPTIONS: { key: DirectionKey; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'payable', label: 'Borç' },
  { key: 'receivable', label: 'Alacak' },
];

const STATUS_OPTIONS: { key: StatusKey; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'active', label: 'Aktif' },
  { key: 'overdue', label: 'Gecikmiş' },
  { key: 'closed', label: 'Kapalı' },
];

const STATUSES_BY_KEY: Record<StatusKey, Obligation['status'][] | undefined> = {
  active: ACTIVE_OBLIGATION_STATUSES,
  overdue: ['gecikti'],
  closed: CLOSED_OBLIGATION_STATUSES,
  all: undefined,
};

// Tek ekran tüm belge türlerini karşılar: başlık ve boş-durum metni `type` parametresinden
// türetilir (docs/01-finansal-kayit-modeli.md §3.2). Yeni bir belge türü eklemek için
// documentTypes.ts'e satır eklemek yeterlidir, yeni ekran gerekmez. Krediye özel kart
// bölümleri (ilerleme çubuğu, faiz oranı, kalan taksit) `document_type === 'kredi'` ile
// değil, o kaydın gerçekten taksitli olup olmadığıyla (hasInstallments) koşullanır —
// böylece kredi kartı ekstresi gibi başka taksitli türler de aynı zengin kartı ücretsiz alır.
export default function ObligationsByTypeScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const { type } = useLocalSearchParams<{ type?: string }>();
  const documentType = typeof type === 'string' ? type : undefined;
  const title = documentType
    ? (DOCUMENT_TYPE_LABEL_PLURAL[documentType] ?? DOCUMENT_TYPE_LABEL[documentType] ?? 'Kayıtlar')
    : 'Tüm Kayıtlar';

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [directionKey, setDirectionKey] = useState<DirectionKey>('all');
  const [statusKey, setStatusKey] = useState<StatusKey>('active');
  const [sortAscending, setSortAscending] = useState(true);

  // hareketler.tsx ile aynı desen: her tuşta sorgu atmamak için 300ms debounce.
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const direction = directionKey === 'all' ? undefined : directionKey;
  const statuses = STATUSES_BY_KEY[statusKey];
  const enabled = !!activeWorkspaceId && !!documentType;

  // Özet sorgusu sıralamadan etkilenmez; sıralama yalnızca sayfalı liste anahtarına eklenir
  // ki "Tarih" düğmesine dokunmak gereksiz yere özeti yeniden çekmesin.
  const filterKey = `${documentType ?? 'all'}|${directionKey}|${statusKey}|${search}`;
  const listFilterKey = `${filterKey}|${sortAscending ? 'asc' : 'desc'}`;

  const obligationsQuery = useInfiniteQuery({
    queryKey: activeWorkspaceId
      ? queryKeys.obligationsByTypeList(activeWorkspaceId, listFilterKey)
      : ['obligations-by-type', 'disabled'],
    queryFn: ({ pageParam }) =>
      listObligations({
        workspaceId: activeWorkspaceId as string,
        documentType,
        direction,
        statuses,
        search: search || undefined,
        page: pageParam,
        ascending: sortAscending,
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

  const idsKey = rows.map((r) => r.id).join(',');
  const installmentSummariesQuery = useQuery({
    queryKey: activeWorkspaceId
      ? queryKeys.obligationInstallmentSummaries(activeWorkspaceId, idsKey)
      : ['obligation-installment-summaries', 'disabled'],
    queryFn: () => getObligationInstallmentSummaries(activeWorkspaceId as string, rows.map((r) => r.id)),
    enabled: !!activeWorkspaceId && rows.length > 0,
  });
  const installmentSummaries = installmentSummariesQuery.data ?? {};

  const deleteMutation = useMutation({
    mutationFn: async (obligationId: string) => {
      await cancelObligationReminder(obligationId);
      await deleteObligation(obligationId);
    },
    onSuccess: (_data, obligationId) => {
      // new.tsx'teki aynı Fabric çakışması düzeltmesi: Alert'in kapanma animasyonu,
      // listeden bir satırın kaldırılmasıyla aynı ana denk gelirse çöküyor — önbellek
      // geçersizleştirme bir sonraki etkileşim turuna ertelenir.
      InteractionManager.runAfterInteractions(() => {
        if (activeWorkspaceId) {
          queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'obligations'] });
        }
        queryClient.removeQueries({ queryKey: ['obligation', obligationId] });
      });
    },
  });

  function confirmDelete(item: ObligationWithRelations, hasInstallments: boolean) {
    Alert.alert(
      'Kaydı Sil',
      hasInstallments
        ? 'Bu kayıt, taksitleri ve ödeme geçmişi kalıcı olarak silinecek. Emin misiniz?'
        : 'Bu kayıt ve varsa ödeme geçmişi kalıcı olarak silinecek. Emin misiniz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: () => deleteMutation.mutate(item.id) },
      ]
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <Stack gap="md" style={{ flex: 1, paddingTop: theme.spacing.md }}>
        <Row style={{ paddingHorizontal: theme.screenEdge.standard }} align="center">
          <Pressable accessibilityLabel="Kapat" onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
          </Pressable>
          <Text variant="pageTitle" style={{ flex: 1, marginLeft: theme.spacing.sm }} numberOfLines={1}>
            {title}
          </Text>
          <Pressable accessibilityLabel="Yeni kayıt" onPress={() => router.push('/obligations/new')} hitSlop={12}>
            <Ionicons name="add-circle" size={30} color={theme.colors.brandPrimary} />
          </Pressable>
        </Row>

        <Stack style={{ paddingHorizontal: theme.screenEdge.standard }}>
          {/* Hero: sayfanın kimliği — tür ikonu, açıklama, ve üç gerçek istatistik (yeni
              sorgu yok, hepsi zaten hesaplanan `summary` alanlarından). */}
          <Card style={{ borderRadius: theme.radius.heroWidget, padding: theme.spacing.lg }}>
            <Stack gap="md">
              <Row gap="sm" align="center">
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: theme.radius.input,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: withAlpha(theme.colors.brandPrimary, 0.16),
                  }}
                >
                  <Ionicons
                    name={(documentType && DOCUMENT_TYPE_ICON[documentType]) || 'apps-outline'}
                    size={22}
                    color={theme.colors.brandPrimary}
                  />
                </View>
                <Text variant="pageTitle" style={{ flex: 1 }} numberOfLines={1}>
                  {title}
                </Text>
              </Row>

              <Text variant="body" color="textSecondary">
                {title} vade ve ödeme durumunu tek ekrandan takip edin, detaylarını görüntüleyip düzenleyin.
              </Text>

              {summary ? (
                <Row gap="xxs">
                  <SummaryCell
                    label="TOPLAM BORÇ"
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
                    label="AKTİF"
                    selected={statusKey === 'active'}
                    onPress={() => setStatusKey(statusKey === 'active' ? 'all' : 'active')}
                  >
                    <Text variant="cardTitle" tabular>
                      {summary.count}
                    </Text>
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
              ) : null}

              <Button
                label={`Yeni ${documentType ? DOCUMENT_TYPE_LABEL[documentType] : 'Kayıt'} Ekle`}
                onPress={() =>
                  router.push({ pathname: '/obligations/new', params: documentType ? { type: documentType } : {} })
                }
              />
            </Stack>
          </Card>
        </Stack>

        {/* Yön filtresi: hero artık yalnızca Toplam Borç gösteriyor, ama bu ekran çek/senet
            gibi hem borç hem alacak yönünde olabilen türlerde de kullanılıyor — bu küçük
            kontrol olmadan alacak yönü bu ekrandan erişilemez hale gelirdi. */}
        <Stack style={{ paddingHorizontal: theme.screenEdge.standard }}>
          <SegmentedControl options={DIRECTION_OPTIONS} value={directionKey} onChange={setDirectionKey} size="compact" />
        </Stack>

        <Stack style={{ paddingHorizontal: theme.screenEdge.standard }}>
          <SegmentedControl options={STATUS_OPTIONS} value={statusKey} onChange={setStatusKey} size="compact" stretch />
        </Stack>

        <Row gap="xs" style={{ paddingHorizontal: theme.screenEdge.standard }}>
          <View style={{ flex: 1, position: 'relative', justifyContent: 'center' }}>
            <Ionicons
              name="search"
              size={18}
              color={theme.colors.textSecondary}
              style={{ position: 'absolute', left: theme.spacing.sm, zIndex: 1 }}
            />
            <TextField
              placeholder={`${title} ara...`}
              value={searchInput}
              onChangeText={setSearchInput}
              returnKeyType="search"
              autoCorrect={false}
              style={{ paddingLeft: theme.spacing.xxl }}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tarihe göre sırala"
            onPress={() => setSortAscending((v) => !v)}
            style={{
              height: theme.buttonHeight.primary,
              paddingHorizontal: theme.spacing.sm,
              borderRadius: theme.radius.input,
              borderWidth: 1,
              borderColor: theme.colors.border,
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.xxs,
            }}
          >
            <Ionicons
              name={sortAscending ? 'arrow-up' : 'arrow-down'}
              size={14}
              color={theme.colors.textSecondary}
            />
            <Text variant="body" color="textSecondary">
              Tarih
            </Text>
          </Pressable>
        </Row>

        {obligationsQuery.error ? (
          <Text variant="body" color="danger" style={{ paddingHorizontal: theme.screenEdge.standard }}>
            {obligationsQuery.error instanceof Error ? obligationsQuery.error.message : 'Kayıtlar yüklenemedi'}
          </Text>
        ) : null}

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
              <ObligationRowCard
                item={item}
                installmentSummary={installmentSummaries[item.id]}
                onDelete={confirmDelete}
                deleting={deleteMutation.isPending && deleteMutation.variables === item.id}
              />
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

interface ObligationRowCardProps {
  item: ObligationWithRelations;
  installmentSummary: ObligationInstallmentSummary | undefined;
  onDelete: (item: ObligationWithRelations, hasInstallments: boolean) => void;
  deleting: boolean;
}

// Taksitli kayıtlarda (kredi, kredi kartı ekstresi vb.) ilerleme/faiz/taksit bloğu
// gerçek `installmentSummary` verisiyle görünür; tek seferlik kayıtlarda (çek, senet,
// fatura...) bu blok tamamen atlanır — belge türüne göre değil, gerçek veriye göre dallanır.
function ObligationRowCard({ item, installmentSummary, onDelete, deleting }: ObligationRowCardProps) {
  const theme = useTheme();
  const hasInstallments = (installmentSummary?.totalCount ?? 0) > 0;
  const isPayable = item.direction === 'payable';
  const bankName = item.bank_code ? (BANK_NAME[item.bank_code] ?? null) : null;
  const progress =
    item.total_amount_minor > 0 ? 1 - item.remaining_amount_minor / item.total_amount_minor : 0;
  const isClosed = item.status === 'odendi' || item.status === 'tahsil_edildi';
  const effectiveRatio =
    installmentSummary?.hasRateData && installmentSummary.principalSumMinor > 0
      ? (installmentSummary.interestSumMinor / installmentSummary.principalSumMinor) * 100
      : null;

  return (
    <Pressable onPress={() => router.push(`/obligations/${item.id}`)}>
      <Card>
        <Stack gap="sm">
          <Row gap="sm" align="center">
            <ObligationIcon documentType={item.document_type} bankCode={item.bank_code} size={36} />
            <Stack gap="xxs" style={{ flex: 1 }}>
              <Text variant="cardTitle" numberOfLines={1}>
                {bankName ?? item.title}
              </Text>
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                {DOCUMENT_TYPE_LABEL[item.document_type] ?? item.document_type}
                {bankName ? ` · ${item.title}` : ''}
              </Text>
            </Stack>
            <StatusBadge status={item.status} />
          </Row>

          <Row>
            <Stack gap="xxs" style={{ flex: 1 }}>
              <Text variant="caption" color="textSecondary">
                {isPayable ? 'KALAN BORÇ' : 'KALAN ALACAK'}
              </Text>
              <Amount
                amountMinor={item.remaining_amount_minor}
                currencyCode={item.currency_code}
                direction={item.direction as 'payable' | 'receivable'}
                overdue={item.status === 'gecikti'}
                variant="cardTitle"
                numberOfLines={1}
              />
            </Stack>
            <Divider orientation="vertical" style={{ marginHorizontal: theme.spacing.sm }} />
            <Stack gap="xxs" style={{ flex: 1 }} align="flex-end">
              <Text variant="caption" color="textSecondary">
                {hasInstallments ? 'SONRAKİ ÖDEME' : 'VADE'}
              </Text>
              {hasInstallments ? (
                <Amount
                  amountMinor={installmentSummary?.nextAmountMinor ?? 0}
                  currencyCode={item.currency_code}
                  variant="cardTitle"
                  numberOfLines={1}
                />
              ) : (
                <Text variant="cardTitle" tabular numberOfLines={1}>
                  {item.due_date ? dateFormatter.format(new Date(item.due_date)) : 'Vade yok'}
                </Text>
              )}
            </Stack>
          </Row>

          {hasInstallments ? (
            <>
              <Divider />
              <Stack gap="xxs">
                <Row>
                  <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                    ÖDEME İLERLEMESİ
                  </Text>
                  <Text variant="caption" color="textSecondary" tabular>
                    %{(Math.max(0, Math.min(1, progress)) * 100).toLocaleString('tr-TR', {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                  </Text>
                </Row>
                <View
                  style={{
                    height: 8,
                    borderRadius: 999,
                    backgroundColor: theme.colors.backgroundPrimary,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      height: '100%',
                      width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
                      borderRadius: 999,
                      backgroundColor: isClosed ? theme.colors.success : theme.colors.brandPrimary,
                    }}
                  />
                </View>
              </Stack>

              <Divider />

              <Row>
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="caption" color="textSecondary">
                    FAİZ ORANI
                  </Text>
                  {effectiveRatio !== null ? (
                    <>
                      <Text variant="cardTitle" tabular style={{ color: theme.colors.brandPrimary }}>
                        %{effectiveRatio.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                      </Text>
                      <Text variant="caption" color="textSecondary">
                        Taksitlere göre hesaplanan
                      </Text>
                    </>
                  ) : (
                    <Text variant="cardTitle" color="textSecondary">
                      —
                    </Text>
                  )}
                </Stack>
                <Divider orientation="vertical" style={{ marginHorizontal: theme.spacing.sm }} />
                <Stack gap="xxs" style={{ flex: 1 }} align="flex-end">
                  <Text variant="caption" color="textSecondary">
                    KALAN TAKSİT
                  </Text>
                  <Text variant="cardTitle" tabular>
                    {installmentSummary!.remainingCount}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {installmentSummary!.totalCount} taksitten kalan
                  </Text>
                </Stack>
              </Row>
            </>
          ) : null}

          <Row gap="xs">
            <ActionPill icon="eye-outline" label="Detay" onPress={() => router.push(`/obligations/${item.id}`)} />
            <ActionPill
              icon="pencil-outline"
              label="Düzenle"
              onPress={() => router.push({ pathname: '/obligations/new', params: { id: item.id } })}
            />
            <ActionPill
              icon="trash-outline"
              label="Sil"
              danger
              disabled={deleting}
              onPress={() => onDelete(item, hasInstallments)}
            />
          </Row>
        </Stack>
      </Card>
    </Pressable>
  );
}

interface ActionPillProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}

function ActionPill({ icon, label, onPress, danger, disabled }: ActionPillProps) {
  const theme = useTheme();
  const color = danger ? theme.colors.danger : theme.colors.textSecondary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        height: 36,
        borderRadius: theme.radius.input,
        borderWidth: 1,
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Row gap="xxs" align="center">
        <Ionicons name={icon} size={14} color={color} />
        <Text variant="caption" style={{ color }}>
          {label}
        </Text>
      </Row>
    </Pressable>
  );
}

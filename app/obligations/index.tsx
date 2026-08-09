import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, InteractionManager, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import {
  ActionSheet,
  Button,
  Card,
  Divider,
  EmptyState,
  Pagination,
  Pressable,
  ProgressRing,
  Row,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  TextField,
} from '@/components/primitives';
import { StatColumns } from '@/components/primitives/StatColumns';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { Amount } from '@/components/finance/Amount';
import { DocumentCalendarIllustration } from '@/components/finance/DocumentCalendarIllustration';
import { ObligationIcon } from '@/components/finance/ObligationIcon';
import { StatusBadge } from '@/components/finance/StatusBadge';
import {
  listObligations,
  getObligationSummary,
  getObligationInstallmentSummaries,
  deleteObligation,
  ACTIVE_OBLIGATION_STATUSES,
  CLOSED_OBLIGATION_STATUSES,
  type Obligation,
  type ObligationInstallmentSummary,
  type ObligationWithRelations,
} from '@/features/obligations/api';
import { DOCUMENT_TYPE_LABEL, DOCUMENT_TYPE_LABEL_PLURAL, DOCUMENT_TYPE_ICON } from '@/features/obligations/documentTypes';
import type { ValueUnitType } from '@/features/valueUnits/units';
import { BANK_NAME } from '@/features/banks/banks';
import { SERVICE_NAME } from '@/features/services/services';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { cancelObligationReminder } from '@/services/notifications';
import { showSuccessAlert } from '@/utils/alerts';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });

// Bu ekranda tek filtre boyutu var: durum. Borç/alacak yön filtresi kaldırıldı — iki ayrı
// filtre satırı kullanıcı için gereksiz karmaşıklık yaratıyordu (bkz. tasarım geri bildirimi).
type StatusKey = 'active' | 'overdue' | 'closed' | 'all';

// Liste sayfa başına 10 kayıt gösterir ve gerçek (numaralı) sayfalandırma kullanır —
// sonsuz kaydırma / "Daha Fazla Yükle" yerine, listenin ekranın altında sabit kalan
// bir sayfalama çubuğuyla öngörülebilir şekilde gezilmesi için.
const LIST_PAGE_SIZE = 10;

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
  const [statusKey, setStatusKey] = useState<StatusKey>('active');
  const [sortAscending, setSortAscending] = useState(true);
  const [page, setPage] = useState(0);

  // hareketler.tsx ile aynı desen: her tuşta sorgu atmamak için 300ms debounce.
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const statuses = STATUSES_BY_KEY[statusKey];
  const enabled = !!activeWorkspaceId && !!documentType;

  // Özet sorgusu sıralama veya sayfadan etkilenmez; ikisi de yalnızca sayfalı liste
  // anahtarına eklenir ki "Tarih" düğmesine dokunmak veya sayfa değiştirmek özeti
  // gereksiz yere yeniden çekmesin.
  const filterKey = `${documentType ?? 'all'}|${statusKey}|${search}`;
  const resetKey = `${filterKey}|${sortAscending ? 'asc' : 'desc'}`;

  // Filtre, arama veya sıralama değiştiğinde geçerli sayfa artık anlamsızlaşır — her
  // zaman 1. sayfaya dönülür. Render sırasında (efekt içinde değil) yapılır ki React'in
  // "prop değişince state sıfırla" deseni izlensin ve ekstra bir render turu tetiklenmesin.
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setPage(0);
  }

  const summaryQuery = useQuery({
    queryKey: activeWorkspaceId
      ? queryKeys.obligationsByTypeSummary(activeWorkspaceId, filterKey)
      : ['obligations-by-type-summary', 'disabled'],
    queryFn: () =>
      getObligationSummary({
        workspaceId: activeWorkspaceId as string,
        documentType,
        statuses,
        search: search || undefined,
      }),
    enabled,
    placeholderData: keepPreviousData,
  });

  // Hero, aşağıdaki sekme/arama filtrelerinden bağımsız sabit bir genel bakış gösterir
  // (ör. "Kapalı" sekmesine geçmek hero'daki aktif/toplam sayıları değiştirmemeli) —
  // bu yüzden statusKey/search'e değil yalnızca documentType'a bağlı ayrı bir sorgu kullanır.
  const overviewQuery = useQuery({
    queryKey: activeWorkspaceId
      ? queryKeys.obligationsByTypeOverview(activeWorkspaceId, documentType ?? 'all')
      : ['obligations-by-type-overview', 'disabled'],
    queryFn: async () => {
      const [active, total] = await Promise.all([
        getObligationSummary({
          workspaceId: activeWorkspaceId as string,
          documentType,
          statuses: ACTIVE_OBLIGATION_STATUSES,
        }),
        getObligationSummary({ workspaceId: activeWorkspaceId as string, documentType }),
      ]);
      return { active, total };
    },
    enabled,
  });

  const summary = summaryQuery.data;
  const totalCount = summary?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / LIST_PAGE_SIZE));
  // Bir sayfadaki son kayıt silindiğinde ya da filtre daralıp toplam sayfa sayısı
  // düştüğünde geçerli sayfa artık aralık dışına düşebilir — state'i etkilemeden,
  // sorguya ve gösterime giden sayfa değerini burada sınırlarız.
  const effectivePage = Math.min(page, totalPages - 1);
  const listFilterKey = `${resetKey}|page:${effectivePage}`;

  const obligationsQuery = useQuery({
    queryKey: activeWorkspaceId
      ? queryKeys.obligationsByTypeList(activeWorkspaceId, listFilterKey)
      : ['obligations-by-type', 'disabled'],
    queryFn: () =>
      listObligations({
        workspaceId: activeWorkspaceId as string,
        documentType,
        statuses,
        search: search || undefined,
        page: effectivePage,
        pageSize: LIST_PAGE_SIZE,
        ascending: sortAscending,
      }),
    enabled,
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(() => obligationsQuery.data ?? [], [obligationsQuery.data]);
  const isFiltered = search.length > 0 || statusKey !== 'active';

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
      // geçersizleştirme, kullanıcı başarı Alert'ini kapatana kadar ertelenir.
      showSuccessAlert('Kayıt başarıyla silindi.', () => {
        InteractionManager.runAfterInteractions(() => {
          if (activeWorkspaceId) {
            queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'obligations'] });
          }
          queryClient.removeQueries({ queryKey: ['obligation', obligationId] });
        });
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

  const overview = overviewQuery.data;
  const activeCount = overview?.active.count ?? 0;
  const totalTypeCount = overview?.total.count ?? 0;
  const overdueCount = overview?.active.overdueCount ?? 0;
  const heroPayableMinor = overview?.active.payableMinor ?? 0;
  const heroReceivableMinor = overview?.active.receivableMinor ?? 0;
  const showsPayable = heroPayableMinor > 0 || heroReceivableMinor === 0;
  // İlerleme oranı: gösterilen yöndeki (borç/alacak) orijinal toplam tutarın ne kadarı
  // zaten ödendi — kalan tutar arttıkça değil azaldıkça dolan bir çubuk.
  const heroOriginalMinor = showsPayable
    ? (overview?.active.payableTotalMinor ?? 0)
    : (overview?.active.receivableTotalMinor ?? 0);
  const heroRemainingMinor = showsPayable ? heroPayableMinor : heroReceivableMinor;
  const progressRatio = heroOriginalMinor > 0 ? 1 - heroRemainingMinor / heroOriginalMinor : 0;
  const typeLabel = documentType ? (DOCUMENT_TYPE_LABEL[documentType] ?? documentType) : 'Kayıt';

  // Tek dikey scroll sahibi: başlık, tanıtım şeridi, hero kartı, filtreler ve arama
  // FlatList'in ListHeaderComponent'ine taşınır ki liste kaydırıldığında hepsi tek parça
  // halinde birlikte kaysın — üstte sabit kalıp listeyi küçük bir kutuya sıkıştırmasınlar.
  const isInitialLoading = obligationsQuery.isLoading && rows.length === 0;

  const listHeader = (
    <Stack gap="md" style={{ paddingTop: theme.spacing.md, paddingBottom: theme.spacing.md }}>
      <ScreenHeader
        title={title}
        left={{ icon: 'close', accessibilityLabel: 'Kapat', onPress: () => router.back() }}
        right={{
          icon: 'add',
          accessibilityLabel: 'Yeni kayıt',
          variant: 'accent',
          onPress: () => router.push('/obligations/new'),
        }}
      />

      {/* Tanıtım şeridi: sayfanın kimliği ve kısa açıklaması, istatistiklerden ayrı
          sakin bir yüzeyde — tutarlar aşağıdaki karta ait, burada dikkat dağıtmaz. */}
      <Card
        style={{
          borderRadius: theme.radius.heroWidget,
          padding: theme.spacing.lg,
          backgroundColor: withAlpha(theme.colors.brandPrimary, 0.08),
        }}
      >
        <Row gap="sm" align="center">
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: theme.radius.input,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: withAlpha(theme.colors.brandPrimary, 0.18),
            }}
          >
            <Ionicons
              name={(documentType && DOCUMENT_TYPE_ICON[documentType]) || 'apps-outline'}
              size={22}
              color={theme.colors.brandPrimary}
            />
          </View>
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="cardTitle" numberOfLines={1}>
              Tek ekrandan kontrol sizde
            </Text>
            <Text variant="caption" color="textSecondary" numberOfLines={2}>
              Vade ve ödeme durumunu tek ekrandan takip edin.
            </Text>
          </Stack>
          <DocumentCalendarIllustration size={72} />
        </Row>
      </Card>

      {/* İstatistik hero kartı: üstte gerçek borç/alacak tutarı + gecikme halkası, altta
          aktif/toplam/gecikmiş sayaçları — Ana Sayfa'daki BalanceHero ile aynı dil
          (büyük tutar + halka + ayraçlı özet satırı). Sayaçlar sekme/arama filtresinden
          bağımsız `overviewQuery`den gelir ki "Kapalı" sekmesine geçmek hero'yu değiştirmesin. */}
      <Card variant="hero">
        <Stack gap="lg">
          <Row gap="md" align="center">
            <Stack gap="xxs" style={{ flex: 1 }}>
              <Text variant="caption" color="textSecondary" style={{ letterSpacing: 0.4 }}>
                {showsPayable ? 'TOPLAM BORÇ' : 'TOPLAM ALACAK'}
              </Text>
              <Amount
                amountMinor={showsPayable ? heroPayableMinor : heroReceivableMinor}
                direction={showsPayable ? 'payable' : 'receivable'}
                variant="displayAmount"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.55}
              />
              {heroPayableMinor > 0 && heroReceivableMinor > 0 ? (
                <Row gap="xs" align="center">
                  <Text variant="caption" color="textSecondary">
                    Alacak:
                  </Text>
                  <Amount amountMinor={heroReceivableMinor} direction="receivable" variant="caption" />
                </Row>
              ) : null}
            </Stack>

            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: theme.radius.input,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: withAlpha(theme.colors.brandPrimary, 0.16),
              }}
            >
              <Ionicons
                name={(documentType && DOCUMENT_TYPE_ICON[documentType]) || 'apps-outline'}
                size={24}
                color={theme.colors.brandPrimary}
              />
            </View>
          </Row>

          <Stack gap="xs">
            <Row align="center" style={{ justifyContent: 'space-between' }}>
              <Text variant="caption" color="textSecondary">
                İLERLEME ORANI
              </Text>
              <Text variant="caption" color="textSecondary" style={{ fontWeight: '600' }}>
                %{Math.round(progressRatio * 100)}
              </Text>
            </Row>
            <View
              style={{
                height: 8,
                borderRadius: 4,
                backgroundColor: withAlpha(theme.colors.brandPrimary, 0.16),
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${Math.max(0, Math.min(100, Math.round(progressRatio * 100)))}%`,
                  height: '100%',
                  borderRadius: 4,
                  backgroundColor: theme.colors.brandPrimary,
                }}
              />
            </View>
          </Stack>

          <Divider />

          <StatColumns
            columns={[
              { label: `AKTİF ${typeLabel.toLocaleUpperCase('tr-TR')}`, value: activeCount },
              { label: `TOPLAM ${typeLabel.toLocaleUpperCase('tr-TR')}`, value: totalTypeCount },
              ...(overdueCount > 0
                ? [{ label: 'GECİKMİŞ', labelColor: 'danger' as const, valueColor: 'danger' as const, value: overdueCount }]
                : []),
            ]}
          />

          <Button
            icon="add"
            label={`Yeni ${typeLabel} Ekle`}
            onPress={() =>
              router.push({ pathname: '/obligations/new', params: documentType ? { type: documentType } : {} })
            }
          />
        </Stack>
      </Card>

      <SegmentedControl options={STATUS_OPTIONS} value={statusKey} onChange={setStatusKey} size="compact" stretch />

      <Row gap="xs">
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
          <Ionicons name={sortAscending ? 'arrow-up' : 'arrow-down'} size={14} color={theme.colors.textSecondary} />
          <Text variant="body" color="textSecondary">
            Tarih
          </Text>
        </Pressable>
      </Row>

      {obligationsQuery.error ? (
        <Text variant="body" color="danger">
          {obligationsQuery.error instanceof Error ? obligationsQuery.error.message : 'Kayıtlar yüklenemedi'}
        </Text>
      ) : null}
    </Stack>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: theme.screenEdge.standard,
          paddingBottom: theme.spacing.xxl,
          gap: theme.spacing.md,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => (
          <ObligationRowCard
            item={item}
            installmentSummary={installmentSummaries[item.id]}
            onDelete={confirmDelete}
            deleting={deleteMutation.isPending && deleteMutation.variables === item.id}
          />
        )}
        ListEmptyComponent={
          isInitialLoading ? (
            <Stack gap="sm">
              <Skeleton height={72} borderRadius={theme.radius.widget} />
              <Skeleton height={72} borderRadius={theme.radius.widget} />
              <Skeleton height={72} borderRadius={theme.radius.widget} />
            </Stack>
          ) : (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <EmptyState
                icon={
                  isFiltered ? 'search-outline' : (documentType && DOCUMENT_TYPE_ICON[documentType]) || 'apps-outline'
                }
                title={isFiltered ? 'Sonuç bulunamadı' : `Henüz ${title.toLocaleLowerCase('tr-TR')} kaydı yok`}
                message={
                  isFiltered
                    ? 'Arama terimini veya filtreleri değiştirin.'
                    : 'Belge tarayarak veya manuel giriş yaparak ekleyebilirsiniz.'
                }
                actionLabel={
                  isFiltered ? undefined : `Yeni ${documentType ? DOCUMENT_TYPE_LABEL[documentType] : 'Kayıt'} Ekle`
                }
                onActionPress={
                  isFiltered
                    ? undefined
                    : () =>
                        router.push({
                          pathname: '/obligations/new',
                          params: documentType ? { type: documentType } : {},
                        })
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
              <Pagination
                page={effectivePage}
                totalPages={totalPages}
                loading={obligationsQuery.isFetching}
                onChange={setPage}
              />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const hasInstallments = (installmentSummary?.totalCount ?? 0) > 0;
  const isPayable = item.direction === 'payable';
  const bankName = item.bank_code ? (BANK_NAME[item.bank_code] ?? null) : null;
  const serviceName = item.service_code ? (SERVICE_NAME[item.service_code] ?? null) : null;
  const progress =
    item.total_amount_minor > 0 ? 1 - item.remaining_amount_minor / item.total_amount_minor : 0;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const isClosed = item.status === 'odendi' || item.status === 'tahsil_edildi';
  const effectiveRatio =
    installmentSummary?.hasRateData && installmentSummary.principalSumMinor > 0
      ? (installmentSummary.interestSumMinor / installmentSummary.principalSumMinor) * 100
      : null;

  return (
    <>
      <Pressable onPress={() => router.push(`/obligations/${item.id}`)} disabled={deleting}>
        <Card style={{ opacity: deleting ? 0.5 : 1 }}>
          <Stack gap="sm">
            <Row gap="sm" align="center">
              {/* Banka logosu/adı ayrı bir dokunma alanı: banka detayına götürür (ilerleme
                  halkası, o bankaya ait tüm hesap/kart/kredi özeti). bank_code yoksa (kredi
                  dışı belge türleri) disabled kalır, dokunuş kartın geneline (obligation
                  detayına) düşer — bkz. app/banks/[code].tsx. */}
              <Pressable
                onPress={() => item.bank_code && router.push(`/banks/${item.bank_code}`)}
                disabled={!item.bank_code}
                accessibilityRole="button"
                accessibilityLabel={item.bank_code ? `${bankName ?? 'Banka'} sayfasına git` : undefined}
                style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flex: 1 }}
              >
                <ObligationIcon
                  documentType={item.document_type}
                  bankCode={item.bank_code}
                  serviceCode={item.service_code}
                  fallbackName={item.title}
                  size={36}
                />
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="cardTitle" numberOfLines={1}>
                    {bankName ?? serviceName ?? item.title}
                  </Text>
                  <Text variant="caption" color="textSecondary" numberOfLines={1}>
                    {DOCUMENT_TYPE_LABEL[item.document_type] ?? item.document_type}
                    {bankName || serviceName ? ` · ${item.title}` : ''}
                  </Text>
                </Stack>
              </Pressable>
              <StatusBadge status={item.status} />
              {deleting ? (
                <ActivityIndicator color={theme.colors.textSecondary} />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Diğer işlemler"
                  onPress={() => setSheetOpen(true)}
                  hitSlop={10}
                >
                  <Ionicons name="ellipsis-vertical" size={18} color={theme.colors.textSecondary} />
                </Pressable>
              )}
            </Row>

            <Row>
              <Stack gap="xxs" style={{ flex: 1 }}>
                <Text variant="caption" color="textSecondary">
                  {isPayable ? 'KALAN BORÇ' : 'KALAN ALACAK'}
                </Text>
                <Amount
                  amountMinor={item.remaining_amount_minor}
                  currencyCode={item.currency_code}
                  valueUnitType={item.value_unit_type as ValueUnitType}
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
                  <>
                    <Amount
                      amountMinor={installmentSummary?.nextAmountMinor ?? 0}
                      currencyCode={item.currency_code}
                      valueUnitType={item.value_unit_type as ValueUnitType}
                      variant="cardTitle"
                      numberOfLines={1}
                    />
                    {installmentSummary?.nextDueDate ? (
                      <Text variant="caption" color="textSecondary" tabular numberOfLines={1}>
                        {dateFormatter.format(new Date(installmentSummary.nextDueDate))}
                      </Text>
                    ) : null}
                  </>
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
                <Stack gap="sm">
                  <Text variant="caption" color="textSecondary">
                    ÖDEME İLERLEMESİ
                  </Text>
                  <Row gap="sm" align="center">
                    <ProgressRing
                      size={56}
                      strokeWidth={6}
                      progress={clampedProgress}
                      color={isClosed ? theme.colors.success : theme.colors.brandPrimary}
                      trackColor={withAlpha(isClosed ? theme.colors.success : theme.colors.brandPrimary, 0.18)}
                      cap
                    >
                      <Text variant="caption" tabular style={{ fontWeight: '700' }}>
                        %{Math.round(clampedProgress * 100)}
                      </Text>
                    </ProgressRing>
                    <Row gap="sm" style={{ flex: 1 }}>
                      <Stack gap="xxs" style={{ flex: 1 }}>
                        <Text variant="caption" color="textSecondary">
                          FAİZ ORANI
                        </Text>
                        {effectiveRatio !== null ? (
                          <Text variant="cardTitle" tabular style={{ color: theme.colors.brandPrimary }}>
                            %{effectiveRatio.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                          </Text>
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
                        <Text variant="caption" color="textSecondary" numberOfLines={1}>
                          {installmentSummary!.totalCount} taksitten
                        </Text>
                      </Stack>
                    </Row>
                  </Row>
                </Stack>

                {item.due_date ? (
                  <Row
                    gap="xs"
                    align="center"
                    style={{
                      backgroundColor: theme.colors.backgroundPrimary,
                      borderRadius: theme.radius.input,
                      paddingHorizontal: theme.spacing.sm,
                      paddingVertical: theme.spacing.xs,
                    }}
                  >
                    <Ionicons name="calendar-outline" size={14} color={theme.colors.textSecondary} />
                    <Text variant="caption" color="textSecondary" numberOfLines={1}>
                      Son ödeme tarihi: {dateFormatter.format(new Date(item.due_date))}
                    </Text>
                  </Row>
                ) : null}
              </>
            ) : null}
          </Stack>
        </Card>
      </Pressable>

      <ActionSheet
        visible={sheetOpen}
        title={bankName ?? item.title}
        onClose={() => setSheetOpen(false)}
        options={[
          {
            key: 'detail',
            label: 'Detay',
            icon: 'eye-outline',
            onPress: () => router.push(`/obligations/${item.id}`),
          },
          {
            key: 'edit',
            label: 'Düzenle',
            icon: 'pencil-outline',
            onPress: () => router.push({ pathname: '/obligations/new', params: { id: item.id } }),
          },
          {
            key: 'delete',
            label: 'Sil',
            icon: 'trash-outline',
            danger: true,
            onPress: () => onDelete(item, hasInstallments),
          },
        ]}
      />
    </>
  );
}

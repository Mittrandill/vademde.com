import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, InteractionManager, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import {
  ActionSheet,
  Divider,
  Pressable,
  Skeleton,
  Stack,
  Text,
} from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { Amount } from '@/components/finance/Amount';
import { FinanceFilterCard } from '@/components/finance/FinanceFilterCard';
import { FinanceListHero } from '@/components/finance/FinanceListHero';
import { FinanceListEmptyState, FinanceListSurface } from '@/components/finance/FinanceListSurface';
import { ObligationIcon } from '@/components/finance/ObligationIcon';
import { OBLIGATION_STATUS_LABEL, type ObligationStatus } from '@/components/finance/StatusBadge';
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
import { showSuccessAlert } from '@/utils/alerts';
import { formatMinorAmount } from '@/utils/money';

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
  const totalTypeCount = overview?.total.count ?? 0;
  const overdueCount = overview?.active.overdueCount ?? 0;
  const heroPayableMinor = overview?.active.payableMinor ?? 0;
  const heroReceivableMinor = overview?.active.receivableMinor ?? 0;
  const showsPayable = heroPayableMinor > 0 || heroReceivableMinor === 0;
  const typeLabel = documentType ? (DOCUMENT_TYPE_LABEL[documentType] ?? documentType) : 'Kayıt';
  const isInitialLoading = obligationsQuery.isLoading && rows.length === 0;

  const openNewRecord = () =>
    router.push({ pathname: '/obligations/new', params: documentType ? { type: documentType } : {} });

  const footerLabel = totalCount
    ? `${effectivePage * LIST_PAGE_SIZE + 1}–${Math.min((effectivePage + 1) * LIST_PAGE_SIZE, totalCount)} / ${totalCount} kayıt`
    : '0 kayıt gösteriliyor';

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
            title={title}
            left={{ icon: 'close', accessibilityLabel: 'Kapat', onPress: () => router.back() }}
            right={{ icon: 'add', accessibilityLabel: `Yeni ${typeLabel}`, variant: 'accent', onPress: openNewRecord }}
          />

          <FinanceListHero
            label={showsPayable ? 'TOPLAM BORÇ' : 'TOPLAM ALACAK'}
            description={`${title} için aktif kayıtların kalan toplamı`}
            amountText={formatMinorAmount(showsPayable ? heroPayableMinor : heroReceivableMinor)}
            amountColor={showsPayable ? 'danger' : 'success'}
            metrics={[
              { label: 'TOPLAM KAYIT', value: totalTypeCount, caption: `Tüm ${typeLabel.toLocaleLowerCase('tr-TR')} kayıtları` },
              { label: 'ALACAĞINIZ', value: formatMinorAmount(heroReceivableMinor), caption: 'Tahsil edilecek', valueColor: 'success' },
              { label: 'BORCUNUZ', value: formatMinorAmount(heroPayableMinor), caption: 'Ödenecek', valueColor: 'danger' },
              { label: 'GECİKMİŞ', value: overdueCount, caption: 'Vadesi geçen', valueColor: overdueCount > 0 ? 'danger' : undefined },
            ]}
          />

          <FinanceFilterCard
            title="KAYIT DURUMU"
            description="Listede görmek istediğiniz kayıt durumunu seçin."
            options={STATUS_OPTIONS}
            value={statusKey}
            onChange={setStatusKey}
          />

          <FinanceListSurface
            searchPlaceholder={`${title} ara...`}
            searchValue={searchInput}
            onSearchChange={setSearchInput}
            sortAction={{
              label: 'Tarih',
              accessibilityLabel: 'Tarihe göre sırala',
              icon: sortAscending ? 'arrow-up' : 'arrow-down',
              onPress: () => setSortAscending((value) => !value),
            }}
            footerLabel={rows.length > 0 ? footerLabel : undefined}
            actionLabel={rows.length > 0 ? `Yeni ${typeLabel}` : undefined}
            onActionPress={rows.length > 0 ? openNewRecord : undefined}
            page={effectivePage}
            totalPages={totalPages}
            paginationLoading={obligationsQuery.isFetching}
            onPageChange={setPage}
          >
            {obligationsQuery.error ? (
              <Text variant="body" color="danger" style={{ padding: theme.spacing.lg }}>
                {obligationsQuery.error instanceof Error ? obligationsQuery.error.message : 'Kayıtlar yüklenemedi'}
              </Text>
            ) : isInitialLoading ? (
              <Stack gap="sm" style={{ padding: theme.spacing.lg }}>
                <Skeleton height={72} borderRadius={theme.radius.widget} />
                <Skeleton height={72} borderRadius={theme.radius.widget} />
                <Skeleton height={72} borderRadius={theme.radius.widget} />
              </Stack>
            ) : rows.length === 0 ? (
              <FinanceListEmptyState
                icon={isFiltered ? 'search-outline' : (documentType && DOCUMENT_TYPE_ICON[documentType]) || 'apps-outline'}
                title={isFiltered ? 'Sonuç bulunamadı' : `Henüz ${title.toLocaleLowerCase('tr-TR')} kaydı yok`}
                message={isFiltered ? 'Arama terimini veya filtreleri değiştirin.' : 'Belge tarayarak veya manuel giriş yaparak ekleyebilirsiniz.'}
                actionLabel={isFiltered ? undefined : `Yeni ${typeLabel}`}
                onActionPress={isFiltered ? undefined : openNewRecord}
              />
            ) : (
              rows.map((item, index) => (
                <View key={item.id}>
                  {index > 0 ? <Divider /> : null}
                  <ObligationRowCard
                    item={item}
                    installmentSummary={installmentSummaries[item.id]}
                    onDelete={confirmDelete}
                    deleting={deleteMutation.isPending && deleteMutation.variables === item.id}
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
  const statusLabel = OBLIGATION_STATUS_LABEL[item.status as ObligationStatus] ?? item.status;
  const dueDate = installmentSummary?.nextDueDate ?? item.due_date;
  const subtitle = [
    DOCUMENT_TYPE_LABEL[item.document_type] ?? item.document_type,
    statusLabel,
    dueDate ? dateFormatter.format(new Date(dueDate)) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${bankName ?? serviceName ?? item.title} detayını aç`}
        onPress={() => router.push(`/obligations/${item.id}`)}
        onLongPress={() => setSheetOpen(true)}
        disabled={deleting}
        style={{
          minHeight: 86,
          opacity: deleting ? 0.5 : 1,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
        }}
      >
        <ObligationIcon
          documentType={item.document_type}
          bankCode={item.bank_code}
          serviceCode={item.service_code}
          fallbackName={item.title}
          size={48}
        />
        <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
          <Text variant="cardTitle" numberOfLines={1}>
            {bankName ?? serviceName ?? item.title}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </Text>
        </Stack>
        <Amount
          amountMinor={item.remaining_amount_minor}
          currencyCode={item.currency_code}
          valueUnitType={item.value_unit_type as ValueUnitType}
          direction={isPayable ? 'expense' : 'income'}
          variant="cardTitle"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.68}
          style={{ maxWidth: '34%', color: isPayable ? theme.colors.danger : theme.colors.success }}
        />
        {deleting ? (
          <ActivityIndicator color={theme.colors.textSecondary} />
        ) : (
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
        )}
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

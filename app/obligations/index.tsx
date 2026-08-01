import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, InteractionManager, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
              {/* Sayfa adı zaten üstteki gezinme çubuğunda gösteriliyor; burada tekrar
                  edilmez — hero yalnızca tür kimliğini (ikon) ve kısa bir açıklamayı taşır. */}
              <Row gap="sm" align="center">
                <View
                  style={{
                    width: 48,
                    height: 48,
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
                <Text variant="body" color="textSecondary" numberOfLines={1} style={{ flex: 1 }}>
                  Vade ve ödeme durumunu tek ekrandan takip edin.
                </Text>
              </Row>

              {/* Üç hücre de salt bilgi amaçlıdır — durum filtresi hemen altındaki
                  segmented control'de zaten var; burada aynı seçimi ikinci kez
                  vurgulamak (dokunulabilir/seçili gibi göstermek) gereksiz tekrardır. */}
              {summary ? (
                <Row gap="xxs">
                  <SummaryCell label="TOPLAM BORÇ">
                    <Amount
                      amountMinor={summary.payableMinor}
                      direction="payable"
                      variant="cardTitle"
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                    />
                  </SummaryCell>
                  <SummaryCell label="AKTİF">
                    <Text variant="cardTitle" tabular>
                      {summary.count}
                    </Text>
                  </SummaryCell>
                  <SummaryCell label="GECİKEN">
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

        {/* Liste, üstteki başlık/filtre bloklarının altına sıkışmadan kalan tüm dikey alanı
            kaplasın diye `flex: 1` alır — aksi halde FlatList içeriği kadar yer kaplayıp
            kendi içinde kaydırılamayan, "ayrı bir kutu" gibi görünen bir alana dönüşürdü. */}
        {obligationsQuery.isLoading && rows.length === 0 ? (
          <Row style={{ flex: 1, justifyContent: 'center' }}>
            <ActivityIndicator color={theme.colors.textSecondary} />
          </Row>
        ) : rows.length === 0 ? (
          <Stack gap="xs" style={{ flex: 1, justifyContent: 'center', paddingHorizontal: theme.screenEdge.standard }}>
            <Text variant="cardTitle">{isFiltered ? 'Sonuç bulunamadı' : `Henüz ${title.toLocaleLowerCase('tr-TR')} kaydı yok`}</Text>
            <Text variant="body" color="textSecondary">
              {isFiltered
                ? 'Arama terimini veya filtreleri değiştirin.'
                : 'Belge tarayarak veya manuel giriş yaparak ekleyebilirsiniz.'}
            </Text>
          </Stack>
        ) : (
          <>
            <FlatList
              data={rows}
              keyExtractor={(item) => item.id}
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: theme.screenEdge.standard,
                gap: theme.spacing.sm,
                paddingBottom: theme.spacing.lg,
              }}
              renderItem={({ item }) => (
                <ObligationRowCard
                  item={item}
                  installmentSummary={installmentSummaries[item.id]}
                  onDelete={confirmDelete}
                  deleting={deleteMutation.isPending && deleteMutation.variables === item.id}
                />
              )}
            />
            <PaginationBar
              page={effectivePage}
              totalPages={totalPages}
              loading={obligationsQuery.isFetching}
              onPrev={() => setPage((p) => Math.max(0, p - 1))}
              onNext={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            />
          </>
        )}
      </Stack>
    </SafeAreaView>
  );
}

interface PaginationBarProps {
  page: number;
  totalPages: number;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
}

// Sonsuz kaydırma yerine gerçek (numaralı) sayfalandırma: ekranın altında sabit kalan,
// öngörülebilir bir çubuk — her sayfada 10 kayıt (bkz. LIST_PAGE_SIZE).
function PaginationBar({ page, totalPages, loading, onPrev, onNext }: PaginationBarProps) {
  const theme = useTheme();
  if (totalPages <= 1) return null;

  return (
    <Row
      gap="sm"
      align="center"
      style={{
        paddingHorizontal: theme.screenEdge.standard,
        paddingTop: theme.spacing.sm,
        paddingBottom: theme.spacing.xs,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
      }}
    >
      <PageStepButton
        icon="chevron-back"
        label="Önceki sayfa"
        disabled={page === 0}
        onPress={onPrev}
      />
      <Row style={{ flex: 1, justifyContent: 'center' }} gap="xs" align="center">
        {loading ? <ActivityIndicator color={theme.colors.textSecondary} /> : null}
        <Text variant="body" tabular>
          Sayfa {page + 1} / {totalPages}
        </Text>
      </Row>
      <PageStepButton
        icon="chevron-forward"
        label="Sonraki sayfa"
        disabled={page >= totalPages - 1}
        onPress={onNext}
      />
    </Row>
  );
}

interface PageStepButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled: boolean;
  onPress: () => void;
}

function PageStepButton({ icon, label, disabled, onPress }: PageStepButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        borderRadius: theme.radius.input,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Ionicons name={icon} size={18} color={theme.colors.textPrimary} />
    </Pressable>
  );
}

interface SummaryCellProps {
  label: string;
  children: React.ReactNode;
}

// Salt bilgi amaçlı özet hücresi — durum filtresi hemen altındaki segmented control'de
// zaten var, bu yüzden burası dokunulabilir/seçili değildir.
function SummaryCell({ label, children }: SummaryCellProps) {
  const theme = useTheme();

  return (
    <View style={{ flex: 1, padding: theme.spacing.sm }}>
      <Stack gap="xxs">
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {label}
        </Text>
        {children}
      </Stack>
    </View>
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

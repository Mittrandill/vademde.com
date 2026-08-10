import { useState } from 'react';
import { ActivityIndicator, Alert, InteractionManager, Modal, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import {
  AmountField,
  Button,
  Card,
  DateField,
  Divider,
  EmptyState,
  Pagination,
  Pressable,
  Row,
  SegmentedControl,
  Stack,
  Text,
} from '@/components/primitives';
import { StatColumns } from '@/components/primitives/StatColumns';
import { DetailScaffold } from '@/components/navigation/DetailScaffold';
import { DetailHeroCard, DetailIdentityRow, DetailMetricRow } from '@/components/finance/DetailHero';
import { Amount } from '@/components/finance/Amount';
import { OBLIGATION_STATUS_LABEL, StatusBadge } from '@/components/finance/StatusBadge';
import { ObligationIcon } from '@/components/finance/ObligationIcon';
import { AccountPicker } from '@/components/finance/AccountPicker';
import { getObligation, getObligationWithInstallments, type Installment, type Obligation } from '@/features/obligations/api';
import { listAccounts, type Account } from '@/features/accounts/api';
import { deletePayment, listPaymentsForObligation, recordPayment, updatePayment, type Payment } from '@/features/payments/api';
import { BANK_NAME } from '@/features/banks/banks';
import { SERVICE_NAME } from '@/features/services/services';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatAmountInput, formatMinorAmount, formatValueUnitAmount, parseValueUnitAmountToMinor } from '@/utils/money';
import { DOCUMENT_TYPE_LABEL } from '@/features/obligations/documentTypes';
import { getValueUnit } from '@/features/valueUnits/units';
import { listValueUnitRates, convertToReferenceMinor, type ValueUnitRate } from '@/features/valueUnits/api';
import { queryKeys } from '@/services/queryKeys';
import { syncObligationReminder } from '@/services/notifications';
import { showSuccessAlert, showErrorAlert } from '@/utils/alerts';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
const shortDateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' });

const TAB_PAGE_SIZE = 10;
type DetailTab = 'genel' | 'plan' | 'gecmis';

export default function ObligationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [payingInstallment, setPayingInstallment] = useState<Installment | 'obligation' | null>(null);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [tab, setTab] = useState<DetailTab>('genel');
  // null = kullanıcı henüz sayfa değiştirmedi; bu durumda sıradaki taksidin bulunduğu
  // sayfa akıllı varsayılan olarak gösterilir (aşağıda hesaplanır).
  const [planPage, setPlanPage] = useState<number | null>(null);
  const [historyPage, setHistoryPage] = useState(0);

  const detailQuery = useQuery({
    queryKey: ['obligation', id],
    queryFn: () => getObligationWithInstallments(id as string),
    enabled: !!id,
  });

  const paymentsQuery = useQuery({
    queryKey: ['obligation', id, 'payments'],
    queryFn: () => listPaymentsForObligation(id as string),
    enabled: !!id,
  });

  const accountsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.accounts(activeWorkspaceId) : ['accounts', 'disabled'],
    queryFn: () => listAccounts(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  // docs/01-finansal-kayit-modeli.md §3.5 — kıymetli maden/döviz kaydının TL karşılığı
  // kalıcı saklanmaz, her görüntülemede canlı fiyattan hesaplanır; yalnızca o tür
  // kayıtlarda gerektiği için sorgu her ekranda değil burada, koşullu olarak açılır.
  const isValueUnitFiat = getValueUnit(detailQuery.data?.obligation.currency_code).unitType === 'fiat';
  const ratesQuery = useQuery({
    queryKey: queryKeys.valueUnitRates(),
    queryFn: listValueUnitRates,
    enabled: !isValueUnitFiat,
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['obligation', id] });
    if (activeWorkspaceId) {
      queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'obligations'] });
      // Hesap seçilen bir ödeme yeni bir transaction oluşturur/günceller (bkz.
      // features/payments/api.ts recordPayment/updatePayment) — bu prefix Son Hareketler
      // (dashboard), Hareketler sekmesi ve hesap bakiyelerini besleyen tüm sorguları kapsar;
      // aksi halde bu ekranlar 30sn'lik staleTime dolana kadar eski veriyi göstermeye devam eder.
      queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'transactions'] });
      queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'account-balances'] });
    }
  }

  function afterPaymentChange() {
    // bkz. üstteki PaymentForm onSuccess notu: modal/alert kapanış animasyonuyla arkadaki
    // listenin yeniden mount'u aynı ana denk gelmesin diye önbellek geçersizleştirme bir
    // sonraki etkileşim turuna ertelenir.
    InteractionManager.runAfterInteractions(async () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ['obligation', id, 'payments'] });
      if (activeWorkspaceId) {
        const fresh = await getObligation(id as string);
        await syncObligationReminder(activeWorkspaceId, fresh);
      }
    });
  }

  const deletePaymentMutation = useMutation({
    mutationFn: (payment: Payment) => deletePayment(payment),
    onSuccess: () => {
      showSuccessAlert('Ödeme kaydı silindi.', afterPaymentChange);
    },
    onError: (error) => showErrorAlert(error),
  });

  function confirmDeletePayment(payment: Payment) {
    Alert.alert('Ödemeyi Sil', 'Bu ödeme kaydı kalıcı olarak silinecek. Emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => deletePaymentMutation.mutate(payment) },
    ]);
  }

  if (detailQuery.isLoading || !detailQuery.data) {
    return (
      <DetailScaffold
        header={{ title: '' }}
        isLoading
        loadingIndicator={<ActivityIndicator color={theme.colors.brandPrimary} />}
        error={detailQuery.error}
        errorFallbackMessage="Kayıt yüklenemedi"
      >
        {null}
      </DetailScaffold>
    );
  }

  const { obligation, installments } = detailQuery.data;
  const payments = paymentsQuery.data ?? [];
  const isPayable = obligation.direction === 'payable';
  const isOverdue = obligation.status === 'gecikti';
  const isClosed = obligation.status === 'odendi' || obligation.status === 'tahsil_edildi';
  const progress =
    obligation.total_amount_minor > 0
      ? 1 - obligation.remaining_amount_minor / obligation.total_amount_minor
      : 0;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const hasInstallments = installments.length > 0;
  // Ana Sayfa'daki UpcomingDueList filtre şeridiyle (Bugün/7 Gün/30 Gün/Gecikmiş) aynı
  // segmented control deyimi — sekmeler ayrı kartlar değil, tek bir kayan seçim şeridi.
  const tabOptions: { key: DetailTab; label: string }[] = [
    { key: 'genel', label: 'Genel' },
    ...(hasInstallments ? [{ key: 'plan' as DetailTab, label: 'Ödeme Planı' }] : []),
    { key: 'gecmis', label: 'Ödeme Geçmişi' },
  ];

  const paidInstallments = installments.filter((i) => i.remaining_amount_minor <= 0).length;
  // İlk ödenmemiş taksit "sıradaki" olarak vurgulanır; taksit listesi bir ödeme
  // takvimidir, bu yüzden numaralı sıralama burada gerçekten anlam taşır
  // (docs/08-tasarim-sistemi.md §12.3 — kart içinde mikro grafikler/zaman çizgisi).
  const nextInstallment = installments.find((i) => i.remaining_amount_minor > 0) ?? null;
  const bankName = obligation.bank_code ? (BANK_NAME[obligation.bank_code] ?? null) : null;
  const isSubscription = obligation.document_type === 'abonelik';
  const serviceName = obligation.service_code ? (SERVICE_NAME[obligation.service_code] ?? null) : null;
  const unitLabel = isSubscription ? 'Ay' : 'Taksit';

  // Hero yüzeyi her zaman temanın nötr "elevated" tonundadır (açıkta beyaza yakın,
  // koyuda grafit) — sabit sarı/renkli kart tema değişince kırılıyordu. Durum anlamı
  // yalnızca küçük vurgularda kalır: durum rozeti, ilerleme çubuğu ve sekme seçimi
  // aynı tek "state accent" rengini paylaşır (docs §12.4 — üçten fazla vurgu rengi olmaz).
  const stateAccent = isClosed ? theme.colors.success : isOverdue ? theme.colors.danger : theme.colors.brandPrimary;
  const heroAmountColor = isOverdue ? theme.colors.danger : isPayable ? theme.colors.textPrimary : theme.colors.success;
  const heroPrimaryName = bankName ?? serviceName ?? obligation.title;
  const heroSubtitle =
    bankName || serviceName
      ? obligation.title
      : (DOCUMENT_TYPE_LABEL[obligation.document_type] ?? obligation.document_type);

  const nextIndex = installments.findIndex((i) => i.id === nextInstallment?.id);
  const smartPlanPage = nextIndex >= 0 ? Math.floor(nextIndex / TAB_PAGE_SIZE) : 0;
  const effectivePlanPage = planPage ?? smartPlanPage;
  const planPageCount = Math.max(1, Math.ceil(installments.length / TAB_PAGE_SIZE));
  const visibleInstallments = installments.slice(
    effectivePlanPage * TAB_PAGE_SIZE,
    effectivePlanPage * TAB_PAGE_SIZE + TAB_PAGE_SIZE
  );

  const historyPageCount = Math.max(1, Math.ceil(payments.length / TAB_PAGE_SIZE));
  const effectiveHistoryPage = Math.min(historyPage, historyPageCount - 1);
  const visiblePayments = payments.slice(
    effectiveHistoryPage * TAB_PAGE_SIZE,
    effectiveHistoryPage * TAB_PAGE_SIZE + TAB_PAGE_SIZE
  );

  const principalSumMinor = installments.reduce((sum, i) => sum + (i.principal_minor ?? 0), 0);
  const interestSumMinor = installments.reduce((sum, i) => sum + (i.interest_minor ?? 0), 0);
  const hasRateData = installments.some((i) => i.principal_minor !== null && i.interest_minor !== null);
  const effectiveRatio = hasRateData && principalSumMinor > 0 ? (interestSumMinor / principalSumMinor) * 100 : null;

  return (
    <>
      <DetailScaffold
        header={{
          title: heroPrimaryName,
          right: {
            icon: 'pencil',
            accessibilityLabel: 'Düzenle',
            onPress: () => router.push({ pathname: '/obligations/new', params: { id: obligation.id } }),
          },
        }}
        isLoading={false}
      >
        <DetailHeroCard
          sections={[
            <DetailIdentityRow
              key="identity"
              icon={
                <ObligationIcon
                  documentType={obligation.document_type}
                  bankCode={obligation.bank_code}
                  serviceCode={obligation.service_code}
                  fallbackName={obligation.title}
                  size={44}
                />
              }
              title={heroPrimaryName}
              subtitle={heroSubtitle}
              badge={<StatusBadge status={obligation.status} />}
            />,
            <DetailMetricRow
              key="metric"
              label={isPayable ? 'KALAN BORÇ' : 'KALAN ALACAK'}
              value={formatValueUnitAmount(obligation.remaining_amount_minor, obligation.currency_code)}
              valueStyle={{ color: heroAmountColor }}
              ring={
                hasInstallments
                  ? {
                      progress: clampedProgress,
                      color: stateAccent,
                      trackColor: withAlpha(stateAccent, 0.18),
                      centerContent: (
                        <Text variant="cardTitle" tabular>
                          %{Math.round(clampedProgress * 100)}
                        </Text>
                      ),
                    }
                  : undefined
              }
            />,
            <StatColumns
              key="stats"
              columns={[
                {
                  label: hasInstallments ? 'SONRAKİ ÖDEME' : 'TOPLAM',
                  value: hasInstallments
                    ? formatMinorAmount(nextInstallment?.remaining_amount_minor ?? 0, obligation.currency_code)
                    : formatValueUnitAmount(obligation.total_amount_minor, obligation.currency_code),
                },
                {
                  label: hasInstallments ? `KALAN ${unitLabel.toLocaleUpperCase('tr-TR')}` : 'VADE',
                  value: hasInstallments
                    ? `${installments.length - paidInstallments}`
                    : obligation.due_date
                      ? shortDateFormatter.format(new Date(obligation.due_date))
                      : 'Yok',
                  align: 'flex-end',
                },
              ]}
            />,
          ]}
        />

        {!isValueUnitFiat ? (
          <ReferenceValueRow
            amountMinor={obligation.remaining_amount_minor}
            unitCode={obligation.currency_code}
            rates={ratesQuery.data}
            isLoading={ratesQuery.isLoading}
          />
        ) : null}

        {!isClosed && obligation.status !== 'iptal_edildi' && obligation.remaining_amount_minor > 0 ? (
          <Button label="Ödeme Ekle" onPress={() => setPayingInstallment('obligation')} />
        ) : null}

        <SegmentedControl options={tabOptions} value={tab} onChange={setTab} size="compact" stretch />

        {tab === 'genel' ? (
          <Card>
            <Stack gap="md">
              <Row gap="sm" align="center">
                <Ionicons name="document-text-outline" size={18} color={theme.colors.brandPrimary} />
                <Text variant="cardTitle">{DOCUMENT_TYPE_LABEL[obligation.document_type] ?? 'Kayıt'} Bilgileri</Text>
              </Row>
              <Divider />
              <InfoRow
                label={isSubscription ? 'Toplam Tutar' : 'Başlangıç Tutarı'}
                value={formatValueUnitAmount(obligation.total_amount_minor, obligation.currency_code)}
              />
              {effectiveRatio !== null ? (
                <InfoRow label="Faiz Oranı" value={`%${effectiveRatio.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`} />
              ) : null}
              {hasInstallments ? (
                <InfoRow label={`Toplam ${unitLabel}`} value={String(installments.length)} />
              ) : null}
              {obligation.due_date ? <InfoRow label="Vade Tarihi" value={dateFormatter.format(new Date(obligation.due_date))} /> : null}
              {bankName ? <InfoRow label="Banka" value={bankName} /> : null}
              {serviceName ? <InfoRow label="Servis" value={serviceName} /> : null}
              <InfoRow label="Durum" value={OBLIGATION_STATUS_LABEL[obligation.status as keyof typeof OBLIGATION_STATUS_LABEL] ?? obligation.status} />
            </Stack>
          </Card>
        ) : tab === 'plan' && hasInstallments ? (
          <Stack gap="md">
            <View>
              {visibleInstallments.map((installment, index) => (
                <TimelineInstallmentRow
                  key={installment.id}
                  installment={installment}
                  currencyCode={obligation.currency_code}
                  isNext={installment.id === nextInstallment?.id}
                  isLast={index === visibleInstallments.length - 1}
                  unitLabel={unitLabel}
                  onPay={() => setPayingInstallment(installment)}
                />
              ))}
            </View>
            <Pagination page={effectivePlanPage} totalPages={planPageCount} onChange={setPlanPage} />
          </Stack>
        ) : (
          <Stack gap="md">
            {visiblePayments.length === 0 ? (
              <EmptyState icon="receipt-outline" message="Henüz ödeme kaydı yok." />
            ) : (
              <Stack gap="xs">
                {visiblePayments.map((payment) => (
                  <PaymentRow
                    key={payment.id}
                    payment={payment}
                    currencyCode={obligation.currency_code}
                    onEdit={() => setEditingPayment(payment)}
                    onDelete={() => confirmDeletePayment(payment)}
                  />
                ))}
              </Stack>
            )}
            <Pagination page={effectiveHistoryPage} totalPages={historyPageCount} onChange={setHistoryPage} />
          </Stack>
        )}
      </DetailScaffold>

      <Modal
        visible={payingInstallment !== null || editingPayment !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setPayingInstallment(null);
          setEditingPayment(null);
        }}
      >
        {payingInstallment || editingPayment ? (
          <PaymentForm
            workspaceId={activeWorkspaceId}
            obligation={obligation}
            installment={payingInstallment === 'obligation' || !payingInstallment ? null : payingInstallment}
            defaultAmountMinor={
              editingPayment
                ? editingPayment.amount_minor
                : payingInstallment === 'obligation'
                  ? obligation.remaining_amount_minor
                  : (payingInstallment as Installment).remaining_amount_minor
            }
            accounts={accountsQuery.data ?? []}
            editingPayment={editingPayment}
            onClose={() => {
              setPayingInstallment(null);
              setEditingPayment(null);
            }}
            onSuccess={() => {
              // Modal'ı Alert'in "Tamam"ına kadar açık tutuyoruz; kapatma ve önbellek
              // geçersizleştirme/yeniden render gibi ağır iş bir sonraki etkileşim turuna
              // ertelenir — aksi halde Fabric, modal dismiss animasyonuyla aynı anda arkadaki
              // listeyi (taksitler vb.) yeniden mount etmeye çalışıp çöküyor (bkz.
              // review.tsx'teki InteractionManager.runAfterInteractions ile aynı düzeltme).
              showSuccessAlert(editingPayment ? 'Ödeme başarıyla güncellendi.' : 'Ödeme başarıyla kaydedildi.', () => {
                setPayingInstallment(null);
                setEditingPayment(null);
                afterPaymentChange();
              });
            }}
          />
        ) : null}
      </Modal>
    </>
  );
}

// docs/01-finansal-kayit-modeli.md §3.5/§9.4.2 — kıymetli maden/döviz kaydının TL
// karşılığı kalıcı saklanmaz; her görüntülemede canlı fiyattan hesaplanan, açıkça
// "≈" ve kur yaşıyla etiketlenmiş bir ikincil satırdır. Kur satırı bulunamazsa veya
// value_unit_rates hiç güncellenmemişse (bkz. supabase/functions/sync-market-rates)
// kaydın kendi tutarını etkilemeden şeffafça "kur bilgisi yok" gösterilir.
function formatCacheAge(cachedAt: string): string {
  const hours = Math.round((Date.now() - new Date(cachedAt).getTime()) / (60 * 60 * 1000));
  if (hours < 1) return 'az önce';
  if (hours < 24) return `${hours} saat önce`;
  return `${Math.round(hours / 24)} gün önce`;
}

function ReferenceValueRow({
  amountMinor,
  unitCode,
  rates,
  isLoading,
}: {
  amountMinor: number;
  unitCode: string;
  rates: ValueUnitRate[] | undefined;
  isLoading: boolean;
}) {
  if (isLoading) return null;

  const reference = rates ? convertToReferenceMinor(amountMinor, unitCode, rates) : null;
  if (!reference) {
    return (
      <Text variant="caption" color="textSecondary">
        Güncel TL karşılığı için kur bilgisi bulunamadı.
      </Text>
    );
  }

  return (
    <Text variant="caption" color="textSecondary">
      ≈ {formatMinorAmount(reference.amountMinor, 'TRY')} (güncel kur
      {reference.isStale ? `, ${formatCacheAge(reference.cachedAt)} güncellendi` : ''})
    </Text>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Row align="center">
      <Text variant="body" color="textSecondary" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="body" tabular numberOfLines={1} style={{ maxWidth: '55%', textAlign: 'right' }}>
        {value}
      </Text>
    </Row>
  );
}

interface TimelineInstallmentRowProps {
  installment: Installment;
  currencyCode: string;
  isNext: boolean;
  isLast: boolean;
  unitLabel: string;
  onPay: () => void;
}

// Taksit listesi bir kredinin ödeme takvimidir: sıra numarası gerçek bilgi taşır.
// Ödenmiş taksit dolu yeşil, sıradaki dolu Saffron, gelecek taksitler soluk anahat.
// Markerlar arasındaki dikey çizgi ödeme takvimini gerçek bir zaman çizgisi olarak
// okunur kılar (docs/08-tasarim-sistemi.md §12.15 — "taksit zaman çizgisi").
function TimelineInstallmentRow({ installment, currencyCode, isNext, isLast, unitLabel, onPay }: TimelineInstallmentRowProps) {
  const theme = useTheme();
  const paid = installment.remaining_amount_minor <= 0;

  const markerBg = paid ? theme.colors.success : isNext ? theme.colors.brandPrimary : 'transparent';
  const markerBorder = paid ? theme.colors.success : isNext ? theme.colors.brandPrimary : theme.colors.border;
  const markerTextColor = paid || isNext ? theme.colors.brandPrimaryText : theme.colors.textSecondary;

  return (
    <Row gap="sm" align="stretch" style={{ marginBottom: isLast ? 0 : theme.spacing.sm }}>
      <Stack gap="xs" align="center" style={{ width: 32 }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            borderWidth: paid || isNext ? 0 : 1.5,
            borderColor: markerBorder,
            backgroundColor: markerBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {paid ? (
            <Ionicons name="checkmark" size={16} color={theme.colors.brandPrimaryText} />
          ) : (
            <Text variant="caption" style={{ color: markerTextColor, fontWeight: '700' }}>
              {installment.installment_number}
            </Text>
          )}
        </View>
        {!isLast ? (
          <View
            style={{
              flex: 1,
              width: 2,
              borderRadius: 1,
              backgroundColor: paid ? theme.colors.success : theme.colors.border,
            }}
          />
        ) : null}
      </Stack>

      <View style={{ flex: 1 }}>
        <Card elevated={isNext}>
          <Row gap="sm">
            <Stack gap="xxs" style={{ flex: 1 }}>
              <Text variant="cardTitle" numberOfLines={1}>
                {installment.installment_number}. {unitLabel} — {shortDateFormatter.format(new Date(installment.due_date))}
              </Text>
              {installment.principal_minor !== null && installment.interest_minor !== null ? (
                <Text variant="caption" color="textSecondary">
                  Anapara {formatMinorAmount(installment.principal_minor, currencyCode)} · Faiz{' '}
                  {formatMinorAmount(installment.interest_minor, currencyCode)}
                </Text>
              ) : null}
            </Stack>

            <Stack gap="xxs" align="flex-end">
              {paid ? (
                <Text variant="caption" style={{ color: theme.colors.success, fontWeight: '600' }}>
                  Ödendi
                </Text>
              ) : (
                <Amount amountMinor={installment.remaining_amount_minor} currencyCode={currencyCode} variant="body" />
              )}
              {!paid ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={onPay}
                  style={{
                    paddingHorizontal: theme.spacing.sm,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: withAlpha(theme.colors.brandPrimary, 0.16),
                  }}
                >
                  <Text variant="caption" style={{ color: theme.colors.brandPrimary, fontWeight: '600' }}>
                    Öde
                  </Text>
                </Pressable>
              ) : null}
            </Stack>
          </Row>
        </Card>
      </View>
    </Row>
  );
}

function PaymentRow({
  payment,
  currencyCode,
  onEdit,
  onDelete,
}: {
  payment: Payment;
  currencyCode: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();

  return (
    <Card>
      <Row gap="sm" align="center">
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: withAlpha(theme.colors.success, 0.16),
          }}
        >
          <Ionicons name="checkmark" size={16} color={theme.colors.success} />
        </View>
        <Text variant="body" color="textSecondary" style={{ flex: 1 }}>
          {dateFormatter.format(new Date(payment.paid_at))}
        </Text>
        <Amount amountMinor={payment.amount_minor} currencyCode={currencyCode} variant="body" />
        <Pressable accessibilityRole="button" accessibilityLabel="Ödemeyi düzenle" onPress={onEdit} hitSlop={8}>
          <Ionicons name="create-outline" size={18} color={theme.colors.textSecondary} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Ödemeyi sil" onPress={onDelete} hitSlop={8}>
          <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
        </Pressable>
      </Row>
    </Card>
  );
}

interface PaymentFormProps {
  workspaceId: string | null;
  obligation: Obligation;
  installment: Installment | null;
  defaultAmountMinor: number;
  accounts: Account[];
  /** Doluysa form düzenleme modunda açılır: mevcut ödeme güncellenir, yeni kayıt oluşturulmaz. */
  editingPayment?: Payment | null;
  onClose: () => void;
  onSuccess: () => void;
}

function PaymentForm({
  workspaceId,
  obligation,
  installment,
  defaultAmountMinor,
  accounts,
  editingPayment,
  onClose,
  onSuccess,
}: PaymentFormProps) {
  const theme = useTheme();
  const isEditing = !!editingPayment;
  const valueUnit = getValueUnit(obligation.currency_code);
  const [amount, setAmount] = useState(
    formatAmountInput(
      (defaultAmountMinor / 10 ** valueUnit.precision).toFixed(valueUnit.precision).replace('.', ','),
      valueUnit.precision
    )
  );
  const [accountId, setAccountId] = useState<string | null>(editingPayment?.account_id ?? null);
  // Ödeme varsayılan olarak işlem yapıldığı anın tarihiyle (DB varsayılanı) kaydedilir,
  // ama geçmiş/ileri tarihli ödemeler için kullanıcı bunu elle değiştirebilir.
  const [dateStr, setDateStr] = useState(
    editingPayment ? editingPayment.paid_at.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );

  const mutation = useMutation({
    mutationFn: () => {
      if (!workspaceId || !amount) throw new Error('Eksik alan var');
      const amountMinor = parseValueUnitAmountToMinor(amount, obligation.currency_code);
      if (amountMinor === null) throw new Error('Tutar okunamadı, kontrol edin');
      const parsedDate = new Date(dateStr);
      if (Number.isNaN(parsedDate.getTime())) throw new Error('Tarih okunamadı, kontrol edin');
      const paidAt = parsedDate.toISOString();

      if (editingPayment) {
        return updatePayment(editingPayment, {
          amount_minor: amountMinor,
          paid_at: paidAt,
          account_id: accountId,
          obligationDirection: obligation.direction as 'payable' | 'receivable',
          obligationTitle: obligation.title,
          obligationCategoryId: obligation.category_id,
          obligationCounterpartyId: obligation.counterparty_id,
          obligationCurrencyCode: obligation.currency_code,
        });
      }

      return recordPayment({
        workspace_id: workspaceId,
        obligation_id: obligation.id,
        installment_id: installment?.id ?? null,
        account_id: accountId,
        amount_minor: amountMinor,
        paid_at: paidAt,
        obligationDirection: obligation.direction as 'payable' | 'receivable',
        obligationTitle: obligation.title,
        obligationCategoryId: obligation.category_id,
        obligationCounterpartyId: obligation.counterparty_id,
        obligationCurrencyCode: obligation.currency_code,
      });
    },
    onSuccess,
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <Stack gap="lg" style={{ flex: 1, padding: theme.screenEdge.standard }}>
        <Row align="center">
          <Text variant="pageTitle" style={{ flex: 1 }}>
            {isEditing ? 'Ödemeyi Düzenle' : 'Ödeme Ekle'}
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
          </Pressable>
        </Row>

        {installment ? (
          <Text variant="body" color="textSecondary">
            {installment.installment_number}. taksit — {shortDateFormatter.format(new Date(installment.due_date))}
          </Text>
        ) : null}

        <Stack gap="sm">
          <Text variant="caption" color="textSecondary">
            TUTAR ({valueUnit.quantityLabel})
          </Text>
          <AmountField
            placeholder={valueUnit.precision === 0 ? '1' : '0,00'}
            precision={valueUnit.precision}
            value={amount}
            onChangeText={setAmount}
          />
        </Stack>

        <DateField label="ÖDEME TARİHİ" value={dateStr} onChangeText={setDateStr} />

        {accounts.length > 0 ? (
          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              HESAP (İSTEĞE BAĞLI)
            </Text>
            <AccountPicker accounts={accounts} selectedId={accountId} onSelect={setAccountId} />
          </Stack>
        ) : null}

        {mutation.error ? (
          <Text variant="caption" color="danger">
            {mutation.error instanceof Error ? mutation.error.message : 'Ödeme kaydedilemedi'}
          </Text>
        ) : null}

        <View style={{ flex: 1 }} />

        <Button
          label={isEditing ? 'Güncelle' : 'Kaydet'}
          onPress={() => mutation.mutate()}
          loading={mutation.isPending}
          disabled={!amount}
        />
      </Stack>
    </SafeAreaView>
  );
}

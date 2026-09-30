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
  ActionSheet,
  Button,
  Card,
  DateField,
  EmptyState,
  Pagination,
  Pressable,
  Row,
  Stack,
  Text,
} from '@/components/primitives';
import { DetailScaffold } from '@/components/navigation/DetailScaffold';
import { Amount } from '@/components/finance/Amount';
import { ReferenceValueRow } from '@/components/finance/ReferenceValueRow';
import { OBLIGATION_STATUS_LABEL, StatusBadge } from '@/components/finance/StatusBadge';
import { ObligationIcon } from '@/components/finance/ObligationIcon';
import {
  FinanceDetailHero,
  FinanceDetailInfoCard,
  FinanceDetailTabs,
} from '@/components/finance/FinanceDetailBlocks';
import { AccountPicker } from '@/components/finance/AccountPicker';
import {
  deleteObligation,
  getObligation,
  getObligationWithInstallments,
  type Installment,
  type Obligation,
} from '@/features/obligations/api';
import { listAccounts, type Account } from '@/features/accounts/api';
import {
  deletePayment,
  listObligationsSettledBy,
  listPaymentsForObligation,
  recordPayment,
  updatePayment,
  type Payment,
} from '@/features/payments/api';
import { ReceiptAttachField } from '@/components/finance/ReceiptAttachField';
import {
  attachReceiptFile,
  discardReceiptFile,
  linkReceiptDocument,
  openReceipt,
  useDocumentArchiveAccess,
  type PendingReceipt,
} from '@/features/receipts/api';
import { BANK_NAME } from '@/features/banks/banks';
import { SERVICE_NAME } from '@/features/services/services';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatAmountInput, formatMinorAmount, formatValueUnitAmount, parseValueUnitAmountToMinor } from '@/utils/money';
import {
  DOCUMENT_TYPE_LABEL,
  INTEREST_DOCUMENT_TYPES,
  getInstallmentUnitLabels,
} from '@/features/obligations/documentTypes';
import { getValueUnit } from '@/features/valueUnits/units';
import { listValueUnitRates } from '@/features/valueUnits/api';
import { queryKeys, invalidatePaymentRelatedQueries } from '@/services/queryKeys';
import { syncObligationReminder } from '@/services/notifications';
import { showSuccessAlert, showErrorAlert } from '@/utils/alerts';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
const shortDateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' });

const TAB_PAGE_SIZE = 10;
type DetailTab = 'genel' | 'plan' | 'gecmis';

export default function ObligationDetailScreen() {
  // pay/installmentId: takvimdeki "Ödendi" kısayolu buraya yönlendirir ve ödeme formunu hesap
  // seçtirerek açar (bkz. components/finance/CalendarObligationRow.tsx).
  const { id, pay, installmentId } = useLocalSearchParams<{ id: string; pay?: string; installmentId?: string }>();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [manualPaying, setPayingInstallment] = useState<Installment | 'obligation' | null>(null);
  // Takvimden "Öde" ile gelindiyse (pay=1) form veri yüklenince kendiliğinden açılır; kullanıcı
  // kapatınca bir daha açılmaz.
  const [payParamDismissed, setPayParamDismissed] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
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

  // Çek/senet kaydıysa hangi fatura/borçların karşılığı olarak verildiği/alındığı.
  const isInstrumentRecord =
    detailQuery.data?.obligation.document_type === 'cek' || detailQuery.data?.obligation.document_type === 'senet';
  const settledQuery = useQuery({
    queryKey: ['obligation', id, 'settled-by'],
    queryFn: () => listObligationsSettledBy(id as string),
    enabled: !!id && isInstrumentRecord,
  });

  const autoPaying: Installment | 'obligation' | null =
    !payParamDismissed && pay === '1' && detailQuery.data
      ? ((installmentId ? detailQuery.data.installments.find((i) => i.id === installmentId) : null) ?? 'obligation')
      : null;
  const payingInstallment = manualPaying ?? autoPaying;

  // docs/01-finansal-kayit-modeli.md §3.5 — kıymetli maden/döviz kaydının TL karşılığı
  // kalıcı saklanmaz, her görüntülemede canlı fiyattan hesaplanır; yalnızca TRY dışı
  // kayıtlarda gerektiği için sorgu her ekranda değil burada, koşullu olarak açılır.
  const isTry = (detailQuery.data?.obligation.currency_code ?? 'TRY') === 'TRY';
  const ratesQuery = useQuery({
    queryKey: queryKeys.valueUnitRates(),
    queryFn: listValueUnitRates,
    enabled: !isTry,
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['obligation', id] });
    if (activeWorkspaceId) {
      invalidatePaymentRelatedQueries(queryClient, activeWorkspaceId);
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

  const deleteObligationMutation = useMutation({
    mutationFn: () => deleteObligation(id as string),
    onSuccess: () => {
      const documentType = detailQuery.data?.obligation.document_type;
      showSuccessAlert('Kayıt başarıyla silindi.', () => {
        if (documentType) {
          router.replace({ pathname: '/obligations', params: { type: documentType } });
        } else {
          router.replace('/(tabs)/daha-fazla');
        }
        InteractionManager.runAfterInteractions(() => {
          if (activeWorkspaceId) {
            invalidatePaymentRelatedQueries(queryClient, activeWorkspaceId);
          }
          queryClient.removeQueries({ queryKey: ['obligation', id] });
          queryClient.removeQueries({ queryKey: ['obligation', id, 'payments'] });
        });
      });
    },
    onError: (error) => showErrorAlert(error),
  });

  function confirmDeletePayment(payment: Payment) {
    Alert.alert('Ödemeyi Sil', 'Bu ödeme kaydı kalıcı olarak silinecek. Emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => deletePaymentMutation.mutate(payment) },
    ]);
  }

  function confirmDeleteObligation() {
    const settledCount = settledQuery.data?.length ?? 0;
    Alert.alert(
      'Kaydı Sil',
      settledCount > 0
        ? `Bu kayıt, taksitleri ve ödeme geçmişi kalıcı olarak silinecek. Bu ${DOCUMENT_TYPE_LABEL[detailQuery.data?.obligation.document_type ?? ''] ?? 'kayıt'} ile kapatılan ${settledCount} kayıt yeniden açılacak. Emin misiniz?`
        : 'Bu kayıt, taksitleri ve ödeme geçmişi kalıcı olarak silinecek. Emin misiniz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: () => deleteObligationMutation.mutate() },
      ]
    );
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
  // Kredi listelerindeki filtre diliyle aynı: seçili sekme safran, üç seçenek tek satırda
  // ve sabit yükseklikte kalır. Kredi kaydında plan henüz oluşmamış olsa da sekme görünür.
  const showsPlanTab = hasInstallments || obligation.document_type === 'kredi';
  const tabOptions: { key: DetailTab; label: string }[] = [
    { key: 'genel', label: 'Genel' },
    ...(showsPlanTab ? [{ key: 'plan' as DetailTab, label: 'Ödeme Planı' }] : []),
    { key: 'gecmis', label: 'Ödeme Geçmişi' },
  ];

  const paidInstallments = installments.filter((i) => i.remaining_amount_minor <= 0).length;
  // İlk ödenmemiş taksit "sıradaki" olarak vurgulanır; taksit listesi bir ödeme
  // takvimidir, bu yüzden numaralı sıralama burada gerçekten anlam taşır
  // (docs/08-tasarim-sistemi.md §12.3 — kart içinde mikro grafikler/zaman çizgisi).
  const nextInstallment = installments.find((i) => i.remaining_amount_minor > 0) ?? null;
  const bankName = obligation.bank_code ? (BANK_NAME[obligation.bank_code] ?? null) : null;
  const serviceName = obligation.service_code ? (SERVICE_NAME[obligation.service_code] ?? null) : null;
  // Vade birimi ve tutar etiketi belge türünden gelir (bkz. features/obligations/documentTypes.ts):
  // maaş/kira/abonelik/vergi gibi tekrarlayan kayıtlarda "Ay", kredi/çek/senette "Taksit".
  const unitLabel = getInstallmentUnitLabels(obligation.document_type).unitTitle;
  // Faizli türlerde TUTAR anaparadır, ödenecek toplam taksitlerden türer — diğer tüm
  // türlerde total_amount_minor zaten toplamın kendisidir.
  const isInterestBearing = INTEREST_DOCUMENT_TYPES.has(obligation.document_type);

  // Hero yüzeyi her zaman temanın nötr "elevated" tonundadır (açıkta beyaza yakın,
  // koyuda grafit) — sabit sarı/renkli kart tema değişince kırılıyordu. Durum anlamı
  // yalnızca küçük vurgularda kalır: durum rozeti, ilerleme çubuğu ve sekme seçimi
  // aynı tek "state accent" rengini paylaşır (docs §12.4 — üçten fazla vurgu rengi olmaz).
  const stateAccent = isClosed ? theme.colors.success : isOverdue ? theme.colors.danger : theme.colors.brandPrimary;
  const heroAmountColor = isOverdue ? theme.colors.danger : isPayable ? theme.colors.textPrimary : theme.colors.success;
  const heroPrimaryName = bankName ?? serviceName ?? obligation.title;

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
  const paidAmountMinor = Math.max(0, obligation.total_amount_minor - obligation.remaining_amount_minor);
  const remainingInstallmentCount = Math.max(0, installments.length - paidInstallments);

  return (
    <>
      <DetailScaffold
        header={{
          title: heroPrimaryName,
          right: {
            icon: 'ellipsis-horizontal',
            accessibilityLabel: 'Kayıt işlemleri',
            onPress: () => setMenuOpen(true),
          },
        }}
        isLoading={false}
      >
        <FinanceDetailHero
          icon={
            <ObligationIcon
              documentType={obligation.document_type}
              bankCode={obligation.bank_code}
              serviceCode={obligation.service_code}
              fallbackName={obligation.title}
              size={44}
            />
          }
          title={DOCUMENT_TYPE_LABEL[obligation.document_type] ?? obligation.title}
          status={<StatusBadge status={obligation.status} />}
          amountLabel={isPayable ? 'KALAN TUTAR' : 'KALAN ALACAK'}
          amount={formatValueUnitAmount(obligation.remaining_amount_minor, obligation.currency_code)}
          amountColor={heroAmountColor}
          progress={clampedProgress}
          progressColor={stateAccent}
          stats={[
            {
              label: 'SONRAKİ ÖDEME',
              value: nextInstallment
                ? formatMinorAmount(nextInstallment.remaining_amount_minor, obligation.currency_code)
                : '—',
            },
            { label: `KALAN ${unitLabel.toLocaleUpperCase('tr-TR')}`, value: String(remainingInstallmentCount) },
            { label: 'ÖDENEN', value: formatValueUnitAmount(paidAmountMinor, obligation.currency_code) },
          ]}
        />

        {!isTry ? (
          <ReferenceValueRow
            amountMinor={obligation.remaining_amount_minor}
            unitCode={obligation.currency_code}
            rates={ratesQuery.data}
            isLoading={ratesQuery.isLoading}
          />
        ) : null}

        <FinanceDetailTabs options={tabOptions} value={tab} onChange={setTab} />

        {tab === 'genel' ? (
          <FinanceDetailInfoCard
            title={`${DOCUMENT_TYPE_LABEL[obligation.document_type] ?? 'Kayıt'} Bilgileri`}
            description="Vade, taraf ve sınıflandırma"
            rows={[
              {
                label: 'Vade Tarihi',
                value: obligation.due_date ? dateFormatter.format(new Date(obligation.due_date)) : '—',
              },
              ...(bankName ? [{ label: 'Banka', value: bankName }] : []),
              ...(serviceName ? [{ label: 'Servis', value: serviceName }] : []),
              { label: 'Hesap', value: obligation.account?.name ?? '—' },
              { label: 'Kategori', value: obligation.category?.name ?? '—' },
              ...(obligation.counterparty?.name ? [{ label: 'Taraf', value: obligation.counterparty.name }] : []),
              ...(obligation.notes ? [{ label: 'Not', value: obligation.notes }] : []),
              ...(settledQuery.data ?? []).map((settled) => ({
                label: 'Karşılığı',
                value: `${settled.title} · ${formatValueUnitAmount(settled.amountMinor, obligation.currency_code)}`,
              })),
              {
                label: isInterestBearing ? 'Başlangıç Tutarı' : 'Toplam Tutar',
                value: formatValueUnitAmount(obligation.total_amount_minor, obligation.currency_code),
              },
              ...(effectiveRatio !== null
                ? [{ label: 'Faiz Oranı', value: `%${effectiveRatio.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}` }]
                : []),
              ...(hasInstallments ? [{ label: `Toplam ${unitLabel}`, value: String(installments.length) }] : []),
              {
                label: 'Durum',
                value:
                  OBLIGATION_STATUS_LABEL[obligation.status as keyof typeof OBLIGATION_STATUS_LABEL] ??
                  obligation.status,
              },
            ]}
          />
        ) : tab === 'plan' ? (
          <Stack gap="md">
            {visibleInstallments.length === 0 ? (
              <EmptyState icon="calendar-outline" message="Henüz ödeme planı yok." />
            ) : (
              <>
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
              </>
            )}
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
                    onOpenInstrument={() => router.push(`/obligations/${payment.settled_by_obligation_id}`)}
                  />
                ))}
              </Stack>
            )}
            <Pagination page={effectiveHistoryPage} totalPages={historyPageCount} onChange={setHistoryPage} />
          </Stack>
        )}
      </DetailScaffold>

      <ActionSheet
        visible={menuOpen}
        title={`${DOCUMENT_TYPE_LABEL[obligation.document_type] ?? 'Kayıt'} İşlemleri`}
        onClose={() => setMenuOpen(false)}
        options={[
          // Kredi kartı ekstresi kendi başına ödenmez: ödeme kart hesabından tek bir
          // transferle yapılır ve kartın açık ekstirelerine otomatik dağıtılır (bkz.
          // features/payments/api.ts recordCardPayment, app/accounts/[id].tsx "Ödeme Ekle").
          // Buradan doğrudan ödeme alınırsa kart bakiyesi güncellenmeden kalır — bu yüzden
          // burada yerine kart sayfasına yönlendirilir.
          ...(obligation.document_type === 'kredi_karti_ekstresi'
            ? obligation.account_id
              ? [
                  {
                    key: 'go-to-card',
                    label: 'Karta Git',
                    description: 'Ödeme, kart sayfasından işlenir.',
                    icon: 'card-outline' as const,
                    onPress: () => router.push(`/accounts/${obligation.account_id}`),
                  },
                ]
              : []
            : !isClosed && obligation.status !== 'iptal_edildi' && obligation.remaining_amount_minor > 0
              ? [
                  {
                    key: 'payment',
                    label: isPayable ? 'Ödeme Ekle' : 'Tahsilat Ekle',
                    description: isPayable
                      ? 'Nakit, havale veya kartla ödeme işle'
                      : 'Nakit, havale veya kartla tahsilat işle',
                    icon: 'cash-outline' as const,
                    onPress: () => setPayingInstallment('obligation'),
                  },
                  // Çek/senet vadeli bir ödeme aracıdır: bu kayıt tutar kadar kapanır, vadeli bir
                  // çek/senet kaydı açılır (bkz. app/payments/new.tsx). Çek/senedin kendisi başka
                  // bir çek/senetle kapatılmaz; karşı tarafı olmayan kayıtlarda (kredi vb.) yoktur.
                  // Alınmış çek/senet tahsil edilmeden bir tedarikçiye verilebilir (ciro).
                  ...(isInstrumentRecord && !isPayable
                    ? [
                        {
                          key: 'endorse',
                          label: 'Ciro Et',
                          description: 'Bu çek/senedi bir tedarikçiye vererek borcunu kapat',
                          icon: 'swap-horizontal-outline' as const,
                          onPress: () =>
                            router.push({ pathname: '/payments/new', params: { endorseId: obligation.id } }),
                        },
                      ]
                    : []),
                  // Avans (ön ödeme / alınan avans) sonraki faturadan düşülür.
                  ...(obligation.document_type === 'avans' && obligation.counterparty_id
                    ? [
                        {
                          key: 'offset',
                          label: 'Faturadan Mahsup Et',
                          description: 'Bu avansı cariyle açık fatura/borçtan düş',
                          icon: 'git-compare-outline' as const,
                          onPress: () =>
                            router.push({
                              pathname: '/payments/new',
                              params: { obligationId: obligation.id, method: 'mahsup' },
                            }),
                        },
                      ]
                    : []),
                  ...(obligation.counterparty_id && !isInstrumentRecord && obligation.document_type !== 'avans'
                    ? [
                        {
                          key: 'instrument',
                          label: isPayable ? 'Çek / Senet ile Öde' : 'Çek / Senet ile Tahsil Et',
                          description: 'Kayıt tutar kadar kapanır, vadeli çek/senet açılır',
                          icon: 'document-text-outline' as const,
                          onPress: () =>
                            router.push({
                              pathname: '/payments/new',
                              params: { obligationId: obligation.id, method: 'cek' },
                            }),
                        },
                      ]
                    : []),
                ]
              : []),
          {
            key: 'edit',
            label: 'Düzenle',
            description: 'Kayıt bilgilerini güncelle',
            icon: 'create-outline',
            onPress: () => router.push({ pathname: '/obligations/new', params: { id: obligation.id } }),
          },
          {
            key: 'delete',
            label: deleteObligationMutation.isPending ? 'Siliniyor…' : 'Sil',
            description: 'Kaydı ve bağlı ödeme geçmişini kaldır',
            icon: 'trash-outline',
            danger: true,
            onPress: () => {
              if (!deleteObligationMutation.isPending) confirmDeleteObligation();
            },
          },
        ]}
      />

      <Modal
        visible={payingInstallment !== null || editingPayment !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setPayingInstallment(null);
          setPayParamDismissed(true);
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
              setPayParamDismissed(true);
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
                setPayParamDismissed(true);
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
  onOpenInstrument,
}: {
  payment: Payment;
  currencyCode: string;
  onEdit: () => void;
  onDelete: () => void;
  onOpenInstrument: () => void;
}) {
  const theme = useTheme();

  // Çek/senetle yapılmış ödeme: tek başına düzenlenip silinemez — silinirse fatura yeniden açılır
  // ama çek/senet borcu kalır ve borç ikiye katlanır. Değişiklik çek/senet kaydının kendisinden
  // yapılır (silinirse bu satır da birlikte silinir).
  if (payment.settled_by_obligation_id) {
    return (
      <Pressable accessibilityRole="button" onPress={onOpenInstrument}>
        <Card>
          <Row gap="sm" align="center">
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: withAlpha(theme.colors.brandPrimary, 0.16),
              }}
            >
              <Ionicons name="document-text-outline" size={16} color={theme.colors.brandPrimary} />
            </View>
            <Stack gap="xxs" style={{ flex: 1 }}>
              <Text variant="body" color="textSecondary">
                {dateFormatter.format(new Date(payment.paid_at))}
              </Text>
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                {payment.notes ?? 'Çek/senet ile kapatıldı'}
              </Text>
            </Stack>
            <Amount amountMinor={payment.amount_minor} currencyCode={currencyCode} variant="body" />
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
          </Row>
        </Card>
      </Pressable>
    );
  }

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
        {payment.receipt_document_id ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dekontu aç"
            onPress={async () => {
              try {
                await openReceipt(payment.receipt_document_id as string);
              } catch {
                Alert.alert('Dekont açılamadı', 'Dosya bulunamadı ya da bağlantı kurulamadı.');
              }
            }}
            hitSlop={8}
          >
            <Ionicons name="attach" size={20} color={theme.colors.brandPrimary} />
          </Pressable>
        ) : null}
        {/* Kart ödemesi transferinden dağıtılan satırlar (hesapsız ama transaction'lı) tek başına
            düzenlenmez: transfer birden çok ekstreyi kapsar. Silme ise hepsini birlikte kaldırır. */}
        {payment.transaction_id && !payment.account_id ? null : (
          <Pressable accessibilityRole="button" accessibilityLabel="Ödemeyi düzenle" onPress={onEdit} hitSlop={8}>
            <Ionicons name="create-outline" size={18} color={theme.colors.textSecondary} />
          </Pressable>
        )}
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
  // POS yalnızca tahsilat alır, ondan ödeme yapılamaz — borç (payable) ödemesinde HESAP
  // seçeneklerinden çıkarılır; alacak (receivable) tahsilatı POS'tan olabileceği için orada kalır.
  // Kredi kartı ekstresi ödemesinde ayrıca hiçbir kredi kartı hesabı kaynak olamaz — bir kartın
  // borcu başka (veya aynı) bir kartla "ödenemez", gerçek parasal hareket temsil etmez.
  // Nakit avans da kart borcudur: karttan "ödenirse" karta gider yazılır ve kart borcu düşmek
  // yerine artar — ekstre ile aynı kural.
  const isCardStatementPayment =
    obligation.document_type === 'kredi_karti_ekstresi' || obligation.document_type === 'nakit_avans';
  const payableAccounts =
    obligation.direction === 'payable'
      ? accounts.filter((a) => a.type !== 'pos' && (!isCardStatementPayment || a.type !== 'credit_card'))
      : accounts;
  // Yeni ödemede kaydın kendi hesabı (ör. çek/senette "vadede ödenecek hesap") geçerliyse önerilir.
  const [accountId, setAccountId] = useState<string | null>(
    editingPayment
      ? editingPayment.account_id
      : payableAccounts.some((a) => a.id === obligation.account_id)
        ? obligation.account_id
        : null
  );
  // Ödeme varsayılan olarak işlem yapıldığı anın tarihiyle (DB varsayılanı) kaydedilir,
  // ama geçmiş/ileri tarihli ödemeler için kullanıcı bunu elle değiştirebilir.
  const [dateStr, setDateStr] = useState(
    editingPayment ? editingPayment.paid_at.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  // Dekont (Plus): yeni seçilen dosya ya da düzenlemede mevcut bağlantı. removedExisting,
  // kullanıcı kayıtlı dekontu ödemeden ayırdıysa true olur.
  const archive = useDocumentArchiveAccess();
  const [receipt, setReceipt] = useState<PendingReceipt | null>(null);
  const [removedExisting, setRemovedExisting] = useState(false);
  const existingReceiptId = removedExisting ? null : (editingPayment?.receipt_document_id ?? null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId || !amount) throw new Error('Eksik alan var');
      const amountMinor = parseValueUnitAmountToMinor(amount, obligation.currency_code);
      if (amountMinor === null) throw new Error('Tutar okunamadı, kontrol edin');
      const parsedDate = new Date(dateStr);
      if (Number.isNaN(parsedDate.getTime())) throw new Error('Tarih okunamadı, kontrol edin');
      const paidAt = parsedDate.toISOString();

      // Dekont önce yüklenir ki ödeme satırı tek insert/update'te ona bağlanabilsin; ödeme
      // yazılamazsa yüklenen dosya temizlenir (öksüz dekont kalmaz).
      const receiptDocument = receipt
        ? await attachReceiptFile({
            workspaceId,
            ...receipt,
            obligationId: obligation.id,
            amountMinor,
            currencyCode: obligation.currency_code,
          })
        : null;

      try {
        const payment = editingPayment
          ? await updatePayment(editingPayment, {
              amount_minor: amountMinor,
              paid_at: paidAt,
              account_id: accountId,
              receipt_document_id: receiptDocument ? receiptDocument.id : removedExisting ? null : undefined,
              obligationDirection: obligation.direction as 'payable' | 'receivable',
          obligationTitle: obligation.title,
          obligationCategoryId: obligation.category_id,
          obligationCounterpartyId: obligation.counterparty_id,
          obligationCurrencyCode: obligation.currency_code,
        })
          : await recordPayment({
              workspace_id: workspaceId,
              obligation_id: obligation.id,
              installment_id: installment?.id ?? null,
              account_id: accountId,
              amount_minor: amountMinor,
              paid_at: paidAt,
              receipt_document_id: receiptDocument?.id ?? null,
              obligationDirection: obligation.direction as 'payable' | 'receivable',
              obligationTitle: obligation.title,
              obligationCategoryId: obligation.category_id,
              obligationCounterpartyId: obligation.counterparty_id,
              obligationCurrencyCode: obligation.currency_code,
            });

        // Belge → borç/hareket bağlantısı (docs/00 kural 6). Ödeme zaten kaydedildiği için bu
        // adımın başarısızlığı kaydı geri almaz; dekont ödemeye bağlı kalır.
        if (receiptDocument) {
          await linkReceiptDocument(receiptDocument.id, {
            obligationId: obligation.id,
            transactionId: payment.transaction_id,
          }).catch(() => undefined);
        }
        return payment;
      } catch (error) {
        if (receiptDocument) await discardReceiptFile(receiptDocument);
        throw error;
      }
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

        {payableAccounts.length > 0 ? (
          // Önceden "İSTEĞE BAĞLI" idi ve recordPayment hesapsız çağrıldığında (bkz.
          // features/payments/api.ts) hiçbir transaction oluşturmuyordu — ödeme borcu kapatıyor
          // ("açık bakiye" doğru düşüyor) ama hiçbir hesabın bakiyesini etkilemiyor ve Hareketler'de
          // hiç görünmüyordu; kullanıcı parayı nereden ödediğini unutsa bile fark etmiyordu. Bu
          // form yalnızca canlı/yeni bir ödeme için kullanılır (geçmiş taksitlerin hesapsız toplu
          // "ödendi" işaretlenmesi ayrı bir yoldan gider, bkz. recordPastInstallmentPayments) —
          // burada hesap artık zorunlu.
          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              HESAP
            </Text>
            <AccountPicker accounts={payableAccounts} selectedId={accountId} onSelect={setAccountId} />
          </Stack>
        ) : null}

        <ReceiptAttachField
          value={receipt}
          onChange={setReceipt}
          existingReceiptId={existingReceiptId}
          onRemoveExisting={() => setRemovedExisting(true)}
          allowed={archive.allowed}
          onUpgrade={() => {
            onClose();
            setTimeout(() => router.push('/paywall'), 400);
          }}
        />

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
          disabled={!amount || (payableAccounts.length > 0 && !accountId)}
        />
      </Stack>
    </SafeAreaView>
  );
}

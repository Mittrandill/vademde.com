import { useState } from 'react';
import { ActivityIndicator, Alert, InteractionManager, KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import {
  ActionSheet,
  BigAmountInput,
  Button,
  Card,
  DateField,
  FieldGroup,
  EmptyState,
  Group,
  GroupedRow,
  GroupedRowIcon,
  Pagination,
  Pill,
  Pressable,
  Row,
  Stack,
  Tag,
  Text,
} from '@/components/primitives';
import { DetailScaffold } from '@/components/navigation/DetailScaffold';
import { Amount } from '@/components/finance/Amount';
import { ReferenceValueRow } from '@/components/finance/ReferenceValueRow';
import { OBLIGATION_STATUS_LABEL, StatusBadge } from '@/components/finance/StatusBadge';
import { ObligationIcon } from '@/components/finance/ObligationIcon';
import {
  FinanceDetailInfoCard,
  FinanceDetailTabs,
} from '@/components/finance/FinanceDetailBlocks';
import { AccountAvatar, AccountPicker } from '@/components/finance/AccountPicker';
import { InstallmentPlanTable, type InstallmentPlanRow } from '@/components/finance/InstallmentPlanTable';
import { getAccountBalances } from '@/features/reports/api';
import {
  deleteObligation,
  getObligation,
  getObligationWithInstallments,
  getLinkedDocument,
  type Installment,
  type Obligation,
  localIsoDate,
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
import { InstrumentLifecycle } from '@/components/finance/InstrumentLifecycle';
import { showSuccessAlert, showErrorAlert, friendlyErrorMessage } from '@/utils/alerts';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
const shortDateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' });

const TAB_PAGE_SIZE = 10;
const monthYearFormatter = new Intl.DateTimeFormat('tr-TR', { month: 'short', year: 'numeric' });
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
  const [tab, setTab] = useState<DetailTab>('plan');
  // null = kullanıcı henüz sayfa değiştirmedi; bu durumda sıradaki taksidin bulunduğu
  // sayfa akıllı varsayılan olarak gösterilir (aşağıda hesaplanır).
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

  const documentQuery = useQuery({
    queryKey: ['obligation', id, 'linked-document'],
    queryFn: () => getLinkedDocument(id as string),
    enabled: !!id,
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
        ? `Bu kayıt, taksitleri, ödeme geçmişi ve ödemelerin hesap hareketleri kalıcı olarak silinecek. Bu ${DOCUMENT_TYPE_LABEL[detailQuery.data?.obligation.document_type ?? ''] ?? 'kayıt'} ile kapatılan ${settledCount} kayıt yeniden açılacak. Emin misiniz?`
        : 'Bu kayıt, taksitleri, ödeme geçmişi ve ödemelerin hesap hareketleri kalıcı olarak silinecek. Emin misiniz?',
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
        loadingIndicator={<ActivityIndicator color={theme.colors.textPrimary} />}
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
  // Kart ekstresi kart sayfasından ödenir (bkz. eylem menüsü); kapalı/iptal kayıtta ödeme yok.
  const canRecordPayment =
    obligation.document_type !== 'kredi_karti_ekstresi' &&
    !isClosed &&
    obligation.status !== 'iptal_edildi' &&
    obligation.remaining_amount_minor > 0;
  // Kredi listelerindeki filtre diliyle aynı: seçili sekme safran, üç seçenek tek satırda
  // ve sabit yükseklikte kalır. Kredi kaydında plan henüz oluşmamış olsa da sekme görünür.
  const showsPlanTab = hasInstallments || obligation.document_type === 'kredi';
  // Taksitli kayıtlarda Taksitler/Ödemeler/Bilgiler sekmeleri; diğer türlerde (çek, senet, fatura…)
  // tuval Senet/Fatura detayı gibi sekmesiz: Bilgiler grubu + Ödeme geçmişi tek akışta.
  const tabOptions: { key: DetailTab; label: string }[] = [
    { key: 'plan', label: showsPlanTab ? 'Taksitler' : 'Plan' },
    { key: 'gecmis', label: 'Ödemeler' },
    { key: 'genel', label: 'Bilgiler' },
  ];
  const activeTab: DetailTab = showsPlanTab ? tab : 'genel';

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
  const dueDateValue = obligation.due_date ? new Date(obligation.due_date) : null;
  const daysToDue = dueDateValue ? Math.ceil((dueDateValue.getTime() - new Date().getTime()) / 86400000) : null;
  const statusLabel = OBLIGATION_STATUS_LABEL[obligation.status as keyof typeof OBLIGATION_STATUS_LABEL] ?? obligation.status;
  const statusTagLabel =
    isClosed || daysToDue === null
      ? statusLabel
      : daysToDue < 0
        ? `${statusLabel} · ${-daysToDue} gün`
        : daysToDue === 0
          ? `${statusLabel} · bugün`
          : `${statusLabel} · ${daysToDue} gün`;

  // Ödeme planı tablosu (ortak InstallmentPlanTable): ödenmişler başta özetlenir, sıradaki vurgulanır.
  const todayIso = localIsoDate();
  const planRows: InstallmentPlanRow[] = installments.map((i) => ({
    key: i.id,
    number: i.installment_number,
    dueDate: i.due_date,
    amountMinor: i.remaining_amount_minor <= 0 ? i.amount_minor : i.remaining_amount_minor,
    principalMinor: i.principal_minor,
    status: i.remaining_amount_minor <= 0 ? 'paid' : i.status === 'gecikti' || i.due_date < todayIso ? 'overdue' : 'upcoming',
  }));
  const installmentById = new Map(installments.map((i) => [i.id, i]));

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

  const infoRows: { label: string; value: string; onPress?: () => void }[] = [
    { label: 'Vade', value: dueDateValue ? dateFormatter.format(dueDateValue) : '—' },
    ...(bankName ? [{ label: 'Banka', value: bankName }] : []),
    ...(serviceName ? [{ label: 'Servis', value: serviceName }] : []),
    { label: 'Hesap', value: obligation.account?.name ?? '—' },
    { label: 'Kategori', value: obligation.category?.name ?? '—' },
    ...(obligation.counterparty?.name
      ? [
          {
            label: 'Taraf',
            value: obligation.counterparty.name,
            onPress: obligation.counterparty_id ? () => router.push(`/counterparties/${obligation.counterparty_id}`) : undefined,
          },
        ]
      : []),
    ...(obligation.notes ? [{ label: 'Not', value: obligation.notes }] : []),
    ...(settledQuery.data ?? []).map((settled) => ({
      label: 'Karşılığı',
      value: `${settled.title} · ${formatValueUnitAmount(settled.amountMinor, obligation.currency_code)}`,
    })),
    {
      label: isInterestBearing ? 'Başlangıç tutarı' : 'Toplam tutar',
      value: formatValueUnitAmount(obligation.total_amount_minor, obligation.currency_code),
    },
    ...(effectiveRatio !== null
      ? [{ label: 'Faiz oranı', value: `%${effectiveRatio.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}` }]
      : []),
    ...(hasInstallments ? [{ label: `Toplam ${unitLabel.toLocaleLowerCase('tr-TR')}`, value: String(installments.length) }] : []),
    { label: 'Durum', value: statusLabel },
  ];

  const linkedDocument = documentQuery.data ?? null;
  // Tuval çek detayındaki "Geçmiş": en yeni olay üstte — oluşturulma, ödeme/tahsilat ve bekleyen vade.
  const shortDay = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });
  const historyEvents: { key: string; title: string; date: string; color: string }[] = [
    ...(isClosed
      ? []
      : dueDateValue
        ? [{ key: 'due', title: 'Vade bekleniyor', date: shortDay.format(dueDateValue), color: theme.colors.brandPrimary }]
        : []),
    ...payments.map((payment) => ({
      key: payment.id,
      title: isPayable ? 'Ödendi' : 'Tahsil edildi',
      date: shortDay.format(new Date(payment.paid_at)),
      color: theme.colors.success,
    })),
    {
      key: 'created',
      title: linkedDocument ? 'Belgeden oluşturuldu' : 'Kayıt oluşturuldu',
      date: obligation.created_at ? shortDay.format(new Date(obligation.created_at)) : '—',
      color: theme.colors.textSecondary,
    },
  ];

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
        {showsPlanTab ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <ObligationIcon
                documentType={obligation.document_type}
                bankCode={obligation.bank_code}
                serviceCode={obligation.service_code}
                fallbackName={obligation.title}
                size={56}
              />
              <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
                <Text variant="sectionTitle" numberOfLines={2}>
                  {obligation.title}
                </Text>
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {[bankName ?? serviceName, DOCUMENT_TYPE_LABEL[obligation.document_type]].filter(Boolean).join(' · ')}
                </Text>
              </Stack>
            </View>
            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="caption" color="textSecondary">
                    {isPayable ? 'Kalan geri ödeme' : 'Kalan alacak'}
                  </Text>
                  <Text
                    tabular
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                    style={{ fontSize: 28, lineHeight: 34, fontWeight: '700', color: isOverdue ? theme.colors.danger : theme.colors.textPrimary }}
                  >
                    {formatValueUnitAmount(obligation.remaining_amount_minor, obligation.currency_code)}
                  </Text>
                </Stack>
                {installments.length > 0 ? (
                  <Stack gap="xxs" style={{ alignItems: 'flex-end' }}>
                    <Text variant="caption" color="textSecondary">
                      {unitLabel}
                    </Text>
                    <Text style={{ fontSize: 15, fontWeight: '600' }} tabular>
                      {paidInstallments} / {installments.length}
                    </Text>
                  </Stack>
                ) : null}
              </View>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: theme.colors.fill, overflow: 'hidden' }}>
                <View style={{ width: `${clampedProgress * 100}%`, height: 8, borderRadius: 4, backgroundColor: isOverdue ? theme.colors.danger : theme.colors.success }} />
              </View>
              <View style={{ flexDirection: 'row' }}>
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="caption" color="textSecondary">
                    Ödenen
                  </Text>
                  <Text tabular style={{ fontSize: 15, fontWeight: '600' }}>
                    {formatValueUnitAmount(paidAmountMinor, obligation.currency_code)}
                  </Text>
                </Stack>
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="caption" color="textSecondary">
                    Toplam
                  </Text>
                  <Text tabular style={{ fontSize: 15, fontWeight: '600' }}>
                    {formatValueUnitAmount(obligation.total_amount_minor, obligation.currency_code)}
                  </Text>
                </Stack>
                <Stack gap="xxs" style={{ alignItems: 'flex-end' }}>
                  <Text variant="caption" color="textSecondary">
                    Bitiş
                  </Text>
                  <Text style={{ fontSize: 15, fontWeight: '600' }}>
                    {installments.length > 0
                      ? monthYearFormatter.format(new Date(installments[installments.length - 1].due_date))
                      : '—'}
                  </Text>
                </Stack>
              </View>
            </Card>
          </>
        ) : (
          <Stack gap="xs" style={{ alignItems: 'center' }}>
            <ObligationIcon
              documentType={obligation.document_type}
              bankCode={obligation.bank_code}
              serviceCode={obligation.service_code}
              fallbackName={obligation.title}
              size={56}
            />
            <Text variant="caption" color="textSecondary" style={{ marginTop: theme.spacing.xs }} numberOfLines={2}>
              {[DOCUMENT_TYPE_LABEL[obligation.document_type] ?? obligation.title, bankName ?? serviceName ?? obligation.counterparty?.name]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Text
              tabular
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              style={{ fontSize: 36, lineHeight: 42, fontWeight: '700', letterSpacing: -0.8, color: isOverdue ? theme.colors.danger : isPayable ? theme.colors.textPrimary : theme.colors.success }}
            >
              {formatValueUnitAmount(obligation.remaining_amount_minor, obligation.currency_code)}
            </Text>
            <View style={{ alignItems: 'center' }}>
              <Tag
                large
                label={statusTagLabel}
                tone={isClosed ? 'success' : isOverdue ? 'danger' : daysToDue !== null && daysToDue <= 10 ? 'brand' : 'neutral'}
              />
            </View>
          </Stack>
        )}

        {canRecordPayment ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                label={nextInstallment && showsPlanTab ? `${nextInstallment.installment_number}. ${unitLabel.toLocaleLowerCase('tr-TR')}i ${isPayable ? 'öde' : 'tahsil et'}` : isPayable ? 'Ödendi' : 'Tahsil Et'}
                size="compact"
                onPress={() => setPayingInstallment(showsPlanTab && nextInstallment ? nextInstallment : 'obligation')}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="İşlemler" variant="secondary" size="compact" onPress={() => setMenuOpen(true)} />
            </View>
          </View>
        ) : null}

        {isInstrumentRecord ? <InstrumentLifecycle obligation={obligation} /> : null}

        {!isTry ? (
          <ReferenceValueRow
            amountMinor={obligation.remaining_amount_minor}
            unitCode={obligation.currency_code}
            rates={ratesQuery.data}
            isLoading={ratesQuery.isLoading}
          />
        ) : null}

        {showsPlanTab ? <FinanceDetailTabs options={tabOptions} value={tab} onChange={setTab} /> : null}

        {activeTab === 'genel' ? (
          <Stack gap="lg">
            <Group inset={16}>
              {infoRows.map((row) => (
                <GroupedRow
                  key={row.label}
                  title={row.label}
                  value={row.value}
                  chevron={!!row.onPress}
                  onPress={row.onPress}
                />
              ))}
            </Group>
            {linkedDocument ? (
              <Stack gap="xs">
                <Text variant="label" color="textSecondary" style={{ paddingLeft: theme.spacing.xxs }}>
                  BELGE
                </Text>
                <Group inset={16}>
                  <GroupedRow
                    leading={<GroupedRowIcon name="document-text" tone="brandSoft" />}
                    title={linkedDocument.fileName}
                    subtitle={linkedDocument.fieldCount > 0 ? `Belgeden ${linkedDocument.fieldCount} alan okundu` : 'Belgeden oluşturuldu'}
                    chevron={false}
                  />
                </Group>
              </Stack>
            ) : null}
            {isInstrumentRecord ? (
              <Stack gap="xs">
                <Text variant="label" color="textSecondary" style={{ paddingLeft: theme.spacing.xxs }}>
                  GEÇMİŞ
                </Text>
                <Group inset={16}>
                  {historyEvents.map((event) => (
                    <GroupedRow
                      key={event.key}
                      leading={<View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: event.color }} />}
                      title={event.title}
                      value={event.date}
                      chevron={false}
                    />
                  ))}
                </Group>
              </Stack>
            ) : null}
            {!showsPlanTab ? (
              <Stack gap="xs">
                <Text variant="sectionTitle">Ödeme geçmişi</Text>
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
                {historyPageCount > 1 ? (
                  <Pagination page={effectiveHistoryPage} totalPages={historyPageCount} onChange={setHistoryPage} />
                ) : null}
              </Stack>
            ) : null}
          </Stack>
        ) : activeTab === 'plan' ? (
          <Stack gap="md">
            {planRows.length === 0 ? (
              <EmptyState icon="calendar-outline" message="Henüz ödeme planı yok." />
            ) : (
              <InstallmentPlanTable
                rows={planRows}
                currencyCode={obligation.currency_code}
                unitLabel={unitLabel.toLocaleLowerCase('tr-TR')}
                rowActionLabel={isClosed ? undefined : isPayable ? 'Öde' : 'Tahsil et'}
                onRowPress={
                  isClosed
                    ? undefined
                    : (row) => {
                        const installment = installmentById.get(row.key);
                        if (installment && installment.remaining_amount_minor > 0) setPayingInstallment(installment);
                      }
                }
              />
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
            counterpartyName={obligation.counterparty?.name ?? null}
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
                backgroundColor: theme.colors.backgroundPrimary,
              }}
            >
              <Ionicons name="document-text-outline" size={16} color={theme.colors.textPrimary} />
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
            backgroundColor: theme.colors.backgroundPrimary,
          }}
        >
          <Ionicons name="checkmark" size={16} color={theme.colors.textPrimary} />
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
            <Ionicons name="attach" size={20} color={theme.colors.textPrimary} />
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
  /** Bağlam satırında gösterilir (tuval: "Kuzey Lojistik · Akbank çeki"). */
  counterpartyName?: string | null;
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
  counterpartyName,
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
  // Hesap, kaydın değer birimiyle aynı olmalı: hareket kaydın biriminde yazılır ve bakiye birimlere
  // bakmadan toplanır — USD borç TL hesaptan ödenirse 100 sent, TL hesaptan 1 ₺ düşerdi.
  const sameUnitAccounts = accounts.filter((a) => a.currency_code === obligation.currency_code);
  const payableAccounts =
    obligation.direction === 'payable'
      ? sameUnitAccounts.filter((a) => a.type !== 'pos' && (!isCardStatementPayment || a.type !== 'credit_card'))
      : sameUnitAccounts;
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
    editingPayment ? editingPayment.paid_at.slice(0, 10) : localIsoDate()
  );
  // Dekont (Plus): yeni seçilen dosya ya da düzenlemede mevcut bağlantı. removedExisting,
  // kullanıcı kayıtlı dekontu ödemeden ayırdıysa true olur.
  const archive = useDocumentArchiveAccess();
  const [receipt, setReceipt] = useState<PendingReceipt | null>(null);
  const [removedExisting, setRemovedExisting] = useState(false);
  const existingReceiptId = removedExisting ? null : (editingPayment?.receipt_document_id ?? null);
  // Hesap satırında güncel bakiye (tuval OdemeKaydet).
  const balancesQuery = useQuery({
    queryKey: workspaceId ? queryKeys.reportAccountBalances(workspaceId) : ['account-balances', 'disabled'],
    queryFn: () => getAccountBalances(workspaceId as string),
    enabled: !!workspaceId,
  });
  const balanceByAccount = new Map((balancesQuery.data ?? []).map((b) => [b.accountId, b]));

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

  const isPayable = obligation.direction === 'payable';
  const title = isEditing ? (isPayable ? 'Ödemeyi düzenle' : 'Tahsilatı düzenle') : isPayable ? 'Ödeme kaydet' : 'Tahsilat kaydet';
  const fullAmountInput = formatAmountInput(
    (defaultAmountMinor / 10 ** valueUnit.precision).toFixed(valueUnit.precision).replace('.', ','),
    valueUnit.precision
  );
  const isFullAmount = amount === fullAmountInput;
  const symbol = obligation.currency_code === 'TRY' ? '₺' : obligation.currency_code === 'USD' ? '$' : obligation.currency_code === 'EUR' ? '€' : undefined;
  const contextLine = [
    counterpartyName,
    installment
      ? `${installment.installment_number}. taksit · ${shortDateFormatter.format(new Date(installment.due_date))}`
      : obligation.title,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: theme.screenEdge.standard, paddingBottom: theme.spacing.xxl }}
        >
          {/* Tuval OdemeKaydet: Vazgeç · ortada başlık */}
          <View style={{ height: 44, flexDirection: 'row', alignItems: 'center' }}>
            <Pressable accessibilityRole="button" onPress={onClose} hitSlop={12} style={{ minWidth: 70, height: 44, justifyContent: 'center' }}>
              <Text style={{ fontSize: 17 }}>Vazgeç</Text>
            </Pressable>
            <Text numberOfLines={1} style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' }}>
              {title}
            </Text>
            <View style={{ minWidth: 70 }} />
          </View>

          <Stack gap="sm" align="center" style={{ marginTop: theme.spacing.sm }}>
            <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ fontSize: 13 }}>
              {contextLine}
            </Text>
            <View style={{ alignSelf: 'stretch' }}>
              <BigAmountInput
                value={amount}
                onChangeText={setAmount}
                precision={valueUnit.precision}
                symbol={symbol}
                autoFocus={!isEditing}
              />
            </View>
            {!isEditing && defaultAmountMinor > 0 ? (
              <Row gap="xs" style={{ justifyContent: 'center' }}>
                <Pill label="Tamamı" selected={isFullAmount} onPress={() => setAmount(fullAmountInput)} />
                <Pill label="Kısmi tutar" selected={!isFullAmount} onPress={() => setAmount('')} />
              </Row>
            ) : null}
          </Stack>

          <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.sm }}>
            <FieldGroup>
              {payableAccounts.length > 0 ? (
                // Önceden "İSTEĞE BAĞLI" idi ve recordPayment hesapsız çağrıldığında (bkz.
                // features/payments/api.ts) hiçbir transaction oluşturmuyordu — ödeme borcu kapatıyor
                // ama hiçbir hesabın bakiyesini etkilemiyor ve Hareketler'de görünmüyordu. Bu form
                // yalnızca canlı/yeni bir ödeme için kullanılır (geçmiş taksitlerin hesapsız toplu
                // "ödendi" işaretlenmesi ayrı bir yoldan gider, bkz. recordPastInstallmentPayments) —
                // burada hesap zorunlu.
                <AccountPicker
                  accounts={payableAccounts}
                  selectedId={accountId}
                  onSelect={setAccountId}
                  title="Hesap seç"
                  renderTrigger={(selected, open) => {
                    const balance = selected ? balanceByAccount.get(selected.id) : undefined;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={selected ? `Hesap: ${selected.name}` : 'Hesap seçin'}
                        onPress={open}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: theme.spacing.md, paddingVertical: 10, minHeight: 60 }}
                      >
                        {selected ? (
                          <AccountAvatar account={selected} />
                        ) : (
                          <Ionicons name="wallet-outline" size={20} color={theme.colors.textSecondary} />
                        )}
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                          <Text numberOfLines={1} style={{ fontWeight: '500', color: selected ? theme.colors.textPrimary : theme.colors.mutedControl }}>
                            {selected ? selected.name : isPayable ? 'Ödemenin çıktığı hesap' : 'Tahsilatın girdiği hesap'}
                          </Text>
                          {balance ? (
                            <Text variant="caption" color="textSecondary" tabular numberOfLines={1}>
                              Bakiye {formatMinorAmount(balance.balanceMinor, balance.currencyCode)}
                            </Text>
                          ) : null}
                        </View>
                        <Ionicons name="chevron-forward" size={14} color={theme.colors.mutedControl} />
                      </Pressable>
                    );
                  }}
                />
              ) : null}
              <DateField label={isPayable ? 'Ödeme tarihi' : 'Tahsilat tarihi'} value={dateStr} onChangeText={setDateStr} />
            </FieldGroup>

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
                {friendlyErrorMessage(mutation.error, 'Ödeme kaydedilemedi')}
              </Text>
            ) : null}

            <Button
              label={isEditing ? 'Güncelle' : isPayable ? 'Ödemeyi kaydet' : 'Tahsilatı kaydet'}
              onPress={() => mutation.mutate()}
              loading={mutation.isPending}
              disabled={!amount || (payableAccounts.length > 0 && !accountId)}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

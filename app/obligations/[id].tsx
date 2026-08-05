import { useState } from 'react';
import { ActivityIndicator, InteractionManager, Modal, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  Pagination,
  Pressable,
  ProgressRing,
  Row,
  SegmentedControl,
  Stack,
  Text,
  TextField,
} from '@/components/primitives';
import { Amount } from '@/components/finance/Amount';
import { OBLIGATION_STATUS_LABEL, StatusBadge } from '@/components/finance/StatusBadge';
import { ObligationIcon } from '@/components/finance/ObligationIcon';
import { AccountPicker } from '@/components/finance/AccountPicker';
import { getObligation, getObligationWithInstallments, type Installment, type Obligation } from '@/features/obligations/api';
import { listAccounts, type Account } from '@/features/accounts/api';
import { listPaymentsForObligation, recordPayment, type Payment } from '@/features/payments/api';
import { BANK_NAME } from '@/features/banks/banks';
import { SERVICE_NAME } from '@/features/services/services';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount, toMinorUnits } from '@/utils/money';
import { DOCUMENT_TYPE_LABEL } from '@/features/obligations/documentTypes';
import { queryKeys } from '@/services/queryKeys';
import { syncObligationReminder } from '@/services/notifications';
import { showSuccessAlert } from '@/utils/alerts';

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

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['obligation', id] });
    if (activeWorkspaceId) {
      queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'obligations'] });
    }
  }

  if (detailQuery.isLoading || !detailQuery.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        <Stack style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          {detailQuery.error ? (
            <Text variant="body" color="danger">
              {detailQuery.error instanceof Error ? detailQuery.error.message : 'Kayıt yüklenemedi'}
            </Text>
          ) : (
            <ActivityIndicator color={theme.colors.brandPrimary} />
          )}
        </Stack>
      </SafeAreaView>
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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView contentContainerStyle={{ padding: theme.screenEdge.standard, paddingBottom: theme.spacing.huge }}>
        <Stack gap="lg">
          <Row align="center">
            <Pressable
              accessibilityLabel="Geri"
              onPress={() => router.back()}
              hitSlop={8}
              style={{
                width: 44,
                height: 44,
                borderRadius: theme.radius.input,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.surfaceElevated,
              }}
            >
              <Ionicons name="chevron-back" size={22} color={theme.colors.textPrimary} />
            </Pressable>
            <Text variant="pageTitle" style={{ flex: 1, marginLeft: theme.spacing.sm }} numberOfLines={1}>
              {heroPrimaryName}
            </Text>
            <Pressable
              accessibilityLabel="Düzenle"
              onPress={() => router.push({ pathname: '/obligations/new', params: { id: obligation.id } })}
              hitSlop={8}
              style={{
                width: 44,
                height: 44,
                borderRadius: theme.radius.input,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.surfaceElevated,
              }}
            >
              <Ionicons name="pencil" size={22} color={theme.colors.textPrimary} />
            </Pressable>
          </Row>

          {/* Hero: temanın nötr elevated yüzeyinde banka/belge kimliği, kalan tutar ve
              ödeme durumunu toplar — açık temada beyaza yakın, koyu temada grafit. */}
          <Card elevated variant="hero">
            <Stack gap="lg">
              <Row gap="sm" align="center">
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: theme.radius.input,
                    backgroundColor: theme.colors.backgroundPrimary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ObligationIcon
                    documentType={obligation.document_type}
                    bankCode={obligation.bank_code}
                    serviceCode={obligation.service_code}
                    fallbackName={obligation.title}
                    size={44}
                  />
                </View>
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="cardTitle" numberOfLines={2}>
                    {heroPrimaryName}
                  </Text>
                  <Text variant="caption" color="textSecondary" numberOfLines={1}>
                    {heroSubtitle}
                  </Text>
                </Stack>
                <StatusBadge status={obligation.status} />
              </Row>

              <Divider />

              <Row gap="md" align="center">
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="caption" color="textSecondary" style={{ letterSpacing: 0.6 }}>
                    {isPayable ? 'KALAN BORÇ' : 'KALAN ALACAK'}
                  </Text>
                  <Text
                    variant="displayAmount"
                    tabular
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.5}
                    style={{ color: heroAmountColor }}
                  >
                    {formatMinorAmount(obligation.remaining_amount_minor, obligation.currency_code)}
                  </Text>
                </Stack>
                {hasInstallments ? (
                  <ProgressRing
                    size={88}
                    strokeWidth={10}
                    progress={clampedProgress}
                    color={stateAccent}
                    trackColor={withAlpha(stateAccent, 0.18)}
                    cap
                  >
                    <Text variant="cardTitle" tabular>
                      %{Math.round(clampedProgress * 100)}
                    </Text>
                  </ProgressRing>
                ) : null}
              </Row>

              <Divider />

              <Row>
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="caption" color="textSecondary">
                    {hasInstallments ? 'SONRAKİ ÖDEME' : 'TOPLAM'}
                  </Text>
                  <Text variant="cardTitle" tabular numberOfLines={1}>
                    {hasInstallments
                      ? formatMinorAmount(nextInstallment?.remaining_amount_minor ?? 0, obligation.currency_code)
                      : formatMinorAmount(obligation.total_amount_minor, obligation.currency_code)}
                  </Text>
                </Stack>
                <Divider orientation="vertical" style={{ marginHorizontal: theme.spacing.sm }} />
                <Stack gap="xxs" style={{ flex: 1 }} align="flex-end">
                  <Text variant="caption" color="textSecondary">
                    {hasInstallments ? `KALAN ${unitLabel.toLocaleUpperCase('tr-TR')}` : 'VADE'}
                  </Text>
                  <Text variant="cardTitle" tabular numberOfLines={1}>
                    {hasInstallments
                      ? `${installments.length - paidInstallments}`
                      : obligation.due_date
                        ? shortDateFormatter.format(new Date(obligation.due_date))
                        : 'Yok'}
                  </Text>
                </Stack>
              </Row>
            </Stack>
          </Card>

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
                  value={formatMinorAmount(obligation.total_amount_minor, obligation.currency_code)}
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
                    <PaymentRow key={payment.id} payment={payment} currencyCode={obligation.currency_code} />
                  ))}
                </Stack>
              )}
              <Pagination page={effectiveHistoryPage} totalPages={historyPageCount} onChange={setHistoryPage} />
            </Stack>
          )}
        </Stack>
      </ScrollView>

      <Modal
        visible={payingInstallment !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPayingInstallment(null)}
      >
        {payingInstallment ? (
          <PaymentForm
            workspaceId={activeWorkspaceId}
            obligation={obligation}
            installment={payingInstallment === 'obligation' ? null : payingInstallment}
            defaultAmountMinor={
              payingInstallment === 'obligation'
                ? obligation.remaining_amount_minor
                : payingInstallment.remaining_amount_minor
            }
            accounts={accountsQuery.data ?? []}
            onClose={() => setPayingInstallment(null)}
            onSuccess={() => {
              // Modal'ı Alert'in "Tamam"ına kadar açık tutuyoruz; kapatma ve önbellek
              // geçersizleştirme/yeniden render gibi ağır iş bir sonraki etkileşim turuna
              // ertelenir — aksi halde Fabric, modal dismiss animasyonuyla aynı anda arkadaki
              // listeyi (taksitler vb.) yeniden mount etmeye çalışıp çöküyor (bkz.
              // review.tsx'teki InteractionManager.runAfterInteractions ile aynı düzeltme).
              showSuccessAlert('Ödeme başarıyla kaydedildi.', () => {
                setPayingInstallment(null);
                InteractionManager.runAfterInteractions(async () => {
                  invalidateAll();
                  queryClient.invalidateQueries({ queryKey: ['obligation', id, 'payments'] });
                  if (activeWorkspaceId) {
                    const fresh = await getObligation(id as string);
                    await syncObligationReminder(activeWorkspaceId, fresh);
                  }
                });
              });
            }}
          />
        ) : null}
      </Modal>
    </SafeAreaView>
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

function PaymentRow({ payment, currencyCode }: { payment: Payment; currencyCode: string }) {
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
  onClose: () => void;
  onSuccess: () => void;
}

function PaymentForm({
  workspaceId,
  obligation,
  installment,
  defaultAmountMinor,
  accounts,
  onClose,
  onSuccess,
}: PaymentFormProps) {
  const theme = useTheme();
  const [amount, setAmount] = useState((defaultAmountMinor / 100).toFixed(2).replace('.', ','));
  const [accountId, setAccountId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      if (!workspaceId || !amount) throw new Error('Eksik alan var');
      return recordPayment({
        workspace_id: workspaceId,
        obligation_id: obligation.id,
        installment_id: installment?.id ?? null,
        account_id: accountId,
        amount_minor: toMinorUnits(Number(amount.replace(',', '.'))),
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
            Ödeme Ekle
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
            TUTAR
          </Text>
          <TextField placeholder="0,00" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        </Stack>

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

        <Button label="Kaydet" onPress={() => mutation.mutate()} loading={mutation.isPending} disabled={!amount} />
      </Stack>
    </SafeAreaView>
  );
}

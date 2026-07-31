import { useState } from 'react';
import { ActivityIndicator, InteractionManager, Modal, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Button, Card, Divider, EmptyState, Pressable, Row, SectionHeader, Stack, Text, TextField } from '@/components/primitives';
import { Amount } from '@/components/finance/Amount';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { ObligationIcon } from '@/components/finance/ObligationIcon';
import { AccountPicker } from '@/components/finance/AccountPicker';
import { getObligation, getObligationWithInstallments, type Installment, type Obligation } from '@/features/obligations/api';
import { listAccounts, type Account } from '@/features/accounts/api';
import { listPaymentsForObligation, recordPayment, type Payment } from '@/features/payments/api';
import { BANK_NAME } from '@/features/banks/banks';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount, toMinorUnits } from '@/utils/money';
import { DOCUMENT_TYPE_LABEL } from '@/features/obligations/documentTypes';
import { queryKeys } from '@/services/queryKeys';
import { syncObligationReminder } from '@/services/notifications';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
const shortDateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' });

export default function ObligationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [payingInstallment, setPayingInstallment] = useState<Installment | 'obligation' | null>(null);

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
  const isPayable = obligation.direction === 'payable';
  const isOverdue = obligation.status === 'gecikti';
  const isClosed = obligation.status === 'odendi' || obligation.status === 'tahsil_edildi';
  const progress =
    obligation.total_amount_minor > 0
      ? 1 - obligation.remaining_amount_minor / obligation.total_amount_minor
      : 0;

  const paidInstallments = installments.filter((i) => i.remaining_amount_minor <= 0).length;
  // İlk ödenmemiş taksit "sıradaki" olarak vurgulanır; taksit listesi bir ödeme
  // takvimidir, bu yüzden numaralı sıralama burada gerçekten anlam taşır
  // (docs/08-tasarim-sistemi.md §12.3 — kart içinde mikro grafikler/zaman çizgisi).
  const nextInstallment = installments.find((i) => i.remaining_amount_minor > 0) ?? null;
  const bankName = obligation.bank_code ? (BANK_NAME[obligation.bank_code] ?? null) : null;

  const heroAmountColor = isOverdue ? theme.colors.danger : isPayable ? theme.colors.textPrimary : theme.colors.success;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView contentContainerStyle={{ padding: theme.screenEdge.standard, paddingBottom: theme.spacing.huge }}>
        <Stack gap="lg">
          <Row align="center">
            <Pressable accessibilityLabel="Geri" onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="chevron-back" size={26} color={theme.colors.textPrimary} />
            </Pressable>
            <Text variant="pageTitle" style={{ flex: 1, marginLeft: theme.spacing.sm }} numberOfLines={1}>
              {obligation.title}
            </Text>
            <Pressable
              accessibilityLabel="Düzenle"
              onPress={() => router.push({ pathname: '/obligations/new', params: { id: obligation.id } })}
              hitSlop={12}
            >
              <Ionicons name="pencil" size={22} color={theme.colors.textPrimary} />
            </Pressable>
          </Row>

          <Row gap="sm" align="center">
            <ObligationIcon documentType={obligation.document_type} bankCode={obligation.bank_code} size={32} />
            <Stack gap="xxs" style={{ flex: 1 }}>
              <Text variant="body" numberOfLines={1}>
                {DOCUMENT_TYPE_LABEL[obligation.document_type] ?? obligation.document_type}
                {bankName ? ` · ${bankName}` : ''}
              </Text>
            </Stack>
            <StatusBadge status={obligation.status} />
          </Row>

          {/* Hero: sayfanın tek büyük rakamı kalan borç/alacak — tüm diğer bilgiler
              (toplam, vade, taksit ilerlemesi) bu rakamı destekleyen ikincil bağlam. */}
          <Card style={{ borderRadius: theme.radius.heroWidget, padding: theme.spacing.lg }}>
            <Stack gap="md">
              <Stack gap="xxs">
                <Text variant="caption" color="textSecondary" style={{ letterSpacing: 0.6 }}>
                  {isPayable ? 'KALAN BORÇ' : 'KALAN ALACAK'}
                </Text>
                <Text
                  variant="displayAmount"
                  tabular
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                  style={{ color: heroAmountColor }}
                >
                  {formatMinorAmount(obligation.remaining_amount_minor, obligation.currency_code)}
                </Text>
                <Row gap="xs">
                  <Text variant="caption" color="textSecondary">
                    Toplam {formatMinorAmount(obligation.total_amount_minor, obligation.currency_code)}
                  </Text>
                  {obligation.due_date ? (
                    <Text variant="caption" color={isOverdue ? 'danger' : 'textSecondary'}>
                      · Vade {dateFormatter.format(new Date(obligation.due_date))}
                    </Text>
                  ) : null}
                </Row>
              </Stack>

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

              {installments.length > 0 ? (
                <Row>
                  <Stack gap="xxs" style={{ flex: 1 }}>
                    <Text variant="caption" color="textSecondary" numberOfLines={1}>
                      Ödenen taksit
                    </Text>
                    <Text variant="cardTitle" tabular>
                      {paidInstallments}/{installments.length}
                    </Text>
                  </Stack>
                  <Divider orientation="vertical" style={{ marginHorizontal: theme.spacing.sm }} />
                  <Stack gap="xxs" style={{ flex: 1 }}>
                    <Text variant="caption" color="textSecondary" numberOfLines={1}>
                      Sıradaki vade
                    </Text>
                    <Text variant="cardTitle" tabular numberOfLines={1}>
                      {nextInstallment ? shortDateFormatter.format(new Date(nextInstallment.due_date)) : 'Yok'}
                    </Text>
                  </Stack>
                </Row>
              ) : null}

              {!isClosed && obligation.status !== 'iptal_edildi' && obligation.remaining_amount_minor > 0 ? (
                <Button label="Ödeme Ekle" onPress={() => setPayingInstallment('obligation')} />
              ) : null}
            </Stack>
          </Card>

          {installments.length > 0 ? (
            <Stack gap="sm">
              <SectionHeader title={`Taksitler · ${paidInstallments}/${installments.length} ödendi`} />
              <Stack gap="xs">
                {installments.map((installment) => (
                  <InstallmentRow
                    key={installment.id}
                    installment={installment}
                    currencyCode={obligation.currency_code}
                    isNext={installment.id === nextInstallment?.id}
                    onPay={() => setPayingInstallment(installment)}
                  />
                ))}
              </Stack>
            </Stack>
          ) : null}

          <Stack gap="sm">
            <SectionHeader title="Ödeme Geçmişi" />
            {(paymentsQuery.data ?? []).length === 0 ? (
              <EmptyState icon="receipt-outline" message="Henüz ödeme kaydı yok." />
            ) : (
              <Stack gap="xs">
                {(paymentsQuery.data ?? []).map((payment) => (
                  <PaymentRow key={payment.id} payment={payment} currencyCode={obligation.currency_code} />
                ))}
              </Stack>
            )}
          </Stack>
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
              // Modal'ı hemen kapat (native dismiss transition'ı temiz başlasın), önbellek
              // geçersizleştirme/yeniden render gibi ağır işi bir sonraki etkileşim turuna
              // ertele — aksi halde Fabric, modal dismiss animasyonuyla aynı anda arkadaki
              // listeyi (taksitler vb.) yeniden mount etmeye çalışıp çöküyor (bkz.
              // review.tsx'teki InteractionManager.runAfterInteractions ile aynı düzeltme).
              setPayingInstallment(null);
              InteractionManager.runAfterInteractions(async () => {
                invalidateAll();
                queryClient.invalidateQueries({ queryKey: ['obligation', id, 'payments'] });
                if (activeWorkspaceId) {
                  const fresh = await getObligation(id as string);
                  await syncObligationReminder(activeWorkspaceId, fresh);
                }
              });
            }}
          />
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}

interface InstallmentRowProps {
  installment: Installment;
  currencyCode: string;
  isNext: boolean;
  onPay: () => void;
}

// Taksit listesi bir kredinin ödeme takvimidir: sıra numarası gerçek bilgi taşır.
// Ödenmiş taksit dolu yeşil, sıradaki dolu Saffron, gelecek taksitler soluk anahat.
function InstallmentRow({ installment, currencyCode, isNext, onPay }: InstallmentRowProps) {
  const theme = useTheme();
  const paid = installment.remaining_amount_minor <= 0;

  const markerBg = paid ? theme.colors.success : isNext ? theme.colors.brandPrimary : 'transparent';
  const markerBorder = paid ? theme.colors.success : isNext ? theme.colors.brandPrimary : theme.colors.border;
  const markerTextColor = paid || isNext ? theme.colors.brandPrimaryText : theme.colors.textSecondary;

  return (
    <Card elevated={isNext}>
      <Row gap="sm">
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

        <Stack gap="xxs" style={{ flex: 1 }}>
          <Text variant="cardTitle" numberOfLines={1}>
            {installment.installment_number}. Taksit — {shortDateFormatter.format(new Date(installment.due_date))}
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
  );
}

function PaymentRow({ payment, currencyCode }: { payment: Payment; currencyCode: string }) {
  const theme = useTheme();

  return (
    <Card>
      <Row gap="sm">
        <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
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

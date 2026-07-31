import { useState } from 'react';
import { InteractionManager, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Button, Pressable, Row, Stack, Text, TextField } from '@/components/primitives';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { ObligationIcon } from '@/components/finance/ObligationIcon';
import { AccountPicker } from '@/components/finance/AccountPicker';
import { getObligation, getObligationWithInstallments, type Installment, type Obligation } from '@/features/obligations/api';
import { listAccounts, type Account } from '@/features/accounts/api';
import { listPaymentsForObligation, recordPayment } from '@/features/payments/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount, toMinorUnits } from '@/utils/money';
import { DOCUMENT_TYPE_LABEL } from '@/features/obligations/documentTypes';
import { queryKeys } from '@/services/queryKeys';
import { syncObligationReminder } from '@/services/notifications';

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
          ) : null}
        </Stack>
      </SafeAreaView>
    );
  }

  const { obligation, installments } = detailQuery.data;
  const progress = obligation.total_amount_minor > 0
    ? 1 - obligation.remaining_amount_minor / obligation.total_amount_minor
    : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView contentContainerStyle={{ padding: theme.screenEdge.standard }}>
        <Stack gap="lg">
          <Row align="center">
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="chevron-back" size={26} color={theme.colors.textPrimary} />
            </Pressable>
            <Text variant="pageTitle" style={{ flex: 1, marginLeft: theme.spacing.sm }} numberOfLines={1}>
              {obligation.title}
            </Text>
            <Pressable onPress={() => router.push({ pathname: '/obligations/new', params: { id: obligation.id } })} hitSlop={12}>
              <Ionicons name="pencil" size={22} color={theme.colors.textPrimary} />
            </Pressable>
          </Row>

          <Row gap="sm" align="center">
            <ObligationIcon documentType={obligation.document_type} bankCode={obligation.bank_code} size={28} />
            <Row gap="xs" align="center" style={{ flex: 1 }}>
              <StatusBadge status={obligation.status} />
              <Text variant="caption" color="textSecondary">
                {DOCUMENT_TYPE_LABEL[obligation.document_type] ?? obligation.document_type}
              </Text>
            </Row>
          </Row>

          <Stack
            gap="sm"
            style={{ backgroundColor: theme.colors.surfacePrimary, borderRadius: theme.radius.widget, padding: theme.spacing.lg }}
          >
            <Text variant="caption" color="textSecondary">
              {obligation.direction === 'payable' ? 'KALAN BORÇ' : 'KALAN ALACAK'}
            </Text>
            <Text variant="displayAmount" tabular>
              {formatMinorAmount(obligation.remaining_amount_minor, obligation.currency_code)}
            </Text>
            <Row gap="xs">
              <Text variant="caption" color="textSecondary">
                Toplam {formatMinorAmount(obligation.total_amount_minor, obligation.currency_code)}
              </Text>
              {obligation.due_date ? (
                <Text variant="caption" color="textSecondary">
                  • Vade {obligation.due_date}
                </Text>
              ) : null}
            </Row>
            <Row
              style={{
                height: 8,
                borderRadius: 999,
                backgroundColor: theme.colors.border,
                overflow: 'hidden',
              }}
            >
              <Row
                style={{
                  width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
                  backgroundColor: theme.colors.success,
                }}
              />
            </Row>
            {obligation.status !== 'iptal_edildi' && obligation.remaining_amount_minor > 0 ? (
              <Button label="Ödeme Ekle" onPress={() => setPayingInstallment('obligation')} />
            ) : null}
          </Stack>

          {installments.length > 0 ? (
            <Stack gap="sm">
              <Text variant="sectionTitle">Taksitler</Text>
              {installments.map((installment) => (
                <Row
                  key={installment.id}
                  align="center"
                  style={{
                    backgroundColor: theme.colors.surfacePrimary,
                    borderRadius: theme.radius.widget,
                    padding: theme.spacing.md,
                  }}
                >
                  <Stack gap="xxs" style={{ flex: 1 }}>
                    <Text variant="cardTitle">
                      {installment.installment_number}. Taksit — {installment.due_date}
                    </Text>
                    {installment.principal_minor !== null && installment.interest_minor !== null ? (
                      <Text variant="caption" color="textSecondary">
                        Anapara {formatMinorAmount(installment.principal_minor, obligation.currency_code)} • Faiz{' '}
                        {formatMinorAmount(installment.interest_minor, obligation.currency_code)}
                      </Text>
                    ) : null}
                    <StatusBadge status={installment.status} />
                  </Stack>
                  <Stack gap="xxs" align="flex-end">
                    <Text variant="body" tabular>
                      {formatMinorAmount(installment.remaining_amount_minor, obligation.currency_code)}
                    </Text>
                    {installment.remaining_amount_minor > 0 ? (
                      <Pressable onPress={() => setPayingInstallment(installment)}>
                        <Text variant="caption" style={{ color: theme.colors.brandPrimary }}>
                          Öde
                        </Text>
                      </Pressable>
                    ) : null}
                  </Stack>
                </Row>
              ))}
            </Stack>
          ) : null}

          <Stack gap="sm">
            <Text variant="sectionTitle">Ödeme Geçmişi</Text>
            {(paymentsQuery.data ?? []).length === 0 ? (
              <Text variant="body" color="textSecondary">
                Henüz ödeme kaydı yok.
              </Text>
            ) : (
              (paymentsQuery.data ?? []).map((payment) => (
                <Row key={payment.id} align="center">
                  <Text variant="body" color="textSecondary" style={{ flex: 1 }}>
                    {new Date(payment.paid_at).toLocaleDateString('tr-TR')}
                  </Text>
                  <Text variant="body" tabular>
                    {formatMinorAmount(payment.amount_minor, obligation.currency_code)}
                  </Text>
                </Row>
              ))
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

        <Button label="Kaydet" onPress={() => mutation.mutate()} loading={mutation.isPending} disabled={!amount} />
      </Stack>
    </SafeAreaView>
  );
}

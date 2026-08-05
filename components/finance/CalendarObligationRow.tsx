import { Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Card, Pressable, Row, Stack, Text } from '@/components/primitives';
import { StatusBadge } from './StatusBadge';
import { Amount } from './Amount';
import { ObligationIcon } from './ObligationIcon';
import { getObligation, type ObligationDueItem } from '@/features/obligations/api';
import { recordPayment } from '@/features/payments/api';
import { formatMinorAmount } from '@/utils/money';
import { syncObligationReminder } from '@/services/notifications';

export interface CalendarObligationRowProps {
  workspaceId: string;
  obligation: ObligationDueItem;
}

export function CalendarObligationRow({ workspaceId, obligation }: CalendarObligationRowProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const isPayable = obligation.direction === 'payable';
  const isTerminal = obligation.status === 'odendi' || obligation.status === 'tahsil_edildi' || obligation.status === 'iptal_edildi';
  const isInstallment = !!obligation.installment_id;

  const markPaidMutation = useMutation({
    mutationFn: () =>
      recordPayment({
        workspace_id: workspaceId,
        obligation_id: obligation.id,
        installment_id: obligation.installment_id ?? null,
        account_id: obligation.account_id,
        amount_minor: obligation.remaining_amount_minor,
        obligationDirection: obligation.direction as 'payable' | 'receivable',
        obligationTitle: obligation.title,
        obligationCategoryId: obligation.category_id,
        obligationCounterpartyId: obligation.counterparty_id,
        obligationCurrencyCode: obligation.currency_code,
      }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: [workspaceId, 'obligations'] });
      const fresh = await getObligation(obligation.id);
      await syncObligationReminder(workspaceId, fresh);
    },
    onError: (error) => {
      Alert.alert('Hata', error instanceof Error ? error.message : 'İşlem kaydedilemedi');
    },
  });

  function handleMarkPaid() {
    Alert.alert(
      isPayable ? 'Ödendi Olarak İşaretle' : 'Tahsil Edildi Olarak İşaretle',
      `${obligation.title}${isInstallment ? ` — ${obligation.installment_number}. taksit` : ''} için ${formatMinorAmount(obligation.remaining_amount_minor, obligation.currency_code)} tutarında ${isPayable ? 'ödeme' : 'tahsilat'} kaydı oluşturulacak. Emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Onayla', onPress: () => markPaidMutation.mutate() },
      ]
    );
  }

  return (
    <Card>
      <Row gap="sm">
        <Pressable onPress={() => router.push(`/obligations/${obligation.id}`)} style={{ flex: 1 }}>
          <Row gap="sm">
            <ObligationIcon
              documentType={obligation.document_type}
              bankCode={obligation.bank_code}
              serviceCode={obligation.service_code}
              fallbackName={obligation.title}
              size={36}
            />
            <Stack gap="xxs" style={{ flex: 1 }}>
              <Text variant="cardTitle">
                {obligation.title}
                {isInstallment ? ` — ${obligation.installment_number}. Taksit` : ''}
              </Text>
              <Row gap="xs">
                {obligation.counterparty?.name ? (
                  <Text variant="caption" color="textSecondary">
                    {obligation.counterparty.name}
                  </Text>
                ) : null}
                <StatusBadge status={obligation.status} />
              </Row>
            </Stack>
          </Row>
        </Pressable>
        <Stack gap="xxs" align="flex-end">
          <Amount
            amountMinor={obligation.remaining_amount_minor}
            currencyCode={obligation.currency_code}
            direction={obligation.direction as 'payable' | 'receivable'}
            overdue={obligation.status === 'gecikti'}
            variant="body"
          />
          {!isTerminal ? (
            <Pressable onPress={handleMarkPaid} hitSlop={8} disabled={markPaidMutation.isPending}>
              <Row gap="xxs" align="center">
                <Ionicons
                  name="checkmark-circle-outline"
                  size={14}
                  color={theme.colors.success}
                />
                <Text variant="caption" style={{ color: theme.colors.success }}>
                  {isPayable ? 'Ödendi' : 'Tahsil Edildi'}
                </Text>
              </Row>
            </Pressable>
          ) : null}
        </Stack>
      </Row>
    </Card>
  );
}

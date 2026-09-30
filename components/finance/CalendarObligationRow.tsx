import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { Card, Pressable, Row, Stack, Text } from '@/components/primitives';
import { StatusBadge } from './StatusBadge';
import { Amount } from './Amount';
import { ObligationIcon } from './ObligationIcon';
import type { ObligationDueItem } from '@/features/obligations/api';
import type { ValueUnitType } from '@/features/valueUnits/units';

export interface CalendarObligationRowProps {
  workspaceId: string;
  obligation: ObligationDueItem;
}

// "Ödendi / Tahsil Edildi" kısayolu artık ödemeyi doğrudan yazmaz. Önceden kaydın kendi hesabıyla
// (obligations.account_id) soru sormadan ödeme oluşturuyordu:
// - hesabı olmayan fatura/senet/maaşta borç kapanıyor ama hiçbir hesaptan para çıkmıyordu;
// - kredi kartı ekstresi ve nakit avansta o hesap kartın kendisi olduğu için karta gider yazılıyor,
//   kart borcu düşmek yerine artıyordu.
// Bu yüzden kısayol, hesap seçtiren ödeme formunu açar (bkz. app/obligations/[id].tsx pay=1; nakit
// avansta form kart hesaplarını listelemez). Kart ekstresi kart sayfasındaki ödeme akışına gider
// (transferle ödenir, ekstreye dağıtılır). Nakit avans oraya gitmez: kart bakiyesine dahil değildir,
// kart ödemesiyle kapatılırsa kart borcu olduğundan az görünür.
export function CalendarObligationRow({ obligation }: CalendarObligationRowProps) {
  const theme = useTheme();
  const isPayable = obligation.direction === 'payable';
  const isTerminal = obligation.status === 'odendi' || obligation.status === 'tahsil_edildi' || obligation.status === 'iptal_edildi';
  const isInstallment = !!obligation.installment_id;

  function handleMarkPaid() {
    if (obligation.document_type === 'kredi_karti_ekstresi' && obligation.account_id) {
      router.push(`/accounts/${obligation.account_id}`);
      return;
    }
    router.push({
      pathname: '/obligations/[id]',
      params: {
        id: obligation.id,
        pay: '1',
        ...(obligation.installment_id ? { installmentId: obligation.installment_id } : {}),
      },
    });
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
            valueUnitType={obligation.value_unit_type as ValueUnitType}
            direction={obligation.direction as 'payable' | 'receivable'}
            overdue={obligation.status === 'gecikti'}
            variant="body"
          />
          {!isTerminal ? (
            <Pressable onPress={handleMarkPaid} hitSlop={8}>
              <Row gap="xxs" align="center">
                <Ionicons name="checkmark-circle-outline" size={14} color={theme.colors.success} />
                <Text variant="caption" style={{ color: theme.colors.success }}>
                  {isPayable ? 'Öde' : 'Tahsil Et'}
                </Text>
              </Row>
            </Pressable>
          ) : null}
        </Stack>
      </Row>
    </Card>
  );
}

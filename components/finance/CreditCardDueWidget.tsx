import { router } from 'expo-router';

import { Card, Pressable, Row, Stack, Text } from '@/components/primitives';
import { StatusBadge } from './StatusBadge';
import { Amount } from './Amount';
import { ObligationIcon } from './ObligationIcon';
import type { ObligationWithRelations } from '@/features/obligations/api';
import type { ValueUnitType } from '@/features/valueUnits/units';

export interface CreditCardDueWidgetProps {
  obligation: ObligationWithRelations | null;
}

function daysUntil(dueDate: string): number {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const due = new Date(dueDate);
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.round((dueStart.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function CreditCardDueWidget({ obligation }: CreditCardDueWidgetProps) {
  if (!obligation) return null;

  const remaining = obligation.due_date ? daysUntil(obligation.due_date) : null;

  return (
    <Pressable onPress={() => router.push(`/obligations/${obligation.id}`)}>
      <Card>
        <Row gap="sm">
          <ObligationIcon documentType={obligation.document_type} bankCode={obligation.bank_code} size={36} />
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="cardTitle">{obligation.title}</Text>
            <Row gap="xs">
              <Text variant="caption" color="textSecondary">
                {remaining !== null
                  ? remaining > 0
                    ? `Son ödeme: ${remaining} gün`
                    : remaining === 0
                      ? 'Son ödeme: bugün'
                      : `${Math.abs(remaining)} gün gecikti`
                  : 'Vade tarihi yok'}
              </Text>
              <StatusBadge status={obligation.status} />
            </Row>
          </Stack>
          <Amount
            amountMinor={obligation.remaining_amount_minor}
            currencyCode={obligation.currency_code}
            valueUnitType={obligation.value_unit_type as ValueUnitType}
            direction="payable"
            overdue={obligation.status === 'gecikti'}
            variant="body"
          />
        </Row>
      </Card>
    </Pressable>
  );
}

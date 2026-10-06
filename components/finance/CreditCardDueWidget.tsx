import { View } from 'react-native';
import { router } from 'expo-router';

import { Card, Pressable, SectionHeader, Tag, Text } from '@/components/primitives';
import { Amount } from './Amount';
import { ObligationIcon } from './ObligationIcon';
import type { ObligationWithRelations } from '@/features/obligations/api';
import type { ValueUnitType } from '@/features/valueUnits/units';

export interface CreditCardDueWidgetProps {
  obligation: ObligationWithRelations | null;
}

const dayMonth = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });

function daysUntil(dueDate: string): number {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const due = new Date(dueDate);
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.round((dueStart.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

// Tuval AnaSayfa "Kredi kartları": banka logosu + ad, kalan gün etiketi, dönem borcu ve son ödeme günü.
export function CreditCardDueWidget({ obligation }: CreditCardDueWidgetProps) {
  if (!obligation) return null;

  const remaining = obligation.due_date ? daysUntil(obligation.due_date) : null;
  const overdue = remaining !== null && remaining < 0;

  return (
    <View>
      <SectionHeader title="Kredi kartları" actionLabel="Tümü" onActionPress={() => router.push('/accounts/credit-cards')} />
      <Pressable accessibilityRole="button" onPress={() => router.push(`/obligations/${obligation.id}`)}>
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <ObligationIcon documentType={obligation.document_type} bankCode={obligation.bank_code} size={34} />
            <Text numberOfLines={1} style={{ flex: 1, fontWeight: '600' }}>
              {obligation.title}
            </Text>
            {remaining !== null ? (
              <Tag
                tone={overdue ? 'danger' : remaining <= 3 ? 'brand' : 'neutral'}
                label={overdue ? `${Math.abs(remaining)} gün gecikti` : remaining === 0 ? 'Bugün' : `${remaining} gün`}
              />
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View style={{ gap: 2 }}>
              <Text variant="caption" color="textSecondary">
                Dönem borcu
              </Text>
              <Amount
                amountMinor={obligation.remaining_amount_minor}
                currencyCode={obligation.currency_code}
                valueUnitType={obligation.value_unit_type as ValueUnitType}
                direction="payable"
                variant="displayAmount"
                style={{ fontSize: 24, lineHeight: 28 }}
              />
            </View>
            {obligation.due_date ? (
              <View style={{ gap: 2, alignItems: 'flex-end' }}>
                <Text variant="caption" color="textSecondary">
                  Son ödeme
                </Text>
                <Text style={{ fontWeight: '600' }}>{dayMonth.format(new Date(obligation.due_date))}</Text>
              </View>
            ) : null}
          </View>
        </Card>
      </Pressable>
    </View>
  );
}

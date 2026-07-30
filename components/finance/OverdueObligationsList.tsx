import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { Card, Pressable, Row, Stack, Text } from '@/components/primitives';
import { Amount } from './Amount';
import { DOCUMENT_TYPE_ICON } from '@/features/obligations/documentTypes';
import type { ObligationWithRelations } from '@/features/obligations/api';

export interface OverdueObligationsListProps {
  obligations: ObligationWithRelations[];
}

function daysOverdue(dueDate: string): number {
  const due = new Date(dueDate);
  const today = new Date();
  const diff = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()) /
      86_400_000
  );
  return Math.max(0, diff);
}

export function OverdueObligationsList({ obligations }: OverdueObligationsListProps) {
  const theme = useTheme();

  return (
    <Stack gap="sm">
      <Text variant="sectionTitle">Gecikmiş Ödemeler</Text>
      {obligations.length === 0 ? (
        <Card>
          <Text variant="body" color="textSecondary">
            Gecikmiş kayıt yok.
          </Text>
        </Card>
      ) : (
        <Stack gap="xs">
          {obligations.map((o) => (
            <Pressable key={o.id} onPress={() => router.push(`/obligations/${o.id}`)}>
              <Card>
                <Row gap="sm">
                  <Ionicons
                    name={DOCUMENT_TYPE_ICON[o.document_type] ?? 'document-text-outline'}
                    size={22}
                    color={theme.colors.danger}
                  />
                  <Stack gap="xxs" style={{ flex: 1 }}>
                    <Text variant="cardTitle">{o.title}</Text>
                    <Text variant="caption" color="danger">
                      {daysOverdue(o.due_date as string)} gün gecikti
                    </Text>
                  </Stack>
                  <Amount
                    amountMinor={o.remaining_amount_minor}
                    currencyCode={o.currency_code}
                    direction={o.direction as 'payable' | 'receivable'}
                    overdue
                    variant="body"
                  />
                </Row>
              </Card>
            </Pressable>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { Card, Pressable, Row, Stack, Text } from '@/components/primitives';
import { StatusBadge } from './StatusBadge';
import { Amount } from './Amount';
import { DOCUMENT_TYPE_ICON } from '@/features/obligations/documentTypes';
import type { ObligationWithRelations } from '@/features/obligations/api';

export interface UpcomingDueListProps {
  obligations: ObligationWithRelations[];
}

type SegmentKey = 'today' | 'week' | 'month';

const SEGMENTS: { key: SegmentKey; label: string; days: number }[] = [
  { key: 'today', label: 'Bugün', days: 0 },
  { key: 'week', label: '7 Gün', days: 7 },
  { key: 'month', label: '30 Gün', days: 30 },
];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' });

export function UpcomingDueList({ obligations }: UpcomingDueListProps) {
  const theme = useTheme();
  const [segment, setSegment] = useState<SegmentKey>('week');

  const filtered = useMemo(() => {
    const today = startOfDay(new Date());
    const days = SEGMENTS.find((s) => s.key === segment)?.days ?? 7;
    const limit = new Date(today);
    limit.setDate(limit.getDate() + days);

    return obligations.filter((o) => {
      if (!o.due_date) return false;
      const due = startOfDay(new Date(o.due_date));
      return due <= limit;
    });
  }, [obligations, segment]);

  return (
    <Stack gap="sm">
      <Row align="center">
        <Text variant="sectionTitle" style={{ flex: 1 }}>
          Yaklaşan Vadeler
        </Text>
      </Row>

      <Row gap="xs">
        {SEGMENTS.map((item) => {
          const selected = item.key === segment;
          return (
            <Pressable
              key={item.key}
              onPress={() => setSegment(item.key)}
              style={{
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.xs,
                borderRadius: 999,
                backgroundColor: selected ? theme.colors.brandPrimary : theme.colors.surfacePrimary,
              }}
            >
              <Text variant="caption" style={{ color: selected ? theme.colors.brandPrimaryText : theme.colors.textSecondary }}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </Row>

      {filtered.length === 0 ? (
        <Card>
          <Text variant="body" color="textSecondary">
            Bu aralıkta vadesi gelen kayıt yok.
          </Text>
        </Card>
      ) : (
        <Stack gap="xs">
          {filtered.map((o) => (
            <Pressable key={o.id} onPress={() => router.push(`/obligations/${o.id}`)}>
              <Card>
                <Row gap="sm">
                  <Ionicons
                    name={DOCUMENT_TYPE_ICON[o.document_type] ?? 'document-text-outline'}
                    size={22}
                    color={theme.colors.accentViolet}
                  />
                  <Stack gap="xxs" style={{ flex: 1 }}>
                    <Text variant="cardTitle">{o.title}</Text>
                    <Row gap="xs">
                      <Text variant="caption" color="textSecondary">
                        {o.due_date ? dateFormatter.format(new Date(o.due_date)) : ''}
                      </Text>
                      <StatusBadge status={o.status} />
                    </Row>
                  </Stack>
                  <Amount amountMinor={o.remaining_amount_minor} currencyCode={o.currency_code} direction={o.direction as 'payable' | 'receivable'} overdue={o.status === 'gecikti'} variant="body" />
                </Row>
              </Card>
            </Pressable>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

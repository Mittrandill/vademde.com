import { useMemo, useState } from 'react';
import { router } from 'expo-router';

import { Card, EmptyState, Pressable, Row, SectionHeader, SegmentedControl, Stack, Text } from '@/components/primitives';
import { StatusBadge } from './StatusBadge';
import { Amount } from './Amount';
import { ObligationIcon } from './ObligationIcon';
import type { ObligationDueItem } from '@/features/obligations/api';

export interface UpcomingDueListProps {
  obligations: ObligationDueItem[];
}

type SegmentKey = 'today' | 'week' | 'month' | 'overdue';

const SEGMENTS: { key: SegmentKey; label: string; days: number }[] = [
  { key: 'today', label: 'Bugün', days: 0 },
  { key: 'week', label: '7 Gün', days: 7 },
  { key: 'month', label: '30 Gün', days: 30 },
  { key: 'overdue', label: 'Gecikmiş', days: 0 },
];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' });

export function UpcomingDueList({ obligations }: UpcomingDueListProps) {
  const [segment, setSegment] = useState<SegmentKey>('week');

  const filtered = useMemo(() => {
    const today = startOfDay(new Date());

    // "Gecikmiş" ayrı bir sekme: vadesi bugünden önce olan kayıtlar artık Bugün/7
    // Gün/30 Gün sekmelerine karışmıyor, sadece bu sekmede görünüyor.
    if (segment === 'overdue') {
      return obligations.filter((o) => {
        if (!o.due_date) return false;
        return startOfDay(new Date(o.due_date)) < today;
      });
    }

    const days = SEGMENTS.find((s) => s.key === segment)?.days ?? 7;
    const limit = new Date(today);
    limit.setDate(limit.getDate() + days);

    return obligations.filter((o) => {
      if (!o.due_date) return false;
      const due = startOfDay(new Date(o.due_date));
      return due >= today && due <= limit;
    });
  }, [obligations, segment]);

  return (
    <Stack gap="sm">
      <SectionHeader title="Yaklaşan Vadeler" />

      <SegmentedControl options={SEGMENTS} value={segment} onChange={setSegment} size="compact" stretch />

      {filtered.length === 0 ? (
        <EmptyState icon="calendar-outline" message="Bu aralıkta vadesi gelen kayıt yok." />
      ) : (
        <Stack gap="xs">
          {filtered.map((o) => (
            <Pressable key={o.installment_id ?? o.id} onPress={() => router.push(`/obligations/${o.id}`)}>
              <Card>
                <Row gap="sm">
                  <ObligationIcon
                    documentType={o.document_type}
                    bankCode={o.bank_code}
                    serviceCode={o.service_code}
                    fallbackName={o.title}
                    size={36}
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

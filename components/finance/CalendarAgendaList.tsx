import { Fragment, useMemo } from 'react';

import { Card, Stack, Text } from '@/components/primitives';
import { CalendarObligationRow } from './CalendarObligationRow';
import { toDateKey } from '@/utils/calendar';
import type { ObligationWithRelations } from '@/features/obligations/api';

export interface CalendarAgendaListProps {
  workspaceId: string;
  obligations: ObligationWithRelations[];
  emptyLabel?: string;
}

const dateHeaderFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  weekday: 'long',
});

export function CalendarAgendaList({
  workspaceId,
  obligations,
  emptyLabel = 'Bu aralıkta vadesi gelen kayıt yok.',
}: CalendarAgendaListProps) {
  const groups = useMemo(() => {
    const withDueDate = obligations.filter((o) => o.due_date);
    const ordered: { dateKey: string; date: Date; items: ObligationWithRelations[] }[] = [];
    const indexByKey = new Map<string, number>();

    for (const obligation of withDueDate) {
      const date = new Date(obligation.due_date as string);
      const dateKey = toDateKey(date);
      const existingIndex = indexByKey.get(dateKey);
      if (existingIndex === undefined) {
        indexByKey.set(dateKey, ordered.length);
        ordered.push({ dateKey, date, items: [obligation] });
      } else {
        ordered[existingIndex].items.push(obligation);
      }
    }
    return ordered;
  }, [obligations]);

  if (groups.length === 0) {
    return (
      <Card>
        <Text variant="body" color="textSecondary">
          {emptyLabel}
        </Text>
      </Card>
    );
  }

  return (
    <Stack gap="md">
      {groups.map((group) => (
        <Fragment key={group.dateKey}>
          <Text variant="caption" color="textSecondary">
            {dateHeaderFormatter.format(group.date).toLocaleUpperCase('tr-TR')}
          </Text>
          <Stack gap="xs">
            {group.items.map((obligation) => (
              <CalendarObligationRow key={obligation.id} workspaceId={workspaceId} obligation={obligation} />
            ))}
          </Stack>
        </Fragment>
      ))}
    </Stack>
  );
}

import { Card, Stack, Text } from '@/components/primitives';
import { Amount } from './Amount';

export interface ObligationSummaryCardProps {
  direction: 'payable' | 'receivable';
  totalMinor: number;
  count: number;
  nearestDueDate: string | null;
}

const TITLE: Record<ObligationSummaryCardProps['direction'], string> = {
  payable: 'Borç',
  receivable: 'Alacak',
};

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' });

export function ObligationSummaryCard({ direction, totalMinor, count, nearestDueDate }: ObligationSummaryCardProps) {
  return (
    <Card style={{ flex: 1 }}>
      <Stack gap="xs">
        <Text variant="caption" color="textSecondary">
          {TITLE[direction].toUpperCase()}
        </Text>
        <Amount amountMinor={totalMinor} direction={direction} variant="cardTitle" />
        <Text variant="caption" color="textSecondary">
          {count > 0
            ? `${count} kayıt${nearestDueDate ? ` · en yakın ${dateFormatter.format(new Date(nearestDueDate))}` : ''}`
            : 'Kayıt yok'}
        </Text>
      </Stack>
    </Card>
  );
}

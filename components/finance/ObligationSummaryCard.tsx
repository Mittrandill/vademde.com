import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Card, ProgressRing, Row, Stack, Text } from '@/components/primitives';
import { Amount } from './Amount';

export interface ObligationSummaryCardProps {
  direction: 'payable' | 'receivable';
  totalMinor: number;
  count: number;
  nearestDueDate: string | null;
  /** Halkanın doluluğu: bu yönün borç+alacak toplamındaki payı (0-1). */
  share?: number;
}

const TITLE: Record<ObligationSummaryCardProps['direction'], string> = {
  payable: 'Borç',
  receivable: 'Alacak',
};

const ICON: Record<ObligationSummaryCardProps['direction'], keyof typeof Ionicons.glyphMap> = {
  payable: 'arrow-down',
  receivable: 'arrow-up',
};

const RING_SIZE = 60;
const RING_STROKE = 7;

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' });

export function ObligationSummaryCard({
  direction,
  totalMinor,
  count,
  nearestDueDate,
  share,
}: ObligationSummaryCardProps) {
  const theme = useTheme();

  // Borç kırmızı değildir; kırmızı yalnızca gecikme anlamı taşır (bkz. Amount).
  const accent = direction === 'receivable' ? theme.colors.success : theme.colors.textSecondary;
  const progress = share ?? (count > 0 ? 1 : 0);

  return (
    <Card
      style={{
        flex: 1,
        borderWidth: 1,
        borderColor: withAlpha(accent, 0.22),
      }}
    >
      <Stack gap="sm">
        <Text variant="caption" color="textSecondary">
          {TITLE[direction].toUpperCase()}
        </Text>
        <Row gap="sm">
          <ProgressRing
            size={RING_SIZE}
            strokeWidth={RING_STROKE}
            progress={progress}
            color={accent}
            trackColor={withAlpha(accent, 0.18)}
            cap
          >
            <Ionicons name={ICON[direction]} size={18} color={accent} />
          </ProgressRing>
          <Amount
            amountMinor={totalMinor}
            direction={direction}
            variant="cardTitle"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={{ flex: 1 }}
          />
        </Row>
        {/* Dar sütunda sarmaması için sayaç/vade satırı kartın tam genişliğinde. */}
        <Text variant="caption" color="textSecondary">
          {count > 0
            ? `${count} kayıt${nearestDueDate ? ` · en yakın ${dateFormatter.format(new Date(nearestDueDate))}` : ''}`
            : 'Kayıt yok'}
        </Text>
      </Stack>
    </Card>
  );
}

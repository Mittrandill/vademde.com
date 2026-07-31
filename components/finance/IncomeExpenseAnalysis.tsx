import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Card, Divider, ProgressRing, Row, Stack, Text } from '@/components/primitives';
import { Amount, type AmountDirection } from './Amount';

export interface IncomeExpenseAnalysisProps {
  incomeMinor: number;
  expenseMinor: number;
  title?: string;
}

const RING_SIZE = 56;
const RING_STROKE = 6;

export function IncomeExpenseAnalysis({
  incomeMinor,
  expenseMinor,
  title = 'Bu Ay Gelir-Gider',
}: IncomeExpenseAnalysisProps) {
  const theme = useTheme();
  const netMinor = incomeMinor - expenseMinor;

  // Halkalar dönem içindeki payı gösterir: gelir ve gider birbirini tamamlar,
  // net ise ikisinin toplamına oranlanır. Hareket yoksa halkalar boş kalır.
  const volume = incomeMinor + expenseMinor;
  const share = (value: number) => (volume > 0 ? Math.abs(value) / volume : 0);

  return (
    <Card>
      <Stack gap="md">
        <Text variant="caption" color="textSecondary">
          {title.toUpperCase()}
        </Text>
        <Row align="stretch">
          <MetricColumn
            label="GELİR"
            amountMinor={incomeMinor}
            direction="income"
            progress={share(incomeMinor)}
            color={theme.colors.success}
            icon="trending-up"
          />
          <Divider orientation="vertical" style={{ marginHorizontal: theme.spacing.xs }} />
          <MetricColumn
            label="GİDER"
            amountMinor={expenseMinor}
            direction="expense"
            progress={share(expenseMinor)}
            color={theme.colors.textSecondary}
            icon="trending-down"
          />
          <Divider orientation="vertical" style={{ marginHorizontal: theme.spacing.xs }} />
          <MetricColumn
            label="NET"
            amountMinor={Math.abs(netMinor)}
            direction={netMinor >= 0 ? 'income' : 'expense'}
            progress={share(netMinor)}
            color={netMinor >= 0 ? theme.colors.success : theme.colors.textSecondary}
            icon={netMinor >= 0 ? 'trending-up' : 'trending-down'}
          />
        </Row>
      </Stack>
    </Card>
  );
}

interface MetricColumnProps {
  label: string;
  amountMinor: number;
  direction: AmountDirection;
  progress: number;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}

function MetricColumn({ label, amountMinor, direction, progress, color, icon }: MetricColumnProps) {
  return (
    <Stack gap="xs" align="center" style={{ flex: 1 }}>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
      <ProgressRing
        size={RING_SIZE}
        strokeWidth={RING_STROKE}
        progress={progress}
        color={color}
        trackColor={withAlpha(color, 0.18)}
        cap
      >
        <Ionicons name={icon} size={20} color={color} />
      </ProgressRing>
      <Amount
        amountMinor={amountMinor}
        direction={direction}
        variant="cardTitle"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={{ alignSelf: 'stretch', textAlign: 'center' }}
      />
    </Stack>
  );
}

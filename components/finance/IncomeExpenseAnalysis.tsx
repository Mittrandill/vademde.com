import { Card, Row, Stack, Text } from '@/components/primitives';
import { Amount } from './Amount';

export interface IncomeExpenseAnalysisProps {
  incomeMinor: number;
  expenseMinor: number;
  title?: string;
}

export function IncomeExpenseAnalysis({ incomeMinor, expenseMinor, title = 'Bu Ay Gelir-Gider' }: IncomeExpenseAnalysisProps) {
  const netMinor = incomeMinor - expenseMinor;

  return (
    <Card>
      <Stack gap="sm">
        <Text variant="sectionTitle">{title}</Text>
        <Row>
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="caption" color="textSecondary">
              GELİR
            </Text>
            <Amount amountMinor={incomeMinor} direction="income" variant="cardTitle" />
          </Stack>
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="caption" color="textSecondary">
              GİDER
            </Text>
            <Amount amountMinor={expenseMinor} direction="expense" variant="cardTitle" />
          </Stack>
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="caption" color="textSecondary">
              NET
            </Text>
            <Amount amountMinor={Math.abs(netMinor)} direction={netMinor >= 0 ? 'income' : 'expense'} variant="cardTitle" />
          </Stack>
        </Row>
      </Stack>
    </Card>
  );
}

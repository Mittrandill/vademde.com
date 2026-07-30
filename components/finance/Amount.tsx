import { Text, type TextProps } from '@/components/primitives';
import { formatMinorAmount } from '@/utils/money';
import type { ThemeColors } from '@/theme/colors';

export type AmountDirection = 'income' | 'expense' | 'payable' | 'receivable' | 'transfer';

export interface AmountProps extends Omit<TextProps, 'children' | 'color'> {
  amountMinor: number;
  currencyCode?: string;
  direction?: AmountDirection;
  overdue?: boolean;
}

const PREFIX: Partial<Record<AmountDirection, string>> = {
  income: '+',
  expense: '-',
  transfer: '⇄',
};

const COLOR: Record<AmountDirection, keyof ThemeColors> = {
  income: 'success',
  expense: 'textPrimary',
  receivable: 'success',
  payable: 'textPrimary',
  transfer: 'textSecondary',
};

export function Amount({ amountMinor, currencyCode = 'TRY', direction, overdue, variant = 'body', style, ...rest }: AmountProps) {
  const color = overdue ? 'danger' : direction ? COLOR[direction] : 'textPrimary';
  const prefix = direction ? (PREFIX[direction] ?? '') : '';

  return (
    <Text variant={variant} color={color} tabular style={style} {...rest}>
      {prefix}
      {formatMinorAmount(amountMinor, currencyCode)}
    </Text>
  );
}

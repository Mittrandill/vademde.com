import { Text, type TextProps } from '@/components/primitives';
import { formatMinorAmount, formatValueUnitAmount } from '@/utils/money';
import type { ThemeColors } from '@/theme/colors';
import type { ValueUnitType } from '@/features/valueUnits/units';

export type AmountDirection = 'income' | 'expense' | 'payable' | 'receivable' | 'transfer';

export interface AmountProps extends Omit<TextProps, 'children' | 'color'> {
  amountMinor: number;
  currencyCode?: string;
  direction?: AmountDirection;
  overdue?: boolean;
  /**
   * docs/01-finansal-kayit-modeli.md §3.5 — verilirse ve 'kiymetli_maden' ise
   * currencyCode ISO 4217 değil Vademde'nin sabit birim koduna (gram_altin vb.)
   * karşılık gelir; Intl.NumberFormat({currency}) yerine formatValueUnitAmount kullanılır.
   * Verilmezse (varsayılan) mevcut fiat davranışı korunur — geriye dönük uyumlu.
   */
  valueUnitType?: ValueUnitType;
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

export function Amount({
  amountMinor,
  currencyCode = 'TRY',
  direction,
  overdue,
  valueUnitType,
  variant = 'body',
  style,
  ...rest
}: AmountProps) {
  const color = overdue ? 'danger' : direction ? COLOR[direction] : 'textPrimary';
  const prefix = direction ? (PREFIX[direction] ?? '') : '';
  const formatted =
    valueUnitType === 'kiymetli_maden'
      ? formatValueUnitAmount(amountMinor, currencyCode)
      : formatMinorAmount(amountMinor, currencyCode);

  return (
    <Text variant={variant} color={color} tabular style={style} {...rest}>
      {prefix}
      {formatted}
    </Text>
  );
}

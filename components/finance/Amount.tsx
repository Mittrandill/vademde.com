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
  /** Yönden türetilen işareti geçersiz kılar (ör. net için '+' / '−'). */
  prefix?: string;
}

const PREFIX: Partial<Record<AmountDirection, string>> = {
  income: '+',
  expense: '−',
  transfer: '⇄',
};

const COLOR: Record<AmountDirection, keyof ThemeColors> = {
  income: 'receivable',
  expense: 'textPrimary',
  receivable: 'receivable',
  payable: 'textPrimary',
  transfer: 'textSecondary',
};

export function Amount({
  amountMinor,
  currencyCode = 'TRY',
  direction,
  overdue,
  valueUnitType,
  prefix: prefixOverride,
  variant = 'body',
  style,
  ...rest
}: AmountProps) {
  const color = overdue ? 'danger' : direction ? COLOR[direction] : 'textPrimary';
  const prefix = prefixOverride ?? (direction ? (PREFIX[direction] ?? '') : '');
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

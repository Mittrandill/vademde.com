import type { ThemeColors } from '@/theme/colors';

type CalendarItem = { direction: string; document_type: string };
export type CalendarMarkerKind = 'Payable' | 'Receivable' | 'Instruments' | 'Loan' | 'CreditCard';

/** One contribution per meaning, regardless of how many records have that meaning. */
export function calendarMarkerKinds(items: CalendarItem[]): CalendarMarkerKind[] {
  const kinds: CalendarMarkerKind[] = [];
  if (items.some((item) => item.direction === 'payable')) kinds.push('Payable');
  if (items.some((item) => item.direction === 'receivable')) kinds.push('Receivable');
  if (items.some((item) => item.document_type === 'cek' || item.document_type === 'senet')) kinds.push('Instruments');
  if (items.some((item) => item.document_type === 'kredi')) kinds.push('Loan');
  if (items.some((item) => item.document_type === 'kredi_karti_ekstresi')) kinds.push('CreditCard');
  return kinds;
}

export function calendarMarkerColor(kinds: CalendarMarkerKind[], colors: ThemeColors): string | null {
  if (!kinds.length) return null;
  const palette: Record<CalendarMarkerKind, string> = {
    Payable: colors.danger,
    Receivable: colors.success,
    Instruments: colors.accentViolet,
    Loan: colors.attentionMarker,
    CreditCard: colors.accentAqua,
  };
  const unique = [...new Set(kinds)];
  const components = unique.map((kind) => palette[kind].replace('#', '')).map((hex) =>
    [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)));
  const mixed = [0, 1, 2].map((channel) => Math.round(components.reduce((sum, rgb) => sum + rgb[channel], 0) / components.length));
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

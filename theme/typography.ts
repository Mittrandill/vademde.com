import type { TextStyle } from 'react-native';

// docs/08-tasarim-sistemi.md §12.6 — iOS sistem fontu + tabular numbers.
// fontFamily boş bırakılır: iOS'ta San Francisco, Android'de Roboto varsayılanı kullanılır.
export type TypographyToken =
  | 'displayBalance'
  | 'displayAmount'
  | 'pageTitle'
  | 'sectionTitle'
  | 'cardTitle'
  | 'body'
  | 'caption';

export const typography: Record<TypographyToken, TextStyle> = {
  displayBalance: { fontSize: 44, lineHeight: 52, fontWeight: '700' },
  displayAmount: { fontSize: 34, lineHeight: 40, fontWeight: '700' },
  pageTitle: { fontSize: 30, lineHeight: 36, fontWeight: '700' },
  sectionTitle: { fontSize: 21, lineHeight: 28, fontWeight: '600' },
  cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
};

// Tutar gibi rakam ağırlıklı alanlarda kullanılır (docs §12.6).
export const tabularNums: TextStyle = {
  fontVariant: ['tabular-nums'],
};

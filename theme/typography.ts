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

// docs/08-tasarim-sistemi.md §12.19 — Dynamic Type desteklenir ama sabit boyutlu
// öğelerde (ProgressRing, TextField) taşmayı önlemek için üst sınır konur. iOS
// "Metin Boyutu" kaydırıcısının standart (accessibility olmayan) tepe noktası ~1.35x'tir;
// 1.3 bu aralığın neredeyse tamamını onurlandırırken dar layout'larda güvenlik payı bırakır.
export const MAX_FONT_SCALE = 1.3;

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

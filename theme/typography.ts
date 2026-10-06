import { Platform, type TextStyle } from 'react-native';

// Tasarım tuvali (Vademde Ekran Tasarımı, vademde.css): iOS sistem fontu, tüm metin ve tutarlarda.
// Özel font yüklenmez; ağırlık fontWeight ile seçilir. Rakamlar tabular-nums ile hizalanır.
// IBAN/belge no gibi alanlar için sistem monospace ailesi.
export const monoFamily = Platform.select({ ios: 'Menlo', default: 'monospace' }) as string;

export type TypographyToken =
  | 'displayBalance'
  | 'displayAmount'
  | 'pageTitle'
  | 'sectionTitle'
  | 'cardTitle'
  | 'body'
  | 'caption'
  | 'label';

// docs/08-tasarim-sistemi.md §12.19 — Dynamic Type desteklenir ama sabit boyutlu
// öğelerde (ProgressRing, TextField) taşmayı önlemek için üst sınır konur. iOS
// "Metin Boyutu" kaydırıcısının standart (accessibility olmayan) tepe noktası ~1.35x'tir;
// 1.3 bu aralığın neredeyse tamamını onurlandırırken dar layout'larda güvenlik payı bırakır.
export const MAX_FONT_SCALE = 1.3;

// vademde.css ölçeği: .lt 34/41 700 (sayfa başlığı), .t1 28/34 700, .h2 20/25 700 (bölüm başlığı),
// .hd 17/600 (liste/kart başlığı), .bd 17 (gövde), .fn 13/18 (alt metin), .ov 13/600 büyük harf (üst etiket).
export const typography: Record<TypographyToken, TextStyle> = {
  displayBalance: { fontSize: 40, lineHeight: 42, fontWeight: '700', letterSpacing: -1.2 },
  displayAmount: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.56 },
  pageTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.85 },
  sectionTitle: { fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: -0.3 },
  cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.17 },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400', letterSpacing: -0.17 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    letterSpacing: 0.26,
    textTransform: 'uppercase',
  },
};

// Tutar, tarih gibi rakam ağırlıklı alanlarda kullanılır (.num / .amt: tabular-nums).
export const tabularNums: TextStyle = {
  fontVariant: ['tabular-nums'],
};

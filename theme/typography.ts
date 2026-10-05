import type { TextStyle } from 'react-native';
import {
  BricolageGrotesque_400Regular,
  BricolageGrotesque_500Medium,
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
} from '@expo-google-fonts/bricolage-grotesque';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from '@expo-google-fonts/ibm-plex-mono';

// docs/08-tasarim-sistemi.md §12.6 — Bricolage Grotesque (başlık + gövde) ve IBM Plex Mono
// (tutarlar, tarihler, küçük büyük-harf etiketler). Her ikisi de OFL lisanslı.
// React Native'de özel fontlarda fontWeight aileyi seçmez; ağırlık başına ayrı aile adı gerekir.
export const fontFamily = {
  sans: {
    regular: 'BricolageGrotesque_400Regular',
    medium: 'BricolageGrotesque_500Medium',
    semibold: 'BricolageGrotesque_600SemiBold',
    bold: 'BricolageGrotesque_700Bold',
  },
  mono: {
    regular: 'IBMPlexMono_400Regular',
    medium: 'IBMPlexMono_500Medium',
    semibold: 'IBMPlexMono_600SemiBold',
    // Plex Mono 700 yüklenmez (tasarım 400–600 kullanır); en yakın ağırlığa düşer.
    bold: 'IBMPlexMono_600SemiBold',
  },
} as const;

// app/_layout.tsx içindeki useFonts bu haritayı yükler.
export const fontAssets = {
  [fontFamily.sans.regular]: BricolageGrotesque_400Regular,
  [fontFamily.sans.medium]: BricolageGrotesque_500Medium,
  [fontFamily.sans.semibold]: BricolageGrotesque_600SemiBold,
  [fontFamily.sans.bold]: BricolageGrotesque_700Bold,
  [fontFamily.mono.regular]: IBMPlexMono_400Regular,
  [fontFamily.mono.medium]: IBMPlexMono_500Medium,
  [fontFamily.mono.semibold]: IBMPlexMono_600SemiBold,
};

/** fontWeight değerini ilgili ağırlıktaki font ailesine çevirir (varsayılan: regular). */
export function resolveFontFamily(fontWeight: TextStyle['fontWeight'], mono = false): string {
  const set = mono ? fontFamily.mono : fontFamily.sans;
  const w = fontWeight === 'bold' ? 700 : Number(fontWeight ?? 400);
  if (w >= 700) return set.bold;
  if (w >= 600) return set.semibold;
  if (w >= 500) return set.medium;
  return set.regular;
}

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

// HANDOFF §2: hero tutar 52–60 pt/700/−4%; ekran başlığı 34/700; bölüm başlığı 22–24/700;
// liste başlığı 15–16/600; etiket Plex Mono 10–11, büyük harf, 0.08em.
export const typography: Record<TypographyToken, TextStyle> = {
  displayBalance: {
    fontFamily: fontFamily.mono.bold,
    fontSize: 56,
    lineHeight: 60,
    fontWeight: '700',
    letterSpacing: -2.24,
  },
  displayAmount: {
    fontFamily: fontFamily.mono.bold,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    letterSpacing: -1.36,
  },
  pageTitle: { fontFamily: fontFamily.sans.bold, fontSize: 34, lineHeight: 40, fontWeight: '700' },
  sectionTitle: {
    fontFamily: fontFamily.sans.bold,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -0.48,
  },
  cardTitle: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  body: { fontFamily: fontFamily.sans.regular, fontSize: 16, lineHeight: 22, fontWeight: '400' },
  caption: {
    fontFamily: fontFamily.sans.regular,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  label: {
    fontFamily: fontFamily.mono.medium,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
    letterSpacing: 0.88,
    textTransform: 'uppercase',
  },
};

// Tutar, tarih gibi rakam ağırlıklı alanlarda kullanılır (HANDOFF §2: Plex Mono + tabular-nums).
export const tabularNums: TextStyle = {
  fontVariant: ['tabular-nums'],
};

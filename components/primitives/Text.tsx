import { StyleSheet, Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme } from '@/theme';
import { MAX_FONT_SCALE, resolveFontFamily, type TypographyToken } from '@/theme/typography';
import type { ThemeColors } from '@/theme/colors';

export interface TextProps extends RNTextProps {
  variant?: TypographyToken;
  color?: keyof ThemeColors;
  /** Tutar/tarih: IBM Plex Mono + tabular-nums (HANDOFF §2). */
  tabular?: boolean;
  /** Tabular olmadan Plex Mono (ör. IBAN, belge no). */
  mono?: boolean;
}

const MONO_VARIANTS: TypographyToken[] = ['label', 'displayBalance', 'displayAmount'];

export function Text({
  variant = 'body',
  color = 'textPrimary',
  tabular,
  mono,
  style,
  maxFontSizeMultiplier = MAX_FONT_SCALE,
  ...rest
}: TextProps) {
  const theme = useTheme();
  const flat = StyleSheet.flatten([theme.typography[variant], style]);
  const useMono = !!(tabular || mono) || MONO_VARIANTS.includes(variant);
  // Ağırlık inline (fontWeight) verildiğinde de doğru aile seçilsin; açık fontFamily korunur.
  const explicitFamily = StyleSheet.flatten(style)?.fontFamily;
  const family = explicitFamily ?? resolveFontFamily(flat.fontWeight, useMono);

  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        theme.typography[variant],
        { color: theme.colors[color], fontFamily: family },
        tabular && theme.tabularNums,
        style,
      ]}
      {...rest}
    />
  );
}

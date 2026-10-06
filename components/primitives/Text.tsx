import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme } from '@/theme';
import { MAX_FONT_SCALE, monoFamily, type TypographyToken } from '@/theme/typography';
import type { ThemeColors } from '@/theme/colors';

export interface TextProps extends RNTextProps {
  variant?: TypographyToken;
  color?: keyof ThemeColors;
  /** Tutar/tarih: tabular-nums (vademde.css .num). */
  tabular?: boolean;
  /** IBAN, belge no gibi alanlar: sistem monospace (vademde.css .mono). */
  mono?: boolean;
}

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

  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        theme.typography[variant],
        { color: theme.colors[color] },
        (tabular || mono || variant === 'displayBalance' || variant === 'displayAmount') && theme.tabularNums,
        mono && { fontFamily: monoFamily },
        style,
      ]}
      {...rest}
    />
  );
}

import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme } from '@/theme';
import type { TypographyToken } from '@/theme/typography';
import type { ThemeColors } from '@/theme/colors';

export interface TextProps extends RNTextProps {
  variant?: TypographyToken;
  color?: keyof ThemeColors;
  tabular?: boolean;
}

export function Text({ variant = 'body', color = 'textPrimary', tabular, style, ...rest }: TextProps) {
  const theme = useTheme();

  return (
    <RNText
      style={[
        theme.typography[variant],
        { color: theme.colors[color] },
        tabular && theme.tabularNums,
        style,
      ]}
      {...rest}
    />
  );
}

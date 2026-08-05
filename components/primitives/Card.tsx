import { View, type ViewProps } from 'react-native';

import { useTheme } from '@/theme';

export interface CardProps extends ViewProps {
  elevated?: boolean;
  /** 'hero' → hero widget radius/padding (docs §12.7) — ana bakiye/özet kartları için. */
  variant?: 'default' | 'hero';
}

export function Card({ elevated, variant = 'default', style, ...rest }: CardProps) {
  const theme = useTheme();
  const isHero = variant === 'hero';

  return (
    <View
      style={[
        {
          backgroundColor: elevated ? theme.colors.surfaceElevated : theme.colors.surfacePrimary,
          borderRadius: isHero ? theme.radius.heroWidget : theme.radius.widget,
          padding: isHero ? theme.spacing.lg : theme.spacing.md,
        },
        style,
      ]}
      {...rest}
    />
  );
}

import { View, type ViewProps } from 'react-native';

import { useTheme } from '@/theme';

export interface CardProps extends ViewProps {
  elevated?: boolean;
  /** Geriye dönük uyumluluk: tuvalde tek kart tipi var (.card, 20 radius, 16 padding). */
  variant?: 'default' | 'hero';
}

// vademde.css .card: yüzey, 20 radius, 16 padding; açık temada çok hafif gölge.
export function Card({ elevated, variant = 'default', style, ...rest }: CardProps) {
  const theme = useTheme();
  const isHero = variant === 'hero';

  return (
    <View
      style={[
        {
          backgroundColor: elevated ? theme.colors.surfaceElevated : theme.colors.surfacePrimary,
          borderRadius: theme.radius.widget,
          padding: isHero ? theme.spacing.lg : theme.spacing.md,
        },
        theme.scheme === 'light' ? lightShadow : null,
        style,
      ]}
      {...rest}
    />
  );
}

const lightShadow = {
  shadowColor: '#1F2126',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
} as const;

import { View, type ViewProps } from 'react-native';

import { useTheme } from '@/theme';

export interface CardProps extends ViewProps {
  elevated?: boolean;
}

export function Card({ elevated, style, ...rest }: CardProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: elevated ? theme.colors.surfaceElevated : theme.colors.surfacePrimary,
          borderRadius: theme.radius.widget,
          padding: theme.spacing.md,
        },
        style,
      ]}
      {...rest}
    />
  );
}

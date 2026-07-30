import { View, type ViewProps } from 'react-native';

import { useTheme } from '@/theme';
import type { spacing } from '@/theme/spacing';

type SpacingKey = keyof typeof spacing;

export interface StackProps extends ViewProps {
  gap?: SpacingKey;
  align?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
}

export function Stack({ gap = 'md', align = 'stretch', style, ...rest }: StackProps) {
  const theme = useTheme();

  return (
    <View
      style={[{ flexDirection: 'column', gap: theme.spacing[gap], alignItems: align }, style]}
      {...rest}
    />
  );
}

export function Row({ gap = 'md', align = 'center', style, ...rest }: StackProps) {
  const theme = useTheme();

  return (
    <View
      style={[{ flexDirection: 'row', gap: theme.spacing[gap], alignItems: align }, style]}
      {...rest}
    />
  );
}

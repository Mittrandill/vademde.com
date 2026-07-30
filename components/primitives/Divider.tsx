import { View, type ViewProps } from 'react-native';

import { useTheme } from '@/theme';

export function Divider({ style, ...rest }: ViewProps) {
  const theme = useTheme();

  return (
    <View
      style={[{ height: 1, backgroundColor: theme.colors.border }, style]}
      {...rest}
    />
  );
}

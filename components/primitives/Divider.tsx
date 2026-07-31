import { View, type ViewProps } from 'react-native';

import { useTheme } from '@/theme';

export interface DividerProps extends ViewProps {
  orientation?: 'horizontal' | 'vertical';
}

export function Divider({ orientation = 'horizontal', style, ...rest }: DividerProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        orientation === 'vertical'
          ? { width: 1, alignSelf: 'stretch', backgroundColor: theme.colors.border }
          : { height: 1, backgroundColor: theme.colors.border },
        style,
      ]}
      {...rest}
    />
  );
}

import { Pressable as RNPressable, type PressableProps as RNPressableProps } from 'react-native';

import { useTheme } from '@/theme';

export interface PressableProps extends RNPressableProps {}

// docs/08-tasarim-sistemi.md §12.7, §12.19 — minimum 44x44 pt dokunma alanı.
export function Pressable({ style, hitSlop, ...rest }: PressableProps) {
  const theme = useTheme();

  return (
    <RNPressable
      hitSlop={hitSlop ?? theme.touchTarget.minimum / 4}
      style={(state) => [
        { opacity: state.pressed ? theme.opacity.pressed : 1 },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}
    />
  );
}

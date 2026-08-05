import { useEffect, useState } from 'react';
import { Animated, type DimensionValue, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

// docs/08-tasarim-sistemi.md §12.18 — tam ekran boş spinner yerine skeleton kullanılır.
// Tek bir pulsing-surface block; listeler/kartlar bunu tekrarlayarak kendi iskeletini kurar.
export function Skeleton({ width = '100%', height = 16, borderRadius, style }: SkeletonProps) {
  const theme = useTheme();
  const [pulse] = useState(() => new Animated.Value(0.4));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: theme.motion.chartEntryMs,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: theme.motion.chartEntryMs,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, theme.motion.chartEntryMs]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: borderRadius ?? theme.radius.input,
          backgroundColor: theme.colors.surfaceElevated,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

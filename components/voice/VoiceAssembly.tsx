import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';

import { MARK_PIXELS, MARK_PIXEL_COLUMNS, MARK_PIXEL_ROWS } from '@/components/voice/markPixels';
import { useTheme } from '@/theme';

const CELL = 6.5;
const GAP = 1;

function pixelMotion(column: number, row: number, index: number) {
  const angle = (index * 137.5 * Math.PI) / 180;
  const distance = 80 + (index % 9) * 13;
  return {
    fromX: Math.round((Math.cos(angle) * distance) / CELL) * CELL,
    fromY: Math.round((Math.sin(angle) * distance) / CELL) * CELL,
    start: (((row * 5 + column * 3) % 17) / 17) * 0.55,
  };
}

// Dijital pikseller yapboz gibi yerine oturup Vademde sembolünü oluşturur.
export function VoiceAssembly({
  complete,
  durationMs,
  onComplete,
}: {
  complete: boolean;
  durationMs: number;
  onComplete?: () => void;
}) {
  const theme = useTheme();
  const [progress] = useState(() => new Animated.Value(0));
  const pixels = useMemo(
    () => MARK_PIXELS.map(([column, row, kind], index) => ({ column, row, kind, ...pixelMotion(column, row, index) })),
    []
  );

  useEffect(() => {
    let cancelled = false;
    let loop: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (complete) {
        Animated.timing(progress, {
          toValue: 1,
          duration: reduced ? 0 : durationMs,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) onComplete?.();
        });
        return;
      }
      if (reduced) {
        progress.setValue(1);
        return;
      }
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(progress, { toValue: 0.7, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(progress, { toValue: 0.2, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [complete, durationMs, onComplete, progress]);

  const colors = { a: theme.colors.textPrimary, s: theme.colors.brandPrimary, v: theme.colors.accentViolet };

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: MARK_PIXEL_COLUMNS * CELL, height: MARK_PIXEL_ROWS * CELL, alignSelf: 'center', marginVertical: theme.spacing.xl }}
    >
      {pixels.map((pixel) => {
        const inputRange = [pixel.start, Math.min(1, pixel.start + 0.42)];
        return (
          <Animated.View
            key={`${pixel.column}-${pixel.row}`}
            style={{
              position: 'absolute',
              left: pixel.column * CELL,
              top: pixel.row * CELL,
              width: CELL - GAP,
              height: CELL - GAP,
              backgroundColor: colors[pixel.kind],
              opacity: progress.interpolate({ inputRange, outputRange: [0.2, 1], extrapolate: 'clamp' }),
              transform: [
                { translateX: progress.interpolate({ inputRange, outputRange: [pixel.fromX, 0], extrapolate: 'clamp' }) },
                { translateY: progress.interpolate({ inputRange, outputRange: [pixel.fromY, 0], extrapolate: 'clamp' }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

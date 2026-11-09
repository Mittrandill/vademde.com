import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';

import { useTheme } from '@/theme';

const WIDTH = 260;
const HEIGHT = 170;
const FRAGMENTS = 42;

// Hedefler kart satırlarını oluşturur: başlık, büyük tutar ve iki bilgi satırı.
function fragmentLayout(index: number) {
  const row = index % 4;
  const column = Math.floor(index / 4);
  const rowY = [34, 72, 112, 138][row]!;
  const rowHeight = [8, 16, 6, 6][row]!;
  const angle = (index * 137.5 * Math.PI) / 180;
  const radius = 130 + (index % 5) * 18;
  return {
    targetX: 24 + column * 21,
    targetY: rowY,
    width: 17,
    height: rowHeight,
    startX: Math.cos(angle) * radius,
    startY: Math.sin(angle) * radius,
    delay: (index % 7) / 7,
  };
}

// Veriler işlenirken dijital parçalar döner ve yanıt gelince kayıt kartına dönüşür.
export function VoiceAssembly({ complete, onComplete }: { complete: boolean; onComplete?: () => void }) {
  const theme = useTheme();
  const [progress] = useState(() => new Animated.Value(0));
  const fragments = useMemo(() => Array.from({ length: FRAGMENTS }, (_, index) => fragmentLayout(index)), []);
  const palette = [theme.colors.brandPrimary, theme.colors.payable, theme.colors.textSecondary, theme.colors.receivable];

  useEffect(() => {
    let cancelled = false;
    let loop: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (complete) {
        Animated.timing(progress, {
          toValue: 1,
          duration: reduced ? 0 : theme.motion.chartEntryMs,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) onComplete?.();
        });
        return;
      }
      if (reduced) {
        progress.setValue(0.75);
        return;
      }
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(progress, { toValue: 0.72, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(progress, { toValue: 0.28, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [complete, onComplete, progress, theme.motion.chartEntryMs]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: WIDTH, height: HEIGHT, alignSelf: 'center' }}
    >
      <Animated.View
        style={{
          position: 'absolute',
          width: WIDTH,
          height: HEIGHT,
          borderRadius: theme.radius.widget,
          backgroundColor: theme.colors.surfacePrimary,
          opacity: progress.interpolate({ inputRange: [0.6, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
        }}
      />
      {fragments.map((fragment, index) => {
        const entry = fragment.delay * 0.35;
        return (
          <Animated.View
            key={index}
            style={{
              position: 'absolute',
              left: fragment.targetX,
              top: fragment.targetY,
              width: fragment.width,
              height: fragment.height,
              borderRadius: theme.radius.tag,
              backgroundColor: palette[index % palette.length],
              opacity: progress.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.15, 0.85, 1] }),
              transform: [
                { translateX: progress.interpolate({ inputRange: [entry, 1], outputRange: [fragment.startX, 0], extrapolate: 'clamp' }) },
                { translateY: progress.interpolate({ inputRange: [entry, 1], outputRange: [fragment.startY, 0], extrapolate: 'clamp' }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

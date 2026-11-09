import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import {
  MARK_ARROW_PATH,
  MARK_BAR_RADIUS,
  MARK_BAR_WIDTH,
  MARK_SAFFRON_BARS,
  MARK_SAFFRON_PATH,
  MARK_VIEWBOX,
  MARK_VIOLET_BARS,
} from '@/components/brand/VademdeMark';
import { useTheme } from '@/theme';

const SIZE = 180;
const HEIGHT = SIZE * (MARK_VIEWBOX.height / MARK_VIEWBOX.width);

interface MarkPiece {
  key: string;
  shape: ReactNode;
  fromX: number;
  fromY: number;
  rotate: string;
  start: number;
}

// Vademde sembolünün parçaları ayrı ayrı gelip sembolü oluşturur; konuşma süresince tamamlanır.
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

  useEffect(() => {
    let cancelled = false;
    let loop: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (complete) {
        Animated.timing(progress, {
          toValue: 1,
          duration: reduced ? 0 : durationMs,
          easing: Easing.inOut(Easing.cubic),
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
          Animated.timing(progress, { toValue: 0.62, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(progress, { toValue: 0.18, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [complete, durationMs, onComplete, progress]);

  const bar = (item: { x: number; y: number; height: number }, fill: string) => (
    <Rect fill={fill} x={item.x} y={item.y} width={MARK_BAR_WIDTH} height={item.height} rx={MARK_BAR_RADIUS} ry={MARK_BAR_RADIUS} />
  );

  const pieces: MarkPiece[] = [
    { key: 'arrow', shape: <Path fill={theme.colors.textPrimary} d={MARK_ARROW_PATH} />, fromX: 0, fromY: 26, rotate: '0deg', start: 0 },
    { key: 'saffron-left', shape: bar(MARK_SAFFRON_BARS[0], theme.colors.brandPrimary), fromX: -96, fromY: -112, rotate: '-34deg', start: 0.08 },
    { key: 'saffron-center', shape: bar(MARK_SAFFRON_BARS[1], theme.colors.brandPrimary), fromX: 8, fromY: -142, rotate: '20deg', start: 0.16 },
    { key: 'saffron-right', shape: <Path fill={theme.colors.brandPrimary} d={MARK_SAFFRON_PATH} />, fromX: 104, fromY: -104, rotate: '32deg', start: 0.24 },
    { key: 'violet-left', shape: bar(MARK_VIOLET_BARS[2], theme.colors.accentViolet), fromX: -104, fromY: 104, rotate: '28deg', start: 0.14 },
    { key: 'violet-center', shape: bar(MARK_VIOLET_BARS[0], theme.colors.accentViolet), fromX: -6, fromY: 132, rotate: '-18deg', start: 0.22 },
    { key: 'violet-right', shape: bar(MARK_VIOLET_BARS[1], theme.colors.accentViolet), fromX: 100, fromY: 96, rotate: '-30deg', start: 0.3 },
  ];

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: SIZE, height: HEIGHT, alignSelf: 'center', marginVertical: theme.spacing.xxxl }}
    >
      {pieces.map((piece) => {
        const inputRange = [piece.start, 1];
        return (
          <Animated.View
            key={piece.key}
            style={{
              position: 'absolute',
              width: SIZE,
              height: HEIGHT,
              opacity: progress.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.25, 0.8, 1] }),
              transform: [
                { translateX: progress.interpolate({ inputRange, outputRange: [piece.fromX, 0], extrapolate: 'clamp' }) },
                { translateY: progress.interpolate({ inputRange, outputRange: [piece.fromY, 0], extrapolate: 'clamp' }) },
                { rotate: progress.interpolate({ inputRange, outputRange: [piece.rotate, '0deg'], extrapolate: 'clamp' }) },
              ],
            }}
          >
            <Svg width={SIZE} height={HEIGHT} viewBox={`0 0 ${MARK_VIEWBOX.width} ${MARK_VIEWBOX.height}`} fill="none">
              {piece.shape}
            </Svg>
          </Animated.View>
        );
      })}
    </View>
  );
}

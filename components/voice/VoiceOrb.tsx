import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Svg, { Defs, Path, RadialGradient, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';

export type VoiceOrbMode = 'idle' | 'listening' | 'speaking';

const SIZE = 220;
const CENTER = SIZE / 2;
const POINTS = 56;
const FRAME_MS = 33;

function blobPath(radius: number, time: number, seed: number, amplitude: number): string {
  const points = Array.from({ length: POINTS }, (_, index) => {
    const angle = (index / POINTS) * Math.PI * 2;
    const wave =
      Math.sin(angle * 3 + time * 1.3 + seed) * 0.5 +
      Math.sin(angle * 5 - time * 1.9 + seed * 2) * 0.32 +
      Math.sin(angle * 8 + time * 2.7 + seed * 3) * 0.18;
    const r = radius * (1 + wave * amplitude);
    return [CENTER + Math.cos(angle) * r, CENTER + Math.sin(angle) * r] as const;
  });
  const midpoint = (a: readonly [number, number], b: readonly [number, number]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
  const start = midpoint(points[POINTS - 1]!, points[0]!);
  let path = `M${start[0].toFixed(1)},${start[1].toFixed(1)}`;
  points.forEach((point, index) => {
    const end = midpoint(point, points[(index + 1) % POINTS]!);
    path += `Q${point[0].toFixed(1)},${point[1].toFixed(1)} ${end[0].toFixed(1)},${end[1].toFixed(1)}`;
  });
  return `${path}Z`;
}

function orbPaths(time: number, energy: number) {
  const amplitude = 0.035 + energy * 0.2;
  const grow = 1 + energy * 0.14;
  return {
    outer: blobPath(84 * grow, time * 0.8, 1.7, amplitude * 1.15),
    middle: blobPath(68 * grow, time, 3.1, amplitude),
    core: blobPath(48 * grow, time * 1.25, 5.3, amplitude * 0.8),
  };
}

// Dokunulabilir mikrofon yerine geçen küre: dinlerken ses seviyesine, konuşurken asistana göre şekillenir.
export function VoiceOrb({ mode, level }: { mode: VoiceOrbMode; level: number }) {
  const theme = useTheme();
  const [paths, setPaths] = useState(() => orbPaths(0, 0));
  const input = useRef({ mode, level });

  useEffect(() => {
    input.current = { mode, level };
  }, [mode, level]);

  useEffect(() => {
    let frame = 0;
    let cancelled = false;
    let last = 0;
    let energy = 0;
    const startedAt = Date.now();
    const tick = () => {
      if (cancelled) return;
      const now = Date.now();
      if (now - last >= FRAME_MS) {
        last = now;
        const time = (now - startedAt) / 1000;
        const current = input.current;
        const target =
          current.mode === 'listening'
            ? current.level
            : current.mode === 'speaking'
              ? 0.3 + Math.abs(Math.sin(time * 6.4) * Math.sin(time * 2.3)) * 0.42
              : 0;
        energy += (target - energy) * 0.2;
        setPaths(orbPaths(time, energy));
      }
      frame = requestAnimationFrame(tick);
    };
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!reduced && !cancelled) frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <View style={{ width: SIZE, height: SIZE }}>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Defs>
          <RadialGradient id="orbOuter" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={theme.colors.accentViolet} stopOpacity={0.5} />
            <Stop offset="1" stopColor={theme.colors.accentViolet} stopOpacity={0.08} />
          </RadialGradient>
          <RadialGradient id="orbMiddle" cx="42%" cy="38%" r="70%">
            <Stop offset="0" stopColor={theme.colors.payable} stopOpacity={0.9} />
            <Stop offset="1" stopColor={theme.colors.accentViolet} stopOpacity={0.75} />
          </RadialGradient>
          <RadialGradient id="orbCore" cx="40%" cy="34%" r="75%">
            <Stop offset="0" stopColor={theme.colors.brandPrimary} stopOpacity={1} />
            <Stop offset="1" stopColor={theme.colors.brandPrimary} stopOpacity={0.72} />
          </RadialGradient>
        </Defs>
        <Path d={paths.outer} fill="url(#orbOuter)" />
        <Path d={paths.middle} fill="url(#orbMiddle)" />
        <Path d={paths.core} fill="url(#orbCore)" />
      </Svg>
    </View>
  );
}

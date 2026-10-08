import { useEffect, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, Image as SvgImage, LinearGradient, Mask, RadialGradient, Rect, Stop } from 'react-native-svg';

import { withAlpha } from '@/theme/colors';

// Ana Sayfa uyarı kartlarının (Gecikmiş, Nakit uyarısı, Akıllı öneri) zemini: tonun çapraz degradesi,
// sağ ortada ışıma ve üstten beyaz parlaklık. `id` aynı ekranda tekil olmalı (SVG degrade kimliği).
export function GlowBackground({ id, tone }: { id: string; tone: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <LinearGradient id={`${id}-base`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={tone} stopOpacity={0.16} />
          <Stop offset="1" stopColor={tone} stopOpacity={0.04} />
        </LinearGradient>
        <RadialGradient id={`${id}-glow`} cx="0.88" cy="0.55" r="0.75">
          <Stop offset="0" stopColor={tone} stopOpacity={0.4} />
          <Stop offset="1" stopColor={tone} stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id={`${id}-sheen`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.09} />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}-base)`} />
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}-glow)`} />
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}-sheen)`} />
    </Svg>
  );
}

/** Kartın sağ üstündeki yarı saydam koyu daire ok (uyarı kartlarıyla aynı). */
export function GlowChevron() {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withAlpha('#000000', 0.4),
        borderWidth: 1,
        borderColor: withAlpha('#FFFFFF', 0.1),
      }}
    >
      <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
    </View>
  );
}

/** İçeriği ilk çizimde yumuşakça belirtir (opaklık + 8 pt yukarı kayma). */
export function FadeIn({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 320, delay, useNativeDriver: true }).start();
  }, [progress, delay]);
  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Kartın sağ alt köşesine yaslanan, kartın içine doğru şeffaflaşarak kaybolan illüstrasyon.
 * Maske sol üstte tamamen saydam, sağ altta tamamen opaktır; görselin bir kısmı kartın dışında kalır.
 */
export function FadedArt({
  id,
  source,
  width,
  height,
  right = -40,
  bottom = -48,
}: {
  id: string;
  source: ImageSourcePropType;
  width: number;
  height: number;
  right?: number;
  bottom?: number;
}) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', right, bottom, width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={`${id}-fade`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0.15" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0.75} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={1} />
          </LinearGradient>
          <Mask id={`${id}-mask`}>
            <Rect x="0" y="0" width={width} height={height} fill={`url(#${id}-fade)`} />
          </Mask>
        </Defs>
        <SvgImage
          href={source}
          x="0"
          y="0"
          width={width}
          height={height}
          preserveAspectRatio="xMidYMid meet"
          mask={`url(#${id}-mask)`}
        />
      </Svg>
    </View>
  );
}

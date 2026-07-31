import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

export interface ProgressRingProps {
  size: number;
  /** 0-1 arası doluluk oranı. */
  progress: number;
  color: string;
  trackColor: string;
  strokeWidth?: number;
  /** Yayın ucuna yuvarlak kapak koyar (docs/08-tasarim-sistemi.md — "ilerleme halkası"). */
  cap?: boolean;
}

type ArcSide = 'left' | 'right';

interface ArcProps {
  size: number;
  strokeWidth: number;
  color: string;
  /** 12 yönünden saat yönünde derece. */
  rotation: number;
  side: ArcSide;
}

// react-native-svg bağımlılığı (ve yeni bir native build) gerektirmemek için halka
// saf View ile çizilir: dört kenarı ayrı renklendirilebilen yuvarlak bir View'da iki
// kenar transparent bırakılınca 180°'lik bir yay kalır. Bir yay sağ, diğeri sol yarıya
// kırpılıp döndürülerek 0-360° arası her doluluk elde edilir.
function Arc({ size, strokeWidth, color, rotation, side }: ArcProps) {
  const half = size / 2;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: side === 'left' ? 0 : half,
        width: half,
        height: size,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 0,
          // Yay kutusu her zaman halkanın tamamını kaplar; böylece dönüş merkezi
          // kırpma penceresinin değil halkanın merkezi olur.
          left: side === 'left' ? 0 : -half,
          width: size,
          height: size,
          borderRadius: half,
          borderWidth: strokeWidth,
          borderTopColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
          borderLeftColor: color,
          // Kenar renkleri 45°'lik köşegenlerde birleştiği için alt+sol kenar 135°-315°
          // arasını kaplar; +45° ile sol yarıya (180°-360°) hizalanır.
          transform: [{ rotate: `${45 + rotation}deg` }],
        }}
      />
    </View>
  );
}

export function ProgressRing({
  size,
  progress,
  color,
  trackColor,
  strokeWidth = 8,
  cap = false,
  children,
}: PropsWithChildren<ProgressRingProps>) {
  const clamped = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const angle = clamped * 360;
  const half = size / 2;
  const capSize = strokeWidth + 2;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: half,
          borderWidth: strokeWidth,
          borderColor: trackColor,
        }}
      />
      {/* Sağ yarı ilk 180°'yi, sol yarı kalanını gösterir. */}
      <Arc side="right" size={size} strokeWidth={strokeWidth} color={color} rotation={Math.min(angle, 180)} />
      <Arc side="left" size={size} strokeWidth={strokeWidth} color={color} rotation={Math.max(angle, 180)} />
      {cap && clamped > 0 ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: size,
            height: size,
            alignItems: 'center',
            transform: [{ rotate: `${angle}deg` }],
          }}
        >
          <View
            style={{
              width: capSize,
              height: capSize,
              borderRadius: capSize / 2,
              backgroundColor: color,
              marginTop: (strokeWidth - capSize) / 2,
            }}
          />
        </View>
      ) : null}
      {children}
    </View>
  );
}

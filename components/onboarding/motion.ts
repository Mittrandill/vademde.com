import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';

// docs/08-tasarim-sistemi.md §12.19 — hareket bilgi taşımaz, destekler; sistem ayarında hareketi
// azalt açıksa tüm giriş animasyonları atlanır ve öğeler son hâlleriyle çizilir.
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

interface StagedOptions {
  /** İlk öğenin başlama gecikmesi (ms). */
  base?: number;
  /** Öğeler arası gecikme (ms). */
  step?: number;
  duration?: number;
}

// Sahne aktif olduğunda öğeleri sırayla 0→1 giriş değerine taşır; sahneden çıkınca sıfırlar ki
// kullanıcı geri döndüğünde animasyon yeniden oynasın.
export function useStaged(count: number, active: boolean, { base = 200, step = 160, duration = 450 }: StagedOptions = {}) {
  const reduceMotion = useReduceMotion();
  const values = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current;

  useEffect(() => {
    if (!active) {
      values.forEach((value) => value.setValue(0));
      return undefined;
    }
    if (reduceMotion) {
      values.forEach((value) => value.setValue(1));
      return undefined;
    }
    const animations = values.map((value, index) =>
      Animated.timing(value, { toValue: 1, duration, delay: base + index * step, useNativeDriver: true })
    );
    Animated.parallel(animations).start();
    return () => animations.forEach((animation) => animation.stop());
  }, [active, reduceMotion, values, base, step, duration]);

  return values;
}

// Aşağıdan yukarı belirerek gelme.
export function fadeUp(value: Animated.Value, distance = 14) {
  return {
    opacity: value,
    transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }],
  };
}

// Hafif büyüyerek belirerek gelme.
export function popIn(value: Animated.Value) {
  return {
    opacity: value,
    transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
  };
}

// Sahne aktifken sonsuz "nefes alma" döngüsü (0↔1); pasifken durur.
export function useLoop(active: boolean, durationMs: number): Animated.Value {
  const reduceMotion = useReduceMotion();
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active || reduceMotion) {
      value.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: durationMs, useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: durationMs, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, reduceMotion, value, durationMs]);

  return value;
}

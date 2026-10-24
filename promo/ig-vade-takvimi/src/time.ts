import { motionValue, useTransform } from 'framer-motion';

/**
 * Videonun tek saati. Render sırasında her kare için `time.set(saniye)` çağrılır;
 * tüm hareketler bu MotionValue'dan türetilir, bu yüzden çıktı kare kare aynıdır
 * (gerçek zamana, rAF hızına ya da makineye bağlı değildir).
 */
export const time = motionValue(0);

export function useT<T>(fn: (t: number) => T) {
  return useTransform(time, fn);
}

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** t, [a, b] aralığında 0→1 ilerleme. */
export const prog = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

export const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
export const easeInCubic = (p: number) => p * p * p;
export const easeInOutCubic = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
export const easeOutExpo = (p: number) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));

/** Sönümlü yay: hafif taşıp yerine oturur (Framer Motion spring hissi, deterministik). */
export const spring = (p: number, bounce = 1) => {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  return 1 - Math.exp(-6.5 * p) * Math.cos(bounce * 9 * p);
};

/** Belirli bir zamandan sonra `dur` saniyede yaylanarak 0→1. */
export const springAt = (t: number, start: number, dur = 0.7, bounce = 1) =>
  spring(prog(t, start, start + dur), bounce);

/** Türkçe para biçimi: 979911.79 → "979.911,79" */
export function trMoney(n: number, decimals = 2) {
  const fixed = Math.abs(n).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '−' : '') + grouped + (decimals ? ',' + frac : '');
}

/** Sayaç: start→end arasında 0'dan hedefe hızlıca yaklaşan değer. */
export const countUp = (t: number, start: number, end: number, target: number) =>
  target * easeOutExpo(prog(t, start, end));

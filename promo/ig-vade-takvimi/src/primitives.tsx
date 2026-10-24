import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { darkColors as C } from '../../../theme/colors';
import { INTER_BASELINE, SRC_W } from './layout';
import { easeOutCubic, prog, trMoney, countUp, useT } from './time';

/** Ekran görüntüsünden bir dikdörtgen parça. Varsayılan olarak kendi yerinde çizilir. */
export function Slice({
  src,
  imgH,
  sx,
  sy,
  sw,
  sh,
  style,
}: {
  src: string;
  imgH: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  style?: Record<string, unknown>;
}) {
  return (
    <motion.div
      style={{
        position: 'absolute',
        left: sx,
        top: sy,
        width: sw,
        height: sh,
        backgroundImage: `url(${src})`,
        backgroundSize: `${SRC_W}px ${imgH}px`,
        backgroundPosition: `${-sx}px ${-sy}px`,
        ...style,
      }}
    />
  );
}

/** Orijinal metni örten düz renk yama. */
export function Patch({
  x0,
  x1,
  y0,
  y1,
  color,
  radius = 0,
}: {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  color: string;
  radius?: number;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x0,
        top: y0,
        width: x1 - x0,
        height: y1 - y0,
        background: color,
        borderRadius: radius,
      }}
    />
  );
}

/**
 * 0'dan hedefe sayan tutar. Taban çizgisi `baseline` y'sine oturur; `align` ile
 * soldan (`x` sol kenar) ya da sağdan (`x` sağ kenar) ya da ortadan hizalanır.
 */
export function Counter({
  value,
  decimals = 2,
  prefix = '₺',
  start,
  end,
  x,
  baseline,
  size,
  weight = 700,
  color = C.textPrimary,
  align = 'left',
  letterSpacing = -0.5,
  hideAt,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  start: number;
  end: number;
  x: number;
  baseline: number;
  size: number;
  weight?: number;
  color?: string;
  align?: 'left' | 'right' | 'center';
  letterSpacing?: number;
  /** Orijinal piksele geçiş anı: sayaç sönerken orijinal parça belirir. */
  hideAt?: number;
}) {
  const text = useT((t) => prefix + trMoney(countUp(t, start, end, value), decimals));
  const opacity = useT((t) =>
    t < start - 0.05 ? 0 : hideAt === undefined ? 1 : 1 - prog(t, hideAt, hideAt + 0.15),
  );
  const width = 700;
  const left = align === 'left' ? x : align === 'right' ? x - width : x - width / 2;
  const style: CSSProperties = {
    position: 'absolute',
    left,
    width,
    top: baseline - INTER_BASELINE * size,
    fontSize: size,
    lineHeight: 1,
    fontWeight: weight,
    color,
    textAlign: align,
    letterSpacing,
    fontFeatureSettings: '"tnum" 1',
    whiteSpace: 'nowrap',
  };
  return <motion.div style={{ ...style, opacity }}>{text}</motion.div>;
}

/** Dokunma göstergesi: genişleyen halka + basılı nokta. */
export function TapRing({ x, y, at }: { x: number; y: number; at: number }) {
  const ring = useT((t) => {
    const p = prog(t, at, at + 0.45);
    return `translate(-50%, -50%) scale(${0.5 + easeOutCubic(p) * 1.1})`;
  });
  const ringOpacity = useT((t) => (t < at ? 0 : 0.7 * (1 - prog(t, at + 0.05, at + 0.45))));
  const dotOpacity = useT((t) => (t < at - 0.08 ? 0 : 0.45 * (1 - prog(t, at + 0.12, at + 0.3))));
  const base: CSSProperties = {
    position: 'absolute',
    left: x,
    top: y,
    borderRadius: '50%',
  };
  return (
    <>
      <motion.div
        style={{
          ...base,
          width: 150,
          height: 150,
          border: '6px solid rgba(255,255,255,0.9)',
          transform: ring,
          opacity: ringOpacity,
        }}
      />
      <motion.div
        style={{
          ...base,
          width: 96,
          height: 96,
          background: 'rgba(255,255,255,0.85)',
          transform: 'translate(-50%, -50%)',
          opacity: dotOpacity,
        }}
      />
    </>
  );
}

/** Temiz iOS durum çubuğu (9:41, tam pil) — ekran görüntülerindeki gerçek saat/şebekeyi örter. */
export function StatusBar({ bg }: { bg: string }) {
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: SRC_W, height: 140, background: bg }}>
      <div
        style={{
          position: 'absolute',
          left: 92,
          top: 46,
          fontSize: 40,
          fontWeight: 600,
          color: '#fff',
          letterSpacing: -0.5,
        }}
      >
        9:41
      </div>
      <div
        style={{
          position: 'absolute',
          left: 315,
          top: 27,
          width: 293,
          height: 86,
          borderRadius: 43,
          background: '#000',
        }}
      />
      <svg style={{ position: 'absolute', left: 655, top: 48 }} width="200" height="44" viewBox="0 0 200 44">
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={i * 13} y={30 - i * 8} width="9" height={10 + i * 8} rx="2.5" fill="#fff" />
        ))}
        <path
          d="M84 14a28 28 0 0 1 38 0l-4 4.5a21.5 21.5 0 0 0-30 0zM90.5 21.5a18.5 18.5 0 0 1 25 0l-4.2 4.6a12 12 0 0 0-16.6 0zM97 29a8.5 8.5 0 0 1 12 0l-6 6.4z"
          fill="#fff"
        />
        <rect x="136" y="8" width="52" height="28" rx="8" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2.5" />
        <rect x="140.5" y="12.5" width="43" height="19" rx="4.5" fill="#fff" />
        <rect x="191" y="17" width="4" height="10" rx="2" fill="rgba(255,255,255,0.45)" />
      </svg>
    </div>
  );
}

export function Hl({ children }: { children: ReactNode }) {
  return <span style={{ color: C.brandPrimary }}>{children}</span>;
}

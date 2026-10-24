import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { darkColors as C } from '../../../theme/colors';
import { CANVAS_W, HEADLINE_TOP } from './layout';
import { easeInCubic, easeOutCubic, prog, springAt, useT } from './time';

function Line({
  children,
  inAt,
  outAt,
  size,
}: {
  children: ReactNode;
  inAt: number;
  outAt: number;
  size: number;
}) {
  const opacity = useT((t) =>
    Math.min(easeOutCubic(prog(t, inAt, inAt + 0.3)), 1 - prog(t, outAt, outAt + 0.18)),
  );
  const y = useT((t) => (1 - springAt(t, inAt, 0.65)) * 60 - easeInCubic(prog(t, outAt, outAt + 0.22)) * 50);
  const filter = useT(
    (t) => `blur(${((1 - prog(t, inAt, inAt + 0.28)) * 12 + prog(t, outAt, outAt + 0.18) * 10).toFixed(2)}px)`,
  );
  return (
    <motion.div style={{ opacity, y, filter, fontSize: size, lineHeight: 1.04, whiteSpace: 'nowrap' }}>
      {children}
    </motion.div>
  );
}

/** Üst başlık: satırlar sırayla yaylanarak girer, birlikte yukarı süzülüp çıkar. */
export function Headline({
  lines,
  inAt,
  outAt,
  size = 80,
  top = HEADLINE_TOP,
}: {
  lines: ReactNode[];
  inAt: number;
  outAt: number;
  size?: number;
  top?: number;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top,
        width: CANVAS_W,
        textAlign: 'center',
        fontFamily: '"Inter Display", Inter, sans-serif',
        fontWeight: 800,
        letterSpacing: -2.4,
        color: C.textPrimary,
      }}
    >
      {lines.map((line, i) => (
        <Line key={i} inAt={inAt + i * 0.09} outAt={outAt} size={size}>
          {line}
        </Line>
      ))}
    </div>
  );
}

/** Başlığın altında küçük açıklama satırı. */
export function Subline({ children, inAt, outAt, top }: { children: ReactNode; inAt: number; outAt: number; top: number }) {
  const opacity = useT((t) => Math.min(easeOutCubic(prog(t, inAt, inAt + 0.3)), 1 - prog(t, outAt, outAt + 0.18)));
  const y = useT((t) => (1 - springAt(t, inAt, 0.6)) * 24);
  return (
    <motion.div
      style={{
        position: 'absolute',
        left: 0,
        top,
        width: CANVAS_W,
        textAlign: 'center',
        fontSize: 38,
        fontWeight: 500,
        color: C.textSecondary,
        opacity,
        y,
      }}
    >
      {children}
    </motion.div>
  );
}

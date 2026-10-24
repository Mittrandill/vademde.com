import { motion } from 'framer-motion';
import { darkColors as C } from '../../../theme/colors';
import { CANVAS_W } from './layout';
import { easeInCubic, easeOutCubic, prog, springAt, useT } from './time';
import icon from '../assets/brand/icon.png';
import wordmark from '../assets/brand/wordmark.png';

export const STAMPS = [13.7, 13.95];

function Stamp({ text, at, top, rot }: { text: string; at: number; top: number; rot: number }) {
  const transform = useT((t) => {
    const p = prog(t, at, at + 0.16);
    const settle = Math.sin(Math.PI * prog(t, at + 0.16, at + 0.4)) * 0.05;
    const scale = 2.6 - 1.6 * easeInCubic(p) - settle;
    return `translateX(-50%) rotate(${rot}deg) scale(${scale})`;
  });
  const opacity = useT((t) => (t < at ? 0 : Math.min(1, prog(t, at, at + 0.08))));
  return (
    <motion.div
      style={{
        position: 'absolute',
        left: CANVAS_W / 2,
        top,
        transform,
        opacity,
        padding: '14px 40px',
        border: `6px solid ${C.brandPrimary}`,
        borderRadius: 22,
        background: 'rgba(255,176,0,0.10)',
        color: C.brandPrimary,
        fontSize: 56,
        fontWeight: 900,
        letterSpacing: 4,
        whiteSpace: 'nowrap',
        boxShadow: `0 0 50px rgba(255,176,0,0.25)`,
      }}
    >
      {text}
    </motion.div>
  );
}

export function EndCard() {
  const glow = useT((t) => easeOutCubic(prog(t, 12.95, 13.6)));
  const iconScale = useT((t) => springAt(t, 13.1, 0.7, 1.2));
  const wordOpacity = useT((t) => easeOutCubic(prog(t, 13.28, 13.55)));
  const wordY = useT((t) => (1 - springAt(t, 13.28, 0.6)) * 40);
  const tagOpacity = useT((t) => easeOutCubic(prog(t, 13.42, 13.7)));
  const tagY = useT((t) => (1 - springAt(t, 13.42, 0.6)) * 40);
  const storeOpacity = useT((t) => easeOutCubic(prog(t, 14.3, 14.6)));
  return (
    <>
      <motion.div
        style={{
          position: 'absolute',
          left: CANVAS_W / 2 - 600,
          top: 0,
          width: 1200,
          height: 1300,
          background: 'radial-gradient(closest-side, rgba(255,176,0,0.28), rgba(255,176,0,0) 100%)',
          opacity: glow,
        }}
      />
      <motion.img
        src={icon}
        style={{
          position: 'absolute',
          left: CANVAS_W / 2 - 115,
          top: 300,
          width: 230,
          height: 230,
          borderRadius: 52,
          boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
          scale: iconScale,
        }}
      />
      <motion.img
        src={wordmark}
        style={{ position: 'absolute', left: CANVAS_W / 2 - 230, top: 572, width: 460, opacity: wordOpacity, y: wordY }}
      />
      <motion.div
        style={{
          position: 'absolute',
          left: 0,
          top: 724,
          width: CANVAS_W,
          textAlign: 'center',
          fontFamily: '"Inter Display", Inter, sans-serif',
          fontSize: 54,
          fontWeight: 700,
          letterSpacing: -1.2,
          lineHeight: 1.15,
          color: C.textPrimary,
          opacity: tagOpacity,
          y: tagY,
        }}
      >
        Çek, senet, fatura, kredi.
        <br />
        <span style={{ color: C.brandPrimary }}>Tüm vadeler tek takvimde.</span>
      </motion.div>
      <Stamp text="REKLAMSIZ" at={STAMPS[0]} top={920} rot={-5} />
      <Stamp text="İNDİRMESİ ÜCRETSİZ" at={STAMPS[1]} top={1050} rot={3} />
      <motion.div
        style={{
          position: 'absolute',
          left: 0,
          top: 1196,
          width: CANVAS_W,
          textAlign: 'center',
          fontSize: 36,
          fontWeight: 600,
          color: C.textSecondary,
          opacity: storeOpacity,
        }}
      >
        App Store ve Google Play'de
      </motion.div>
    </>
  );
}

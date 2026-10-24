import { motion } from 'framer-motion';
import { darkColors as C } from '../../../theme/colors';
import { CANVAS_W } from './layout';
import { easeInOutCubic, easeOutCubic, prog, springAt, useT } from './time';
import icon from '../assets/brand/icon.png';
import wordmark from '../assets/brand/wordmark.png';
import appStore from '../assets/brand/app-store.svg';
import googlePlay from '../assets/brand/google-play.svg';

/** Uygulamanın kart dilinde vaat çipi: yeşil onay + metin. */
function Promise({ text, at }: { text: string; at: number }) {
  const opacity = useT((t) => easeOutCubic(prog(t, at, at + 0.3)));
  const y = useT((t) => (1 - springAt(t, at, 0.7, 0.9)) * 36);
  const check = useT((t) => springAt(t, at + 0.12, 0.5, 1.3));
  return (
    <motion.div
      style={{
        opacity,
        y,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '18px 30px 18px 18px',
        borderRadius: 999,
        background: C.surfacePrimary,
        border: `2px solid ${C.border}`,
        fontSize: 38,
        fontWeight: 600,
        letterSpacing: -0.4,
        color: C.textPrimary,
        whiteSpace: 'nowrap',
      }}
    >
      <motion.div
        style={{
          scale: check,
          width: 48,
          height: 48,
          borderRadius: 24,
          background: C.receivable,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24">
          <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={C.onAction} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </motion.div>
      {text}
    </motion.div>
  );
}

function Badge({ src, at, height, width }: { src: string; at: number; height: number; width: number }) {
  const opacity = useT((t) => easeOutCubic(prog(t, at, at + 0.3)));
  const y = useT((t) => (1 - springAt(t, at, 0.7, 0.9)) * 40);
  return <motion.img src={src} style={{ opacity, y, height, width }} />;
}

export function EndCard() {
  const glow = useT((t) => easeOutCubic(prog(t, 12.95, 13.6)));
  const iconScale = useT((t) => springAt(t, 13.1, 0.7, 1.2));
  const wordOpacity = useT((t) => easeOutCubic(prog(t, 13.28, 13.55)));
  const wordY = useT((t) => (1 - springAt(t, 13.28, 0.6)) * 40);
  const tagOpacity = useT((t) => easeOutCubic(prog(t, 13.42, 13.7)));
  const tagY = useT((t) => (1 - springAt(t, 13.42, 0.6)) * 40);
  // Rozetler oturduktan sonra üstlerinden geçen ince parlama
  const shine = useT((t) => `translateX(${-400 + 1100 * easeInOutCubic(prog(t, 14.7, 15.3))}px) skewX(-20deg)`);
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
          top: 290,
          width: 230,
          height: 230,
          borderRadius: 52,
          boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
          scale: iconScale,
        }}
      />
      <motion.img
        src={wordmark}
        style={{ position: 'absolute', left: CANVAS_W / 2 - 230, top: 560, width: 460, opacity: wordOpacity, y: wordY }}
      />
      <motion.div
        style={{
          position: 'absolute',
          left: 0,
          top: 710,
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
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 892,
          width: CANVAS_W,
          display: 'flex',
          justifyContent: 'center',
          gap: 20,
        }}
      >
        <Promise text="Reklam yok" at={13.65} />
        <Promise text="İndirmesi ücretsiz" at={13.8} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 1040,
          width: CANVAS_W,
          display: 'flex',
          justifyContent: 'center',
          gap: 28,
        }}
      >
        <div style={{ position: 'relative', display: 'flex', gap: 28, overflow: 'hidden', borderRadius: 16 }}>
          <Badge src={appStore} at={14.05} height={104} width={(104 * 135) / 40} />
          <Badge src={googlePlay} at={14.18} height={104} width={(104 * 135) / 40} />
          <motion.div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: 120,
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)',
              transform: shine,
            }}
          />
        </div>
      </div>
    </>
  );
}

import { motion } from 'framer-motion';
import { darkColors as C } from '../../../theme/colors';
import { BEZEL, K, PHONE_X, PHONE_Y, SCREEN_H, SCREEN_RADIUS, SCREEN_W, SRC_H, SRC_W } from './layout';
import { Counter, Patch, Slice, StatusBar, TapRing } from './primitives';
import {
  easeInCubic,
  easeInOutCubic,
  easeOutCubic,
  prog,
  spring,
  springAt,
  useT,
} from './time';
import takvimTall from '../assets/screens/takvim-tall.png';
import tabbar from '../assets/screens/tabbar.png';
import fab from '../assets/screens/fab.png';
import home from '../assets/screens/home.png';
import homeErased from '../assets/screens/home-erased.png';
import tara from '../assets/screens/tara.png';
import rev from '../assets/screens/rev.png';

const TALL_H = 2286;
const SCROLL = 491;

// ---------------------------------------------------------------- Takvim

const DOTS: [number, string][] = [
  [240, C.receivable],
  [350, C.danger],
  [461, C.danger],
  [571, C.receivable],
  [761, C.danger],
  [782, C.receivable],
  [803, C.accentViolet],
  [824, C.brandPrimary],
];

const RINGS = [
  { cx: 172, frac: 0.14, track: '#434548', fill: '#A3A5A0', value: 20495.74, color: C.textPrimary, x0: 76, x1: 268 },
  { cx: 461, frac: 0.88, track: '#2E4A3E', fill: C.receivable, value: 148400, color: C.receivable, x0: 340, x1: 584 },
  { cx: 751, frac: 0.8, track: '#2E4A3E', fill: C.receivable, value: 127904.26, color: C.receivable, x0: 628, x1: 872 },
];
const RING_CY = 1155;
const RING_R = 55;

/** Takvimdeki kartlar (uzun sayfa koordinatları). */
const CARDS: [number, number][] = [
  [1348, 1586],
  [1597, 1782],
  [1795, 2032],
  [2044, 2280],
];

function Dot({ x, color, at }: { x: number; color: string; at: number }) {
  const scale = useT((t) => springAt(t, at, 0.5, 1.4));
  return (
    <motion.div
      style={{
        position: 'absolute',
        left: x - 7,
        top: 769,
        width: 14,
        height: 14,
        borderRadius: 7,
        background: color,
        scale,
      }}
    />
  );
}

function Ring({ ring, at }: { ring: (typeof RINGS)[number]; at: number }) {
  const length = useT((t) => ring.frac * easeOutCubic(prog(t, at, at + 0.9)));
  return (
    <svg
      style={{ position: 'absolute', left: ring.cx - 80, top: RING_CY - 80, overflow: 'visible' }}
      width="160"
      height="160"
    >
      <circle cx="80" cy="80" r={RING_R} fill="none" stroke={C.surfacePrimary} strokeWidth="20" />
      <circle cx="80" cy="80" r={RING_R} fill="none" stroke={ring.track} strokeWidth="12" />
      <motion.circle
        cx="80"
        cy="80"
        r={RING_R}
        fill="none"
        stroke={ring.fill}
        strokeWidth="12"
        strokeLinecap="round"
        transform="rotate(-90 80 80)"
        style={{ pathLength: length }}
      />
    </svg>
  );
}

function Card({ y0, y1, at }: { y0: number; y1: number; at: number }) {
  const x = useT((t) => (1 - springAt(t, at, 0.75, 0.9)) * 220);
  const opacity = useT((t) => easeOutCubic(prog(t, at, at + 0.25)));
  return <Slice src={takvimTall} imgH={TALL_H} sx={40} sy={y0} sw={845} sh={y1 - y0} style={{ x, opacity }} />;
}

function TakvimScreen() {
  const y = useT((t) => -SCROLL * easeInOutCubic(prog(t, 6.3, 7.05)));
  const opacity = useT((t) => 1 - prog(t, 7.45, 7.7));
  return (
    <motion.div style={{ position: 'absolute', inset: 0, opacity, background: C.backgroundPrimary }}>
      <motion.div style={{ position: 'absolute', left: 0, top: 0, width: SRC_W, height: TALL_H, y }}>
        <img src={takvimTall} style={{ position: 'absolute', left: 0, top: 0, width: SRC_W }} />
        <Patch x0={205} x1={852} y0={764} y1={790} color={C.surfacePrimary} />
        {DOTS.map(([x, color], i) => (
          <Dot key={i} x={x} color={color} at={4.0 + i * 0.07} />
        ))}
        {RINGS.map((r, i) => (
          <Ring key={i} ring={r} at={4.5 + i * 0.08} />
        ))}
        {RINGS.map((r, i) => (
          <Patch key={i} x0={r.x0} x1={r.x1} y0={1246} y1={1294} color={C.surfacePrimary} />
        ))}
        {RINGS.map((r, i) => (
          <Counter
            key={i}
            value={r.value}
            start={4.55 + i * 0.08}
            end={5.45}
            x={r.cx}
            align="center"
            baseline={1282}
            size={32}
            weight={600}
            color={r.color}
            letterSpacing={-0.2}
          />
        ))}
        <Patch x0={30} x1={900} y0={1338} y1={TALL_H} color={C.backgroundPrimary} />
        {CARDS.map(([y0, y1], i) => (
          <Card key={i} y0={y0} y1={y1} at={5.3 + i * 0.12} />
        ))}
      </motion.div>
      <img src={tabbar} style={{ position: 'absolute', left: 0, top: 1795, width: SRC_W }} />
      <img src={fab} style={{ position: 'absolute', left: 391, top: 1766, width: 140 }} />
      <StatusBar bg={C.backgroundPrimary} />
    </motion.div>
  );
}

// ---------------------------------------------------------------- Ana ekran

function HomeScreen() {
  const opacity = useT((t) => (t < 7.45 ? 0 : easeOutCubic(prog(t, 7.45, 7.75)) * (1 - prog(t, 9.85, 10.05))));
  const scale = useT((t) => 1.04 - 0.04 * easeOutCubic(prog(t, 7.45, 7.9)));
  const original = useT((t) => prog(t, 8.85, 9.0));
  const cardX = useT((t) => (1 - springAt(t, 8.3, 0.8, 0.9)) * 330);
  const cardOpacity = useT((t) => easeOutCubic(prog(t, 8.3, 8.55)));
  const glow = useT((t) => {
    const pulse = (a: number) => Math.sin(Math.PI * prog(t, a, a + 0.32));
    return Math.max(pulse(8.95), pulse(9.3) * 0.8);
  });
  return (
    <motion.div style={{ position: 'absolute', inset: 0, opacity, scale, background: C.backgroundPrimary }}>
      <img src={homeErased} style={{ position: 'absolute', left: 0, top: 0, width: SRC_W }} />
      <Counter value={979911} decimals={0} start={7.5} end={8.8} x={512} align="right" baseline={576} size={91} letterSpacing={-2.6} hideAt={8.85} />
      <Counter value={810078} start={7.55} end={8.8} x={96} baseline={853} size={47} letterSpacing={-0.8} hideAt={8.85} />
      <Counter value={3633100.38} start={7.55} end={8.8} x={483} baseline={853} size={47} letterSpacing={-0.8} hideAt={8.85} />
      <Slice src={home} imgH={SRC_H} sx={88} sy={496} sw={428} sh={98} style={{ opacity: original }} />
      <Slice src={home} imgH={SRC_H} sx={88} sy={808} sw={316} sh={64} style={{ opacity: original }} />
      <Slice src={home} imgH={SRC_H} sx={474} sy={808} sw={360} sh={64} style={{ opacity: original }} />
      {/* Gecikmiş kartı sağdan kayarak gelir ve kırmızı nabız atar */}
      <Patch x0={40} x1={SRC_W} y0={950} y1={1464} color={C.backgroundPrimary} />
      <Slice src={home} imgH={SRC_H} sx={40} sy={950} sw={SRC_W - 40} sh={514} style={{ x: cardX, opacity: cardOpacity }} />
      <motion.div
        style={{
          position: 'absolute',
          left: 47,
          top: 958,
          width: 763,
          height: 500,
          borderRadius: 50,
          border: `4px solid ${C.danger}`,
          boxShadow: `0 0 60px ${C.danger}`,
          opacity: glow,
        }}
      />
      <StatusBar bg={C.backgroundPrimary} />
      <TapRing x={461} y={1836} at={9.7} />
    </motion.div>
  );
}

// ---------------------------------------------------------------- Tarama

const DOC = { left: 178, top: 452, w: 567, h: 700 };

function FieldBox({
  x,
  y,
  w,
  h,
  label,
  at,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  at: number;
}) {
  const opacity = useT((t) => easeOutCubic(prog(t, at, at + 0.18)));
  const scale = useT((t) => 1.25 - 0.25 * springAt(t, at, 0.5));
  return (
    <motion.div style={{ position: 'absolute', left: x, top: y, width: w, height: h, opacity, scale }}>
      <div style={{ position: 'absolute', inset: 0, border: `4px solid ${C.brandPrimary}`, borderRadius: 10 }} />
      <div
        style={{
          position: 'absolute',
          right: -6,
          top: -34,
          padding: '3px 12px',
          borderRadius: 14,
          background: C.brandPrimary,
          color: C.onAction,
          fontSize: 22,
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        ✓ {label}
      </div>
    </motion.div>
  );
}

function Document() {
  const transform = useT((t) => {
    const s = springAt(t, 10.05, 0.8, 0.8);
    const driftX = Math.sin(t * 2.1) * 5;
    const driftR = Math.sin(t * 1.7) * 0.5;
    return `translate(${driftX}px, ${(1 - s) * 900}px) rotate(${(1 - s) * 12 + 1.2 + driftR}deg)`;
  });
  const scanY = useT((t) => DOC.h * easeInOutCubic(prog(t, 10.6, 11.2)));
  const scanOpacity = useT((t) => (t < 10.55 || t > 11.25 ? 0 : 1));
  const mono = '"DejaVu Sans Mono", monospace';
  const row = (n: string, date: string, amount: string) => (
    <div key={n} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: mono, fontSize: 22, color: '#3A3A38', marginTop: 12 }}>
      <span>{n}</span>
      <span>{date}</span>
      <span>{amount}</span>
    </div>
  );
  return (
    <motion.div
      style={{
        position: 'absolute',
        left: DOC.left,
        top: DOC.top,
        width: DOC.w,
        height: DOC.h,
        transform,
        background: '#FBF8F1',
        borderRadius: 8,
        boxShadow: '0 30px 60px rgba(0,0,0,0.6)',
        padding: '40px 40px',
        boxSizing: 'border-box',
        color: '#1F2126',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: 0.5 }}>ÖRNEK BANK A.Ş.</span>
        <span style={{ fontFamily: mono, fontSize: 18, color: '#8A8A84' }}>No 0047219</span>
      </div>
      <div style={{ fontSize: 34, fontWeight: 800, marginTop: 34, letterSpacing: 1 }}>KREDİ ÖDEME PLANI</div>
      <div style={{ fontSize: 22, color: '#77776F', marginTop: 8 }}>İhtiyaç kredisi · 24 ay</div>
      <div style={{ height: 2, background: '#DDD8CB', margin: '28px 0 10px' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 700, color: '#8A8A84' }}>
        <span>TAKSİT</span>
        <span>VADE</span>
        <span>TUTAR</span>
      </div>
      {row(' 1', '15.11.2026', '9.874,20')}
      {row(' 2', '15.12.2026', '9.874,20')}
      {row(' 3', '15.01.2027', '9.874,20')}
      {row(' 4', '15.02.2027', '9.874,20')}
      <div style={{ height: 2, background: '#DDD8CB', margin: '24px 0 18px' }} />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '14px 18px',
          borderRadius: 10,
          background: '#FCEBC2',
          border: `3px solid ${C.brandPrimary}`,
          fontWeight: 800,
          fontSize: 26,
        }}
      >
        <span>Ana para</span>
        <span style={{ fontFamily: mono }}>180.000,00</span>
      </div>
      <FieldBox x={28} y={26} w={330} h={50} label="Banka" at={10.78} />
      <FieldBox x={110} y={318} w={210} h={42} label="Vade" at={10.9} />
      <FieldBox x={26} y={566} w={515} h={74} label="Tutar" at={11.02} />
      <motion.div
        style={{
          position: 'absolute',
          left: -10,
          right: -10,
          top: 0,
          height: 6,
          y: scanY,
          opacity: scanOpacity,
          background: C.brandPrimary,
          boxShadow: `0 0 30px 10px ${C.brandPrimary}88`,
        }}
      />
    </motion.div>
  );
}

function TaraScreen() {
  const opacity = useT((t) => (t < 9.85 ? 0 : easeOutCubic(prog(t, 9.85, 10.05))));
  const pushX = useT((t) => -260 * easeOutCubic(prog(t, 11.5, 11.85)));
  const dim = useT((t) => 0.5 * prog(t, 11.5, 11.85));
  const chip = useT((t) => easeOutCubic(prog(t, 11.08, 11.3)));
  const chipY = useT((t) => (1 - springAt(t, 11.08, 0.5)) * 30);
  const shutter = useT((t) => {
    const p = prog(t, 11.22, 11.42);
    return `translate(-50%, -50%) scale(${1 - 0.14 * Math.sin(Math.PI * p)})`;
  });
  const flash = useT((t) => (t < 11.3 ? 0 : 0.85 * (1 - prog(t, 11.3, 11.6))));
  const vis = useT((t) => (t > 11.9 ? 0 : 1));
  return (
    <motion.div style={{ position: 'absolute', inset: 0, opacity, x: pushX, background: '#000' }}>
      <motion.div style={{ position: 'absolute', inset: 0, opacity: vis }}>
        <img src={tara} style={{ position: 'absolute', left: 0, top: 0, width: SRC_W }} />
        <Document />
        <motion.div
          style={{
            position: 'absolute',
            left: 461,
            top: 1268,
            transform: 'translate(-50%, -50%)',
            opacity: chip,
          }}
        >
          <motion.div
            style={{
              y: chipY,
              padding: '14px 30px',
              borderRadius: 40,
              background: C.backgroundPrimary,
              border: `2px solid ${C.border}`,
              fontSize: 30,
              fontWeight: 600,
              color: C.textPrimary,
              whiteSpace: 'nowrap',
              boxShadow: '0 0 0 40px #000',
            }}
          >
            <span style={{ color: C.receivable }}>●</span> 3 alan okundu · Güven %99
          </motion.div>
        </motion.div>
        <motion.div
          style={{
            position: 'absolute',
            left: 460,
            top: 1636,
            width: 178,
            height: 178,
            borderRadius: '50%',
            border: '8px solid #F4F3EF',
            boxSizing: 'border-box',
            background: '#000',
            transform: shutter,
          }}
        >
          <div style={{ position: 'absolute', inset: 10, borderRadius: '50%', background: '#F4F3EF' }} />
        </motion.div>
        <motion.div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: flash }} />
      </motion.div>
      <motion.div style={{ position: 'absolute', inset: 0, background: '#000', opacity: dim }} />
      <StatusBar bg="#000" />
    </motion.div>
  );
}

// ---------------------------------------------------------------- OCR onay

function Toast() {
  const y = useT((t) => -260 + 410 * springAt(t, 12.55, 0.7, 0.9));
  const opacity = useT((t) => (t < 12.5 ? 0 : 1));
  return (
    <motion.div
      style={{
        position: 'absolute',
        left: 50,
        right: 50,
        top: 0,
        y,
        opacity,
        padding: '26px 30px',
        borderRadius: 44,
        background: 'rgba(57,59,63,0.97)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        gap: 24,
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          background: C.receivable,
          color: C.onAction,
          fontSize: 44,
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ✓
      </div>
      <div>
        <div style={{ fontSize: 34, fontWeight: 700, color: C.textPrimary }}>Kayıt oluşturuldu</div>
        <div style={{ fontSize: 26, color: C.textSecondary, marginTop: 4 }}>Onayınızla · Kredi ₺180.000,00</div>
      </div>
    </motion.div>
  );
}

function RevScreen() {
  const x = useT((t) => (t < 11.5 ? SRC_W : SRC_W * (1 - easeOutCubic(prog(t, 11.5, 11.85)))));
  const original = useT((t) => prog(t, 12.25, 12.38));
  const chipGlow = useT((t) => Math.sin(Math.PI * prog(t, 11.9, 12.35)));
  const chipScale = useT((t) => 1 + 0.06 * Math.sin(Math.PI * prog(t, 11.9, 12.2)));
  const btn = useT((t) => 1 - 0.03 * Math.sin(Math.PI * prog(t, 12.36, 12.52)));
  return (
    <motion.div
      style={{ position: 'absolute', inset: 0, x, background: C.backgroundPrimary, boxShadow: '-30px 0 60px rgba(0,0,0,0.5)' }}
    >
      <img src={rev} style={{ position: 'absolute', left: 0, top: 0, width: SRC_W }} />
      <Patch x0={80} x1={400} y0={1530} y1={1598} color={C.surfacePrimary} />
      <Counter value={180000} start={11.75} end={12.25} x={86} baseline={1580} size={64} hideAt={12.25} letterSpacing={-1.4} prefix="" />
      <Slice src={rev} imgH={SRC_H} sx={80} sy={1530} sw={320} sh={68} style={{ opacity: original }} />
      <Slice src={rev} imgH={SRC_H} sx={66} sy={282} sw={240} sh={66} style={{ scale: chipScale }} />
      <motion.div
        style={{
          position: 'absolute',
          left: 66,
          top: 282,
          width: 240,
          height: 66,
          borderRadius: 33,
          border: `3px solid ${C.brandPrimary}`,
          boxShadow: `0 0 40px ${C.brandPrimary}`,
          opacity: chipGlow,
          scale: chipScale,
        }}
      />
      <Slice src={rev} imgH={SRC_H} sx={44} sy={1700} sw={836} sh={126} style={{ scale: btn }} />
      <StatusBar bg={C.backgroundPrimary} />
      <TapRing x={460} y={1762} at={12.4} />
      <Toast />
    </motion.div>
  );
}

// ---------------------------------------------------------------- Telefon

export function Phone() {
  const y = useT((t) => (1 - springAt(t, 3.3, 0.95, 0.75)) * 1500 + easeInCubic(prog(t, 12.9, 13.4)) * 380);
  const scale = useT((t) => 1 - 0.1 * easeInCubic(prog(t, 12.9, 13.4)));
  const opacity = useT((t) => (t < 3.25 ? 0 : 1 - prog(t, 13.05, 13.4)));
  const tilt = useT((t) => (1 - spring(prog(t, 3.3, 4.3))) * 8);
  return (
    <motion.div
      style={{
        position: 'absolute',
        left: PHONE_X - BEZEL,
        top: PHONE_Y - BEZEL,
        width: SCREEN_W + 2 * BEZEL,
        height: SCREEN_H + 2 * BEZEL,
        borderRadius: SCREEN_RADIUS + BEZEL,
        background: 'linear-gradient(160deg, #3A3C42, #0C0D10 40%, #0C0D10 70%, #2A2C31)',
        boxShadow: '0 60px 120px rgba(0,0,0,0.65), 0 0 0 2px #45474D',
        y,
        scale,
        opacity,
        rotateX: tilt,
        transformPerspective: 2000,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: BEZEL,
          top: BEZEL,
          width: SCREEN_W,
          height: SCREEN_H,
          borderRadius: SCREEN_RADIUS,
          overflow: 'hidden',
          background: C.backgroundPrimary,
        }}
      >
        <div style={{ position: 'absolute', left: 0, top: 0, width: SRC_W, height: SRC_H, transform: `scale(${K})`, transformOrigin: '0 0' }}>
          <TakvimScreen />
          <HomeScreen />
          <TaraScreen />
          <RevScreen />
        </div>
      </div>
    </motion.div>
  );
}

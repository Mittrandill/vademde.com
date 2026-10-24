import { motion } from 'framer-motion';
import { darkColors as C } from '../../../theme/colors';
import { easeInCubic, easeOutCubic, prog, spring, useT } from './time';

const HAND = 'Caveat, cursive';
const INK = '#2B2A28';
const PAGE = { x: 540, y: 1120, w: 800, h: 1040, rot: -4 };

/** Kâğıt notların renkleri: gerçek post-it tonları, uygulamanın Saffron/mor/yeşil yönüne yakın. */
const PAPER = {
  yellow: '#FFD94A',
  pink: '#FF9DB6',
  mint: '#8FE3C6',
  orange: '#FFB866',
  violet: '#BBA8FF',
};

type Note = {
  x: number;
  y: number;
  rot: number;
  color: string;
  lines: string[];
  /** Uçma sırası (0 ilk). */
  order: number;
  circle?: boolean;
};

const NOTES: Note[] = [
  { x: 320, y: 770, rot: -8, color: PAPER.yellow, lines: ["Ahmet'in çeki", '12 Kas?'], order: 1, circle: true },
  { x: 770, y: 820, rot: 7, color: PAPER.pink, lines: ['Elektrik', 'faturası!!'], order: 3 },
  { x: 555, y: 1085, rot: -3, color: PAPER.mint, lines: ['Kuzey İnşaat', 'çeki ne zaman??'], order: 0 },
  { x: 300, y: 1345, rot: 6, color: PAPER.orange, lines: ['Kredi taksiti', '???'], order: 5 },
  { x: 790, y: 1300, rot: -6, color: PAPER.violet, lines: ['Senet', '3 Ara'], order: 2 },
  { x: 560, y: 1585, rot: 4, color: PAPER.yellow, lines: ["Kira 5'inde", 'UNUTMA!'], order: 4 },
];

export const FLY_START = 2.05;
const FLY_STEP = 0.1;
const FLY_DUR = 0.5;

function PostIt({ note, index }: { note: Note; index: number }) {
  const flyAt = FLY_START + note.order * FLY_STEP;
  let dx = note.x - PAGE.x;
  let dy = note.y - PAGE.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  if (len < 80) {
    dx = 0.35;
    dy = -1;
  }
  const spin = (index % 2 ? 1 : -1) * (45 + index * 6);

  const transform = useT((t) => {
    const settle = spring(prog(t, -0.3 + index * 0.05, 0.25 + index * 0.05));
    const panic = prog(t, 0.55, 1.5) * (1 - prog(t, FLY_START - 0.25, FLY_START));
    const lift = easeOutCubic(prog(t, flyAt - 0.18, flyAt));
    const fly = easeInCubic(prog(t, flyAt, flyAt + FLY_DUR));
    const shakeR = Math.sin(t * 38 + index * 1.7) * 2.2 * panic;
    const shakeX = Math.sin(t * 47 + index * 2.3) * 4 * panic;
    const x = note.x + shakeX + dx * 1900 * fly;
    const y = note.y + dy * 1900 * fly - 260 * fly;
    const scale = (0.86 + 0.14 * settle) * (1 + 0.07 * lift) * (1 - 0.15 * fly);
    const rot = note.rot + shakeR + spin * fly;
    return `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${rot}deg) scale(${scale})`;
  });
  const shadow = useT((t) => {
    const lift = easeOutCubic(prog(t, flyAt - 0.18, flyAt));
    return `0 ${10 + 26 * lift}px ${24 + 40 * lift}px rgba(0,0,0,${0.32 + 0.2 * lift})`;
  });
  const blur = useT((t) => `blur(${(prog(t, flyAt + 0.12, flyAt + FLY_DUR) * 6).toFixed(2)}px)`);
  const circle = useT((t) => easeOutCubic(prog(t, 0.35, 0.95)));

  return (
    <motion.div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 340,
        height: 300,
        background: `linear-gradient(170deg, ${note.color} 0%, ${note.color} 78%, rgba(0,0,0,0.06) 100%), ${note.color}`,
        boxShadow: shadow,
        transform,
        filter: blur,
        padding: '46px 30px 0',
        boxSizing: 'border-box',
        fontFamily: HAND,
        fontWeight: 700,
        fontSize: 58,
        lineHeight: 1.02,
        color: INK,
        textAlign: 'center',
      }}
    >
      {/* yapışkan şerit gölgesi */}
      <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: 26, background: 'rgba(0,0,0,0.05)' }} />
      {note.lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
      {note.circle && (
        <svg style={{ position: 'absolute', left: 60, top: 98, overflow: 'visible' }} width="220" height="96">
          <motion.path
            d="M28 50 C 20 14, 190 4, 206 40 C 220 78, 60 98, 22 70 C 6 58, 30 30, 70 22"
            fill="none"
            stroke="#E5322D"
            strokeWidth="6"
            strokeLinecap="round"
            style={{ pathLength: circle }}
          />
        </svg>
      )}
    </motion.div>
  );
}

function Agenda() {
  const pageOut = FLY_START + 0.72;
  const transform = useT((t) => {
    const out = easeInCubic(prog(t, pageOut, pageOut + 0.55));
    const settle = spring(prog(t, -0.35, 0.3));
    return `translate(${PAGE.x}px, ${PAGE.y + 1300 * out}px) translate(-50%, -50%) rotate(${PAGE.rot - 14 * out}deg) scale(${0.94 + 0.06 * settle})`;
  });
  const opacity = useT((t) => 1 - prog(t, pageOut + 0.3, pageOut + 0.55));
  return (
    <motion.div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: PAGE.w,
        height: PAGE.h,
        transform,
        opacity,
        borderRadius: 18,
        background: `repeating-linear-gradient(180deg, transparent 0 62px, rgba(70,110,170,0.28) 62px 64px), #F3EDDD`,
        boxShadow: '0 40px 90px rgba(0,0,0,0.55)',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', left: 96, top: 0, bottom: 0, width: 3, background: 'rgba(220,70,70,0.5)' }} />
      {/* spiral delikleri */}
      {Array.from({ length: 14 }).map((_, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: 30,
            top: 40 + i * 72,
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: '#1A1B1F',
            boxShadow: 'inset 0 3px 4px rgba(0,0,0,0.6)',
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          left: 130,
          top: 14,
          fontFamily: HAND,
          fontWeight: 700,
          fontSize: 64,
          color: '#33415E',
        }}
      >
        EKİM 2026 — ödemeler
      </div>
      {[
        ['Tedarikçi çeki — ??', 150],
        ['Ahmet → senet mi çek mi?', 900],
        ['Banka taksit (hangi gün?)', 975],
      ].map(([text, top]) => (
        <div
          key={text}
          style={{
            position: 'absolute',
            left: 130,
            top: top as number,
            fontFamily: HAND,
            fontSize: 50,
            color: '#3D4A66',
          }}
        >
          {text}
        </div>
      ))}
    </motion.div>
  );
}

export function PostItScene() {
  const sceneOpacity = useT((t) => (t > 3.6 ? 0 : 1));
  return (
    <motion.div style={{ position: 'absolute', inset: 0, opacity: sceneOpacity }}>
      <Agenda />
      {NOTES.map((n, i) => (
        <PostIt key={i} note={n} index={i} />
      ))}
    </motion.div>
  );
}

/** "Sil" anı: notlar uçarken çapraz geçen Saffron silgi çizgisi. */
export function EraseSweep() {
  const at = FLY_START - 0.05;
  const transform = useT((t) => {
    const p = easeOutCubic(prog(t, at, at + 0.55));
    return `translate(${-1300 + 2900 * p}px, 1040px) rotate(-18deg)`;
  });
  const opacity = useT((t) => (t < at ? 0 : 1 - prog(t, at + 0.35, at + 0.6)));
  return (
    <motion.div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 1300,
        height: 120,
        transform,
        opacity,
        background: `linear-gradient(90deg, transparent, ${C.brandPrimary}55 40%, ${C.brandPrimary} 92%, #fff 100%)`,
        filter: 'blur(6px)',
        borderRadius: 60,
      }}
    />
  );
}

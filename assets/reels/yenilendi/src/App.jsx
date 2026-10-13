// "Vademde yenilendi" — 1080×1920 dikey Reels videosu (açık tema).
// Tüm hareket tek bir zaman değerinden (t, saniye) türetilir; render.mjs her kareyi
// window.__setTime ile ayarlayıp ekran görüntüsü alır. Yaylı (spring) geçişler, zamana bağlı
// analitik bir yay eğrisiyle hesaplanır; böylece çıktı kare-kesin ve tekrarlanabilir.
import { motion, useMotionValue, useTransform, cubicBezier } from 'framer-motion';
import { useEffect } from 'react';
import markDark from './mark-dark.svg';
import iconPng from './icon.png';
import {
  FPS, BEAT, INTRO, SCENE, SCENES, sceneStart, OUTRO_START, DURATION, POP_AT, CHIP_AT,
} from './timeline.js';

const easeOut = cubicBezier(0.16, 1, 0.3, 1);
const easeInOut = cubicBezier(0.65, 0, 0.35, 1);
const easeIn = cubicBezier(0.7, 0, 0.84, 0);

// Sönümlü yay: p ∈ [0,1] → 0..1 (aşma ile). zeta küçüldükçe daha çok zıplar.
const spring = (zeta = 0.5, w = 13) => {
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return (p) =>
    p >= 1 ? 1 : 1 - Math.exp(-zeta * w * p) * (Math.cos(wd * p) + ((zeta * w) / wd) * Math.sin(wd * p));
};
const springSoft = spring(0.62, 12);
const springBouncy = spring(0.42, 14);

function useT(t, input, output, ease) {
  return useTransform(t, input, output, { ease, clamp: true });
}
const useVisible = (t, from, to) => useTransform(t, (v) => (v >= from && v < to ? 'visible' : 'hidden'));

// Telefon geometrisi (render pikseli)
const PHONE_W = 620;
const PAD = 16;
const SCREEN_W = PHONE_W - PAD * 2;
const K = SCREEN_W / 1206;

/* ---------- Metin ---------- */

function Word({ t, at, text, ease = springSoft, dur = 0.7 }) {
  const y = useT(t, [at, at + dur], [110, 0], ease);
  const rot = useT(t, [at, at + dur], [8, 0], ease);
  return (
    <span className="mask">
      <motion.span style={{ y, rotate: rot, display: 'inline-block', transformOrigin: '0% 100%' }}>{text}</motion.span>
    </span>
  );
}

// Vurgulu satır: kelimeler yükselir, arkasından safran fosforlu kalem geçer.
function Line({ t, at, text, marker }) {
  const words = text.split(' ');
  const sweep = useT(t, [at + 0.3, at + 0.75], [0, 1], easeInOut);
  return (
    <span className={`line${marker ? ' marked' : ''}`}>
      {marker && <motion.i className="marker" style={{ scaleX: sweep }} />}
      {words.map((w, i) => (
        <Word key={i} t={t} at={at + i * 0.05} text={w} />
      ))}
    </span>
  );
}

/* ---------- Arka plan ---------- */

function Background({ t }) {
  const ax = useT(t, [0, DURATION], [78, 18]);
  const ay = useT(t, [0, DURATION], [8, 26]);
  const bx = useT(t, [0, DURATION], [10, 88]);
  const bg = useTransform([ax, ay, bx], ([a, b, c]) =>
    `radial-gradient(820px 820px at ${a}% ${b}%, rgba(255,176,0,.30), transparent 70%),` +
    `radial-gradient(900px 900px at ${c}% 96%, rgba(107,77,255,.16), transparent 70%),` +
    'linear-gradient(180deg,#FBFAF7 0%,#F1EFE9 100%)'
  );
  const gridY = useT(t, [0, DURATION], [0, -240]);
  const progress = useT(t, [0, DURATION], [0, 1]);
  return (
    <>
      <motion.div className="bg" style={{ background: bg }} />
      <motion.div className="dots" style={{ y: gridY }} />
      <motion.div className="progress" style={{ scaleX: progress }} />
    </>
  );
}

// Sahne geçişlerinde ekranı çapraz kesen renkli bant.
function Swoosh({ t, at, color }) {
  const x = useT(t, [at - 0.28, at + 0.22], [-2600, 2600], easeInOut);
  return <motion.div className="swoosh" style={{ x, background: color, visibility: useVisible(t, at - 0.3, at + 0.25) }} />;
}

/* ---------- Giriş ---------- */

const FLOATERS = [
  { label: 'Çek', x: -330, y: -560, r: -10, d: 0.25 },
  { label: 'Senet', x: 300, y: -470, r: 8, d: 0.33 },
  { label: 'Fatura', x: -310, y: 520, r: 7, d: 0.41 },
  { label: 'Kredi', x: 320, y: 600, r: -8, d: 0.49 },
  { label: 'Dekont', x: -40, y: -700, r: 3, d: 0.57 },
];

function Floater({ t, f }) {
  const p = useT(t, [f.d, f.d + 0.8], [0, 1], springSoft);
  const x = useTransform(p, [0, 1], [f.x * 2.2, f.x]);
  const y = useTransform(p, [0, 1], [f.y * 1.6, f.y]);
  const drift = useT(t, [f.d, INTRO], [0, f.y > 0 ? 30 : -30]);
  const yy = useTransform([y, drift], ([a, b]) => a + b);
  return (
    <motion.div className="floater" style={{ x, y: yy, rotate: f.r }}>
      <i />
      {f.label}
    </motion.div>
  );
}

function Intro({ t }) {
  const exitP = useT(t, [INTRO - 0.35, INTRO + 0.1], [0, 1], easeIn);
  const scale = useTransform(exitP, [0, 1], [1, 1.35]);
  const opacity = useTransform(exitP, [0, 1], [1, 0]);
  const markScale = useT(t, [0.05, 0.75], [0, 1], springBouncy);
  const markRot = useT(t, [0.05, 0.75], [-40, 0], springSoft);
  const stamp = useT(t, [2 * BEAT, 2 * BEAT + 0.6], [1.9, 1], springBouncy);
  const stampO = useT(t, [2 * BEAT, 2 * BEAT + 0.08], [0, 1]);
  const marker = useT(t, [2 * BEAT + 0.15, 2 * BEAT + 0.55], [0, 1], easeInOut);
  const tagO = useT(t, [1.65, 1.95], [0, 1]);
  const tagY = useT(t, [1.65, 2.1], [30, 0], springSoft);
  const letters = 'Vademde'.split('');
  return (
    <motion.div className="intro" style={{ scale, opacity, visibility: useVisible(t, 0, INTRO + 0.15) }}>
      {FLOATERS.map((f) => (
        <Floater key={f.label} t={t} f={f} />
      ))}
      <motion.img src={markDark} className="intro-mark" style={{ scale: markScale, rotate: markRot }} alt="" />
      <div className="intro-word">
        {letters.map((l, i) => (
          <Word key={i} t={t} at={0.3 + i * 0.045} text={l} ease={springBouncy} />
        ))}
      </div>
      <motion.div className="intro-stamp" style={{ scale: stamp, opacity: stampO }}>
        <motion.i className="marker" style={{ scaleX: marker }} />
        <span>yenilendi.</span>
      </motion.div>
      <motion.div className="intro-tag" style={{ opacity: tagO, y: tagY }}>
        Yeni tasarım · Daha hızlı · Daha sade
      </motion.div>
    </motion.div>
  );
}

/* ---------- Telefon üstü öğeler ---------- */

// Ekrandaki bir bölgeyi telefondan dışarı "kopararak" büyütür.
function Pop({ t, at, shot, box: [x, y, w, h], ring }) {
  const p = useT(t, [at, at + 0.7], [0, 1], springBouncy);
  const scale = useTransform(p, [0, 1], [1, 1.5]);
  const lift = useTransform(p, [0, 1], [0, -40]);
  const shadow = useTransform(p, (v) =>
    `0 ${Math.round(50 * v)}px ${Math.round(110 * v)}px rgba(31,33,38,${(0.35 * v).toFixed(3)})` +
    (ring ? `, 0 0 0 ${(4 * Math.min(v, 1)).toFixed(2)}px #FFB000` : `, 0 0 0 ${(2 * Math.min(v, 1)).toFixed(2)}px rgba(255,255,255,.5)`)
  );
  return (
    <motion.div
      className="pop"
      style={{
        left: PAD + x * K,
        top: PAD + y * K,
        width: w * K,
        height: h * K,
        backgroundImage: `url(shots/${shot}.png)`,
        backgroundSize: `${SCREEN_W}px auto`,
        backgroundPosition: `${-x * K}px ${-y * K}px`,
        scale,
        y: lift,
        boxShadow: shadow,
        visibility: useVisible(t, at, 1e9),
      }}
    />
  );
}

function Cheque({ t, s }) {
  const p = useT(t, [s + 0.15, s + 0.85], [0, 1], springSoft);
  const x = useTransform(p, [0, 1], [-900, 0]);
  const y = useTransform(p, [0, 1], [500, 0]);
  const rot = useTransform(p, [0, 1], [-38, -4]);
  const scan = useT(t, [s + 0.75, s + 1.35], ['-10%', '105%'], easeInOut);
  const scanO = useT(t, [s + 0.72, s + 0.8, s + 1.3, s + 1.4], [0, 1, 1, 0]);
  const hl = useT(t, [s + 1.3, s + 1.6], [0, 1], springBouncy);
  return (
    <motion.div className="cheque" style={{ x, y, rotate: rot }}>
      <div className="row">
        <b className="bank">KUZEY BANK A.Ş.</b>
        <span>No 0047219</span>
      </div>
      <div className="cline" style={{ width: '70%' }} />
      <div className="cline" style={{ width: '48%' }} />
      <div className="row" style={{ marginTop: 26 }}>
        <span>27.10.2026</span>
        <motion.span className="amount" style={{ '--hl': hl }}>
          <motion.em className="tag" style={{ scale: hl, opacity: hl }}>Tutar ✓</motion.em>
          ₺120.000,00
        </motion.span>
      </div>
      <motion.i className="scan" style={{ top: scan, opacity: scanO }} />
    </motion.div>
  );
}

function Chip({ t, at, children, style }) {
  const p = useT(t, [at, at + 0.7], [0, 1], springBouncy);
  const scale = useTransform(p, [0, 1], [0.3, 1]);
  const opacity = useT(t, [at, at + 0.12], [0, 1]);
  return (
    <motion.div className="chip" style={{ scale, opacity, ...style }}>
      {children}
    </motion.div>
  );
}

function Notif({ t, at }) {
  const p = useT(t, [at, at + 0.75], [0, 1], springSoft);
  const y = useTransform(p, [0, 1], [-420, 0]);
  return (
    <motion.div className="notif" style={{ y, visibility: useVisible(t, at, 1e9) }}>
      <img src={iconPng} alt="" />
      <div style={{ flex: 1 }}>
        <div className="nt">
          Ödeme hatırlatması <small>şimdi</small>
        </div>
        <div className="nb">Enerjisa Elektrik faturasının son ödeme günü 12 Ekim · ₺1.842,60</div>
      </div>
    </motion.div>
  );
}

/* ---------- Sahne ---------- */

function Scene({ t, i, scene }) {
  const s = sceneStart(i);
  const e = s + SCENE;
  const side = i % 2 === 0;

  // Giriş: çift sahneler yandan 3B dönerek, tekler alttan yaylanarak gelir.
  const inP = useT(t, [s - 0.15, s + 0.65], [0, 1], springSoft);
  const outP = useT(t, [e - 0.28, e + 0.12], [0, 1], easeIn);
  const px = useTransform([inP, outP], ([a, b]) => (side ? (1 - a) * 1100 : 0) + b * (side ? -1100 : 0));
  const py = useTransform([inP, outP], ([a, b]) => (side ? 0 : (1 - a) * 1400) + b * (side ? 0 : -1500));
  const ry = useTransform([inP, outP], ([a, b]) => (side ? (1 - a) * -35 + b * 30 : 0));
  const rz = useTransform([inP, outP], ([a, b]) => (side ? 0 : (1 - a) * 10 - b * 6));
  const breathe = useT(t, [s + 0.6, e], [1, 1.035]);

  // Telefon, öne çıkan parça varken hafifçe kararır.
  const dim = useT(t, [s + POP_AT[0], s + POP_AT[0] + 0.3], [0, scene.pops ? 0.45 : 0]);

  const copyO = useT(t, [e - 0.25, e], [1, 0]);
  const copyY = useT(t, [e - 0.25, e], [0, -50], easeIn);
  const kickP = useT(t, [s - 0.05, s + 0.5], [0, 1], springBouncy);
  const kickScale = useTransform(kickP, [0, 1], [0.4, 1]);
  const kickO = useT(t, [s - 0.05, s + 0.1], [0, 1]);

  return (
    <motion.div className="scene" style={{ visibility: useVisible(t, s - 0.2, e + 0.15) }}>
      <motion.div className="copy" style={{ opacity: copyO, y: copyY }}>
        <div className="kick-row">
          <motion.div className="kicker" style={{ scale: kickScale, opacity: kickO }}>
            <b>{String(i + 1).padStart(2, '0')}</b>
            {scene.kicker}
          </motion.div>
        </div>
        <h1>
          <Line t={t} at={s + 0.05} text={scene.a} />
          <Line t={t} at={s + 0.22} text={scene.b} marker />
        </h1>
      </motion.div>

      <div className="persp">
        <motion.div className="phone-wrap" style={{ x: px, y: py, rotateY: ry, rotate: rz, scale: breathe }}>
          <div className="phone">
            <div className="screen">
              <img src={`shots/${scene.shot}.png`} alt="" />
              <motion.i className="dim" style={{ opacity: dim }} />
            </div>
            {(scene.pops || []).map((pop, k) => (
              <Pop key={k} t={t} at={s + POP_AT[k]} shot={scene.shot} {...pop} />
            ))}
            {scene.cheque && <Cheque t={t} s={s} />}
            {scene.notif && <Notif t={t} at={s + CHIP_AT - 0.3} />}
          </div>
        </motion.div>
      </div>

      {scene.cheque && (
        <Chip t={t} at={s + CHIP_AT + 0.3} style={{ left: 250, top: 1390 }}>
          <span className="dot" style={{ background: '#14804F' }} />3 alan okundu <small>· %99 güven</small>
        </Chip>
      )}
    </motion.div>
  );
}

/* ---------- Kapanış ---------- */

function FanPhone({ t, at, shot, x, rot, width, z }) {
  const p = useT(t, [at, at + 0.8], [0, 1], springSoft);
  const y = useTransform(p, [0, 1], [1300, z ? 0 : 70]);
  const xx = useTransform(p, [0, 1], [0, x]);
  const r = useTransform(p, [0, 1], [0, rot]);
  return (
    <motion.div className="fan-phone" style={{ x: xx, y, rotate: r, zIndex: z, marginLeft: -width / 2 }}>
      <div className="phone small" style={{ width }}>
        <div className="screen">
          <img src={`shots/${shot}.png`} alt="" />
        </div>
      </div>
    </motion.div>
  );
}

function Outro({ t }) {
  const s = OUTRO_START;
  const markP = useT(t, [s + 0.1, s + 0.8], [0, 1], springBouncy);
  const markRot = useT(t, [s + 0.1, s + 0.8], [90, 0], springSoft);
  const ctaP = useT(t, [s + 4 * BEAT, s + 4 * BEAT + 0.7], [0, 1], springBouncy);
  const ctaScale = useTransform(ctaP, [0, 1], [0.2, 1]);
  const ctaO = useT(t, [s + 4 * BEAT, s + 4 * BEAT + 0.1], [0, 1]);
  const shine = useT(t, [s + 3.1, s + 3.8], ['-150%', '300%'], easeInOut);
  const storeO = useT(t, [s + 2.9, s + 3.3], [0, 1]);
  const storeY = useT(t, [s + 2.9, s + 3.4], [24, 0], springSoft);
  const end = useT(t, [DURATION - 0.4, DURATION], [1, 0]);
  return (
    <motion.div className="outro" style={{ visibility: useVisible(t, s - 0.2, 1e9), opacity: end }}>
      <div className="fan">
        <FanPhone t={t} at={s + 0.25} shot="takvim" x={-300} rot={-10} width={450} z={1} />
        <FanPhone t={t} at={s + 0.35} shot="reports" x={300} rot={10} width={450} z={1} />
        <FanPhone t={t} at={s} shot="home" x={0} rot={0} width={520} z={2} />
      </div>
      <div className="outro-copy">
        <motion.img src={markDark} className="outro-mark" style={{ scale: markP, rotate: markRot }} alt="" />
        <h1>
          <Line t={t} at={s + 0.4} text="Vademde" />
          <Line t={t} at={s + 2 * BEAT - 0.25} text="yenilendi." marker />
        </h1>
        <motion.div className="cta" style={{ scale: ctaScale, opacity: ctaO }}>
          Şimdi güncelle <span className="arrow">→</span>
          <motion.i className="shine" style={{ x: shine }} />
        </motion.div>
        <motion.div className="store" style={{ opacity: storeO, y: storeY }}>
          App Store'da · vademde.com
        </motion.div>
      </div>
    </motion.div>
  );
}

const SWOOSH_COLORS = ['#FFB000', '#6B4DFF', '#1F2126'];

export default function App() {
  const t = useMotionValue(0);
  useEffect(() => {
    window.__duration = DURATION;
    window.__fps = FPS;
    window.__setTime = (v) =>
      new Promise((r) => {
        t.set(v);
        requestAnimationFrame(() => requestAnimationFrame(r));
      });
    if (new URLSearchParams(location.search).has('play')) {
      const t0 = performance.now();
      const tick = () => {
        t.set(((performance.now() - t0) / 1000) % DURATION);
        requestAnimationFrame(tick);
      };
      tick();
    }
    window.__ready = true;
  }, [t]);

  return (
    <div className="stage">
      <Background t={t} />
      <Intro t={t} />
      {SCENES.map((scene, i) => (
        <Scene key={scene.shot} t={t} i={i} scene={scene} />
      ))}
      <Outro t={t} />
      {SCENES.map((_, i) =>
        i % 3 === 0 ? <Swoosh key={i} t={t} at={sceneStart(i)} color={SWOOSH_COLORS[(i / 3) % 3]} /> : null
      )}
      <Swoosh t={t} at={OUTRO_START} color="#FFB000" />
      <div className="grain" />
    </div>
  );
}

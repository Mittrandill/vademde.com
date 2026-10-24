import { motion } from 'framer-motion';
import { darkColors as C } from '../../../theme/colors';
import { EndCard, STAMPS } from './EndCard';
import { Headline, Subline } from './Headline';
import { CANVAS_H, CANVAS_W, HEADLINE_TOP } from './layout';
import { Phone } from './Phone';
import { Hl } from './primitives';
import { EraseSweep, PostItScene } from './PostIts';
import { prog, useT } from './time';

/** Damga darbelerinde tüm kare kısa süre sarsılır. */
function useShake() {
  return useT((t) => {
    let dx = 0;
    let dy = 0;
    for (const at of STAMPS) {
      const p = prog(t, at + 0.14, at + 0.34);
      if (p > 0 && p < 1) {
        const a = (1 - p) * 14;
        dx += Math.sin(p * 40) * a;
        dy += Math.cos(p * 33) * a * 0.6;
      }
    }
    return `translate(${dx}px, ${dy}px)`;
  });
}

export function Video() {
  const transform = useShake();
  return (
    <div
      style={{
        position: 'relative',
        width: CANVAS_W,
        height: CANVAS_H,
        overflow: 'hidden',
        background: `radial-gradient(900px 700px at 50% 0%, rgba(255,176,0,0.10), transparent 70%),
          radial-gradient(900px 900px at 0% 100%, rgba(107,77,255,0.22), transparent 70%),
          #141518`,
        fontFamily: 'Inter, sans-serif',
        color: C.textPrimary,
      }}
    >
      <motion.div style={{ position: 'absolute', inset: 0, transform }}>
        <PostItScene />
        <EraseSweep />
        <Phone />
        <EndCard />

        <Headline lines={['Vadeler hâlâ', <Hl key="h">post-it'te mi?</Hl>]} inAt={-0.35} outAt={2.0} size={88} />
        <Headline lines={[<>Hepsini <Hl>sil.</Hl></>]} inAt={2.1} outAt={3.25} size={120} top={HEADLINE_TOP + 20} />
        <Headline lines={['Tek takvim.', <Hl key="h">Tüm vadeler.</Hl>]} inAt={3.4} outAt={7.35} />
        <Headline lines={['Bakiye, borç, alacak.', <Hl key="h">Tek bakışta.</Hl>]} inAt={7.5} outAt={9.75} size={76} />
        <Headline lines={['Fotoğrafını çek.', <Hl key="h">Vademde okusun.</Hl>]} inAt={9.85} outAt={12.85} />
        <Subline inAt={11.7} outAt={12.85} top={HEADLINE_TOP + 184}>
          Onaylamadan kayıt oluşmaz.
        </Subline>
      </motion.div>
    </div>
  );
}

import '@fontsource/caveat/700.css';
import { createRoot } from 'react-dom/client';
import { time } from './time';
import { Video } from './Video';

declare global {
  interface Window {
    __ready: Promise<void>;
    __setTime: (seconds: number) => Promise<void>;
  }
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

createRoot(document.getElementById('root')!).render(<Video />);

window.__setTime = async (seconds) => {
  time.set(seconds);
  // Framer Motion stil güncellemelerini bir sonraki karede DOM'a yazar.
  await nextFrame();
  await nextFrame();
};

window.__ready = (async () => {
  await Promise.all([
    document.fonts.load('700 58px Caveat', 'Ahmet İnşaat çeki ğüşöç'),
    document.fonts.load('800 80px "Inter Display"', 'Vadeler ğüşİ₺'),
    document.fonts.load('700 40px Inter', '₺0123456789'),
  ]);
  await document.fonts.ready;
  await nextFrame();
  await Promise.all(
    Array.from(document.images).map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => {}))),
  );
  await nextFrame();
})();

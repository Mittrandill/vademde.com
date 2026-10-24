// Videoyu kare kare çizer ve MP4'e çevirir.
//
//   node scripts/render.mjs                 → out/vademde-vade-takvimi.mp4 (+ -sessiz, -muziksiz)
//   node scripts/render.mjs --stills 0,2.4,5   → yalnızca bu saniyelerin PNG'leri (out/stills/)
//
// Her kare için saat `window.__setTime` ile ayarlanır; gerçek zamanlı kayıt yapılmadığı için
// takılma/kare atlaması olmaz. Ses, scripts/sfx.py'nin ürettiği WAV'lardan eklenir.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'out');
const TL = JSON.parse(readFileSync(join(ROOT, 'src', 'timeline.json'), 'utf8'));
const NAME = 'vademde-vade-takvimi';

const args = process.argv.slice(2);
const stillsArg = args.includes('--stills') ? args[args.indexOf('--stills') + 1] : null;

function run(cmd, argv, stdin) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: [stdin ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} çıkış kodu ${code}`))));
    if (stdin) stdin(p.stdin);
  });
}

async function openPage() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('sayfa hatası:', e.message));
  await page.goto('file://' + join(ROOT, 'build', 'index.html'));
  await page.evaluate(() => window.__ready);
  return { browser, page };
}

async function stills(list) {
  const dir = join(OUT, 'stills');
  mkdirSync(dir, { recursive: true });
  const { browser, page } = await openPage();
  for (const s of list) {
    await page.evaluate((t) => window.__setTime(t), s);
    await page.screenshot({ path: join(dir, `t${s.toFixed(2)}.png`) });
  }
  await browser.close();
  console.log('kareler:', dir);
}

async function video() {
  mkdirSync(OUT, { recursive: true });
  const frames = Math.round(TL.duration * TL.fps);
  const silent = join(OUT, `${NAME}-sessiz.mp4`);
  const { browser, page } = await openPage();

  let pipe;
  const ffmpeg = run(
    'ffmpeg',
    [
      '-y', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', String(TL.fps), '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
      '-profile:v', 'high', '-r', String(TL.fps), '-movflags', '+faststart',
      silent,
    ],
    (stdin) => (pipe = stdin),
  );

  for (let f = 0; f < frames; f++) {
    await page.evaluate((t) => window.__setTime(t), f / TL.fps);
    const png = await page.screenshot({ type: 'png' });
    if (!pipe.write(png)) await new Promise((r) => pipe.once('drain', r));
    if (f % 30 === 0) process.stdout.write(`\rkare ${f}/${frames}`);
  }
  pipe.end();
  await ffmpeg;
  await browser.close();
  console.log(`\rkare ${frames}/${frames} → ${silent}`);

  // Ses: efekt + altlık müzik (tam) ve yalnızca efekt (Instagram müziği eklenecekse).
  for (const [wav, suffix] of [
    ['mix.wav', ''],
    ['sfx.wav', '-muziksiz'],
  ]) {
    const audio = join(OUT, 'audio', wav);
    if (!existsSync(audio)) {
      console.warn(`${audio} yok — önce: npm run sfx`);
      continue;
    }
    const target = join(OUT, `${NAME}${suffix}.mp4`);
    await run('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', silent, '-i', audio,
      '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
      // Instagram hedef yüksekliği (~-14 LUFS)
      '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
      '-shortest', '-movflags', '+faststart', target,
    ]);
    console.log('→', target);
  }
}

if (stillsArg) await stills(stillsArg.split(',').map(Number));
else await video();

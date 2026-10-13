// dist/index.html'i kare kare çekip ffmpeg'e besler → out/vademde-yenilendi.mp4 (1080×1920, 30 fps, H.264)
import { launch } from './launch.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__ready);
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));

const { duration, fps } = await page.evaluate(() => ({ duration: window.__duration, fps: window.__fps }));
const total = Math.round(duration * fps);
mkdirSync('out', { recursive: true });
const out = 'out/vademde-yenilendi.mp4';
const silent = 'out/video-silent.mp4';
const wav = 'out/audio.wav';
execFileSync('python3', ['audio.py', 'dist/timeline.json', wav], { stdio: 'inherit' });
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', silent], { stdio: ['pipe', 'inherit', 'inherit'] });

for (let f = 0; f < total; f++) {
  await page.evaluate((v) => window.__setTime(v), f / fps);
  const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % fps === 0) process.stdout.write(`\r${f}/${total}`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
// Görüntü + ses birleştirme
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', out]);
console.log(`\n${out} (${duration.toFixed(1)} sn)`);

// Belirli saniyelerden önizleme karesi: node preview.mjs 1.5 4 20
import { launch } from './launch.mjs';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('pageerror', (e) => console.error(e));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__ready);
await page.evaluate(() => document.fonts.ready);
mkdirSync('out/preview', { recursive: true });
for (const s of process.argv.slice(2)) {
  await page.evaluate((v) => window.__setTime(v), Number(s));
  await page.screenshot({ path: `out/preview/t${s}.png` });
}
await browser.close();

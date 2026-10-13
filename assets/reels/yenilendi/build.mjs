import { build } from 'esbuild';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { DURATION, audioEvents } from './src/timeline.js';

mkdirSync('dist', { recursive: true });
await build({
  entryPoints: ['src/main.jsx'],
  bundle: true,
  outfile: 'dist/app.js',
  jsx: 'automatic',
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'file', '.woff': 'file' },
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: true,
  tsconfigRaw: '{}',
});
cpSync('shots', 'dist/shots', { recursive: true });
writeFileSync('dist/index.html', `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<title>Vademde yenilendi</title><link rel="stylesheet" href="app.css"></head>
<body><div id="root"></div><script src="app.js"></script></body></html>`);
// Ses betiği (audio.py) için zaman çizelgesi
writeFileSync('dist/timeline.json', JSON.stringify({ duration: DURATION, events: audioEvents() }));
console.log('dist/ hazır');

import * as esbuild from 'esbuild'
import fs from 'fs';

// ─── Change the app name here, it propagates everywhere ───────────────────────
const APP_NAME = 'Foyr Screen Recorder';
// ──────────────────────────────────────────────────────────────────────────────

const shared = {
  bundle: true,
  outdir: 'dist',
  target: 'chrome120',
  format: 'iife',
  globalName: 'SV',
  jsx: 'automatic',
  minify: true,
  treeShaking: true,
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  sourcemap: false,
}

await esbuild.build({ ...shared, entryPoints: ['src/service-worker.ts'] })
await esbuild.build({ ...shared, entryPoints: ['src/offscreen.ts'] })
await esbuild.build({ ...shared, entryPoints: ['src/setup.ts'] })
await esbuild.build({ ...shared, entryPoints: ['src/popup.ts'] })

// Copy static files
const staticFiles = [
  ['src/popup.css', 'dist/popup.css'],
  ['src/popup.html', 'dist/popup.html'],
  ['src/offscreen.html', 'dist/offscreen.html'],
  ['src/setup.html', 'dist/setup.html'],
  ['manifest.json', 'dist/manifest.json'],
];

for (const [src, dest] of staticFiles) {
  if (src === 'manifest.json') {
    // Strip the `key` field (not allowed on CWS) and apply APP_NAME
    const manifest = JSON.parse(fs.readFileSync(src, 'utf8'));
    delete manifest.key;
    manifest.name = APP_NAME;
    fs.writeFileSync(dest, JSON.stringify(manifest, null, 2));
  } else {
    const content = fs.readFileSync(src, 'utf8').replaceAll('ScreenVault', APP_NAME);
    fs.writeFileSync(dest, content);
  }
}

// Icons referenced by manifest.json's `action.default_icon`
fs.mkdirSync('dist/icons', { recursive: true });
for (const file of fs.readdirSync('icons')) {
  fs.copyFileSync(`icons/${file}`, `dist/icons/${file}`);
}

// Privacy page served at /privacy
fs.mkdirSync('dist/privacy', { recursive: true });
fs.copyFileSync('src/privacy.html', 'dist/privacy/index.html');


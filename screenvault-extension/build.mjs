import * as esbuild from 'esbuild'
import fs from 'fs';
import { execSync } from 'child_process';

// ─── Change the app name here, it propagates everywhere ───────────────────────
const APP_NAME = 'RecVault Beta';
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
await esbuild.build({ ...shared, entryPoints: ['src/playback.ts'] })
await esbuild.build({ ...shared, entryPoints: ['src/dashboard/index.tsx'], outbase: 'src' })

// Copy static files
const staticFiles = [
  ['src/popup.css', 'dist/popup.css'],
  ['src/popup.html', 'dist/popup.html'],
  ['src/index.html', 'dist/index.html'],
  ['src/offscreen.html', 'dist/offscreen.html'],
  ['src/setup.html', 'dist/setup.html'],
  ['src/dashboard/dashboard.html', 'dist/dashboard.html'],
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

// Privacy page served at /privacy
fs.mkdirSync('dist/privacy', { recursive: true });
fs.copyFileSync('src/privacy.html', 'dist/privacy/index.html');

// Generate Tailwind CSS for the player page (replaces CDN script)
execSync('./node_modules/.bin/tailwindcss -i src/player.css -o dist/player.css --minify', { stdio: 'inherit' });


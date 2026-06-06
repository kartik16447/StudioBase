import * as esbuild from 'esbuild'
import fs from 'fs';
import path from 'path';

const isProd = process.argv.includes('--prod');

const shared = {
  bundle: true,
  outdir: 'dist',
  target: 'chrome120',
  format: 'iife',
  globalName: 'SB',
  jsx: 'automatic',
  minify: true,
  treeShaking: true,
  ...(isProd ? { drop: ['console'] } : {}),
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.env.DEV': isProd ? 'false' : 'true',
    'import.meta.env.VITE_DEV_MODE': isProd ? '"false"' : '"true"',
    'import.meta.env.VITE_BACKEND_URL': 'undefined',
  },
  sourcemap: false,
}

await esbuild.build({ ...shared, entryPoints: ['src/service-worker.ts'] })
await esbuild.build({ ...shared, entryPoints: ['src/content.ts'] })
await esbuild.build({ ...shared, entryPoints: ['src/offscreen.ts'] })
await esbuild.build({ ...shared, entryPoints: ['src/popup.ts'] })
await esbuild.build({ ...shared, entryPoints: ['src/setup.ts'] })

// Dashboard — ESM format so React works correctly
await esbuild.build({
  ...shared,
  format: 'esm',
  globalName: undefined,
  entryPoints: ['src/dashboard/index.tsx'],
  outdir: 'dist/dashboard',
})

// Copy static files
const staticFiles = [
  ['src/popup.css', 'dist/popup.css'],
  ['src/popup.html', 'dist/popup.html'],
  ['src/offscreen.html', 'dist/offscreen.html'],
  ['src/setup.html', 'dist/setup.html'],
  ['src/dashboard/dashboard.html', 'dist/dashboard.html'],
];

for (const [src, dest] of staticFiles) {
  fs.copyFileSync(src, dest);
}

// Copy correct manifest
const manifestSrc = isProd ? 'manifest.prod.json' : 'manifest.json';
fs.copyFileSync(manifestSrc, 'dist/manifest.json');

// Copy icons
fs.mkdirSync('dist/icons', { recursive: true });
for (const icon of ['icon16.png', 'icon48.png', 'icon128.png']) {
  fs.copyFileSync(`icons/${icon}`, `dist/icons/${icon}`);
}

console.log(`Built ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'} extension → dist/`);


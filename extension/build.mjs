import * as esbuild from 'esbuild'
import fs from 'fs';

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
  fs.copyFileSync(src, dest);
}


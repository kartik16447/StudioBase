import * as esbuild from 'esbuild'
import fs from 'fs';

const shared = {
  bundle: true,
  outdir: 'dist',
  target: 'chrome120',
  format: 'iife',
  globalName: 'SB',
  jsx: 'automatic',
  minify: true,
  treeShaking: true,
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.env.DEV': 'false',
    'import.meta.env.VITE_DEV_MODE': '"false"',
    'import.meta.env.VITE_BACKEND_URL': 'undefined'
  },
  sourcemap: false,
}

await esbuild.build({ ...shared, entryPoints: ['src/service-worker.ts'] })
await esbuild.build({ ...shared, entryPoints: ['src/content.ts'] })
await esbuild.build({ ...shared, entryPoints: ['src/offscreen.ts'] })
await esbuild.build({ ...shared, entryPoints: ['src/popup.ts'] })

// Copy static files
const staticFiles = [
  ['src/popup.css', 'dist/popup.css'],
  ['src/popup.html', 'dist/popup.html'],
  ['src/offscreen.html', 'dist/offscreen.html'],
  ['manifest.json', 'dist/manifest.json'],
];

for (const [src, dest] of staticFiles) {
  fs.copyFileSync(src, dest);
}


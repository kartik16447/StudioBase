/**
 * Generates studio/public/og-image.png (1200×630) from an inline SVG.
 * Uses @resvg/resvg-js.
 * Run: node scripts/gen-og-image.mjs
 */

import { writeFileSync }  from 'fs';
import { fileURLToPath }  from 'url';
import { dirname, resolve } from 'path';
import { Resvg } from '@resvg/resvg-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT       = resolve(__dirname, '../studio/public/og-image.png');

const W = 1200;
const H = 630;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- Background -->
    <radialGradient id="glo1" cx="200" cy="180" r="480" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#5E5CE6" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#5E5CE6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glo2" cx="1050" cy="500" r="380" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#06B6D4" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#06B6D4" stop-opacity="0"/>
    </radialGradient>
    <!-- Headline gradient -->
    <linearGradient id="hg" x1="260" y1="0" x2="940" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="#5E5CE6"/>
      <stop offset="45%"  stop-color="#8B5CF6"/>
      <stop offset="100%" stop-color="#06B6D4"/>
    </linearGradient>
    <clipPath id="pillClip">
      <rect x="420" y="138" width="360" height="30" rx="15"/>
    </clipPath>
  </defs>

  <!-- Base dark background -->
  <rect width="${W}" height="${H}" fill="#0a0a0a"/>

  <!-- Ambient glows -->
  <rect width="${W}" height="${H}" fill="url(#glo1)"/>
  <rect width="${W}" height="${H}" fill="url(#glo2)"/>

  <!-- Grid dots pattern -->
  <pattern id="dots" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse">
    <circle cx="0" cy="0" r="1" fill="rgba(94,92,230,0.08)"/>
  </pattern>
  <rect width="${W}" height="${H}" fill="url(#dots)"/>

  <!-- Early Access pill -->
  <rect x="420" y="138" width="360" height="30" rx="15"
        fill="rgba(94,92,230,0.12)" stroke="rgba(94,92,230,0.30)" stroke-width="1"/>
  <circle cx="447" cy="153" r="4" fill="#5E5CE6"/>
  <text x="600" y="158" text-anchor="middle" dominant-baseline="middle"
        font-family="-apple-system, 'SF Pro Text', Inter, sans-serif"
        font-size="13" font-weight="500" fill="rgba(255,255,255,0.70)">
    Early Access · 100 Workspaces
  </text>

  <!-- Headline line 1 -->
  <text x="600" y="252" text-anchor="middle"
        font-family="-apple-system, 'SF Pro Display', Inter, sans-serif"
        font-size="64" font-weight="700" fill="#FFFFFF">
    One capture.
  </text>

  <!-- Headline line 2 — gradient -->
  <text x="600" y="337" text-anchor="middle"
        font-family="-apple-system, 'SF Pro Display', Inter, sans-serif"
        font-size="58" font-weight="700" fill="url(#hg)">
    Three pixel-perfect formats.
  </text>

  <!-- Headline line 3 -->
  <text x="600" y="418" text-anchor="middle"
        font-family="-apple-system, 'SF Pro Display', Inter, sans-serif"
        font-size="64" font-weight="700" fill="#FFFFFF">
    Zero per-seat fees.
  </text>

  <!-- Format pill 1: SOP Guide / Free (purple) -->
  <rect x="130" y="490" width="260" height="56" rx="12"
        fill="rgba(255,255,255,0.05)" stroke="rgba(94,92,230,0.30)" stroke-width="1"/>
  <rect x="150" y="507" width="3"  height="22" rx="2" fill="#5E5CE6"/>
  <text x="164" y="522"
        font-family="-apple-system, 'SF Pro Text', Inter, sans-serif"
        font-size="14" font-weight="600" fill="rgba(255,255,255,0.90)">SOP Guide</text>
  <text x="164" y="540"
        font-family="-apple-system, 'SF Pro Text', Inter, sans-serif"
        font-size="12" font-weight="500" fill="rgba(52,199,89,0.90)">Free</text>

  <!-- Format pill 2: Raw Recording / Free (cyan) -->
  <rect x="470" y="490" width="260" height="56" rx="12"
        fill="rgba(255,255,255,0.05)" stroke="rgba(6,182,212,0.30)" stroke-width="1"/>
  <rect x="490" y="507" width="3"  height="22" rx="2" fill="#06B6D4"/>
  <text x="504" y="522"
        font-family="-apple-system, 'SF Pro Text', Inter, sans-serif"
        font-size="14" font-weight="600" fill="rgba(255,255,255,0.90)">Raw Recording</text>
  <text x="504" y="540"
        font-family="-apple-system, 'SF Pro Text', Inter, sans-serif"
        font-size="12" font-weight="500" fill="rgba(52,199,89,0.90)">Free</text>

  <!-- Format pill 3: Cinematic / 1 credit (violet) -->
  <rect x="810" y="490" width="260" height="56" rx="12"
        fill="rgba(255,255,255,0.05)" stroke="rgba(139,92,246,0.30)" stroke-width="1"/>
  <rect x="830" y="507" width="3"  height="22" rx="2" fill="#8B5CF6"/>
  <text x="844" y="522"
        font-family="-apple-system, 'SF Pro Text', Inter, sans-serif"
        font-size="14" font-weight="600" fill="rgba(255,255,255,0.90)">Cinematic</text>
  <text x="844" y="540"
        font-family="-apple-system, 'SF Pro Text', Inter, sans-serif"
        font-size="12" font-weight="500" fill="rgba(255,159,10,0.90)">1 credit</text>

  <!-- Logo -->
  <text x="52" y="${H - 30}"
        font-family="-apple-system, 'SF Pro Display', Inter, sans-serif"
        font-size="18" font-weight="600" fill="rgba(255,255,255,0.50)">StudioBase</text>

  <!-- URL -->
  <text x="${W - 52}" y="${H - 30}" text-anchor="end"
        font-family="-apple-system, 'SF Pro Text', Inter, sans-serif"
        font-size="14" font-weight="500" fill="rgba(255,255,255,0.30)">studiobase.app</text>
</svg>`;

const resvg = new Resvg(svg);
const pngData = resvg.render();
const buf = pngData.asPng();

writeFileSync(OUT, buf);
console.log(`✓ og-image.png written (${W}×${H}) → ${OUT}`);

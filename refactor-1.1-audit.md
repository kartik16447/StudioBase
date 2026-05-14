# StudioPage.tsx Refactor Phase 1.1 Audit

## 1. Target Code

### Constants for `src/modules/render-engine/RenderConstants.ts`
- **Panel Width:** `480px`
- **SOP Container Max Width:** `860px`
- **Glow Radius:** `500px`
- **Asset Refresh Interval:** `15 * 60 * 1000` (15 minutes)
- **Player Max Height:** `calc(100vh - 280px)`
- **Aspect Ratios:** `16/9` (Player), `16/10` (Session Card fallback context)
- **Export Compositor Dimensions:** `2880x1444`
- **Export Compositor Visual Scale:** `288px x 162px`
- **Export Video Bitrate:** `25000000` (25 Mbps)
- **Export Frame Rate:** `30` (fps)
- **Grid Background Spacing:** `60px`

### Math Functions for `src/modules/render-engine/CinematicMath.ts`
- **`getTarget(step)`:** Calculates `centerX`, `centerY`, and `zoomScale` (with `1` for hybrid/video and `1.55` for slideshow).
- **Camera Math Transformations:**
  - `scale = (hasZoom || !isPlaying) ? target.zoomScale : 1`
  - `tx = (50 - target.centerX) * scale`
  - `ty = (50 - target.centerY) * scale`
- **Momentum Logic (Large Jumps):**
  - `dx = tx - prevTX`
  - `dy = ty - prevTY`
  - `isLargeJump = Math.abs(dx) > 15 || Math.abs(dy) > 15`
  - `overshootX = tx + dx * 0.08`
  - `overshootY = ty + dy * 0.08`
- **Cinematic Re-orientation Sequence:** The logic that generates the Framer Motion animation arrays based on `sameContext` and `renderMode` (Apple-style re-orientation vs standard translation).
- **Spring Physics Variables:**
  - `{ stiffness: 70, damping: 18, mass: 1.1, restDelta: 0.001 }`
  - `{ stiffness: 280, damping: 36 }` (used for panels)
- **Cursor Interpolation / Hotspot Math:**
  - `(coords.x / (coords.viewportWidth || 1440)) * 100`
  - `(coords.y / (coords.viewportHeight || 900)) * 100`

## 2. Guarded Logic (Do Not Touch)

**OFF-LIMITS:**
- **State:** `useStudioStore(state => state.activeView)` (defaults to 'video') and `useStudioStore(state => state.renderMode)`.
- **JSX Toggles:** The toggle rendering logic in `StudioTopBar` (`src/components/studio/index.tsx`) for `Video` (`renderMode==='hybrid'`) and `Slides` (`renderMode==='slideshow'`). The conditional guards have been specifically removed to ensure constant UI visibility. Do not reinstate `hasVideo` guards.
- **Canvas Switcher:** The `{activeView === 'sop' ? <SOPCanvas /> : activeView === 'video' ? <VideoCanvas /> : <DemoCanvas />}` block in `StudioPage.tsx`.

## 3. Dependency Graph

- **`SOPCanvas`:** Relies on structural constants (`max-w-[860px]`, `glowRadius=500`).
- **`VideoCanvas`:** Heavily dependent on `CinematicMath` (`getTarget`, camera translations, momentum overshoot, cinematic sequences) and visual constants (Spring physics, `aspectRatio: '16/9'`).
- **`DemoCanvas`:** Depends on coordinate calculation math for hotspots.
- **`handleSOPVideoExport`:** Needs rendering constants (`2880x1444`, 30 FPS, 25 Mbps bitrate).
- **`StudioPage` (Root):** Depends on `15 * 60 * 1000` interval constant and the core `activeView` guarded logic.

## 4. Execution Plan

1. **Create Files:** Instantiate `src/modules/render-engine/RenderConstants.ts` and `src/modules/render-engine/CinematicMath.ts`.
2. **Migrate Constants:** Move hardcoded dimensions, timings, and bitrates from `StudioPage.tsx` to `RenderConstants.ts` as exported variables.
3. **Migrate Math:** Extract `getTarget`, momentum calculations, and `cinematicSequence` generators into pure, testable functions within `CinematicMath.ts`.
4. **Refactor StudioPage.tsx:** Import the new constants and math functions into `StudioPage.tsx` and replace the inline logic.
5. **Verify Guards:** Ensure `activeView` and the JSX toggle logic remain completely untouched during the refactor.
6. **Test Compilation:** Verify `npm run build` succeeds with the new modular architecture.

# StudioPage.tsx Refactor Phase 1.3 Audit

## 1. Target Files to Create
We will extract the three main view implementations from `StudioPage.tsx` into a new directory: `src/components/studio/canvases/`.
- `src/components/studio/canvases/SOPCanvas.tsx`
- `src/components/studio/canvases/VideoCanvas.tsx`
- `src/components/studio/canvases/DemoCanvas.tsx`

*(Note: The `handleSOPVideoExport` function will be kept with `VideoCanvas` or exported appropriately, as it handles the cinematic rendering logic).*

## 2. Complex Props & State Dependencies
To avoid massive prop-drilling for these heavy, top-level view components, they will continue to consume `useStudioStore` directly, but their imports will be cleanly isolated.

### `SOPCanvas`
- **State Dependencies:** `session`, `focusedStepId`, `setFocusStep`, `setStepIndex`, `scrollTrigger`, `triggerScroll`, `isExporting`, `triggerExport`, `setActiveView`.
- **Constants:** `RenderConstants.GLOW_RADIUS`, `RenderConstants.SOP_MAX_WIDTH`.
- **External Dependencies:** `BACKEND_URL` for AI generation, `DotGrid`, `StepCard`, `ChapterBreak`, `SummaryCallout`, `AIButton`, `AIShimmer`.

### `VideoCanvas`
- **State Dependencies:** `session`, `currentStepIndex`, `isPlaying`, `playbackRate`, `setPlaying`, `setStepIndex`, `brand`, `isExporting`, `exportTrigger`, `renderMode`.
- **Math & Constants:** Heavily relies on `CinematicMath` (target calculations, sequence generation, cursor hotspots) and `RenderConstants`.
- **External Dependencies:** `ScreenshotPlaceholder`, `DotGrid`, `handleSOPVideoExport`.

### `DemoCanvas`
- **State Dependencies:** `session`, `currentStepIndex`, `setStepIndex`, `isPlaying`, `setPlaying`, `brand`, `isExporting`, `exportTrigger`.
- **Math & Constants:** `CinematicMath.getHotspotPercent`.
- **External Dependencies:** `ScreenshotPlaceholder`.

## 3. The Switcher Logic
The main `StudioPage.tsx` will be massively simplified. It will simply import the three canvas components:
```tsx
import { SOPCanvas } from '../components/studio/canvases/SOPCanvas';
import { VideoCanvas } from '../components/studio/canvases/VideoCanvas';
import { DemoCanvas } from '../components/studio/canvases/DemoCanvas';
```
The inline implementations will be deleted from `StudioPage.tsx`, leaving only the root layout and the canvas switcher logic.

## 4. Guarded Logic (Do Not Break)
**OFF-LIMITS:**
- The `<AnimatePresence mode="wait">` block inside `StudioPage.tsx` that controls the mounting and unmounting of the canvases based on `activeView`.
- The exact condition: `{activeView === 'sop' ? <SOPCanvas /> : activeView === 'video' ? <VideoCanvas /> : <DemoCanvas />}` must remain untouched to ensure seamless transitions between views.

## 5. Execution Plan
1. Create the `src/components/studio/canvases/` directory.
2. Extract `SOPCanvas`, `VideoCanvas` (along with `handleSOPVideoExport`), and `DemoCanvas` into their respective files.
3. Add all necessary imports to each canvas file (`useStudioStore`, `RenderConstants`, UI components, Framer Motion, etc.).
4. Clean up `StudioPage.tsx` by removing the extracted components and unused imports.
5. Verify the app builds correctly and the ViewMode toggle flawlessly swaps the canvases as before.

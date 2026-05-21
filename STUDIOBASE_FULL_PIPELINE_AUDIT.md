# StudioBase Full Pipeline Audit

## 1. Executive Summary

This document provides a comprehensive, end-to-end audit of the StudioBase architecture, spanning from raw capture event generation to final video export. Based on a deep trace of the codebase and real `session_dump.json` data, this audit identifies the exact path of data hydration, the sources of truth for playback and rendering, the differences between preview and export paradigms, and the underlying mathematical models driving cinematic camera movement.

## 2. Full File Map & Responsibilities

- **`studio/src/store/useStudioStore.ts`**
  - **Role:** Central Source of Truth for frontend state and hydration.
  - **Responsibilities:** Owns `session`, playback state (`isPlaying`, `currentTime`, `currentStepIndex`, `renderMode`), and export lifecycle (`isExporting`, `exportStatus`). Performs heavy normalization of nested legacy `session.steps` data into a flat array structure.

- **`studio/src/components/studio/canvases/VideoCanvas.tsx`**
  - **Role:** The Preview & Export Orchestrator.
  - **Responsibilities:** Manages the hidden `<video>` element, runs the `requestAnimationFrame` (rAF) loop for preview, syncs video playhead with step changes, and houses the `handleSOPVideoExport` function which drives the deterministic export loop.

- **`studio/src/modules/render-engine/CanvasRenderer.ts`**
  - **Role:** The Visual Compositor.
  - **Responsibilities:** Draws the background grid, computes camera spring interpolation, applies transformations, draws the main asset (video frame or image), and overlays interactions and annotations.

- **`studio/src/modules/render-engine/CinematicMath.ts`**
  - **Role:** The Camera Logic Engine.
  - **Responsibilities:** Converts raw viewport coordinates into safe-zone clamped percentages. Defines the target `centerX`, `centerY`, and `zoomScale` for a step.

- **`studio/src/components/studio/canvases/SOPCanvas.tsx`**
  - **Role:** The Document Renderer.
  - **Responsibilities:** Renders the static, scrollable list of steps (`StepCard`), chapters, and AI summaries. It interacts with the store via `scrollTrigger` and updates the focused step on scroll/keyboard navigation.

- **`backend/src/services/SessionService.ts`**
  - **Role:** The Storage Layer.
  - **Responsibilities:** Handles DB operations (`sessions`, `steps`, `artifacts`) and R2 integration. Returns flattened steps mixed with DB and R2 content.

## 3. End-to-End Lifecycle Map

1. **Capture:** Browser extension records events (clicks, inputs) and records WebM video. Events capture high-fidelity DOM metadata (`elementRect`, `viewportWidth`, `timestamp`).
2. **Session Creation:** Data is sent to backend, creating a `session_dump.json` in R2 and DB records.
3. **Frontend Hydration:** `fetchSession` in `useStudioStore` fetches the session.
4. **Normalization:** `useStudioStore` flattens the nested JSON, derives relative timestamps, and normalizes missing data.
5. **Playback:** `VideoCanvas` mounts a hidden `<video>`. The rAF loop continuously reads `video.currentTime`.
6. **Rendering:** `CanvasRenderer` computes camera translation based on the current step's `animationTarget` and interpolates progress using `CinematicMath`.
7. **Export:** `handleSOPVideoExport` bypasses rAF for a deterministic `for` loop, extracting video frames via `WorkerExtractor`, running them through `CanvasRenderer`, and piping to a `MediaRecorder` attached to an invisible canvas.

## 4. Trigger / Event Chain Map

- **Play/Pause:** Bottom bar clicks -> `store.setPlaying()` -> `VideoCanvas` reacts -> calls `videoRef.current.play()` or `pause()` -> rAF loop begins/stops ticking UI updates.
- **Seek / Step Click in SOP:** Click `StepCard` -> `setFocusStep()` & `setStepIndex()` -> `VideoCanvas` reacts -> sets `video.currentTime` to `step.timestamp / 1000` -> rAF loop catches the new time.
- **Export Trigger:** Click Export -> `store.triggerExport()` -> `VideoCanvas` `useEffect` catches it -> invokes `handleSOPVideoExport`.

## 5. Player Architecture Deep Dive

- **Source of Truth:** The HTML `<video>` element (`videoRef.current.currentTime`) is the absolute clock in `hybrid` mode.
- **Control Flow:** Bottom controls mutate the store (`setPlaying`, `setStepIndex`). `VideoCanvas` watches the store and issues imperative commands to the `<video>` element.
- **The rAF Loop:** Runs independently of React state. It reads the video time, finds the corresponding step, computes animation progress, and triggers `CanvasRenderer`. It also handles "Playhead Latch" (syncing store `currentStepIndex` if the video naturally crosses a timestamp boundary).

## 6. Cinematic Motion / Panning Audit

- **Input:** Raw JSON `coordinates` (e.g., `x: 325, y: 36, width: 70, viewportWidth: 1440`).
- **Math:** `CinematicMath.getTarget()` calculates the center percentage (`targetCenterX = (x + width/2) / viewportWidth * 100`). It clamps to a safe zone (15% to 85%) to avoid zooming into extreme edges.
- **Interpolation:** `CanvasRenderer` uses a linear interpolation `lerp` with a "sprung progress" (an overshoot factor injected between 80% and 110% progress using `Math.sin`).
- **Execution:** `ctx.translate` and `ctx.scale` are applied to exactly center the calculated percentage on the canvas.

## 7. Preview vs Export Parity Map

| Feature              | Preview Path (`VideoCanvas` rAF)                 | Export Path (`handleSOPVideoExport`)                        |
| :------------------- | :----------------------------------------------- | :---------------------------------------------------------- |
| **Clock**            | `<video>.currentTime` (Realtime, Wall-clock)     | Deterministic loop (`targetMs`), `f / fps`                  |
| **Asset Source**     | `<video>` element                                | `WorkerExtractor` yielding `VideoFrame` / `ImageBitmap`     |
| **Render Engine**    | `CanvasRenderer.render()`                        | `CanvasRenderer.render()` (Identical)                       |
| **Spring Math**      | Realtime easing based on elapsed wall-clock time | Hardcoded overdamped spring `1 - Math.pow(1 - progress, 4)` |
| **Transition Latch** | Latches onto `uiStepChangeTime`                  | Deterministically calculates step durations                 |
| **Failure Mode**     | Drifts or stutters on low CPU                    | Drops frames (Magenta fallback) if decode fails             |

**Parity Drift Risks:** Export uses a strictly computed spring progress formula, whereas Preview uses a dynamic wall-clock delta. If frame decoding lags, export stays perfectly timed because it waits for the frame, while preview drops frames and jumps.

## 8. SOP / Demo / Video / Slides Mode Map

- **Video (Hybrid):** Plays the continuous screen recording. The video playhead dictates the current step. Uses `VideoCanvas`.
- **Slides (Slideshow):** Swaps the video asset for static `screenshotKey` images. Steps are advanced manually or on a timer. Bypasses the video playhead.
- **SOP:** Rendered by `SOPCanvas`. A vertical scrolling document of `StepCard`s. Clicking a card updates the global `currentStepIndex`, which the `VideoCanvas` (running invisibly or split-screen) respects.
- **State Bleed:** `useStudioStore` owns `currentStepIndex`. If you seek in Video, SOP scrolls. If you click in SOP, Video seeks.

## 9. Session JSON / Hydration Deep Trace

**Reference:** `scratch/session_dump.json`

- **Raw Structure:** An object with `startedAt`, `endedAt`, `events` array, `steps` array, `screenshots`, `videoKey`, and `aiOutputs`.
- **Backend (`SessionService.ts`):** Flattens `content` strings into JSON. Returns raw data mixed with R2 keys.
- **Frontend (`useStudioStore.ts`):**
  - Iterates over `events` to build `steps` if they are missing.
  - Normalizes `timestamp`: Subtracts `sessionStartTime` to convert absolute epoch timestamps (1778865296878) into relative milliseconds (e.g., 2000ms).
  - Merges `screenshots` array into the root of each `step` object as `screenshotKey`.
  - Promotes `animationTarget` to the root of the step.

## 10. CSS / Layout / Responsiveness Audit

- **SOP View:** Relies on `.scroll-y` and sticky/fixed positioning for the grid. The `SOP_MAX_WIDTH` constant keeps it constrained.
- **Video Canvas:** Utilizes absolute positioning to fill its container. The internal canvas resolution is fixed (2880x1440) for high-DPI crispness, scaling down via CSS `width: 100%; height: 100%`.
- **Export Canvas:** A hidden DOM element (`id='export-compositor'`) fixed at `0,0` with `0.05` opacity to force the browser to hardware-accelerate it without obscuring the UI.

## 11. Source-of-Truth Map

- **Playback Time:** `videoRef.current.currentTime` (in Hybrid Mode).
- **Current Step:** `useStudioStore.currentStepIndex`.
- **Render Mode:** `useStudioStore.renderMode`.
- **Screenshots:** `session.assets[step.screenshotKey]`.
- **Camera Target:** Derived dynamically by `CinematicMath.getTarget()` from `step.data.coordinates` or `step.animationTarget`.

## 12. Legacy / Split-Logic Map

- **Nested vs Flat Steps:** The hydration logic contains extensive shims to support old sessions where `screenshotKey` and `timestamp` were nested inside a stringified `content` field.
- **`events` Fallback:** If a session lacks a `steps` array, the frontend falls back to parsing the raw `events` array directly.
- **R2 Keys:** `videoKey` vs `r2VideoKey` discrepancy handled by the frontend normalizer.

## 13. Backend/Frontend Contract

- **Expectation:** Backend sends raw `session` rows with a joined `steps` table and mapped `artifacts` for screenshots.
- **Fragility:** The frontend heavily relies on timestamp alignment. If `startedAt` is missing, it falls back to `capturedAt`, which can introduce a 1-3 second drift between the video and the step timing.
- **Transformations:** All timestamps are normalized to 0-based relative milliseconds locally.

## 14. Runtime Ownership Map

- **Player Clock:** `VideoCanvas` (`<video>` element).
- **Camera State:** `CanvasRenderer` (stateless, computed per-frame).
- **Export Orchestration:** `handleSOPVideoExport` (in `VideoCanvas.tsx`).
- **Session Hydration:** `useStudioStore` (`fetchSession`).
- **Telemetry:** `TelemetryService` (injected manually throughout export and player events).

## 15. Actionable Fixes & Insights

- **What is unified:** The visual rendering engine (`CanvasRenderer`) and math (`CinematicMath`) are strictly shared between preview and export.
- **What is fragile:** The timeline synchronization. Export calculates exact millisecond offsets via a `for` loop, while preview relies on the unpredictable wall-clock and `video.currentTime`.
- **What should be fixed first:** The absolute timestamp normalization (`startedAt` vs `capturedAt`) in `useStudioStore` needs robust backend validation, as it is the primary cause of audio/video desync and camera panning drift.

---

## Section 15 — Full Runtime Timeline Trace

### A. Application Boot — Exact Initialization Order

1. **`main.tsx`** — `ReactDOM.createRoot(document.getElementById('root')).render(<App />)`. React root mounts.
2. **`useStudioStore` (Zustand)** — Store singleton is created on first import. Synchronous initial state: `route = { name: 'home', params: {} }`, `session = null`, `isPlaying = false`, `currentStepIndex = 0`, `renderMode = 'hybrid'`. No async work yet.
3. **`App.tsx` mounts** — First `useEffect(syncRouteFromUrl, [])` fires after first paint. Reads `window.location.search`.
4. **Token exchange** — If `?token=` exists, `sessionManager.loginWithGoogle(token)` is called. This hits the backend to exchange the Google token, then stores `sb_token` in `localStorage`. The URL is cleaned via `window.history.replaceState`.
5. **`sessionManager.syncWorkspaces()`** — Fires if authenticated. Resolves `workspaceId` from backend and stores in `localStorage('sb_active_workspace')`.
6. **URL routing** — If `?session=<id>` is present, `store.navigate('studio', { sessionId })` fires, mutating `store.route` and calling `window.history.pushState`.
7. **`StudioPage` renders** — Returned by `App.renderRoute()` when `route.name === 'studio'`. `useSessionManager()` hook is invoked.
8. **`useSessionManager` effects** — Two effects register: (a) `ThemeService.applyBrand(brand)` applies CSS vars immediately. (b) Reads `?session=` from URL and calls `store.fetchSession(sessionId)`.
9. **Loading state** — `StudioPage` shows spinner (`!session` guard). `VideoCanvas`, `SOPCanvas`, `DemoCanvas` are NOT mounted yet.
10. **`fetchSession` async completes** — Store writes `set({ session: sessionData })`. React re-renders `StudioPage`.
11. **Canvas mounts** — `AnimatePresence` keyed on `activeView` mounts `VideoCanvas` (default `activeView = 'video'`). All `useEffect` hooks in `VideoCanvas` register and fire.
12. **rAF loop starts** — First `requestAnimationFrame(tick)` is scheduled. `progressSpring` is at `0`.

**Cold-load total latency:** ~400–1200ms (network round trip for D1 session row + optional R2 JSON fetch).

---

### B. Opening a Session — Full Fetch Lifecycle

1. **`store.fetchSession(sessionId)`** — Sets `sessionError = null`. Calls `apiClient.get('/sessions/<id>')`.
2. **`apiClient.get`** — Constructs URL as `${V1_API_URL}/sessions/<id>`. Sends `Authorization: Bearer <sb_token>` and `x-workspace-id` headers.
3. **Backend route `GET /v1/sessions/:id`** — `authMiddleware` verifies JWT. `workspaceMiddleware` resolves workspace. `SessionService.getById(id, ws.id)` runs three D1 queries: sessions row, `steps JOIN sops`, and `artifacts WHERE type='screenshot'`.
4. **Backend response** — Returns merged object with `sessionJsonUrl` pointing to `/v1/assets/<r2JsonKey>` if `r2JsonKey` is set.
5. **Second fetch (R2 JSON)** — If `data.sessionJsonUrl` exists, `apiClient.get(data.sessionJsonUrl)` fetches the raw session dump from R2. This is the `session_dump.json` shape: `{ events[], steps[], screenshots[], videoKey, startedAt, aiOutputs }`.
6. **Merge** — `sessionData = { ...dbRow, ...r2Json }`. R2 JSON wins on field conflicts (it is more complete).
7. **Events → Steps fallback** — If `sessionData.steps` is empty but `events[]` exists, steps are constructed from events. Each event maps to a `Step` with `id = evt.id || 'step-<i>'`, `timestamp = evt.timestamp`, and `screenshotKey` from the `screenshots` map keyed by `rawEvents.indexOf(evt)`.
8. **Timing normalization** — `sessionStartTime = new Date(startedAt).getTime()` (or `capturedAt` or `steps[0].timestamp`). Each step: `normalizedTimestamp = rawTimestamp > 1_000_000 ? Math.max(0, rawTimestamp - sessionStartTime) : rawTimestamp`.
9. **Step content flatten** — Each step's optional `content` object (D1 JSON blob) is spread to root level: `{ ...step, ...step.content }`. This is the legacy shim for old sessions where metadata was nested.
10. **Asset map** — After flattening, `assets[videoKey] = apiClient.getUrl('/assets/<videoKey>')` (appends `?token=<sb_token>`). Same for each `step.screenshotKey` and `step.voiceoverKey`.
11. **Brand sync** — If `sessionData.brand` exists, `set({ brand: { ...state.brand, primaryColor, logoUrl, ... } })`.
12. **`set({ session: sessionData })`** — Full write. React subscribers re-render.
13. **Initial step** — `set({ focusedStepId: steps[0].id, focusedStepIndex: 0 })`.
14. **`VideoCanvas` mounts** — The hidden `<video>` element's `src` is set to `session.assets[session.videoKey]`. No explicit `preload` attribute. Browser begins preloading at its discretion.
15. **First rAF render** — `video.readyState` is likely 0 or 1 (no data). `drawImage(video, ...)` draws a black frame. Grid and radial glow render correctly regardless.

---

### C. Starting Playback — Exact Chain

1. Play button click → `setPlaying(!isPlaying)` → `store.setPlaying(true)` → `set({ isPlaying: true })`.
2. **`useEffect` on `[isPlaying, videoUrl, renderMode]`** (VideoCanvas line ~730): `renderMode === 'hybrid' && isPlaying` → `videoRef.current.play()`. This is asynchronous (returns a Promise).
3. **rAF loop (already running)** — The `tick()` function now passes the step-advance check: `hybrid && isPlaying && nextStep && videoMs >= nextStep.timestamp`.
4. **`video.currentTime` advances** — Each rAF tick: `videoMs = video.currentTime * 1000`.
5. **Step sync** — When `videoMs >= steps[currentIndex + 1].timestamp`: `store.setStepIndex(currentIndex + 1)`.
6. **`useEffect` on `[currentStepIndex]`** fires:
   - `progressSpring.set(0)` (immediate snap to 0).
   - `setTimeout(() => progressSpring.set(1), 0)` (schedules animation toward 1 on next microtask).
   - `stepStartTimeRef.current = video.currentTime * 1000`.
   - `window.uiStepChangeTime = performance.now()`.
7. **Spring animation** — `useSpring(0, { stiffness: 60, damping: 20 })` interpolates from 0→1 over ~600–800ms of real time. Each rAF tick reads `progressSpring.get()` for the current interpolated value.
8. **Renderer invocation** — `renderer.render(ctx, { step, prevStep, progress: springProgress, ... }, video)`.
9. **Canvas draw order**: drawBackground → camera lerp → ctx.save/translate/scale → drawMainAsset → drawInteractionHighlight → ctx.restore → drawOverlays.

---

### D. Per Animation Frame — Exact Execution Order (rAF tick)

```
1.  canvas = canvasRef.current; video = videoRef.current
2.  Guard: if (!canvas || !video || !currentStep) → re-queue rAF, return early
3.  Resolution: internalW=2880, internalH=1444. Set if canvas.width differs.
4.  ctx = canvas.getContext('2d')
5.  videoMs = video.currentTime * 1000
6.  wallClockElapsed = performance.now() - window.uiStepChangeTime
7.  currentState = useStudioStore.getState()            ← Zustand snapshot (NOT React subscription)
8.  currentIndex = currentState.currentStepIndex
9.  nextStep = steps[currentIndex + 1]
10. [HYBRID STEP ADVANCE] if hybrid && isPlaying && nextStep && videoMs >= nextStep.timestamp:
      currentState.setStepIndex(currentIndex + 1)
11. [SLIDE ADVANCE] if slideshow && isPlaying && wallClockElapsed >= 3000:
      currentState.setStepIndex(currentIndex + 1) OR setPlaying(false) + setIsEnded(true)
12. [END DETECTION] if isPlaying && !nextStep && video.ended:
      setPlaying(false), setIsEnded(true)
13. [TIME SYNC] if isPlaying && |store.currentTime - video.currentTime| > 0.5:
      store.setCurrentTime(video.currentTime)
14. springProgress = (slideshow) ? 1.0 : progressSpring.get()
15. ctx.clearRect(0, 0, 2880, 1444)
16. ctx.save()
17. renderer.render(ctx, spec, masterFrame):
    └─ drawBackground: fillRect(dark) + grid dots + radialGradient(primaryColor)
    └─ target = CinematicMath.getTarget(step, renderMode)
    └─ prevTarget = CinematicMath.getTarget(prevStep) || target (LATCH)
    └─ overshootFactor = (progress > 0.8 && < 1.1) ? sin((p-0.8)*π*1.5)*0.08 : 0
    └─ currentX = lerp(prevTarget.centerX, target.centerX, progress + overshootFactor)
    └─ currentY = lerp(prevTarget.centerY, target.centerY, progress + overshootFactor)
    └─ currentScale = lerp(prevTarget.zoomScale, target.zoomScale, progress)
    └─ ctx.translate(width/2, height/2)
    └─ ctx.scale(currentScale, currentScale)
    └─ ctx.translate(-(currentX/100)*width, -(currentY/100)*height)
    └─ drawMainAsset: roundRect clip + ctx.drawImage(masterFrame, 0, 0, dw, dh)
    └─ drawInteractionHighlight: ring at (coords.x/vw)*dw, (coords.y/vh)*dh
    └─ ctx.restore()
    └─ drawOverlays: annotations (fade-in) + typing overlay (if input action)
18. ctx.restore()
19. rafId = requestAnimationFrame(tick)   ← reschedule, loop continues
```

**Key race:** Step 10 writes to the store. Step 7 is a Zustand snapshot taken at frame start. If `setStepIndex` fires mid-tick, the snapshot is stale for the REST of this frame. The new index is only visible on the NEXT frame's snapshot. This is a one-frame lag, acceptable but important for debugging timing issues.

---

### E. Switching Modes — State Transitions

#### Video → Slides

- `setRenderMode('slideshow')` → `renderMode = 'slideshow'` in store.
- `useEffect([isPlaying, videoUrl, renderMode])` in VideoCanvas fires → `videoRef.current.pause()`.
- rAF loop continues. `masterFrame` becomes `slideImageRef.current || video`.
- Next step change: `progressSpring.jump(1.0)` (immediate snap, no animation).
- **Hidden risk:** If `isPlaying` is still `true` in store (user didn't pause before switching), the slideshow auto-advance (3-second latch) activates immediately. The `video` element is paused but `isPlaying` is `true`.

#### Slides → Video

- `setRenderMode('hybrid')` → `renderMode = 'hybrid'`.
- `useEffect([isPlaying, videoUrl, renderMode])` fires → if `isPlaying`, `videoRef.current.play()`.
- **Camera snap risk:** Slideshow advanced steps by wall-clock (every 3s). Video may have `currentTime` far behind the current `currentStepIndex`. The `useEffect([currentStepIndex])` will seek the video to `steps[currentStepIndex].timestamp / 1000` to re-align, but only if `!isPlaying` at the time of the effect.

#### SOP → Video

- `setActiveView('video')` → store `activeView = 'video'`.
- `AnimatePresence` in `StudioPage` (key=activeView): `SOPCanvas` unmounts, `VideoCanvas` mounts fresh.
- `VideoCanvas` mounts: ALL useEffects re-run. `progressSpring` re-initializes at 0. Video seeks to `steps[currentStepIndex].timestamp / 1000`.
- `currentStepIndex` and `isPlaying` persist from store. A full re-animation from 0→1 plays on the current step.

#### Demo → Video

- Identical to SOP → Video. `DemoCanvas` unmounts, `VideoCanvas` mounts fresh with cold `progressSpring`.

---

### F. Export Frame Lifecycle — Complete Internal Order

1. Export button → `handleSOPVideoExport({ session, theme: brand, renderMode })`.
2. Guard: `store.isExporting` → return if true. Set `isExporting=true`, `exportStatus='checking'`.
3. **Health check:** `navigator.deviceMemory < 4` (warning only). `fetch(videoUrl, HEAD)` (asset reachability). `window.VideoDecoder` existence (hard abort if missing).
4. **Export canvas:** `createElement('canvas')`, `width=2880`, `height=1444`. Appended to `document.body` with `opacity: 0.05`, `position: fixed`, `zIndex: 9999`. Forces GPU rasterization path.
5. **MediaRecorder:** `canvas.captureStream(60)` → `MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 25_000_000 })`. `recorder.start(1000)`.
6. **Export video element:** `createElement('video')`, hidden, `crossOrigin='anonymous'`, `src=videoUrl`. Wait for `onloadedmetadata` or 5s timeout.
7. **CORS validation:** Test canvas draw + `toDataURL()`. Hard abort if tainted.
8. **`WorkerExtractor.init(videoUrl)`:** Posts `INIT` to `extractor.worker.ts`. Worker fetches blob, runs `WebMFrameExtractor.init(blob)`: `WebMIndexer` EBML scan builds frame index (timestamp, offset, size, isKeyframe). `VideoDecoder` is configured with VP9 codec config (or synthesized VpcC box if `CodecPrivate` is missing). `prefer-software` hardware acceleration is forced.
9. **Step loop** (sequential `for i = 0..steps.length-1`):
   - `store.setStepIndex(i)` (UI update).
   - Chapter card: 60 frames of `ctx.fillStyle = brand.primaryColor; ctx.fillText(...)` if chapter map has entry for `steps[i-1].id`.
   - `stepDuration = Math.max(2, step.duration || 5)`. Scaled by 1.5 if `jumpDist > 40`.
   - `stepFrames = Math.floor(stepDuration * 60)`.
   - Frame loop `f = 0..stepFrames`:
     - `cameraProgress = Math.min(1.0, (f/60) / 1.2)` — camera motion completes in first 1.2s.
     - `springProgress = 1 - Math.pow(1 - cameraProgress, 4)` — overdamped power-4 curve.
     - `calculatedMs = step.timestamp + (f / stepFrames) * stepDuration * 1000`.
     - `safeTargetMs = Math.max(absoluteLastLoggedMs + 1, Math.floor(calculatedMs))` — strict monotonic forward latch.
     - Frame reuse: if `safeTargetMs - absoluteLastLoggedMs < 12`, reuse `masterFrame`.
     - Frame extraction: `extractor.getFrame(toRelativeMs(safeTargetMs))` → `WorkerExtractor.sendRequest('GET_FRAME')` → worker's `WebMFrameExtractor.getFrame(timestampMs)`:
       - Find nearest frame index in `indexer.getFrames()` by minimum timestamp delta.
       - Check `frameCache` (Map of up to 40 VideoFrame objects, evicts oldest).
       - If cache miss: check if restart needed (`targetIndex < lastRequestedIndex`). If so, `restartAtKeyframe()`: `decoder.reset()`, `decoder.configure(activeConfig)`, clear cache.
       - Feed pressure burst (15 frames ahead) of `EncodedVideoChunk` objects. Each chunk: `new EncodedVideoChunk({ type: 'key'|'delta', timestamp: entry.timestamp * 1000 (microseconds), data: Uint8Array(videoBuffer, entry.offset, entry.size) })`. `decoder.decode(chunk)`.
       - `VideoDecoder.output` callback fires for each decoded frame: `handleOutput(frame)` → clones frame into `frameCache`, resolves pending `frameResolvers` promise.
       - Worker converts `VideoFrame` to `ImageBitmap` via `createImageBitmap(frame)`, closes the `VideoFrame`, posts `{ type: 'FRAME_SUCCESS', payload: { bitmap }, requestId }` with `[bitmap]` as transferable.
       - Main thread receives bitmap via `WorkerExtractor.pendingRequests` resolution.
     - `renderer.render(ctx, spec, masterFrame || screenshotImg)`.
     - `videoTrack.requestFrame()` → forces `MediaRecorder` to sample canvas NOW.
     - `await requestAnimationFrame(...)` → yields to compositor.
   - `masterFrame.close()` after each step's inner loop.
10. **Recorder stop:** `recorder.stop()` → `recorder.onstop` fires → `new Blob(chunks, { type: 'video/webm' })`. If `blob.size < 1000`, logs error. Else triggers download via `<a>.click()`.
11. **R2 upload:** `PUT /v1/assets/file?key=videos/<sessionId>/export_<timestamp>.webm`. `PATCH /v1/sessions/<id>` with `{ r2VideoKey, r2ExportKey }`.
12. **Cleanup:** `extractor.destroy()` (flushes cache, closes `VideoDecoder`, terminates `Worker`). DOM removals for canvas, exportVideo, infoOverlay. `store.setIsExporting(false)`.

---

## Section 16 — Full State Dependency Graph

### `currentTime` — DUAL SOURCE, CONFIRMED SPLIT OWNERSHIP

```
video.currentTime (DOM — true clock in hybrid mode)
 ├── Advances autonomously via browser media pipeline
 ├── Written by: videoRef.current.currentTime = targetTime (seek on step change)
 ├── Read by: rAF tick() → videoMs = video.currentTime * 1000
 ├── Drives: step advance (videoMs >= nextStep.timestamp)
 └── NOT accessible outside VideoCanvas. Fully encapsulated.

store.currentTime (float, seconds — lagging mirror)
 ├── Written by: rAF tick() IF |store.currentTime - video.currentTime| > 0.5s
 ├── Read by: VideoCanvas useEffect on [currentStepIndex] to seed seek target
 └── RISK: Up to 0.5 second staleness vs real video position
```

### `currentStepIndex` — MULTIPLE CONCURRENT WRITERS

```
currentStepIndex (int, store)
 ├── Writers:
 │   ├── rAF tick: setStepIndex(currentIndex + 1) on timestamp cross
 │   ├── SOP/Demo click: setFocusStep() → setStepIndex()
 │   ├── Bottom controls: SkipBack/SkipForward buttons
 │   └── Export loop: store.setStepIndex(i) per step
 ├── Drives: VideoCanvas useEffect → video seek + progressSpring reset
 ├── Drives: SOPCanvas scrollTrigger scroll sync
 ├── Drives: focusedStepId + focusedStepIndex (co-mutation in setStepIndex)
 └── RISK: rAF writes and click handler writes can collide within the same frame.
            No mutex or locking mechanism exists.
```

### `renderMode` — PROPAGATION CHAIN

```
renderMode ('hybrid' | 'slideshow', store)
 ├── Written by: StudioPage header setRenderMode()
 ├── Drives: VideoCanvas video play/pause behavior
 ├── Drives: masterFrame selection (video element vs slideImageRef)
 ├── Drives: springProgress override (slideshow → always 1.0)
 ├── Drives: CanvasRenderer viewMode ('cinematic' vs 'fit')
 └── RISK: Does NOT stop the rAF loop. Loop runs at 60fps regardless of renderMode.
```

### `screenshotKey` → `screenshotUrl` — FRAGILE ASSET REFERENCE

```
step.screenshotKey (string — R2 key)
 ├── Source: session_dump.json screenshots[] keyed by stepIndex
 ├── Normalized by: fetchSession screenshotByIndex Map
 ├── Drives: session.assets[screenshotKey] → full authenticated URL
 ├── Consumed by: slideImageRef preloader, export fallback, SOPCanvas StepCard
 └── RISK: Empty string "" screenshotKey produces assets[""] = broken URL. No guard.
```

### `animationTarget` — DIVERGENT CALCULATION IN EXPORT

```
step.animationTarget (from session_dump.json — pre-computed by extension)
 ├── Provides: centerX, centerY, zoomScale (all as percentages or scale factor)
 ├── Used by: CinematicMath.getTarget(step) → if manual, use animationTarget; else derive from coordinates
 ├── Safe-zone clamped: Math.max(15, Math.min(85, centerX/Y))
 └── CONFIRMED DIVERGENCE:
     Preview: CinematicMath.getTarget(step) reads animationTarget.centerX directly
     Export:  handleSOPVideoExport computes targetCenterX independently:
              centerX = coords.x + (coords.width / 2); targetCenterX = (centerX / vw) * 100
              → Does NOT use animationTarget.centerX. Uses raw coordinates only.
     This means if animationTarget was manually overridden, export IGNORES the override.
```

### `springProgress` — EPHEMERAL, NON-PERSISTENT

```
springProgress (Framer Motion useSpring, VideoCanvas local state)
 ├── Initialized fresh on every VideoCanvas mount (view switch resets to 0)
 ├── Written by: useEffect([currentStepIndex]) → .set(0) then .set(1)
 ├── Read by: rAF tick → progressSpring.get()
 ├── Drives: CanvasRenderer progress (lerp factor for camera and overshoot)
 └── RISK: Every SOP→Video or Demo→Video switch triggers a full 0→1 cold animation.
```

### `isPlaying` vs `video.paused` — CONFIRMED SPLIT STATE

```
isPlaying (store, bool)
 ├── Represents: user intent (should the player be playing?)
 └── Does NOT always equal !video.paused

video.paused (DOM, bool)
 ├── Represents: actual browser media state
 └── Can differ from isPlaying during:
     - renderMode='slideshow' (video forced paused, isPlaying=true)
     - Buffering events (browser auto-pauses, store unaware)
     - play() Promise rejection (browser blocks autoplay, store thinks it's playing)
```

### Confirmed Cyclic / Dual Ownership Risks Summary

| State              | Owners                                          | Risk Level                  |
| :----------------- | :---------------------------------------------- | :-------------------------- |
| `currentStepIndex` | rAF + click handlers + export                   | HIGH — concurrent write     |
| `currentTime`      | Store (lagging) + video DOM (realtime)          | MEDIUM — 0.5s window        |
| `isPlaying`        | Store intent vs video.paused DOM truth          | MEDIUM — can diverge        |
| `screenshotKey`    | Two hydration paths in fetchSession             | MEDIUM — empty string risk  |
| `animationTarget`  | CinematicMath (preview) vs inline math (export) | HIGH — confirmed divergence |
| `springProgress`   | Local VideoCanvas state (not in store)          | LOW — expected ephemeral    |

---

## Section 17 — Export Pipeline Internal Internals

### Thread Architecture

The export pipeline spans three execution contexts:

| Context                                | Responsibility                                                     |
| :------------------------------------- | :----------------------------------------------------------------- |
| **Main thread**                        | `handleSOPVideoExport`, `CanvasRenderer`, `MediaRecorder`, DOM ops |
| **Web Worker** (`extractor.worker.ts`) | Fetch blob, `WebMFrameExtractor`, `VideoDecoder`                   |
| **Browser compositor**                 | `captureStream`, GPU rasterization, `MediaRecorder` encoding       |

The main thread is the orchestrator. The worker is a stateful decode engine. They communicate via `postMessage` with a simple request-ID map (`pendingRequests: Map<string, { resolve, reject }>`).

### WorkerExtractor — Message Protocol

```
Main → Worker:
  INIT        { url: string }           → Worker fetches blob, inits decoder
  GET_FRAME   { timestampMs: number }   → Returns nearest decoded frame as ImageBitmap
  CHECK_SUPPORT { config }              → Returns VideoDecoder.isConfigSupported result
  DESTROY     {}                        → Closes decoder, resolves

Worker → Main:
  INIT_SUCCESS    { duration: number }      → extractor.duration set
  FRAME_SUCCESS   { bitmap: ImageBitmap }   → Transferred (zero-copy)
  FRAME_ERROR     { error: string }         → Frame decode failed
  ERROR           { error: string }         → General worker error
  DESTROY_SUCCESS {}
```

**Transferable semantics:** `ImageBitmap` objects are posted with `[bitmap]` in the transfer list. This is a zero-copy transfer — the worker's reference is invalidated. The main thread owns the bitmap after transfer. **Critical: if the main thread calls `bitmap.close()` after use, VRAM is freed. If it forgets (e.g., during an exception), the bitmap leaks GPU memory.**

### WebMIndexer — EBML Frame Index

`WebMIndexer` performs a full in-memory scan of the WebM `ArrayBuffer` on init. It produces a `WebMFrameEntry[]` array:

```typescript
interface WebMFrameEntry {
  timestamp: number; // Absolute ms (clusterTimecode + blockTimecode) * (timecodeScale / 1000000)
  offset: number; // Byte offset of compressed frame data in the buffer
  size: number; // Byte count of compressed frame data
  isKeyframe: boolean; // Bit 7 of the SimpleBlock flags byte
  clusterTimecode: number;
}
```

The timestamp formula: `(clusterTimecode + blockTimecode) * (timecodeScale / 1_000_000)`. `timecodeScale` defaults to `1_000_000` (1ms per timecode unit), making timestamps naturally in milliseconds. The indexer also extracts `CodecConfig` (codec string, width, height, `CodecPrivate` as `ArrayBuffer`).

**Memory:** The full video `ArrayBuffer` is held in the worker's memory for the entire export duration. For a 5-minute recording at ~5MB/s, this is ~1.5GB of `ArrayBuffer`. This is the primary OOM risk for the export pipeline.

### VideoDecoder Lifecycle

```
State machine: 'unconfigured' → 'configured' → 'closed'

Init:    decoder = new VideoDecoder({ output: handleOutput, error: ... })
         decoder.configure(decoderConfig)          → state: 'configured'

Decode:  decoder.decode(new EncodedVideoChunk(...)) → async, output fires later
         decodeQueueSize > 12 → backpressure via setTimeout(10ms) spin

Reset:   decoder.reset()                            → clears queue, keeps state
         decoder.configure(activeConfig)            → reconfigures from scratch

Close:   decoder.close()                            → state: 'closed', irreversible
```

**`prefer-software`:** The extractor forces `hardwareAcceleration: 'prefer-software'`. This prevents hardware decoder isolation on Mac Retina (where the GPU decoder operates in a separate process and can't be tapped synchronously). The trade-off is higher CPU usage.

### VideoFrame Lifecycle (Worker Thread)

```
1. decoder.output fires → VideoFrame object created (GPU-backed pixel data)
2. createImageBitmap(frame) → new ImageBitmap created (copy from GPU to CPU-accessible)
3. frame.close()           → VideoFrame reference released (GPU memory freed)
4. postMessage({ bitmap }, [bitmap]) → ImageBitmap transferred to main thread
5. [Main thread] renderer.render(..., bitmap) → ctx.drawImage(bitmap, ...)
6. [Main thread] bitmap.close()    → ImageBitmap GPU memory freed
```

**Leak path:** If `getFrameWithRetry` returns `null` (all 3 attempts fail), `masterFrame` remains as the previous frame's bitmap. The old bitmap is never closed in this path. The `if (masterFrame) masterFrame.close()` call at the end of the inner loop does handle this case, but only at step boundary, not per-frame. During the inner loop, if a new frame fails, the stale `masterFrame` is reused without being closed — correct behavior, no leak.

### Frame Cache (Worker Thread)

```typescript
frameCache: Map<number, VideoFrame>; // keyed by frame INDEX (not timestamp)
maxCacheSize: 40; // Evicts oldest when full
```

Cache hit: `frameCache.get(targetIndex)` → returns `frame.clone()` (caller gets a new reference). The cached copy stays. If a cloned frame is never `.close()`d, it leaks. The caller (worker `handleOutput`) always adds to cache and the main thread never directly holds `VideoFrame` objects (only `ImageBitmap` after transfer), so this is contained to the worker.

### Frame Cache Eviction

```typescript
if (frameCache.size >= maxCacheSize) {
  const oldestIndex = Array.from(frameCache.keys()).sort((a, b) => a - b)[0];
  const oldestFrame = frameCache.get(oldestIndex);
  oldestFrame?.close(); // GPU memory freed
  frameCache.delete(oldestIndex);
}
```

This is an O(n log n) operation on every cache insertion (sorting all keys). With `maxCacheSize=40`, this is a fixed 40-element sort — negligible. But if `maxCacheSize` is ever increased significantly, this becomes a bottleneck.

### Restart / Keyframe Recovery

When `targetIndex < lastRequestedIndex` (backward seek) or `targetIndex > lastFedIndex + 100` (large forward jump):

```
1. decoder.reset()                  → clears internal decode queue
2. decoder.configure(activeConfig)  → reinstalls codec config
3. cleanupCache()                   → closes ALL VideoFrames in cache, clears resolvers
4. lastFedIndex = keyIndex - 1      → resumes feeding from the nearest preceding keyframe
```

The nearest keyframe is found by scanning backward from `targetIndex` until `allFrames[i].isKeyframe === true`. WebM keyframe intervals for VP9 screen recordings are typically every 2–5 seconds (every ~120–300 frames at 60fps). A restart triggers a re-decode of all delta frames from the keyframe to the target — potentially 120+ `decoder.decode()` calls before the target frame is emitted.

### Decode Timeout and Recovery

```typescript
setTimeout(() => {
  if (frameResolvers.has(targetIndex)) {
    consecutiveTimeouts++;
    frameResolvers.delete(targetIndex);
    this.restartAtKeyframe(targetIndex);
    if (consecutiveTimeouts >= 5) {
      consecutiveTimeouts = 0; // Reset counter, frame is abandoned
    }
    resolve(null); // Returns null → main thread uses fallback
  }
}, 2500);
```

A 2.5-second timeout per frame. If the decoder stalls (hardware flush, queue full), this fires. `getFrameWithRetry` in the main thread tries up to 3 times with exponential backoff (100ms, 200ms, 300ms). After all retries, `null` is returned and the previous `masterFrame` is reused (frame stutter, not a black frame).

### MediaRecorder Pipeline

```
canvas.captureStream(60)     → CanvasCaptureMediaStreamTrack at 60fps
MediaRecorder(stream, {
  mimeType: 'video/webm;codecs=vp9',
  videoBitsPerSecond: 25_000_000   // 25 Mbps
})
recorder.start(1000)         → Collect chunks every 1 second
videoTrack.requestFrame()    → Force canvas state capture per render frame
await requestAnimationFrame()  → Yield to compositor before next frame
```

**`requestFrame()` semantics:** Without this call, `MediaRecorder` samples the canvas on its own schedule (loosely 60fps based on `captureStream(60)`). With `requestFrame()`, each render loop iteration forces a capture, guaranteeing one-to-one correspondence between rendered frames and encoded frames. This is the key mechanism ensuring 60fps output even when the `await` calls inside the loop take variable time.

### Cleanup Ownership Chain

| Resource                            | Created by                | Destroyed by                       | Risk if missed              |
| :---------------------------------- | :------------------------ | :--------------------------------- | :-------------------------- |
| Export canvas (DOM)                 | `handleSOPVideoExport`    | `finally` block DOM removal        | Permanent invisible element |
| Export video (DOM)                  | `handleSOPVideoExport`    | `finally` block DOM removal        | Persistent media element    |
| `infoOverlay` (DOM)                 | `handleSOPVideoExport`    | `finally` block DOM removal        | Stale overlay               |
| `WorkerExtractor`                   | `handleSOPVideoExport`    | `extractor.destroy()` in `finally` | Worker thread leak          |
| `videoTrack` (MediaStreamTrack)     | `canvas.captureStream`    | `videoTrack.stop()` in `finally`   | MediaStream leak            |
| `ImageBitmap` (main thread)         | Worker transfer           | `masterFrame.close()` per step     | GPU VRAM leak               |
| `VideoFrame` objects (worker)       | `VideoDecoder.output`     | `frame.close()` or cache eviction  | Worker VRAM leak            |
| `videoBuffer` (ArrayBuffer, worker) | `WebMFrameExtractor.init` | `destroy()` sets to null           | ~1.5GB heap retained        |

**Critical gap:** The post-recorder R2 upload and PATCH session code (lines ~553–580 in `VideoCanvas.tsx`) runs AFTER the `finally` block. This means cleanup has already occurred before the upload finishes. If the upload fails, there is no retry and no state rollback. The export is considered locally complete but cloud sync fails silently.

---

## Section 18 — Session Data Evolution Map

### V1 Session Format (Legacy — Extension Era)

The earliest session format was a flat object with an `events` array only. No `steps` field existed. Steps were entirely a frontend concept, derived at hydration time from the raw events.

```json
{
  "sessionId": "<uuid>",
  "startedAt": "<ISO>",
  "endedAt": "<ISO>",
  "tabUrl": "<string>",
  "status": "stopped",
  "events": [
    {
      "type": "click",
      "timestamp": 1778865296878,
      "selector": "<css-selector>",
      "coordinates": { "x": 325, "y": 36, "viewportWidth": 1440, "viewportHeight": 778 },
      "data": {
        "action": "click",
        "elementText": "Product",
        "elementRole": "div",
        "pageTitle": "...",
        "url": "https://...",
        "coordinates": { ... }
      }
    }
  ]
}
```

**Key characteristics:**

- No `steps` array. Steps were derived from `events` at hydration.
- No `screenshots` field. Screenshots were attached to events via `data.screenshotKey`.
- No `animationTarget`. Camera targets were computed entirely from `coordinates`.
- No `videoKey`. Video was stored and referenced by a separate mechanism.
- `timestamp` values were raw epoch milliseconds (absolute, e.g., `1778865296878`).
- `generatedText` was embedded inside `data` nested object.
- `voiceoverKey` was inside `data`, not at root.

### V2 Session Format (Transitional — Post-Pipeline Era)

After the AI pipeline was introduced, sessions gained a `steps` array, but steps were stored with nested `content` JSON blobs in the D1 database. The `steps` array in the R2 JSON dump mirrors the `events` array structure but with additional fields.

```json
{
  "sessionId": "<uuid>",
  "startedAt": "<ISO>",
  "endedAt": "<ISO>",
  "events": [ ... ],
  "steps": [
    {
      "id": "step-0",
      "sequence": 1,
      "action": "click",
      "timestamp": 1778865296878,
      "selector": "<css>",
      "generatedText": "Click Product",
      "voiceoverKey": null,
      "animationTarget": {
        "centerX": 22.57,
        "centerY": 4.63,
        "zoomScale": 2.5,
        "transitionType": "fade",
        "transitionDurationMs": 400
      },
      "data": { ... full event data ... }
    }
  ],
  "screenshots": [
    { "stepIndex": 0, "r2Key": "screenshots/<assetId>/0.jpg" }
  ],
  "videoKey": "videos/<assetId>/screen-recording.webm",
  "aiOutputs": {
    "title": "...",
    "summary": "...",
    "tags": ["..."]
  }
}
```

**Key changes from V1:**

- `steps[]` now exists alongside `events[]` (they are parallel arrays — same data, different format).
- `animationTarget` moved to step root (pre-computed by extension at capture time).
- `screenshots[]` is a separate top-level array, keyed by `stepIndex`.
- `videoKey` is now a root field.
- `aiOutputs` is a root field (generated by the AI pipeline after upload).
- Timestamps remain absolute epoch milliseconds.

**D1 representation:** In the database, `steps` have a `content` TEXT column containing a stringified JSON blob of the step data. The frontend `fetchSession` code spreads `...step.content` to flatten it.

### Current Session Format (Canonical — session_dump.json)

The `session_dump.json` file is the canonical representation as stored in R2:

```json
{
  "sessionId": "fbc991ab-75b6-4cc9-b3f9-dc095179cdde",
  "startedAt": "2026-05-15T17:14:53.011Z",
  "endedAt": "2026-05-15T17:15:05.111Z",
  "tabUrl": "Brand Kit - My Framer Site",
  "status": "stopped",
  "events": [ ... ],        // Raw capture events (parallel to steps)
  "steps": [ ... ],         // Pre-processed steps with animationTarget at root
  "screenshots": [
    { "stepIndex": 0, "r2Key": "screenshots/<assetId>/<index>.jpg" }
  ],
  "videoKey": "videos/<assetId>/screen-recording.webm",
  "aiOutputs": {
    "title": "Navigate to AI Avatars Blogs and Explore Related Tools",
    "summary": "...",
    "tags": ["Product Navigation", "AI Avatars", ...]
  }
}
```

**Canonical field analysis from the dump:**

| Field                  | Raw or Derived          | Source              | Essential for                         |
| :--------------------- | :---------------------- | :------------------ | :------------------------------------ |
| `sessionId`            | Raw                     | Extension           | Session lookup                        |
| `startedAt`            | Raw                     | Extension           | Timestamp normalization baseline      |
| `endedAt`              | Raw                     | Extension           | Duration calculation                  |
| `events[]`             | Raw                     | Extension           | Legacy hydration fallback             |
| `steps[]`              | Raw (pre-processed)     | Extension           | Primary step data                     |
| `step.timestamp`       | Raw (absolute epoch ms) | Extension           | Normalized at hydration               |
| `step.animationTarget` | Pre-computed            | Extension           | Camera targeting                      |
| `step.coordinates`     | Raw                     | Extension           | Camera fallback if no animationTarget |
| `step.generatedText`   | AI-derived              | Backend AI pipeline | SOP display                           |
| `step.voiceoverKey`    | Asset reference         | Backend             | Audio playback                        |
| `screenshots[].r2Key`  | Asset reference         | Extension upload    | Screenshot mapping                    |
| `videoKey`             | Asset reference         | Extension upload    | Video playback                        |
| `aiOutputs`            | AI-derived              | Backend AI pipeline | Title, tags, summary                  |

### Normalization Rules Applied at Hydration

```
Rule 1: If steps[] is empty and events[] exists → derive steps from events
Rule 2: If step.timestamp > 1_000_000 → it is absolute epoch ms → subtract sessionStartTime
Rule 3: If step has no id → assign "step-<i>"
Rule 4: If step has no screenshotKey → look up screenshots[].r2Key by index
Rule 5: If step.content exists (D1 format) → spread it: { ...step, ...step.content }
Rule 6: If sessionData.videoKey is null but r2VideoKey exists → use r2VideoKey
Rule 7: If screenshotKey is missing from both step and screenshots[] → assign ""
Rule 8: If animationTarget is at step.data.animationTarget (legacy) → not promoted automatically
```

**Rule 8 is a hidden bug:** In V1 sessions, `animationTarget` was inside `step.data`. The normalization code spreads `step.content` but NOT `step.data`. So legacy V1 sessions will have `step.animationTarget = null` (missing from root), and `CinematicMath.getTarget()` falls back to computing camera from coordinates. This is usually acceptable but silently loses any manual camera overrides set on legacy sessions.

### Dangerous Legacy Baggage

1. **Parallel `events[]` and `steps[]` arrays** — Both exist in the dump. They contain the same data in slightly different formats. The frontend uses `steps[]` if available. The `events[]` array is dead weight in all non-legacy sessions, inflating the R2 JSON payload size (roughly doubles the JSON size).

2. **Absolute timestamps** — The `> 1_000_000` heuristic for detecting absolute epoch ms timestamps is fragile. A relative timestamp of exactly `1_000_001` ms (about 16.7 minutes into a session) would be incorrectly treated as absolute. In practice, recordings rarely exceed 15 minutes, but this is a latent bug.

3. **`screenshotByIndex` with `rawEvents.indexOf(evt)`** — In the events-fallback path, screenshots are keyed by `rawEvents.indexOf(evt)`. This is an O(n) operation per event in an O(n) loop = O(n²) overall. Acceptable for small sessions, but a known quadratic complexity for long sessions (100+ events).

4. **`sessionJsonUrl` trust** — The frontend constructs the R2 URL as `${origin}/v1/assets/${session.r2JsonKey}`. The origin is derived from the backend request URL (not hardcoded). If the session was created on a different deployment (staging vs prod), the asset URL may point to the wrong origin.

---

## Section 19 — Rendering Ownership Map

This section defines the exact ownership boundary for each system layer. These boundaries must be preserved in all future rewrites, AI-assisted refactors, and new feature additions.

### VideoCanvas — Owns: Orchestration, Lifecycle, Playback

| Responsibility          | Mechanism                                                                              | Notes                                       |
| :---------------------- | :------------------------------------------------------------------------------------- | :------------------------------------------ |
| Video element lifecycle | `videoRef: RefObject<HTMLVideoElement>`                                                | Hidden, `muted`, `crossOrigin=anonymous`    |
| rAF loop lifecycle      | `requestAnimationFrame(tick)` in `useEffect`, `cancelAnimationFrame(rafId)` in cleanup | Runs continuously from mount to unmount     |
| Play/pause              | Reacts to `store.isPlaying` → `video.play()` / `video.pause()`                         | Does NOT own `isPlaying`; only reacts to it |
| Step advance            | rAF `tick()` writes `store.setStepIndex()` when `videoMs >= nextStep.timestamp`        | Only writer from the rAF context            |
| Seek-on-step-change     | `useEffect([currentStepIndex])` → `video.currentTime = targetTime`                     | Imperative DOM mutation                     |
| `progressSpring`        | `useSpring(0, { stiffness: 60, damping: 20 })` local hook                              | NOT in store. Ephemeral per-mount.          |
| Export orchestration    | `handleSOPVideoExport()` — defined in the same file                                    | Should be extracted to a dedicated module   |
| Export trigger          | `useEffect([exportTrigger])` → calls `handleSOPVideoExport`                            |                                             |
| Voiceover playback      | Local `Audio` object, driven by `currentStep.voiceoverKey`                             | Independent of video element                |

**Ownership violations present:**

- `handleSOPVideoExport` is defined at the TOP of `VideoCanvas.tsx` (lines 17–581), before the component itself. It is a standalone async function, not a method of the component, but it imports and calls `useStudioStore.getState()` imperatively. This is technically correct but creates the illusion that export is owned by the canvas component — it is not. **It should be moved to a dedicated `ExportOrchestrator` module.**
- The export loop calls `store.setStepIndex(i)` for every step, which triggers React re-renders in `StudioPage` during a CPU-intensive export loop. This is a performance hazard.

### CanvasRenderer — Owns: Pure Rendering Only

| Responsibility        | Mechanism                                                         |
| :-------------------- | :---------------------------------------------------------------- |
| Background rendering  | `drawBackground()`: `fillRect`, grid dots, `createRadialGradient` |
| Camera transform      | `ctx.translate`, `ctx.scale` based on `CinematicMath` output      |
| Main asset draw       | `ctx.drawImage(masterFrame, 0, 0, dw, dh)`                        |
| Interaction highlight | Ring drawn at `coords.x/vw * dw`                                  |
| Overlay rendering     | Annotations, typing overlay                                       |

**What `CanvasRenderer` does NOT own:**

- Timing (no `Date.now()`, no `performance.now()`, no `requestAnimationFrame`)
- State (stateless class, no instance variables that persist between frames)
- Asset loading (receives `masterFrame` as a parameter)
- Playback decisions (receives `progress` as a parameter)

**`CanvasRenderer` boundary is clean.** It is the most correctly isolated module in the system. The `render()` method signature enforces this: `render(ctx, spec: RenderSpec, masterFrame)` — everything needed is passed in, nothing is read from global state.

### CinematicMath — Owns: Pure Camera Mathematics

| Method                                                               | Input                           | Output                                         |
| :------------------------------------------------------------------- | :------------------------------ | :--------------------------------------------- |
| `getHotspotPercent(coords)`                                          | `ViewportCoords`                | `{ x: %, y: % }`                               |
| `getTarget(step, renderMode)`                                        | Step object, render mode string | `CameraTarget { centerX, centerY, zoomScale }` |
| `calculateCamera(target, prevTarget, isPlaying)`                     | Two `CameraTarget` objects      | Camera transform values                        |
| `getCinematicSequence(sameContext, isLargeJump, renderMode, camera)` | Camera values                   | Framer Motion animation keyframe object        |

**What `CinematicMath` does NOT own:**

- React state
- Store access
- Rendering
- Playback control
- Side effects

**`CinematicMath` boundary is clean.** All methods are pure functions (input → output, no side effects). The `_renderMode` parameter in `getTarget` is accepted but ignored (the underscore prefix signals this). This unused parameter is dead code — a remnant from an earlier design where render mode influenced target computation.

### Store (`useStudioStore`) — Owns: Persistent Application State

| State Slice        | Who can write                                            | Who can read                                             |
| :----------------- | :------------------------------------------------------- | :------------------------------------------------------- |
| `session`          | `fetchSession`, `setSession`, `updateStep`, `deleteStep` | All canvases, panels, export                             |
| `isPlaying`        | `setPlaying`                                             | `VideoCanvas`, rAF loop                                  |
| `currentStepIndex` | `setStepIndex`                                           | `VideoCanvas`, `SOPCanvas`, `DemoCanvas`                 |
| `renderMode`       | `setRenderMode`                                          | `VideoCanvas`, `StudioPage`, `CanvasRenderer` (via spec) |
| `exportStatus`     | `setExportStatus`                                        | Export UI overlay                                        |
| `brand`            | `setBrand`, `fetchSession` (brand sync)                  | `VideoCanvas`, `CanvasRenderer` (via theme)              |
| `activeView`       | `setActiveView`                                          | `StudioPage` (controls which canvas mounts)              |
| `route`            | `navigate`                                               | `App.tsx` (routing), `StudioPage`                        |

**Store violations present:**

- `fetchSession` is both a network action AND a normalization function AND a state writer. It performs 400+ lines of transformation logic that should be in a separate `SessionNormalizer` utility. This makes it extremely hard to test.
- `setSession` (line 141) is a two-in-one function: it writes `session` AND writes `focusedStepId`/`focusedStepIndex`. These should be separate actions.

### Export Pipeline — Owns: Deterministic Frame Rendering

| Responsibility   | Implementation                                               |
| :--------------- | :----------------------------------------------------------- |
| Frame timing     | `for` loop with `f / fps` — deterministic, not wall-clock    |
| Frame extraction | `WorkerExtractor` / `WebMFrameExtractor` / `VideoDecoder`    |
| Encoding         | `MediaRecorder` with `canvas.captureStream(60)`              |
| Output delivery  | Local download via `<a>.click()` + R2 upload via `apiClient` |
| Cleanup          | `finally` block in `handleSOPVideoExport`                    |

**Export ownership violations:**

- The export pipeline reads `session` by receiving it as a parameter, but also calls `store.setStepIndex(i)` during the export loop. This is a side-channel write to the global store from inside an allegedly self-contained export function. It modifies the visible UI (progress bar) but also triggers React re-renders in `StudioPage` during a CPU-bound loop.
- The `CanvasRenderer` instance is constructed locally inside `handleSOPVideoExport` (`const renderer = new CanvasRenderer()`). This is correct isolation — the export does not share the preview's renderer instance.

### Ownership Leakage Summary

| Leakage                            | From                 | Into                      | Severity                                |
| :--------------------------------- | :------------------- | :------------------------ | :-------------------------------------- |
| Export function in canvas file     | Export orchestration | `VideoCanvas.tsx`         | HIGH — wrong module                     |
| `setStepIndex` calls during export | Export pipeline      | Store + React             | MEDIUM — UI side-effect during CPU work |
| `fetchSession` normalization       | Store action         | Data transformation layer | HIGH — separation of concerns           |
| `getState()` reads inside rAF      | VideoCanvas rAF      | Store snapshot            | LOW — acceptable pattern for perf       |
| `window.uiStepChangeTime` global   | VideoCanvas          | Window global namespace   | MEDIUM — hidden coupling                |

---

## Section 20 — Preview vs Export Mathematical Divergence

This section documents the exact formulas used in both rendering paths and identifies every divergence point.

### Preview Path — Camera Progress Calculation

**Spring initialization:**

```typescript
const progressSpring = useSpring(0, {
  stiffness: 60,
  damping: 20,
  restDelta: 0.001,
});
```

**Spring trigger (on step change):**

```typescript
progressSpring.set(0);
setTimeout(() => progressSpring.set(1), 0);
```

**Spring value read per rAF frame:**

```typescript
const springProgress = progressSpring.get();
// Returns a float in [0, 1] following an underdamped spring physics curve
```

**Framer Motion spring formula (approximate):**

```
x(t) = 1 - e^(-damping/2 * t) * (cos(ωd*t) + (damping/(2*ωd)) * sin(ωd*t))
where ωd = sqrt(stiffness - (damping/2)^2)
     stiffness = 60, damping = 20 → ωd = sqrt(60 - 100) → imaginary
```

With `damping=20`, `stiffness=60`: `damping^2 / (4 * stiffness) = 400/240 = 1.67 > 1` → **overdamped**. No oscillation. The spring settles monotonically from 0→1 over approximately 600–900ms of wall-clock time.

**This means preview `progress` is wall-clock-dependent.** On a slow machine, the spring settles slower. On a fast machine, it settles faster. The animation duration is not deterministic.

---

**Preview camera interpolation (inside `CanvasRenderer.render()`):**

```typescript
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const overshootFactor =
  progress > 0.8 && progress < 1.1
    ? Math.sin((progress - 0.8) * Math.PI * 1.5) * 0.08
    : 0;

let currentScale = lerp(prevTarget.zoomScale, target.zoomScale, progress);
let currentX = lerp(
  prevTarget.centerX,
  target.centerX,
  progress + overshootFactor,
);
let currentY = lerp(
  prevTarget.centerY,
  target.centerY,
  progress + overshootFactor,
);
```

**At any given wall-clock time `t` after step change:**

```
progress(t)   = Framer Motion spring value (non-linear, wall-clock-dependent)
currentX(t)   = prevX + (targetX - prevX) * (progress(t) + overshoot(progress(t)))
currentY(t)   = prevY + (targetY - prevY) * (progress(t) + overshoot(progress(t)))
currentScale(t) = prevScale + (targetScale - prevScale) * progress(t)
```

---

### Export Path — Camera Progress Calculation

**Per step, per frame:**

```typescript
const ANIMATION_DURATION_SEC = 1.2;
const currentFrameTimeSec = f / fps; // f / 60
const cameraProgress = Math.min(
  1.0,
  currentFrameTimeSec / ANIMATION_DURATION_SEC,
);

// Safe approximation of an overdamped spring glide
const springProgress = 1 - Math.pow(1 - cameraProgress, 4);
```

**At frame `f` within a step (for a step of `stepDuration` seconds):**

```
cameraProgress(f) = min(1.0,  f / (60 * 1.2))
                  = min(1.0,  f / 72)
                  → reaches 1.0 at f=72 (frame 72 of the step, t=1.2s)

springProgress(f) = 1 - (1 - cameraProgress(f))^4
```

This is a **polynomial easing curve** (power-4 ease-out). It is deterministic: given frame `f`, the output is always identical regardless of machine speed.

**Export camera at frame `f`:**

```
progress  = 1 - (1 - min(1.0, f/72))^4
currentX  = prevX + (targetX - prevX) * (progress + overshoot(progress))
currentY  = prevY + (targetY - prevY) * (progress + overshoot(progress))
currentScale = prevScale + (targetScale - prevScale) * progress
```

---

### Mathematical Divergence Points

#### 1. Progress Curve Shape

|                 | Preview                                                   | Export                                   |
| :-------------- | :-------------------------------------------------------- | :--------------------------------------- |
| **Formula**     | Framer Motion overdamped spring physics                   | `1 - (1 - t)^4` polynomial ease-out      |
| **Duration**    | ~600–900ms wall-clock (machine-dependent)                 | Always exactly 1.2s (72 frames at 60fps) |
| **Determinism** | Non-deterministic (varies by CPU load)                    | Fully deterministic                      |
| **Overshoot**   | Possible if spring is underdamped (not in current config) | Never (polynomial always monotonic)      |

The visual difference: preview's spring has an exponential decay envelope. Export's power-4 curve has a steeper initial movement and a more abrupt settle. At `t=0.3s` (18 frames), preview spring is at ~`0.40`, export polynomial is at `1 - (1 - 18/72)^4 = 1 - 0.75^4 = 1 - 0.316 = 0.684`. **Export shows 68% of the motion in the same time preview shows 40%.** Export camera moves faster initially.

#### 2. Camera Target Source

|                           | Preview                                      | Export                                         |
| :------------------------ | :------------------------------------------- | :--------------------------------------------- |
| **Function**              | `CinematicMath.getTarget(step, renderMode)`  | Inline calculation in `handleSOPVideoExport`   |
| **animationTarget used?** | YES — if `step.animationTarget` exists       | NO — uses `coords.x + coords.width/2` directly |
| **Safe-zone clamping**    | YES — `Math.max(15, Math.min(85, ...))`      | YES — `Math.max(15, Math.min(85, ...))`        |
| **Fallback**              | `{ centerX: 50, centerY: 50, zoomScale: 1 }` | `centerX = 50` only (no Y fallback)            |

**This is the most severe divergence.** If a session has `animationTarget` values (pre-computed by the extension, as seen in `session_dump.json`), preview uses them and export ignores them. For the sample session:

```
Step 0 animationTarget.centerX = 22.57  (preview uses this)
Step 0 coords.x = 325, coords.width = 70.89, vw = 1440
Export: centerX = (325 + 70.89/2) / 1440 * 100 = (325 + 35.45) / 1440 * 100 = 25.03
```

Preview targets **22.57%** from left. Export targets **25.03%** from left. A ~2.5 percentage point offset. At `zoomScale=2.5`, this translates to a visible camera position difference.

#### 3. Step Duration Assignment

|                           | Preview                                                         | Export                                          |
| :------------------------ | :-------------------------------------------------------------- | :---------------------------------------------- | --- | ----------- |
| **Duration per step**     | Implicit — driven by video playhead advancing to next timestamp | Explicit: `Math.max(2, step.duration            |     | 5)` seconds |
| **Acceleration**          | Proportional to `playbackRate` (1x, 1.5x, 2x)                   | Fixed — always 60fps regardless of playbackRate |
| **Jump distance scaling** | None                                                            | `stepDuration *= 1.5` if `jumpDist > 40`        |

In preview, if a step's natural video duration is 0.5 seconds (fast user click), the camera has only 0.5s to complete its animation. In export, the same step gets a minimum of 2 seconds (enforced by `Math.max(2, ...)`). **Export step durations are almost always longer than preview durations.**

#### 4. Overshoot Calculation

Both paths apply the same overshoot formula via `CanvasRenderer`:

```typescript
const overshootFactor =
  progress > 0.8 && progress < 1.1
    ? Math.sin((progress - 0.8) * Math.PI * 1.5) * 0.08
    : 0;
```

Since export's `progress` is bounded to `[0, 1.0]` by `Math.min(1.0, cameraProgress)`, the overshoot only fires when `progress` is between 0.8 and 1.0. The overshoot peak is: `Math.sin((1.0 - 0.8) * π * 1.5) * 0.08 = Math.sin(0.3π) * 0.08 = 0.809 * 0.08 = 0.065`. So the camera overshoots by up to **6.5% of the distance** between prev and target positions at `progress=0.93`.

In preview, `progress` can momentarily exceed 1.0 if the spring overshoots (though with overdamped settings, it shouldn't). If it did, the formula would compute `sin((progress - 0.8) * π * 1.5)` for values > 1.0, which could produce negative values — a reverse overshoot. This is a latent bug in preview but not export (export is capped at 1.0).

#### 5. Video Frame Source

|                    | Preview                                                              | Export                                                          |
| :----------------- | :------------------------------------------------------------------- | :-------------------------------------------------------------- |
| **Frame source**   | `<video>` element live playback                                      | `WorkerExtractor` → `VideoDecoder` → `ImageBitmap`              |
| **Frame timing**   | Driven by `video.currentTime` (browser media pipeline)               | Driven by `safeTargetMs` (deterministic formula)                |
| **Frame quality**  | Browser decoder (hardware-accelerated, unpredictable frame rounding) | Software decoder (`prefer-software`), exact timestamp targeting |
| **Dropped frames** | Browser skips frames during buffering transparently                  | Explicit: `null` returned, previous frame reused                |
| **Resolution**     | Native video resolution, scaled by `drawImage`                       | Same: `drawImage` with `imageSmoothingQuality: 'high'`          |

#### 6. Canvas Resolution

Both paths use the same internal canvas resolution: `2880 × 1444` pixels (`RenderConstants.EXPORT_COMPOSITOR_WIDTH/HEIGHT`). The preview canvas is CSS-scaled to fit the container via `width: 100%; height: 100%`. The export canvas is CSS-sized to `288px × 162px` (10x downscale visually) but renders at full 2880×1444.

#### 7. What Is Mathematically Guaranteed Identical

- Background render (grid + radial glow) — same `CanvasRenderer.drawBackground()`
- Interaction highlight ring position — same formula, same `coords`
- Safe-zone clamping — both clamp to `[15, 85]`
- Overshoot formula — identical `Math.sin` expression
- Canvas transform mechanics — same `ctx.translate` / `ctx.scale` sequence
- Asset rendering — same `ctx.drawImage` call with `imageSmoothingQuality: 'high'`

#### 8. What Is Mathematically Guaranteed to Differ

- **Camera target position** — preview uses `animationTarget.centerX/Y`, export recomputes from raw `coords`
- **Progress curve shape** — spring physics (preview) vs power-4 polynomial (export)
- **Motion timing** — wall-clock-dependent (preview) vs frame-count-dependent (export)
- **Step duration** — natural video duration (preview) vs enforced minimum 2s (export)
- **Camera velocity profile** — export camera moves faster in first 30% of transition

#### Future Backend Rendering Requirements

A server-side renderer must adopt:

1. **Deterministic timing:** The export path's `1 - (1-t)^4` formula, not Framer Motion springs
2. **`animationTarget` usage:** Must read `step.animationTarget` (not recompute from coordinates) to match preview
3. **Exact safe-zone clamping:** `Math.max(15, Math.min(85, ...))` on both X and Y
4. **Identical `CanvasRenderer` logic:** The `drawBackground`, `drawMainAsset`, `drawInteractionHighlight`, and `drawOverlays` methods must be ported exactly (or called from a shared WASM module)
5. **Step duration override:** Must expose a configurable step duration parameter to match the `Math.max(2, step.duration || 5)` logic
6. **Overshoot:** Must apply the same `Math.sin((p-0.8)*π*1.5)*0.08` formula on the same `[0.8, 1.1]` progress range

---

## Final Architectural Conclusions

### 1. Most Mature Subsystem

**`CanvasRenderer` + `CinematicMath`** — These are the most architecturally clean modules in StudioBase. They are stateless, pure, and well-bounded. They have no side effects, no global state reads, and no coupling to React or the store. They can be safely ported to a server-side renderer or WASM module with minimal modification.

### 2. Most Fragile Subsystem

**`useStudioStore.fetchSession()`** — This single function performs network I/O, JSON parsing, timestamp normalization, field flattening, legacy shim application, asset URL construction, and brand sync. It is untestable as-is. A failure at any of ~15 transformation steps can silently produce a broken session state. The `> 1_000_000` timestamp heuristic is the highest-risk line in the entire codebase.

### 3. Biggest Future Scaling Bottleneck

**Export memory usage** — The `WebMFrameExtractor` holds the full video `ArrayBuffer` in the Web Worker heap for the entire export duration. A 10-minute, 10-step session recording at 5MB/s = ~3GB `ArrayBuffer`. This will OOM on most consumer machines. The fix requires streaming EBML parsing (read chunks, don't buffer the whole file).

### 4. Biggest Future Rendering Bottleneck

**rAF loop during export** — The export loop uses `await requestAnimationFrame(...)` to yield to the compositor after each frame. At 60fps with 5-second steps, that is `60 * 5 * N_steps` yielded rAF callbacks. For a 30-step session, this is 9,000 `requestAnimationFrame` calls. Each also involves a `WorkerExtractor.getFrame()` async round-trip. The total export wall-clock time is bounded by: `sum over steps of (stepFrames * (frame_decode_time + canvas_render_time + rAF_yield_time))`. Frame decode time dominates.

### 5. Biggest Future Synchronization Risk

**The `currentStepIndex` multiple-writer problem** — When export is running (`store.setStepIndex(i)` every step), a user interaction (SOP click, skip button) writes to the same `currentStepIndex` simultaneously. Zustand is synchronous, so the last writer wins. But the export loop reads `steps[i]` by its own `i` counter (not from the store), so it is safe internally. The danger is the UI showing the wrong step during export and the `progressSpring` firing unwanted animations.

### 6. Most Dangerous Hidden Technical Debt

**`animationTarget` export divergence** — The fact that preview uses `step.animationTarget` and export recomputes camera from `coordinates` is a CONFIRMED silent bug. For sessions where `animationTarget` has been manually overridden (or where the extension computed a different value than the raw coordinate-based formula), the exported video will have visually different camera positions than what the user previewed. This can produce user-facing quality complaints that are extremely hard to diagnose without this audit.

### 7. What MUST Stay Unified

- `CanvasRenderer` — any divergence between preview and export rendering paths MUST be fixed by ensuring both call the same `renderer.render()` method
- `CinematicMath.getTarget()` — both paths must use this function for camera target resolution (export must stop computing `targetCenterX` inline)
- Safe-zone clamping constants (`15%` and `85%`) — must be defined in `RenderConstants` and shared
- Asset URL resolution — all paths must go through `apiClient.getUrl()` (no hardcoded URL construction)

### 8. What Can Safely Diverge

- Spring physics vs polynomial easing — visual style difference, acceptable
- Step duration (natural vs enforced minimum 2s) — export intent is different (cinematic, not raw)
- Playback rate effect — export always renders at 1x speed, preview respects `playbackRate`
- Canvas CSS sizing — preview scales to container, export renders at fixed 2880×1444

### 9. What Phase Should Happen Next

**Unify the camera target calculation.** Replace the inline `targetCenterX` calculation in `handleSOPVideoExport` with a call to `CinematicMath.getTarget(step, renderMode).centerX`. This single-line change eliminates the most severe preview/export parity divergence without touching any other system. It is low risk, high impact, and exactly scoped.

Second priority: Extract `handleSOPVideoExport` from `VideoCanvas.tsx` into its own `ExportOrchestrator.ts` module. This requires no logic changes — only a file move and import update.

### 10. What Should Absolutely NOT Be Refactored Yet

- **`useStudioStore.fetchSession()`** — Refactoring this risks breaking legacy session compatibility. The normalization shims exist for a reason. Any refactor here requires a comprehensive test suite against V1 and V2 session fixtures first.
- **`WebMIndexer` + `WebMFrameExtractor`** — The EBML parser is delicate. The keyframe recovery logic, codec synthesis (`VpcC box`), and timeout handling have been hard-won stability fixes. Do not touch without a dedicated video frame regression suite.
- **`CanvasRenderer.drawBackground()`** — The grid dot pattern and radial glow are customer-visible brand elements. Changing them would alter the visual identity of every exported video.

---

_This document is the permanent architecture reference for StudioBase. Last updated: 2026-05-16. All section numbers refer to the audit revision as written. Future additions should append new sections, not modify existing ones._

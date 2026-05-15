# Rendering & Export Stability Audit

This audit evaluates the current state of the StudioBase deterministic rendering pipeline and identifies critical stabilization requirements for enterprise-scale usage.

## 1. Fragile Export Areas
- **GOP Seek Stalls**: `WebMFrameExtractor` performs a full decoder reset and re-initialization when jumping between non-sequential frames. In complex edits, this causes cumulative latency that can lead to browser-level timeouts.
- **MediaRecorder Buffer Pressure**: Chunks are stored in a simple JavaScript array (`chunks: Blob[]`) in the main thread's memory. For long exports (10min+ @ 60fps), this can easily consume 2-4GB of RAM, risking `OOM` crashes.
- **CORS Taint Resilience**: Canvas integrity is checked only once. A single un-cached or failed asset later in the timeline can "taint" the canvas, causing the entire export to fail or output black frames.
- **Clock Drift**: The pipeline uses `requestAnimationFrame` and `setTimeout`. If the browser tab is throttled or suspended, the export timing becomes non-deterministic, resulting in jittery output.

## 2. Browser Assumptions
- **WebCodecs (VideoDecoder)**: Heavily optimized for Chrome/Chromium. Performance and stability varies significantly across platforms.
- **MediaStream Capture**: Relies on `canvas.captureStream()`, which is a DOM-bound API.
- **ImageBitmap Transfer**: Used for zero-copy transfer from Worker to Main Thread; not directly portable to standard Node.js/Bun environments.
- **Main Thread Compositing**: The current `handleSOPVideoExport` creates a DOM-attached canvas, which is susceptible to layout shifts and browser paint optimizations.

## 3. Memory Risks
- **VideoFrame Lifetimes**: Every frame emitted by the `VideoDecoder` consumes VRAM/RAM. While the current implementation calls `.close()`, the `frameCache` in the worker holds up to 40 uncompressed frames.
- **Closure Leaks**: Cloned frames in the `handleOutput` loop may leak if a frame resolver times out or is bypassed.
- **Bitmap Buildup**: If the compositor (Main Thread) lags behind the Extractor (Worker), `ImageBitmap` objects can accumulate in the message queue.

## 4. Backend Portability Blockers (Phase 6)
- **Missing WebCodecs**: Node.js does not provide a native implementation of `VideoDecoder` or `EncodedVideoChunk`.
- **Canvas API**: `CanvasRenderer.ts` is tightly coupled to `CanvasRenderingContext2D`. Transitioning to `OffscreenCanvas` is a required first step.
- **Image/Blob Loading**: Relies on the browser's `Image` element and `URL.createObjectURL`.

## 5. Stabilization Roadmap
- [ ] **Pre-flight Health Checks**: Validate `deviceMemory`, asset availability, and codec support before allocating buffers.
- [ ] **Offscreen Compositor**: Move rendering to `OffscreenCanvas` to reduce main-thread UI interference and prep for backend workers.
- [ ] **Explicit Recovery**: Implement a `maxRetries` per frame and an atomic "Seek-and-Verify" loop.
- [ ] **Telemetry Integration**: Emit `export.frame_decode_failed` and `export.memory_pressure_warning` events.

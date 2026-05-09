# Stage 9: Custom Player Controls & Timeline Hardening

## 1. Overview
Stage 9 focused on the total replacement of the native HTML5 video controls with a high-performance custom control bar. The primary objective was to resolve timeline desynchronization caused by WebM duration inconsistencies and to provide a premium "instant-start" playback experience via muted preview loops.

---

## 2. Exact Git Diff Analysis

### index.html — Removal of Native Controls & Custom Bar Implementation

#### B
```html
<video
  id="player"
  class="w-full h-full object-contain outline-none bg-black"
  controls
  autoplay
  playsinline
  crossorigin="anonymous"
  controlsList="nodownload"
  disablePictureInPicture
></video>
```

#### A
```html
<video
  id="player"
  class="w-full h-full object-contain outline-none bg-black"
  autoplay
  muted
  playsinline
  crossorigin="anonymous"
  controlsList="nodownload"
  disablePictureInPicture
></video>

<!-- Big Center Play Button (Hover Only) -->
<button id="center-play-btn" class="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
  <div class="w-20 h-20 bg-brand/90 backdrop-blur-md rounded-full flex items-center justify-center text-white shadow-2xl transform scale-90 group-hover:scale-100 transition-transform">
    <i id="center-play-icon" class="ph-fill ph-play text-4xl ml-1"></i>
  </div>
</button>

<!-- Custom Control Bar -->
<div id="controls-bar" class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4 pt-12 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col gap-3 z-30 pointer-events-none group-hover:pointer-events-auto">
  <!-- Progress Bar & Controls omitted for brevity -->
</div>
```

**Explanation:**
*   **What changed**: Removed `controls` attribute and added a custom UI overlay.
*   **Why it changed**: Native controls rely on the unreliable `video.duration` property for WebM files. Custom controls allow us to force `authoritativeDurationMs` as the source of truth.
*   **Lifecycle implication**: The video now starts in a `muted` state to bypass browser autoplay restrictions for the preview loop.
*   **Race-condition implication**: None; the UI components are initialized on DOMContentLoaded.

---

### index.html — Authoritative Seek & Progress Math

#### B
```javascript
function updateDurationUI() {
  let totalMs = authoritativeDurationMs;
  if (!totalMs && video.duration && isFinite(video.duration)) {
    totalMs = Math.floor(video.duration * 1000);
  }
  const current = Math.floor(video.currentTime * 1000);
  timeDisplay.textContent = `${formatTime(current)} / ${formatTime(totalMs)}`;
}
```

#### A
```javascript
function updateUI() {
  let totalMs = authoritativeDurationMs;
  if (!totalMs && video.duration && isFinite(video.duration)) {
    totalMs = Math.floor(video.duration * 1000);
  }

  if (totalMs > 0) {
    const currentMs = video.currentTime * 1000;
    const progress = (currentMs / totalMs) * 100;
    progressFill.style.width = `${Math.min(100, progress)}%`;
    seekSlider.value = Math.min(1000, (currentMs / totalMs) * 1000);
    timeText.textContent = `${formatTime(currentMs)} / ${formatTime(totalMs)}`;
  }
}
```

**Explanation:**
*   **What changed**: Refactored the UI update loop to drive both the timestamp display and the progress bar width using `authoritativeDurationMs`.
*   **Why it changed**: Prevents the progress bar from stalling at 0% or showing "Infinity" when the WebM container reports invalid metadata.
*   **Lifecycle implication**: Synchronizes the visual timeline with the actual data fetched from the backend `/meta` endpoint.
*   **Future regression risk**: If the backend fails to provide `actualDurationMs`, the player fallbacks to native duration, which may still be unstable for some files.

---

### index.html — Animated Preview Loop (0→4s)

#### B
```javascript
video.src = streamUrl;
video.load();
```

#### A
```javascript
video.src = streamUrl;
video.load();

// Wait for enough data to start muted loop
video.muted = true;
video.play().catch(() => {});

// In timeupdate listener:
if (previewLoopActive && video.currentTime >= 4) {
  video.currentTime = 0;
}
```

**Explanation:**
*   **What changed**: Implemented a conditional loop in the `timeupdate` handler that triggers only before the first user interaction.
*   **Why it changed**: Provides an "instant-start" feeling where the video appears to be playing as soon as the page loads.
*   **Lifecycle implication**: Terminated by the first `togglePlay()` call, ensuring audio and full playback are only enabled on user intent.
*   **Race-condition implication**: `video.play()` is wrapped in a catch block to prevent unhandled promise rejections if the browser blocks muted autoplay.

---

## 3. Manual Verification Steps
1.  **Seek Accuracy**: Drag the progress slider to the middle. Verify the `currentTime` matches 50% of the `authoritativeDurationMs` displayed in the time text.
2.  **Preview Loop**: Load the player. Observe the video looping 0→4s without sound.
3.  **Real Playback**: Click the center play button. Verify the video resets to 0:00 and audio is unmuted.
4.  **Shortcuts**: Press `M` to mute, `ArrowRight` to skip 15s, and `Space` to pause. Verify all respond instantly.
5.  **Hover State**: Move mouse away from the player. Verify controls fade out while playing. Verify controls stay visible while paused.

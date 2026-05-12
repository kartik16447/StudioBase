# StudioBase: Exhaustive Technical Status & Strategic Expansion Report

This document provides a deep-dive audit of the current StudioBase codebase, original roadmap objectives, and an exhaustive strategy for implementing Universal (Desktop) and Live (High-Motion) recording capabilities.

---

## 🏗️ PART 1: CURRENT ARCHITECTURAL STATE (AUDIT)

### 1. Layer 1: The "Smart Vacuum" Capture Engine
*   **Method**: DOM Event-Triggered Screenshots.
*   **Technologies**: `MutationObserver` (to detect DOM settlement), `chrome.tabs.captureVisibleTab` (high-fidelity JPEG snapshots), `selector-engine` (shadow-DOM piercing CSS selectors).
*   **Implemented Logic**: 
    - Captures `click`, `input`, `scroll`, and `navigation` events.
    - Serializes element geometry (top, left, width, height) into a unified `Coordinates` interface.
    - Buffers data locally in `chrome.storage.session` and `IndexedDB` before R2 upload.

### 2. Layer 2: Enrichment Pipeline (AI)
*   **Technologies**: Cloudflare Workers, GPT-4o-mini, OpenAI TTS.
*   **Implemented Logic**:
    - **Step Transcription**: Converts raw element metadata (e.g., "button#submit") into human instructions (e.g., "Click the Submit button to finalize your profile").
    - **Audio Generation**: Synthesizes professional-grade voiceover for every step.
    - **Scene Math**: Computes `animationTarget` (centerX, centerY, zoomScale) based on interaction coordinates.

### 3. Layer 3: Cinematic Smart Studio
*   **Technologies**: React, Zustand, Framer Motion, Tailwind CSS.
*   **Implemented Logic**:
    - **Hybrid Camera System**: Uses momentum-based spring physics to perform glides between steps on the same context (URL/Title) and staged re-orientations on context changes.
    - **Adaptive Blueprint Mode**: Dynamically adjusts documentation card height to match recorded viewport resolution, eliminating black bars in SOP guides.
    - **Cinematic Stage Mode**: A 3-layer rendering stack for the video player:
        - *Layer 1 (Parallax Backdrop)*: Blurred, scaled copy of the screenshot that moves at 35% of the foreground speed.
        - *Layer 2 (Foreground)*: Sharp, contained interface rendering.
        - *Layer 3 (Vignette)*: Radial depth filters for professional spatial blending.

---

## 🎬 PART 2: ORIGINAL ROADMAP (IN-PROGRESS)

The following features were originally defined in **Phases 4–5** and are currently being refined:

*   **Synthetic Cursor Animation**: SVG-based cursor that interpolates paths between steps (moving from Step 1 coordinates to Step 2 coordinates) to simulate a live mouse.
*   **Click Ripple Feedback**: Animated visual rings at the `(x, y)` interaction point to clarify the user's action.
*   **Ghost Typing**: Replaying `step.inputValue` character-by-character over input fields to simulate live entry.
*   **Interactive Sandbox**: A "Demo" view where the timeline stops at "Hotspots," requiring a real user click to advance the scene.

---

## 🚀 PART 3: EXHAUSTIVE STRATEGY FOR "LIVE" & "DESKTOP" RECORDING

### 🟢 Solution A: The "Live Content" Gap (Animations/Videos)
Current snapshots miss loading bars, live charts, and videos. To fix this, we will implement **Step-Triggered Snippets.**

*   **Mechanism**: Switch from static snapshots to **`MediaStream` buffering.**
*   **API**: `chrome.tabCapture` or `MediaRecorder`.
*   **The Flow**:
    1.  Extension monitors the DOM for "High Motion" elements (Canvas, Video, Lottie).
    2.  When an interaction occurs on/near these elements, the extension records a **2-second WebM snippet.**
    3.  **The Stitching**: The Studio's video player detects the `video_segment` type in the JSON and swaps the static `<img>` for a `<video loop>` element during that step's duration.

### 🔵 Solution B: The "Universal OS" Gap (Non-Browser Apps)
To record Figma, VS Code, or Slack, we must break out of the browser tab.

*   **The Technology: Offscreen Documents + `getDisplayMedia`**
    - **Offscreen Doc**: Manifest V3 background scripts cannot access media. We will spawn a hidden "Offscreen" window to host the recording logic.
    - **Picker UI**: `navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "window" } })`. This allows the user to pick any application window or their entire screen.
*   **The "Smart Telemetry" Breakthrough**:
    - While the video records the desktop app, the extension continues to record the **global mouse position** relative to the screen.
    - **Telemetry JSON**: `[{ timestamp: 0, x: 100, y: 200 }, { timestamp: 100, x: 105, y: 210 }...]`.
    - **Result**: Even for a "dumb" video recording of VS Code, our Studio can **auto-zoom to the cursor** because it has the pixel coordinates in the telemetry file.

### 🟡 Solution C: "Event-Based DOM Stream" (rrweb Integration)
For high-fidelity browser-only sessions without permission prompts.

*   **Technology**: `rrweb` (Record & Replay the Web).
*   **Mechanism**: Instead of screenshots, we serialize the entire DOM into a JSON mutation stream.
*   **The Advantage**: Zero browser permission prompts. The "video" is actually a re-rendered DOM.
*   **The Hybrid Path**: We can mix `rrweb` data for the browser and `getDisplayMedia` for desktop apps in the same session.

---

## 🛠️ PART 4: THE HYBRID TRANSFORMATION PLAN

To unify these solutions, the core **`SessionEnvelope`** will be updated to handle **Media Interleaving**:

1.  **Phase 6 (Universal Extension)**:
    - Update Extension UI to include "Record Screen" mode.
    - Implement the **Offscreen Recorder** for continuous WebM capture.
    - Implement **Mouse Telemetry** tracking (10hz sampling of cursor position).

2.  **Phase 7 (Hybrid Player)**:
    - Update Studio Player to support a **Composite Timeline.**
    - **Layer 1**: The "Stage" backdrop.
    - **Layer 2**: `MediaSource` or `<video>` for raw segments / `rrweb-player` for DOM streams.
    - **Layer 3**: Annotations and AI Cursor.

3.  **Final Rendering**:
    - Use the **Canvas API** to stitch the Static Screenshots, Video Snippets, and Desktop Segments into a single, high-fidelity export.

---

### Comparison of Final Output Modes
| Mode | Quality | Use Case |
| :--- | :--- | :--- |
| **Blueprint (SOP)** | Static / Vector | Technical Docs, Manuals, Guides |
| **Stage (Cinematic)** | Animated / Meta-Video | Product Demos, Marketing, Onboarding |
| **Universal (Desktop)** | Raw Video + Meta-Zoom | Full-stack tutorials, OS-level apps (Figma/VS Code) |
| **Live (Hybrid)** | Mixed Snippets | Dynamic dashboards, WebGL, SaaS workflows |

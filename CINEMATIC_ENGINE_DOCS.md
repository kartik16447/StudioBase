# StudioBase Cinematic Engine: Technical Documentation

This document provides a detailed breakdown of the two core systems responsible for the professional video experience in StudioBase: the **Real-Time Simulation (Preview)** and the **Frame-by-Frame Compositor (Export)**.

---

## 1. Real-Time Video Preview (The Simulation)

The preview in the Studio is NOT a rendered video. It is a **real-time simulation** of the walkthrough using CSS transforms, Framer Motion, and raw assets.

### Key Logic: The "Virtual Camera"
Instead of editing the video file, we move the "viewport" over the raw video. We calculate the `target` coordinates based on the interaction data and apply a physically-weighted spring transition.

```typescript
// Camera Math: translate(tx, ty) scale(scale)
// Physical Correctness: Translate relative to the center, then scale
const scale = (hasZoom || !isPlaying) ? target.zoomScale : 1;
const tx = (50 - target.centerX) * scale;
const ty = (50 - target.centerY) * scale;

// Spring Transition Config (The "Professional" Feel)
const springTransition = {
  type: 'spring',
  stiffness: 70, // Premium inertia
  damping: 18,   // Smooth settling
  mass: 1.1,     // Physically weighted
  restDelta: 0.001
};

// Application via Framer Motion
<motion.div
  animate={{ scale, x: `${tx}%`, y: `${ty}%` }}
  transition={springTransition}
>
  <video src={rawVideoUrl} />
</motion.div>
```

### Why this is used for Preview:
1.  **Instant Updates**: Change a brand color or edit a script, and the preview updates immediately without "processing" time.
2.  **No Server Cost**: All rendering happens in the user's browser using their GPU.

---

## 2. Cinematic Video Export (The Compositor)

When you click "Export," we transition from a "Simulation" to a **"Master Render."** We use a 1080p offscreen canvas to bake all instructions into a single file.

### Key Logic: Frame-by-Frame Drawing
We manually iterate through every step and draw 30 frames per second. We use the **Seek-and-Capture** method for video segments.

```typescript
// MASTER COMPOSITOR LOOP (Simplified)
async function handleSOPVideoExport() {
  const canvas = document.createElement('canvas');
  canvas.width = 1920; 
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { 
    mimeType: 'video/webm;codecs=vp9', 
    videoBitsPerSecond: 8000000 // 8Mbps for clarity
  });

  for (let step of steps) {
    // 1. SEEK VIDEO (If hybrid segment)
    if (step.timestamp) {
       video.currentTime = step.timestamp / 1000;
       await new Promise(res => video.onseeked = res);
       asset = video;
    } else {
       asset = await loadImage(step.screenshot);
    }

    // 2. DRAW FRAMES (With Camera Math)
    for (let f = 0; f < totalFrames; f++) {
      ctx.drawImage(asset, sx, sy, sw, sh, 0, 0, 1920, 1080);
      
      // 3. BAKE ANNOTATIONS
      ctx.strokeRect(anno.x, anno.y, anno.w, anno.h);
      
      // 4. BAKE GHOST TYPING
      ctx.fillText(typedText, x, y);
    }
  }
  recorder.stop();
}
```

### Key Logic: The "Physics-Based Camera" Math
To ensure the exported video has the same "premium" feel as the preview, we use **Stateful Interpolation** between steps.

```typescript
// Stateful interpolation ensures smooth movement between distant steps
const fScale = currentScale + (targetScale - currentScale) * ease;
const fX = currentX + (targetX - currentX) * ease;
const fY = currentY + (targetY - currentY) * ease;

// Draw with calculated viewport
ctx.drawImage(asset, sx, sy, sw, sh, 0, 0, 1920, 1080);

// Update state for next step
currentX = targetX;
currentY = targetY;
currentScale = targetScale;
```

---

## Summary Comparison

| Feature | Video Preview (Studio) | Cinematic Export (Download) |
| :--- | :--- | :--- |
| **Technology** | HTML5 Video + CSS Transforms | 2D Canvas API + MediaRecorder |
| **Rendering** | Real-time Simulation | Offline Frame-by-Frame Bake |
| **Quality** | Dependent on Browser Window | Fixed 1080p (1920x1080) |
| **Output** | Visual Feedback only | `.webm` File (VP9 Codec) |
| **Purpose** | Editing & Iteration | Distribution (LinkedIn, YouTube) |

---

### Libraries & APIs Used:
- **Canvas API**: Core rendering engine for frame drawing.
- **MediaRecorder API**: Real-time stream capture from canvas to video file.
- **Framer Motion**: Smooth spring-based camera math for the preview UI.
- **Zustand**: State management for coordinating export progress.

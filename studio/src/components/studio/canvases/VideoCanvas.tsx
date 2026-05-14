import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStudioStore } from '../../../store/useStudioStore';
import { I } from '../../../components/icons';
import { cn, DotGrid, ScreenshotPlaceholder, Button, AIShimmer } from '../../../components/ui';
import { RenderConstants } from '../../../modules/render-engine/RenderConstants';
import { CinematicMath } from '../../../modules/render-engine/CinematicMath';
import { BACKEND_URL } from '../../../../../shared/constants';
import { WebMFrameExtractor } from '../../../utils/WebMFrameExtractor';

/**
 * MASTER CINEMATIC COMPOSITOR (STABILIZED v2)
 * Renders the session frame-by-frame into a 1080p WebM
 */
export async function handleSOPVideoExport() {
  const store = useStudioStore.getState();
  if (store.isExporting) return;

  const session = store.session;
  const brand = store.brand;
  
  // --- INSTRUMENTATION COUNTERS ---
  let framesRequested = 0;
  let framesDrawn = 0;
  let successfulFrames = 0;
  let failedFrames = 0;
  
  console.log("🎬 [Export] Phase 1: Initializing Deterministic Compositor");

  // 1. Setup high-res compositor (DOM ATTACHED for Hardware Sync)
  const canvas = document.createElement('canvas');
  canvas.id = 'export-compositor';
  canvas.width = RenderConstants.EXPORT_COMPOSITOR_WIDTH;
  canvas.height = RenderConstants.EXPORT_COMPOSITOR_HEIGHT;
  
  // Enforce DOM Presence and Visibility for CaptureStream reliability
  canvas.style.position = 'fixed';
  canvas.style.left = '0';
  canvas.style.top = '0';
  canvas.style.width = RenderConstants.EXPORT_VISUAL_WIDTH; // 15% visual scale
  canvas.style.height = RenderConstants.EXPORT_VISUAL_HEIGHT;

  // --- BACKGROUND CACHE (Performance Fix) ---
  const bgCache = document.createElement('canvas');
  bgCache.width = RenderConstants.EXPORT_COMPOSITOR_WIDTH; bgCache.height = RenderConstants.EXPORT_COMPOSITOR_HEIGHT;
  const bctx = bgCache.getContext('2d')!;
  bctx.fillStyle = '#11111a';
  bctx.fillRect(0, 0, RenderConstants.EXPORT_COMPOSITOR_WIDTH, RenderConstants.EXPORT_COMPOSITOR_HEIGHT);
  bctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  for (let gx = 0; gx < RenderConstants.EXPORT_COMPOSITOR_WIDTH; gx += RenderConstants.GRID_SPACING) {
    for (let gy = 0; gy < RenderConstants.EXPORT_COMPOSITOR_HEIGHT; gy += RenderConstants.GRID_SPACING) {
      bctx.beginPath(); bctx.arc(gx, gy, 1.2, 0, Math.PI * 2); bctx.fill();
    }
  }
  canvas.style.opacity = '0.05'; 
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999'; // Front-and-Center
  document.body.appendChild(canvas);

  // Initialize with alpha: false to prevent encoder "Visual Silence" collapse
  const ctx = canvas.getContext('2d', { 
    willReadFrequently: true,
    alpha: false 
  });

  if (!ctx) {
    console.error("❌ [Export] Failed to get 2D context");
    return;
  }

  store.setIsExporting(true);
  store.setStepIndex(0);
  store.setPlaying(false);

  // --- RESOURCE LIFECYCLE ---
  let extractor: WebMFrameExtractor | null = null;
  let videoTrack: MediaStreamTrack | null = null;
  let infoOverlay: HTMLDivElement | null = null;
  let exportVideo: HTMLVideoElement | null = null;
  const chunks: Blob[] = [];
  let totalBytes = 0;

  try {

    // --- AUTO CAPTURE MODE (Bypassing Throttling) ---
    const stream = (canvas as any).captureStream(RenderConstants.EXPORT_FPS);
    videoTrack = stream.getVideoTracks()[0];
    
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9' : 'video/webm';
    
    const recorder = new MediaRecorder(stream, { 
      mimeType, 
      videoBitsPerSecond: RenderConstants.EXPORT_VIDEO_BITRATE,
      bitsPerSecond: RenderConstants.EXPORT_VIDEO_BITRATE 
    });

    // --- HELPER: PREVENT VISUAL SILENCE ---
    const injectJitter = () => {
      if (!ctx) return;
      ctx.save();
      ctx.globalAlpha = 0.01;
      ctx.fillStyle = `rgb(${Math.random()*255},${Math.random()*255},${Math.random()*255})`;
      ctx.fillRect(1919, 1079, 1, 1);
      ctx.restore();
    };

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
        totalBytes += e.data.size;
        console.log(`🎬 [Export] Chunk received: ${e.data.size} bytes (Total: ${chunks.length}, Cumulative: ${(totalBytes/1024/1024).toFixed(2)}MB)`);
      }
    };
  
  recorder.onstop = () => {
    console.log(`🎬 [Export] Recorder stopped. State: ${recorder.state}`);
    const blob = new Blob(chunks, { type: 'video/webm' });
    console.log(`🎬 [Export] Final Blob size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
    
    if (blob.size < 1000) {
      console.error("❌ [Export] Output blob is too small. Likely black frames.");
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session?.aiOutputs?.title || 'studiobase-cinematic'}.webm`;
    a.click();
    URL.revokeObjectURL(url);
    store.setIsExporting(false);
  };

  console.log("🎬 [Export] Starting Recorder...");
  recorder.start(1000); // Small timeslices to prevent memory soak
  const fps = RenderConstants.EXPORT_FPS;

  // --- HELPER: DETECT TAINTED CANVAS ---
  const validateCanvasIntegrity = () => {
    try {
      canvas.toDataURL(); 
      return true;
    } catch (e) {
      console.error("❌ [Export] CANVAS TAINTED! CORS failure detected.", e);
      return false;
    }
  };

  // --- INTRO SLIDE ---
  if (brand.showIntro) {
    console.log("🎬 [Export] Rendering Intro Slide...");
    for (let f = 0; f < 90; f++) {
      ctx.fillStyle = brand.primaryColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 120px Inter, system-ui, sans-serif';
      ctx.fillText(session?.aiOutputs?.title || 'Recording', canvas.width/2, canvas.height/2 - 40);
      ctx.font = '50px Inter, system-ui, sans-serif';
      ctx.globalAlpha = 0.6;
      ctx.fillText('A StudioBase walkthrough', canvas.width/2, canvas.height/2 + 40);
      ctx.globalAlpha = 1.0;
      
      injectJitter();
      await new Promise(res => setTimeout(res, 0)); // Compositor Yield
      framesRequested++; framesDrawn++;
      await new Promise(res => setTimeout(res, 16)); // Allow encoding yield
    }
    validateCanvasIntegrity();
  }

  const steps = session?.steps || [];
  const chapterMap = new Map((session?.metadata?.chapterBreaks || []).map(c => [c.afterStepId, c]));

  // --- STEP BY STEP RENDERING (Unified Architecture) ---
  // Store center in percentages (0-100) to match Preview Player logic
  let currentX = 50, currentY = 50, currentScale = 1.0;
  
  // --- FILTERED VISIBILITY HACK ---
  // Transparent informational overlay (No occlusion to keep rasterizer active)
  const infoOverlay = document.createElement('div');
  Object.assign(infoOverlay.style, {
    position: 'fixed',
    left: '0px',
    top: '20px',
    width: '100vw',
    textAlign: 'center',
    zIndex: '10001',
    color: '#fff',
    pointerEvents: 'none',
    fontFamily: 'Inter, system-ui, sans-serif',
    textShadow: '0 2px 4px rgba(0,0,0,0.5)'
  });
  infoOverlay.innerHTML = `
    <div style="font-size: 24px; font-weight: bold;">🎬 Rendering Cinematic Video...</div>
    <div style="font-size: 14px; opacity: 0.8;">Bypassing compositor throttling. Please keep this tab active.</div>
  `;
  document.body.appendChild(infoOverlay);

    // --- DEDICATED EXPORT VIDEO NODE ---
    exportVideo = document.createElement('video');
    exportVideo.crossOrigin = "anonymous";
    const videoKey = (session as any)?.videoKey || 'screen-recording';
    const videoUrl = session?.assets?.[videoKey] || session?.assets?.['video'] || '';
    exportVideo.src = videoUrl;
    exportVideo.muted = true;
    exportVideo.playsInline = true;
    
    Object.assign(exportVideo.style, {
      position: 'fixed',
      left: '0px',
      top: '0px',
      width: '1920px',
      height: '1080px',
      objectFit: 'fill',
      opacity: '1', 
      zIndex: '10000', 
      filter: 'brightness(0.2)',
      pointerEvents: 'none',
      willChange: 'transform'
    });
    document.body.appendChild(exportVideo);

    console.log("🎬 [Export] Pre-flight check starting...");
    extractor = new WebMFrameExtractor();
    
    if (videoUrl) {
      try {
        console.log("🔍 [Export] Initializing Deterministic Extractor...");
        const response = await fetch(videoUrl);
        const videoBlob = await response.blob();
        await extractor.init(videoBlob);
      } catch (e) {
        console.error("❌ [Export] Extractor initialization failed:", e);
      }
    }

    // --- TIMELINE NORMALIZATION ---
    const sessionStartTime = (session as any)?.metadata?.startTime || (session as any)?.startTime || (steps.length > 0 ? steps[0].timestamp : 0);
    const toRelativeMs = (absMs: number) => {
      if (!extractor) return 0;
      const maxDuration = extractor.getDuration();
      const rel = absMs - sessionStartTime;
      if (isNaN(rel)) return 0;
      const clamped = Math.max(0, Math.min(rel, maxDuration));
      
      // Log anomalies
      if (Math.abs(rel - clamped) > 1000000) {
        console.warn(`🎬 [Timeline] Massive clamp detected: Absolute ${absMs}ms -> Relative ${clamped}ms`);
      }
      return clamped;
    };

  await new Promise(res => {
    if (exportVideo) {
      exportVideo.onloadedmetadata = () => {
        if (exportVideo) {
          console.log(`🎬 [Export] Metadata Ready. Size: ${exportVideo.videoWidth}x${exportVideo.videoHeight} | Duration: ${exportVideo.duration}s`);
        }
        res(null);
      };
    } else {
      res(null);
    }
    setTimeout(res, 5000);
  });

  // --- WEBCODECS / TRACK PROCESSOR HACK ---
  // On Mac Retina, the primary video is hardware-isolated. 
  // MediaStreamTrackProcessor taps the stream before compositor optimizations apply.
  const videoStream = (exportVideo as any).captureStream ? (exportVideo as any).captureStream() : null;
  const track = videoStream?.getVideoTracks()[0];
  let latestVideoFrame: any = null;
  let reader: any = null;

  if (track && (window as any).MediaStreamTrackProcessor) {
    const processor = new (window as any).MediaStreamTrackProcessor({ track });
    reader = processor.readable.getReader();
    
    // Non-blocking reader loop
    (async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (latestVideoFrame) latestVideoFrame.close();
          latestVideoFrame = value;
        }
      } catch (e) {
        console.error("🎬 [Export] Frame reader failed:", e);
      }
    })();
  } else {
    console.warn("🎬 [Export] MediaStreamTrackProcessor not supported, falling back to direct.");
  }

  // --- HARD CORS / TAINT VALIDATION ---
  try {
    const testCanvas = document.createElement('canvas');
    testCanvas.width = 1; testCanvas.height = 1;
    const testCtx = testCanvas.getContext('2d');
    if (testCtx) {
      testCtx.drawImage(exportVideo, 0, 0, 1, 1);
      testCanvas.toDataURL(); // Will throw if tainted
      console.log("✅ [Export] CORS Validation Passed. Canvas is clean.");
    }
  } catch (e) {
    console.error("❌ [Export] HARD ABORT: Canvas Tainted. CORS headers missing on R2.", e);
    store.setIsExporting(false);
    document.body.removeChild(exportVideo);
    alert("Export Failed: Canvas Tainted. Please verify S3/R2 CORS headers.");
    return;
  }


  for (let i = 0; i < steps.length; i++) {
    store.setStepIndex(i);
    const step = steps[i];
    console.log(`🎬 [Export] Step ${i+1}/${steps.length}: ${step.id}`);

    // Chapter Card Transition
    const chapter = i > 0 ? chapterMap.get(steps[i-1].id) : null;
    if (chapter) {
      console.log(`🎬 [Export] Chapter Card: ${chapter.chapterTitle}`);
      for (let f = 0; f < 60; f++) {
        ctx.fillStyle = brand.primaryColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = 'bold 60px Inter, system-ui, sans-serif';
        ctx.globalAlpha = 0.6;
        ctx.fillText('CHAPTER', canvas.width/2, canvas.height/2 - 60);
        ctx.font = 'bold 120px Inter, system-ui, sans-serif';
        ctx.globalAlpha = 1.0;
        ctx.fillText(chapter.chapterTitle, canvas.width/2, canvas.height/2 + 40);
        
        injectJitter();
        await new Promise(res => setTimeout(res, 0)); // Compositor Yield
        framesRequested++; framesDrawn++;
        await new Promise(res => setTimeout(res, 16));
      }
    }
    
    // Load Asset (Image or Video Bitmap)
    const hasTimestamp = step.timestamp != null && step.timestamp > 0;
    let asset: HTMLImageElement | ImageBitmap | HTMLVideoElement | null = null;

    // Note: Frame extraction is now handled deterministically inside the tick loop

    // --- ASSET PREPARATION ---
    if (hasTimestamp) {
      // Seek logic is already handled above
    } else {
      const imgUrl = step.screenshotKey ? session?.assets?.[step.screenshotKey] : null;
      if (imgUrl) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = imgUrl;
        await new Promise(res => {
          img.onload = res;
          img.onerror = () => { console.error("❌ [Export] Failed to load img:", imgUrl); res(null); };
        });
        asset = img;
      }
    }

    // --- STEP VALIDATION GUARD ---
    // A step is valid if it has a screenshot asset OR a deterministic video timestamp
    if (!asset && !hasTimestamp) {
      console.warn(`⚠️ [Export] No asset or timestamp for step ${i}. Skipping.`);
      continue;
    }

    // --- CINEMATIC TARGET CALCULATION (Safe Math Edition) ---
    const startScale = currentScale || 1.0;
    const startX = currentX || 50;
    const startY = currentY || 50;

    const coords = (step.data as any)?.coordinates;
    let targetZoomScale = 1.0;
    let targetCenterX = 50;
    let targetCenterY = 50;

    if (coords && typeof coords.x === 'number') {
      targetZoomScale = 1.55;
      // Smart Defaults: Use 80x80 if width/height are missing
      const w = typeof coords.width === 'number' ? coords.width : 80;
      const h = typeof coords.height === 'number' ? coords.height : 80;
      const vw = coords.viewportWidth || 1440;
      const vh = coords.viewportHeight || 900;

      // Center-Point Fix: Target the middle of the interaction box
      const centerX = coords.x + (w / 2);
      const centerY = coords.y + (h / 2);
      
      targetCenterX = Math.max(15, Math.min(85, (centerX / vw) * 100));
      targetCenterY = Math.max(15, Math.min(85, (centerY / vh) * 100));
    } else {
      // Vision Fallback: Subtle drift for native apps where metadata is missing
      targetZoomScale = 1.15; 
      targetCenterX = 50;
      targetCenterY = 50;
    }

    const jumpDist = Math.abs(targetCenterX - startX);
    let stepDuration = Math.max(2, ((step as any).duration || 5)); 
    if (jumpDist > 40) stepDuration *= 1.5; // Smooth out large context snaps
    const stepFrames = Math.floor(stepDuration * fps);

    let masterFrame: VideoFrame | null = null;

    for (let f = 0; f < stepFrames; f++) {
      const progress = f / stepFrames;
      
      // Safe approximation of an overdamped spring glide
      // 1 - (1 - t)^4 provides a premium feel with zero NaN risk
      const springProgress = 1 - Math.pow(1 - progress, 4);
      
      const fScale = startScale + (targetZoomScale - startScale) * springProgress;
      // Interpolated center in ratio (0.0-1.0)
      const fX = (startX + (targetCenterX - startX) * springProgress) / 100;
      const fY = (startY + (targetCenterY - startY) * springProgress) / 100;

      // --- DETERMINISTIC FRAME CAPTURE ---
      if (hasTimestamp && extractor) {
        const absTargetMs = (step.timestamp || 0) + (progress * stepDuration);
        const relTargetMs = toRelativeMs(absTargetMs);
        try {
          const newFrame = await extractor.getFrame(relTargetMs);
          if (newFrame) {
            // Fix the Master Frame Leak: Explicit Handover
            if (masterFrame) masterFrame.close();
            masterFrame = newFrame;
          }
        } catch (e) {
          console.error(`❌ [Export] Frame extraction failed at rel ${relTargetMs}ms:`, e);
        }
      }
      const currentAsset = masterFrame || asset;

      if (!currentAsset) {
        continue;
      }

      // 1. Memory Safety: Clone the frame to stop destroying the master asset.
      // We wrap in a try/catch in case the source frame was already disposed by the player/extractor.
      let safeFrame: any = null;
      if (currentAsset && typeof (currentAsset as any).clone === 'function') {
        try {
          safeFrame = (currentAsset as any).clone();
        } catch (e) {
          // If the frame was somehow already closed, ignore and let it draw black for 1ms
        }
      } else {
        safeFrame = currentAsset; // Fallback for standard images/bitmaps
      }

      try {
        ctx.save();
        
        if (safeFrame) {
          // 2. High-Fidelity Studio Background (Mesh + Beam)
          ctx.drawImage(bgCache, 0, 0);

          // Animated Light Beam (Matches line 889)
          const beamPhase = (f / 150) % 1.0; 
          const beamX = (beamPhase * 2.5 - 1.25) * canvas.width;
          const beamGrad = ctx.createLinearGradient(beamX, 0, beamX + 800, 0);
          beamGrad.addColorStop(0, 'rgba(94, 92, 230, 0)');
          beamGrad.addColorStop(0.5, 'rgba(94, 92, 230, 0.08)');
          beamGrad.addColorStop(1, 'rgba(94, 92, 230, 0)');
          ctx.fillStyle = beamGrad;
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Primary Radial Glow (Lightened for visibility)
          const bgGradient = ctx.createRadialGradient(
            canvas.width * 0.5, canvas.height * 0.5, 0,
            canvas.width * 0.5, canvas.height * 0.5, canvas.width * 0.95
          );
          bgGradient.addColorStop(0, 'rgba(94, 92, 230, 0.28)'); 
          bgGradient.addColorStop(1, 'rgba(17, 17, 26, 0)');
          ctx.fillStyle = bgGradient;
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          const aw = (safeFrame as any)?.displayWidth || (safeFrame as any)?.width || 2880;
          const ah = (safeFrame as any)?.displayHeight || (safeFrame as any)?.height || 1444;

          // 1. Calculate crop box dimensions
          let sw = aw / fScale; 
          let sh = ah / fScale;
          if (sw > aw) sw = aw;
          if (sh > ah) sh = ah;

          // 3. Aspect-Aware Compositing (Prevent Squishing)
          const sourceAspect = aw / ah;
          const canvasAspect = canvas.width / canvas.height;

          let baseW, baseH;
          if (sourceAspect > canvasAspect) {
              baseW = canvas.width;
              baseH = canvas.width / sourceAspect;
          } else {
              baseH = canvas.height;
              baseW = canvas.height * sourceAspect;
          }

          const dw = baseW * fScale;
          const dh = baseH * fScale;
          
          // Position the video such that the target coordinate (fX/fY) is centered on the canvas
          const dx = (canvas.width / 2) - (fX * dw);
          const dy = (canvas.height / 2) - (fY * dh);
        
          ctx.globalAlpha = 1.0;
        
          // --- IMAGEBITMAP BRIDGE (Aspect-Aware + Soft Corners) ---
          const bitmap = await createImageBitmap(safeFrame as any);
          ctx.save();
          // Create the "Floating" clipping path to remove sharp boundaries
          ctx.beginPath();
          if (typeof (ctx as any).roundRect === 'function') {
            (ctx as any).roundRect(dx, dy, dw, dh, 40 * fScale); 
          } else {
            ctx.rect(dx, dy, dw, dh);
          }
          ctx.clip();
          
          // Edge Overscan: Inset 2px to hide 1px capture artifacts
          ctx.drawImage(bitmap, 2, 2, aw - 4, ah - 4, dx, dy, dw, dh);
          ctx.restore();
          bitmap.close();
        }
        
        // --- DETERMINISTIC PAINT YIELD ---
        await new Promise(res => setTimeout(res, 0));
        
        injectJitter();
      } catch (err) {
        console.error("❌ [Export] Render tick error:", err);
      } finally {
        // ONLY close the clone we made for this specific tick.
        // DO NOT close currentAsset or frame here! The player/extractor manages that.
        if (safeFrame && typeof (safeFrame as any).close === 'function') {
          (safeFrame as any).close();
        }
        ctx.restore();
      }

      // Annotations are now baked directly into the viewport track inside the try block
      // for 100% mathematical alignment with the cinematic camera.

      // --- MULTI-POINT PIXEL VALIDATION (Every 30 frames) ---
      if (framesDrawn % 30 === 0) {
        const x = Math.floor(canvas.width / 2);
        const y = Math.floor(canvas.height / 2);
        const sample = ctx.getImageData(x - 1, y - 1, 3, 3).data;
        
        let hasContent = false;
        let lastSample = [0,0,0];
        for (let p = 0; p < sample.length; p += 4) {
          const r = sample[p], g = sample[p+1], b = sample[p+2];
          const isMagenta = r === 255 && g === 0 && b === 255;
          const isBlack = r === 0 && g === 0 && b === 0;
          if (!isMagenta && !isBlack) {
            hasContent = true;
            lastSample = [r, g, b];
            break;
          }
          if (p === 16) lastSample = [r, g, b]; // Capture center for logging
        }

        if (!hasContent) failedFrames++; else successfulFrames++;

        const status = hasContent ? "✅ PROBE SUCCESS (VIDEO DATA DETECTED)" : "❌ PROBE FAILED (MAGENTA/BLACK)";
        
        console.log(`🎬 [Export Truth] Frame ${framesDrawn} | ${status}`);
        console.log(`🎬 [Export Truth] Center Sample: [${lastSample[0]}, ${lastSample[1]}, ${lastSample[2]}]`);
      }

      // Ghost Typing
      if (step.action === 'input' && step.inputValue && progress > 0.2) {
        const typeLen = Math.floor((progress - 0.2) * 1.5 * step.inputValue.length);
        const text = step.inputValue.slice(0, typeLen);
        if (text) {
           ctx.fillStyle = 'rgba(0,0,0,0.8)';
           const rx = 1920/2 - 250, ry = 920, rw = 500, rh = 80, rad = 15;
           ctx.beginPath(); ctx.moveTo(rx+rad,ry); ctx.lineTo(rx+rw-rad,ry); ctx.quadraticCurveTo(rx+rw,ry,rx+rw,ry+rad); ctx.lineTo(rx+rw,ry+rh-rad); ctx.quadraticCurveTo(rx+rw,ry+rh,rx+rw-rad,ry+rh); ctx.lineTo(rx+rad,ry+rh); ctx.quadraticCurveTo(rx,ry+rh,rx,ry+rh-rad); ctx.lineTo(rx,ry+rad); ctx.quadraticCurveTo(rx,ry,rx+rad,ry); ctx.closePath();
           ctx.fill();
           ctx.fillStyle = '#fff';
           ctx.font = '32px ui-monospace, SFMono-Regular, Menlo, monospace'; ctx.textAlign = 'center';
           ctx.fillText(text, 1920/2, 970);
        }
      }

      if ((videoTrack as any).requestFrame) (videoTrack as any).requestFrame();
      framesRequested++; framesDrawn++;
      await new Promise(res => setTimeout(res, 33)); 
    }
    if (masterFrame) {
      masterFrame.close();
      masterFrame = null;
    }
    currentX = targetCenterX;
    currentY = targetCenterY;
    currentScale = targetZoomScale;
    
    if (i % 5 === 0) validateCanvasIntegrity();
  }

  console.log(`🎬 [Export] Loop Finished. Frames Drawn: ${framesDrawn}, Requested: ${framesRequested}`);
  console.log(`🎬 [Export] Waiting for final chunks to flush...`);
  
  await new Promise(res => {
    recorder.onstop = res;
    recorder.stop();
  });

  // --- CLEANUP ---
  document.body.removeChild(infoOverlay);
  document.body.removeChild(exportVideo);
  if (reader) reader.cancel();
  if (track) track.stop();
  if (latestVideoFrame) latestVideoFrame.close();

  const statsTotalFrames = successfulFrames + failedFrames;
  const successRate = statsTotalFrames > 0 ? (successfulFrames / statsTotalFrames) * 100 : 0;
  
  console.log(`
  🎬 [Export Summary]
  -------------------
  Total Frames Drawn: ${framesDrawn}
  Sampled Validations: ${statsTotalFrames}
  Successful Extractions: ${successfulFrames}
  Failed Extractions (Magenta): ${failedFrames}
  Success Rate: ${successRate.toFixed(1)}%
  Final Blob Size: ${(totalBytes/1024/1024).toFixed(2)}MB
  -------------------
  `);

  } catch (err) {
    console.error("❌ [Export] Fatal error:", err);
  } finally {
    if (extractor) await extractor.destroy();
    store.setIsExporting(false);
    
    if (infoOverlay && document.body.contains(infoOverlay)) document.body.removeChild(infoOverlay);
    if (exportVideo && document.body.contains(exportVideo)) document.body.removeChild(exportVideo);
    if (videoTrack) videoTrack.stop();
  }

  // --- AUTO DOWNLOAD ---
  const finalBlob = new Blob(chunks, { type: 'video/webm' });
  const url = URL.createObjectURL(finalBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `StudioBase_Export_${new Date().getTime()}.webm`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export const VideoCanvas: React.FC = () => {
  const {
    session,
    currentStepIndex,
    isPlaying,
    playbackRate,
    setPlaying,
    setStepIndex,
    brand,
    isExporting,
    exportTrigger
  } = useStudioStore();

  const [audio] = useState(new Audio());
  const [isEnded, setIsEnded] = useState(false);
  const [showChapterCard, setShowChapterCard] = useState<string | null>(null);
  const [showIntroSlide, setShowIntroSlide] = React.useState(false);
  const [introVisible, setIntroVisible] = React.useState(false);
  const [showOutroSlide, setShowOutroSlide] = React.useState(false);
  const [outroVisible, setOutroVisible] = React.useState(false);
  const [ghostText, setGhostText] = React.useState('');
  const [ghostVisible, setGhostVisible] = React.useState(false);
  const ghostIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Listen for global export trigger
  useEffect(() => {
    if (exportTrigger > 0 && !isExporting && useStudioStore.getState().activeView === 'video') {
      handleSOPVideoExport();
    }
  }, [exportTrigger]);

  const renderMode = useStudioStore(state => state.renderMode);
  const rawVideoUrl = session?.videoKey ? (session.assets?.[session.videoKey] ?? null) : null;
  const videoUrl = renderMode === 'hybrid' ? rawVideoUrl : null;

  const steps = session?.steps || [];
  const currentStep = steps[currentStepIndex];
  const chapterMap = new Map(
    (session?.metadata?.chapterBreaks || []).map(c => [c.afterStepId, c])
  );

  const isSameContext = (s1: any, s2: any) => {
    if (!s1 || !s2) return false;
    return s1.url === s2.url || s1.pageTitle === s2.pageTitle;
  };

  const prevStep = steps[currentStepIndex - 1];
  const sameContext = isSameContext(prevStep, currentStep);

  // Normalization & Target Calculation
  const prevTarget = CinematicMath.getTarget(prevStep, renderMode);
  const target = CinematicMath.getTarget(currentStep, renderMode);
  const hasZoom = target.zoomScale > 1;

  const camera = CinematicMath.calculateCamera(target, prevTarget, isPlaying);

  useEffect(() => {
    if (!isExporting) {
      console.log(`🎬 [VideoCanvas] Step Transition: ${currentStepIndex} (${currentStep?.id})`);
    }
  }, [currentStepIndex, currentStep?.id, isExporting]);

  // Cinematic Re-orientation Sequence
  const cinematicSequence = CinematicMath.getCinematicSequence(
    sameContext,
    camera.isLargeJump,
    renderMode,
    camera
  );



  useEffect(() => {
    if (ghostIntervalRef.current) {
      clearInterval(ghostIntervalRef.current);
      ghostIntervalRef.current = null;
    }
    setGhostText('');
    setGhostVisible(false);

    if (!isPlaying) return;
    const value = currentStep?.inputValue;
    if (!value || currentStep?.action !== 'input') return;

    setGhostVisible(true);
    let i = 0;
    ghostIntervalRef.current = setInterval(() => {
      i++;
      setGhostText(value.slice(0, i));
      if (i >= value.length) {
        if (ghostIntervalRef.current) clearInterval(ghostIntervalRef.current);
        ghostIntervalRef.current = null;
      }
    }, 60);

    return () => {
      if (ghostIntervalRef.current) {
        clearInterval(ghostIntervalRef.current);
        ghostIntervalRef.current = null;
      }
    };
  }, [currentStepIndex, isPlaying]);

  // Sync video playback and seeking
  useEffect(() => {
    if (!videoRef.current || !videoUrl) return;
    
    const v = videoRef.current;
    const handleVideoError = () => {
      console.error("🎬 [VideoPlayer] Video playback error:", v.error);
    };
    const handleCanPlay = () => {
      console.log("🎬 [VideoPlayer] Video is ready to play");
    };
    
    v.addEventListener('error', handleVideoError);
    v.addEventListener('canplay', handleCanPlay);
    
    return () => {
      v.removeEventListener('error', handleVideoError);
      v.removeEventListener('canplay', handleCanPlay);
    };
  }, [videoUrl]);

  useEffect(() => {
    if (!videoRef.current || !videoUrl || isPlaying) return; // Don't force seek while playing
    const step = steps[currentStepIndex];
    if (step?.timestamp != null) {
      const targetTime = step.timestamp / 1000;
      if (Math.abs(videoRef.current.currentTime - targetTime) > 0.5) {
        videoRef.current.currentTime = targetTime;
      }
    }
  }, [currentStepIndex, videoUrl, isPlaying]);

  useEffect(() => {
    if (!videoRef.current || !videoUrl) return;
    if (isPlaying) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying, videoUrl]);

  useEffect(() => {
    if (!videoRef.current || !videoUrl) return;
    videoRef.current.playbackRate = playbackRate;
  }, [playbackRate, videoUrl]);

  const advanceStep = React.useCallback(() => {
    const chapter = chapterMap.get(currentStep?.id);
    if (chapter) {
      setShowChapterCard(chapter.chapterTitle);
      setTimeout(() => {
        setShowChapterCard(null);
        setTimeout(() => {
          if (currentStepIndex < steps.length - 1) {
            setStepIndex(currentStepIndex + 1);
          } else {
            if (brand.showOutro) {
              setShowOutroSlide(true);
              setOutroVisible(true);
              setTimeout(() => {
                setOutroVisible(false);
                setTimeout(() => {
                  setShowOutroSlide(false);
                  setPlaying(false);
                  setShowIntroSlide(false);
                  setIsEnded(true);
                }, 400);
              }, 3000);
            } else {
              setPlaying(false);
              setShowIntroSlide(false);
              setIsEnded(true);
            }
          }
        }, 300);
      }, 2000);
      return;
    }

    // Smart Context Advance: No zoom-out if context is same
    const nextStep = steps[currentStepIndex + 1];
    const willStayInContext = isSameContext(currentStep, nextStep);

    if (hasZoom && !willStayInContext) {
      setTimeout(() => {
        if (currentStepIndex < steps.length - 1) {
          setStepIndex(currentStepIndex + 1);
        } else {
          if (brand.showOutro) {
            setShowOutroSlide(true);
            setOutroVisible(true);
            setTimeout(() => {
              setOutroVisible(false);
              setTimeout(() => {
                setShowOutroSlide(false);
                setPlaying(false);
                setShowIntroSlide(false);
                setIsEnded(true);
              }, 400);
            }, 3000);
          } else {
            setPlaying(false);
            setShowIntroSlide(false);
            setIsEnded(true);
          }
        }
      }, 400);
    } else {
      if (currentStepIndex < steps.length - 1) {
        setStepIndex(currentStepIndex + 1);
      } else {
        if (brand.showOutro) {
          setShowOutroSlide(true);
          setOutroVisible(true);
          setTimeout(() => {
            setOutroVisible(false);
            setTimeout(() => {
              setShowOutroSlide(false);
              setPlaying(false);
              setShowIntroSlide(false);
              setIsEnded(true);
            }, 400);
          }, 3000);
        } else {
          setPlaying(false);
          setShowIntroSlide(false);
          setIsEnded(true);
        }
      }
    }
  }, [currentStepIndex, steps.length, hasZoom, currentStep, chapterMap, setStepIndex, setPlaying, brand.showOutro]);

  // Voiceover playback
  useEffect(() => {
    if (!isPlaying) {
      audio.pause();
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    if (!currentStep?.voiceoverKey) {
      timer = setTimeout(() => advanceStep(), 3000);
    } else {
      const url = `${BACKEND_URL}/assets/${currentStep.voiceoverKey}`;
      if (audio.src !== url) {
        audio.src = url;
      }
      audio.playbackRate = playbackRate;
      audio.play().catch(console.error);

      const handleEnded = () => advanceStep();
      audio.addEventListener('ended', handleEnded);
      return () => {
        audio.removeEventListener('ended', handleEnded);
      };
    }

    return () => { if (timer) clearTimeout(timer); };
  }, [currentStepIndex, isPlaying, playbackRate, steps.length, currentStep?.voiceoverKey, advanceStep]);

  // Synthetic cursor positions
  const prevCoords = prevStep?.data?.coordinates;
  const currCoords = currentStep?.data?.coordinates;

  const { x: cursorStartX, y: cursorStartY } = CinematicMath.getHotspotPercent(prevCoords);
  const { x: cursorEndX, y: cursorEndY } = CinematicMath.getHotspotPercent(currCoords);




  if (!session) return null;

  return (
    <div className="flex-1 h-full studio-gradient flex flex-col items-center justify-start py-16 px-8 min-h-0 scroll-y">
      {/* Player */}
      <div
        ref={playerRef}
        className="relative w-full max-w-5xl rounded-img shadow-card-lifted overflow-hidden bg-[#12121a]"
        style={{ maxHeight: RenderConstants.PLAYER_MAX_HEIGHT, aspectRatio: RenderConstants.PLAYER_ASPECT_RATIO }}
      >
        {/* Vibrant Shimmering Background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Base Mesh */}
          <div className="absolute inset-0 bg-[radial-gradient(at_0%_0%,_#5e5ce644_0px,_transparent_50%),radial-gradient(at_100%_100%,_#af52de44_0px,_transparent_50%)]" />
          
          {/* High-visibility moving light beam */}
          <motion.div 
            animate={{ 
              x: ['-100%', '150%'],
              opacity: [0, 0.4, 0]
            }}
            transition={{ 
              duration: 5, 
              repeat: Infinity, 
              ease: "linear" 
            }}
            className="absolute inset-y-0 w-[500px] bg-gradient-to-r from-transparent via-primary/30 to-transparent blur-[100px] -skew-x-12"
          />

          {/* Core pulsating glow */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_#5e5ce655_0%,_transparent_60%)] animate-pulse" />
          
          <DotGrid className="opacity-30" glowRadius={RenderConstants.GLOW_RADIUS} />
        </div>
        {/* Screenshot with Hybrid Camera (Smart Context) */}
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            key={videoUrl ? 'cinematic-video' : (sameContext ? 'same' : currentStepIndex)}
            animate={cinematicSequence}
            transition={RenderConstants.CAMERA_SPRING}
            className="absolute inset-0 origin-center"
          >
            {videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full h-full object-contain"
                muted
                playsInline
                crossOrigin="anonymous"
                preload="auto"
                onSeeked={() => {
                  if (!isExporting) {
                    console.log(`🎬 [VideoCanvas] Seeked to: ${videoRef.current?.currentTime}s`);
                  }
                }}
                onPlay={() => console.log('🎬 [VideoCanvas] Playback started')}
                onPause={() => console.log('🎬 [VideoCanvas] Playback paused')}
              />
            ) : (
              <ScreenshotPlaceholder
                step={currentStep}
                session={session}
                showChrome={false}
                aspect={RenderConstants.PLAYER_ASPECT_RATIO}
                rounded=""
                mode="stage"
                parallaxOffset={{ x: camera.tx, y: camera.ty }}
                className="w-full h-full !shadow-none"
              />
            )}
          </motion.div>
        </div>

        {/* Annotation Overlay */}
        <div className="absolute inset-0 pointer-events-none">
          <AnimatePresence>
            {currentStep?.annotations?.map(anno => (
              <motion.div
                key={anno.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute"
                style={{
                  left: `${anno.x}%`, top: `${anno.y}%`,
                  width: anno.width ? `${anno.width}%` : undefined,
                  height: anno.height ? `${anno.height}%` : undefined,
                }}
              >
                {anno.shape === 'box' && (
                  <div className="border-4 border-primary rounded-md w-full h-full shadow-[0_0_20px_rgba(94,92,230,0.4)]" />
                )}
                {anno.shape === 'arrow' && (
                  <div className="relative">
                    <I.ArrowUpRight size={32} className="text-primary drop-shadow-lg" />
                    {anno.text && (
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-primary text-white text-xs font-bold rounded shadow-lg whitespace-nowrap">
                        {anno.text}
                      </div>
                    )}
                  </div>
                )}
                {anno.shape === 'blur' && (
                  <div
                    className="absolute pointer-events-none w-full h-full"
                    style={{
                      backdropFilter: 'blur(12px)',
                      background: 'rgba(0,0,0,0.3)',
                    }}
                  />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Synthetic Cursor (Disabled because screenshots/video already have real cursor) */}
        {false && isPlaying && !videoUrl && currentStep?.data?.coordinates && (
          <motion.div
            className="absolute pointer-events-none z-20"
            initial={{ left: `${cursorStartX}%`, top: `${cursorStartY}%` }}
            animate={{ left: `${cursorEndX}%`, top: `${cursorEndY}%` }}
            transition={{ duration: 0.4, ease: 'easeInOut', delay: 0.1 }}
            style={{ transform: 'translate(-4px, -4px)' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M4 2L20 12L12 13L8 22L4 2Z" fill="white" stroke="black" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
            <AnimatePresence>
              {isPlaying && (
                <>
                  <motion.div
                    key={`ripple-1-${currentStepIndex}`}
                    className="absolute rounded-full border-2 border-primary"
                    style={{ width: 32, height: 32, top: -12, left: -12 }}
                    initial={{ scale: 0, opacity: 0.75 }}
                    animate={{ scale: 2.2, opacity: 0 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                  <motion.div
                    key={`ripple-2-${currentStepIndex}`}
                    className="absolute rounded-full border border-primary"
                    style={{ width: 32, height: 32, top: -12, left: -12 }}
                    initial={{ scale: 0, opacity: 0.5 }}
                    animate={{ scale: 2.8, opacity: 0 }}
                    transition={{ duration: 0.6, ease: 'easeOut', delay: 0.12 }}
                  />
                </>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Ghost Typing */}
        <AnimatePresence>
          {ghostVisible && ghostText && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none"
            >
              <div className="bg-black/75 backdrop-blur-sm text-white px-4 py-2 rounded-lg
                              text-[15px] font-mono shadow-card-lifted flex items-center gap-2
                              max-w-[460px] overflow-hidden">
                <I.Type size={13} className="opacity-60 shrink-0" />
                <span className="truncate">{ghostText}</span>
                <span className="w-px h-4 bg-white/80 animate-pulse shrink-0" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Intro Slide */}
        <AnimatePresence>
          {showIntroSlide && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: introVisible ? 1 : 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-0 z-30 flex flex-col items-center justify-center text-white text-center px-10"
              style={{
                background: `linear-gradient(135deg, ${brand.primaryColor}f0, ${brand.primaryColor})`
              }}
            >
              {brand.logoUrl ? (
                <img src={brand.logoUrl} className="h-14 object-contain mb-6 drop-shadow-lg" />
              ) : (
                <div className="text-5xl font-bold mb-4 tracking-tight drop-shadow-lg">
                  {session?.aiOutputs?.title}
                </div>
              )}
              <p className="text-white/70 text-[15px] font-medium tracking-wide uppercase">
                A StudioBase walkthrough
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Outro Slide */}
        <AnimatePresence>
          {showOutroSlide && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: outroVisible ? 1 : 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-0 z-30 flex flex-col items-center justify-center text-white text-center px-10"
              style={{
                background: `linear-gradient(135deg, ${brand.primaryColor}f0, ${brand.primaryColor})`
              }}
            >
              {brand.logoUrl && (
                <img src={brand.logoUrl} className="h-12 object-contain mb-6 drop-shadow-lg" />
              )}
              <div className="text-4xl font-bold mb-3 tracking-tight drop-shadow-lg">
                {session?.aiOutputs?.title}
              </div>
              {brand.watermark && (
                <p className="text-white/70 text-[15px] font-medium">{brand.watermark}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chapter Title Card */}
        <AnimatePresence>
          {showChapterCard && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center z-30"
              style={{ background: `linear-gradient(135deg, ${brand.primaryColor}e6, ${brand.primaryColor})` }}
            >
              <div className="text-center text-white">
                <p className="text-sm font-semibold opacity-70 uppercase tracking-widest mb-3">Chapter</p>
                <h2 className="text-3xl font-bold">{showChapterCard}</h2>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Watermark */}
        {brand.watermark && (
          <div
            className="absolute bottom-3 right-4 z-10 pointer-events-none"
            style={{ opacity: 0.55 }}
          >
            {brand.logoUrl
              ? <img src={brand.logoUrl} className="h-5 object-contain" />
              : <span className="text-white text-[11px] font-semibold tracking-wide">
                  {brand.watermark}
                </span>
            }
          </div>
        )}

        {/* Player Controls Overlay */}
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300">
          <div className="p-6 flex items-center gap-4">
            <button
              onClick={() => {
                if (!isPlaying && currentStepIndex === 0 && brand.showIntro) {
                  setShowIntroSlide(true);
                  setIntroVisible(true);
                  setTimeout(() => {
                    setIntroVisible(false);
                    setTimeout(() => {
                      setShowIntroSlide(false);
                      setPlaying(true);
                    }, 400);
                  }, 3000);
                } else {
                  setPlaying(!isPlaying);
                }
              }}
              className="w-12 h-12 rounded-full glass-dark flex items-center justify-center text-white hover:scale-105 transition active:scale-95"
            >
              {isPlaying ? <I.Pause size={20} fill="currentColor" /> : <I.Play size={20} fill="currentColor" className="translate-x-0.5" />}
            </button>

            <div className="flex-1 flex flex-col gap-1.5">
              <div className="h-1.5 rounded-full bg-white/20 relative" style={{ overflow: 'visible' }}>
                <motion.div
                  className="absolute inset-y-0 left-0 bg-primary rounded-full"
                  animate={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
                />
                {(session?.metadata?.chapterBreaks || []).map(c => {
                  const stepIdx = steps.findIndex(s => s.id === c.afterStepId);
                  if (stepIdx < 0) return null;
                  const pct = ((stepIdx + 1) / steps.length) * 100;
                  return (
                    <div
                      key={c.afterStepId}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
                      style={{ left: `${pct}%` }}
                      title={c.chapterTitle}
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-white border-2 shadow-sm"
                           style={{ borderColor: brand.primaryColor }} />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[11px] font-bold text-white/80 tracking-wider">
                <span>STEP {currentStepIndex + 1} OF {steps.length}</span>
                <span>{currentStep?.pageTitle || 'Dashboard'}</span>
              </div>
            </div>

            {/* Prev / Next */}
            <div className="flex items-center gap-2 glass-dark rounded-pill px-3 h-10">
              <button onClick={() => setStepIndex(Math.max(0, currentStepIndex - 1))} className="text-white/80 hover:text-white">
                <I.ChevronLeft size={18} />
              </button>
              <button onClick={() => setStepIndex(Math.min(steps.length - 1, currentStepIndex + 1))} className="text-white/80 hover:text-white">
                <I.ChevronRight size={18} />
              </button>
            </div>

            {/* Speed Selector */}
            <div className="flex items-center gap-1 glass-dark rounded-pill px-3 h-10">
              {[0.5, 1, 1.5, 2].map(speed => (
                <button
                  key={speed}
                  onClick={() => useStudioStore.getState().setPlaybackRate(speed)}
                  className={cn(
                    'text-[11px] font-bold px-2 py-1 rounded transition',
                    playbackRate === speed ? 'text-white' : 'text-white/50 hover:text-white/80'
                  )}
                >
                  {speed}×
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Play Overlay (Initial) */}
        {!isPlaying && currentStepIndex === 0 && !isEnded && (
          <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px] flex items-center justify-center">
            <button
              onClick={() => {
                if (!isPlaying && currentStepIndex === 0 && brand.showIntro) {
                  setShowIntroSlide(true);
                  setIntroVisible(true);
                  setTimeout(() => {
                    setIntroVisible(false);
                    setTimeout(() => {
                      setShowIntroSlide(false);
                      setPlaying(true);
                    }, 400);
                  }, 3000);
                } else {
                  setPlaying(!isPlaying);
                }
              }}
              className="w-24 h-24 rounded-full glass shadow-card-lifted flex items-center justify-center text-text hover:scale-110 transition active:scale-95 group"
            >
              <div className="w-20 h-20 rounded-full border-2 border-primary/20 flex items-center justify-center group-hover:border-primary/40 transition">
                <I.Play size={32} fill="currentColor" className="translate-x-1" />
              </div>
            </button>
          </div>
        )}
      </div>
      
      {/* Export Progress Overlay */}
      {isExporting && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xl flex flex-col items-center justify-center">
          <div className="bg-surface p-10 rounded-card shadow-2xl flex flex-col items-center gap-5 text-center max-w-md border border-white/10">
            <div className="relative">
               <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                 <I.Loader size={40} className="animate-spin" />
               </div>
               <div className="absolute inset-0 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-text">Rendering Cinematic Video</h3>
              <p className="text-[15px] text-text-2 mt-2 leading-relaxed">
                We're generating your high-fidelity walkthrough with zooms and transitions. Please keep this tab active.
              </p>
            </div>
            <AIShimmer isActive={true} className="w-full h-1.5 mt-4" children={null} />
          </div>
        </div>
      )}

      {/* Caption */}
      <div className="mt-4 text-center max-w-2xl h-[72px] overflow-hidden flex flex-col justify-start">
        <h3 className="text-[20px] font-semibold text-text leading-snug line-clamp-1">
          {session.aiOutputs.title}
        </h3>
        <AnimatePresence mode="wait">
          <motion.p
            key={currentStepIndex}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="text-[14px] text-text-2 mt-1 leading-relaxed line-clamp-2"
          >
            {currentStep?.textOverride || currentStep?.generatedText || 'Watch this smart walkthrough generated by StudioBase AI.'}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Export Button */}
      <div className="mt-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="md"
            icon={isExporting ? I.Download : I.Download}
            onClick={() => useStudioStore.getState().triggerExport()}
            disabled={isExporting}
          >
            {isExporting ? 'Exporting...' : 'Cinematic Export'}
          </Button>

          <Button
            variant="ghost"
            size="md"
            icon={I.Download}
            onClick={() => {
              const videoUrl = session.videoKey ? session.assets?.[session.videoKey] : null;
              if (videoUrl) {
                const a = document.createElement('a');
                a.href = videoUrl;
                a.download = `${session.aiOutputs?.title || 'recording'}.webm`;
                a.target = "_blank";
                a.click();
              }
            }}
          >
            Download Raw
          </Button>
        </div>
      </div>
    </div>
  );
};

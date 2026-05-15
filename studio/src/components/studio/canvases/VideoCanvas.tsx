import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useSpring } from 'framer-motion';
import { useStudioStore } from '../../../store/useStudioStore';
import { I } from '../../../components/icons';
import { cn, Button } from '../../../components/ui';
import { RenderConstants } from '../../../modules/render-engine/RenderConstants';
import { apiClient } from '../../../lib/apiClient';
import { WorkerExtractor } from '../../../services/WorkerExtractor';
import { CanvasRenderer } from '../../../modules/render-engine/CanvasRenderer';

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
  let extractor: WorkerExtractor | null = null;
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
  let currentX = 50;
  
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
    const renderer = new CanvasRenderer();
    extractor = new WorkerExtractor();
    
    if (videoUrl) {
      try {
        console.log("🔍 [Export] Initializing Deterministic Extractor (OFF-THREAD)...");
        await extractor.init(videoUrl);
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


  let absoluteLastLoggedMs = -1;

  for (let i = 0; i < steps.length; i++) {
    store.setStepIndex(i);
    const step = steps[i];
    const prevStep = i > 0 ? steps[i-1] : null;
    // console.log(`🎬 [Export] Step ${i+1}/${steps.length}: ${step.id}`);

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
    const startX = currentX || 50;

    const coords = (step.data as any)?.coordinates;
    let targetCenterX = 50;

    if (coords && typeof coords.x === 'number') {
      // Smart Defaults: Use 80x80 if width/height are missing
      const w = typeof coords.width === 'number' ? coords.width : 80;
      const vw = coords.viewportWidth || 1440;

      // Center-Point Fix: Target the middle of the interaction box
      const centerX = coords.x + (w / 2);
      
      targetCenterX = Math.max(15, Math.min(85, (centerX / vw) * 100));
    } else {
      // Vision Fallback: Subtle drift for native apps where metadata is missing
      targetCenterX = 50;
    }

    const jumpDist = Math.abs(targetCenterX - startX);
    let stepDuration = Math.max(2, ((step as any).duration || 5)); 
    if (jumpDist > 40) stepDuration *= 1.5; // Smooth out large context snaps
    const stepFrames = Math.floor(stepDuration * fps);

    let masterFrame: ImageBitmap | null = null;

    for (let f = 0; f < stepFrames; f++) {
      // The step might last 5 seconds, but the camera should finish moving in 1.2s
      const ANIMATION_DURATION_SEC = 1.2; 
      const currentFrameTimeSec = f / fps;
      const cameraProgress = Math.min(1.0, currentFrameTimeSec / ANIMATION_DURATION_SEC);

      // Safe approximation of an overdamped spring glide
      const springProgress = 1 - Math.pow(1 - cameraProgress, 4);

      // Overall step progress (used for frame extraction timing)
      const progress = f / stepFrames;

      // --- DETERMINISTIC FRAME CAPTURE (STRICT FORWARD LATCH) ---
      if (hasTimestamp && extractor) {
        const calculatedMs = (step.timestamp || 0) + (progress * stepDuration * 1000);
        
        // Never let the playhead move backward, even by a microsecond
        const safeTargetMs = Math.max(absoluteLastLoggedMs + 1, Math.floor(calculatedMs));
        const relTargetMs = toRelativeMs(safeTargetMs);

        // Optimization: If the playhead has moved less than 12ms, reuse the previous frame
        // to prevent expensive GOP restarts and redundant seeks.
        if (masterFrame && (safeTargetMs - absoluteLastLoggedMs) < 12 && absoluteLastLoggedMs !== -1) {
          // Skip extraction, reuse masterFrame
        } else {
          try {
            const newFrame = await extractor.getFrame(relTargetMs);
            if (newFrame) {
              if (masterFrame) masterFrame.close();
              masterFrame = newFrame;
              absoluteLastLoggedMs = safeTargetMs;
            }
          } catch (e) {
            // Silently handle extraction failures to prevent log flood
          }
        }
      }
      
      const currentAsset = masterFrame || asset;
      if (!currentAsset) continue;

      try {
        await renderer.render({
          ctx,
          dimensions: { width: canvas.width, height: canvas.height },
          masterFrame: currentAsset,
          step: step, 
          prevStep: prevStep, 
          progress: springProgress, 
          theme: {
            primaryColor: brand.primaryColor,
            logoUrl: brand.logoUrl ?? undefined,
            watermark: brand.watermark ?? undefined
          }, 
          renderMode: 'hybrid' 
        });
        
        // --- SYNCHRONIZED 60FPS HEARTBEAT ---
        // 1. Force the recorder to capture the CURRENT state of the canvas
        if (videoTrack && (videoTrack as any).requestFrame) {
          (videoTrack as any).requestFrame();
        }
        
        // 2. Yield to the compositor to ensure the frame is flushed to the stream
        await new Promise(res => requestAnimationFrame(() => res(null)));
        
        // --- SELECTIVE PROGRESS LOGGING (Noise Reduction) ---
        const totalFrames = steps.length * stepFrames;
        const currentTotalFrame = (i * stepFrames) + f;
        const progressPct = (currentTotalFrame / totalFrames) * 100;
        
        if (Math.floor(progressPct) % 25 === 0 && f === 0) {
          console.log(`🎬 [Export Progress] ${Math.round(progressPct)}% Complete`);
        }
        
        injectJitter();
      } catch (err) {
        console.error("❌ [Export] Render tick error:", err);
      } finally {
        ctx.restore();
      }
      
      framesRequested++; 
      framesDrawn++;
    }
    if (masterFrame) {
      masterFrame.close();
      masterFrame = null;
    }
    currentX = targetCenterX;
    
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
  const ghostIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderer = useMemo(() => new CanvasRenderer(), []);
  const stepStartTimeRef = useRef<number>(0);
  
  // GOLDEN SOUL: Physics-based progress spring for hardware-synced smoothness
  const progressSpring = useSpring(0, { stiffness: 120, damping: 24, restDelta: 0.001 });
  
  // SLIDE CACHE: Preload screenshots for slideshow mode
  const slideImageRef = useRef<HTMLImageElement | null>(null);

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
  const prevStep = steps[currentStepIndex - 1];

  useEffect(() => {
    if (!isExporting) {
      console.log(`🎬 [VideoCanvas] Step Transition: ${currentStepIndex} (${currentStep?.id})`);
      
      // GOLDEN SOUL: Reset and Trigger the physics spring for 100% parity with Framer Motion feel
      progressSpring.set(0);
      setTimeout(() => progressSpring.set(1), 0);
      
      // LATCH: Record both the video playhead and the wall-clock time for the hybrid timer
      if (videoRef.current) {
        stepStartTimeRef.current = videoRef.current.currentTime * 1000;
      }
      (window as any).uiStepChangeTime = performance.now();
    }
  }, [currentStepIndex, currentStep?.id, isExporting, progressSpring]);

  // --- SLIDE PRELOADER ---
  useEffect(() => {
    if (renderMode === 'slideshow' && currentStep?.screenshotKey) {
      const url = session?.assets?.[currentStep.screenshotKey];
      if (url) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = url;
        img.onload = () => {
          slideImageRef.current = img;
        };
      }
    }
  }, [currentStep?.id, renderMode, session?.assets]);



  useEffect(() => {
    if (ghostIntervalRef.current) {
      clearInterval(ghostIntervalRef.current);
      ghostIntervalRef.current = null;
    }

    if (!isPlaying) return;
    const value = currentStep?.inputValue;
    if (!value || currentStep?.action !== 'input') return;

    let i = 0;
    ghostIntervalRef.current = setInterval(() => {
      i++;
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



  // Voiceover playback (Audio only, no longer controls step advancement)
  useEffect(() => {
    if (!isPlaying) {
      audio.pause();
      return;
    }

    if (currentStep?.voiceoverKey) {
      const url = apiClient.getUrl(`/assets/${currentStep.voiceoverKey}`);
      if (audio.src !== url) {
        audio.src = url;
      }
      audio.playbackRate = playbackRate;
      audio.play().catch(console.error);
    } else {
      audio.pause();
    }
  }, [currentStepIndex, isPlaying, playbackRate, currentStep?.voiceoverKey]);

  // --- UNIFIED PREVIEW LOOP (rAF) ---
  useEffect(() => {
    let rafId: number;
    
    const tick = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video || !currentStep) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      // 1. Internal Resolution Handling (2880x1440 standard)
      const internalW = 2880;
      const internalH = 1444;
      
      if (canvas.width !== internalW || canvas.height !== internalH) {
        canvas.width = internalW;
        canvas.height = internalH;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      // 2. Smooth Cinematic Progress & Latched Step Transition
      const videoMs = video.currentTime * 1000;
      const wallClockElapsed = performance.now() - ((window as any).uiStepChangeTime || performance.now());

      // --- PLAYHEAD LATCH: Advance Step Index based on Video Time (Hybrid Mode) ---
      const nextStep = steps[currentStepIndex + 1];
      if (renderMode === 'hybrid' && isPlaying && nextStep && videoMs >= (nextStep.timestamp || 0)) {
        if (currentStepIndex < steps.length - 1) {
          setStepIndex(currentStepIndex + 1);
        }
      }

      // --- SLIDES AUTO-ADVANCE: 3-second wall-clock latch ---
      if (renderMode === 'slideshow' && isPlaying && wallClockElapsed >= 3000) {
        if (currentStepIndex < steps.length - 1) {
          setStepIndex(currentStepIndex + 1);
        } else {
          setPlaying(false);
          setIsEnded(true);
        }
      }

      // --- PLAYHEAD LATCH: Handle End of Session ---
      if (isPlaying && !nextStep && video.ended) {
        setPlaying(false);
        setIsEnded(true);
      }
      
      // GOLDEN SOUL: Read the physics-synced spring value
      const springProgress = progressSpring.get();

      // 3. Cinematic Draw Sequence (RETINA SCALED)
      ctx.clearRect(0, 0, internalW, internalH);
      ctx.save();
      
      renderer.render({
        ctx,
        dimensions: { width: internalW, height: internalH },
        masterFrame: renderMode === 'hybrid' ? video : (slideImageRef.current || video), 
        step: currentStep,
        prevStep: prevStep,
        progress: springProgress,
        theme: {
          primaryColor: brand.primaryColor,
          logoUrl: brand.logoUrl ?? undefined,
          watermark: brand.watermark ?? undefined
        },
        renderMode: renderMode || 'hybrid'
      });

      ctx.restore();

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [currentStepIndex, isPlaying, brand, renderMode, steps]);

  if (!session) return null;

  return (
    <div ref={playerRef} className="flex-1 min-h-0 bg-surface flex flex-col relative group">
      {/* DETERMINISTIC HIDDEN VIDEO FOR RENDERER TAPPING */}
      {videoUrl && (
        <video 
          ref={videoRef}
          src={videoUrl}
          crossOrigin="anonymous"
          className="hidden"
          playsInline
          muted
        />
      )}

      {/* COMPOSITOR CANVAS (The Visible Soul) */}
      <div className="flex-1 relative flex items-center justify-center p-8 overflow-hidden">
        <div className="relative shadow-2xl rounded-sm overflow-hidden bg-black aspect-video max-h-full">
          <canvas 
            ref={canvasRef}
            className="w-full h-full block"
            style={{ 
              imageRendering: 'crisp-edges' 
            }}
          />
          
          {/* Overlay for ended state */}
          <AnimatePresence>
            {isEnded && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 z-20 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-center p-10"
              >
                <div className="w-16 h-16 rounded-full bg-primary/20 text-primary flex items-center justify-center mb-6">
                  <I.CheckCircle size={32} strokeWidth={2.5} />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">End of Walkthrough</h2>
                <p className="text-white/70 max-w-[320px] mb-8">You've reached the end of the step-by-step guide.</p>
                <div className="flex gap-3">
                  <Button variant="primary" size="md" icon={I.RotateCcw} onClick={() => {
                    setStepIndex(0);
                    setIsEnded(false);
                    setPlaying(true);
                  }}>Watch again</Button>
                  <Button variant="ghost" size="md" className="!text-white border-white/20" onClick={() => setIsEnded(false)}>Stay on last step</Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Rendering Overlay */}
          <AnimatePresence>
            {isExporting && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 z-30 bg-black/80 flex flex-col items-center justify-center text-center p-10"
              >
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6" />
                <h2 className="text-xl font-bold text-white mb-2">🎬 Rendering Cinematic Video</h2>
                <p className="text-white/60 max-w-[320px]">Recording 60FPS high-definition frames off-screen. Please do not close this tab.</p>
                <div className="mt-8 px-4 py-2 bg-white/10 rounded-pill text-[12px] font-mono text-white/80">
                  EXPORT_MODE: HARDWARE_ACCELERATED
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* CONTROLS */}
      <div className="h-20 border-t border-border bg-bg flex items-center px-6 gap-6 relative z-10">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" icon={I.SkipBack} onClick={() => setStepIndex(Math.max(0, currentStepIndex - 1))} />
          <Button 
            variant="primary" 
            size="md" 
            className="w-10 h-10 !p-0 rounded-full" 
            icon={isPlaying ? I.Pause : I.Play} 
            onClick={() => {
              if (isEnded) {
                setStepIndex(0);
                setIsEnded(false);
              }
              setPlaying(!isPlaying);
            }} 
          />
          <Button variant="ghost" size="sm" icon={I.SkipForward} onClick={() => setStepIndex(Math.min(steps.length - 1, currentStepIndex + 1))} />
        </div>

        <div className="flex-1 h-1.5 bg-surface-2 rounded-pill relative group/progress cursor-pointer overflow-hidden">
          <div 
            className="absolute inset-y-0 left-0 bg-primary transition-all duration-300" 
            style={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="flex items-center gap-4">
          <div className="text-[13px] font-medium text-text-2 tabular-nums">
            Step {currentStepIndex + 1} of {steps.length}
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center bg-surface-2 rounded-sm p-0.5">
            {[1, 1.5, 2].map(speed => (
              <button 
                key={speed}
                onClick={() => useStudioStore.getState().setPlaybackRate(speed)}
                className={cn(
                  "px-2.5 h-7 rounded-sm text-[11px] font-bold transition-all",
                  playbackRate === speed ? "bg-white shadow-sm text-primary" : "text-text-3 hover:text-text-2"
                )}
              >
                {speed}x
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-border" />
          
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              icon={I.Download} 
              className="text-text-2 hover:text-primary"
              onClick={() => {
                if (rawVideoUrl) {
                  const a = document.createElement('a');
                  a.href = rawVideoUrl;
                  a.download = `raw-capture-${session.sessionId}.webm`;
                  a.click();
                }
              }}
            >
              Raw
            </Button>
            <Button 
              variant="primary" 
              size="sm" 
              icon={I.Video} 
              disabled={isExporting}
              onClick={() => handleSOPVideoExport()}
            >
              {isExporting ? 'Exporting...' : 'Export Cinematic'}
            </Button>
          </div>

          <div className="h-4 w-px bg-border" />
          <Button variant="ghost" size="sm" icon={I.Maximize} />
        </div>
      </div>
    </div>
  );
};

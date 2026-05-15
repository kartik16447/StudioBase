import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useSpring } from 'framer-motion';
import { useStudioStore } from '../../../store/useStudioStore';
import { I } from '../../../components/icons';
import { cn, Button, AIShimmer } from '../../../components/ui';
import { RenderConstants } from '../../../modules/render-engine/RenderConstants';
import { BACKEND_URL } from '../../../../../shared/constants';
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
      const url = `${BACKEND_URL}/assets/${currentStep.voiceoverKey}`;
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
  }, [currentStep, prevStep, brand, isPlaying]);

  if (!session) return null;

  return (
    <div className="flex-1 h-full studio-gradient flex flex-col items-center justify-start py-16 px-8 min-h-0 scroll-y">
      {/* Player */}
      <div
        ref={playerRef}
        className="relative w-full max-w-5xl rounded-img shadow-card-lifted overflow-hidden bg-[#12121a]"
        style={{ maxHeight: RenderConstants.PLAYER_MAX_HEIGHT, aspectRatio: RenderConstants.PLAYER_ASPECT_RATIO }}
      >
        {/* 🎬 UNIFIED CANVAS PLAYER 🎬 */}
        <canvas 
          ref={canvasRef} 
          className="w-full h-full object-contain"
        />

        {/* Hidden Driver Video */}
        <video
          ref={videoRef}
          src={videoUrl || undefined}
          style={{ opacity: 0, position: 'absolute', pointerEvents: 'none' }}
          muted
          playsInline
          crossOrigin="anonymous"
          preload="auto"
        />

        {/* Player Controls Overlay */}
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300">
          <div className="p-6 flex items-center gap-4">
            <button
              onClick={() => setPlaying(!isPlaying)}
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
              onClick={() => setPlaying(true)}
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

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStudioStore } from '../../../store/useStudioStore';
import { I } from '../../../components/icons';
import { cn, Button } from '../../../components/ui';
import { RenderConstants } from '../../../modules/render-engine/RenderConstants';
import { apiClient } from '../../../lib/apiClient';
import { WorkerExtractor } from '../../../services/WorkerExtractor';
import { CanvasRenderer } from '../../../modules/render-engine/CanvasRenderer';
import { CinematicMath } from '../../../modules/render-engine/CinematicMath';
import { TelemetryService } from '../../../services/TelemetryService';
import { CinematicPlayer, type CinematicPlayerHandle } from '../../player/CinematicPlayer';
import { analyticsClient } from '../../../lib/analyticsClient';
import { EmbedModal } from '../panels/EmbedModal';
import { exportScreenshotsToVideo } from '../../../modules/render-engine/VideoExporter';

// ─── Export ───────────────────────────────────────────────────────────────────

export async function handleSOPVideoExport(config: {
  session: any;
  theme: any;
  renderMode: string;
}) {
  const store = useStudioStore.getState();
  if (store.isExporting) return;

  const { session, theme: brand, renderMode } = config;
  const workspaceId = (session as any)?.workspaceId || 'default';
  const sessionId   = session?.sessionId || 'unknown';

  store.setIsExporting(true);
  store.setExportStatus('checking');
  store.setExportError(null);
  store.setExportProgress(0);

  const steps = session?.steps || [];

  // ── Health checks ─────────────────────────────────────────────────────────
  try {
    const videoKey = (session as any)?.videoKey || 'screen-recording';
    const videoUrl = session?.assets?.[videoKey] || session?.assets?.['video'] || '';
    if (!videoUrl) throw new Error('Video asset URL missing. Cannot export.');
    const check = await fetch(videoUrl, { method: 'HEAD' });
    if (!check.ok) throw new Error(`Video asset unavailable (${check.status})`);
    if (!(window as any).VideoDecoder)
      throw new Error('WebCodecs (VideoDecoder) not supported in this browser.');
  } catch (err: any) {
    store.setExportStatus('failed');
    store.setExportError(err.message);
    store.setIsExporting(false);
    return;
  }

  store.setExportStatus('exporting');

  // ── Compositor canvas (pinned to DOM for captureStream reliability) ────────
  const canvas = document.createElement('canvas');
  canvas.id    = 'export-compositor';
  canvas.width  = RenderConstants.EXPORT_COMPOSITOR_WIDTH;
  canvas.height = RenderConstants.EXPORT_COMPOSITOR_HEIGHT;
  Object.assign(canvas.style, {
    position: 'fixed', left: '0', top: '0',
    width: RenderConstants.EXPORT_VISUAL_WIDTH,
    height: RenderConstants.EXPORT_VISUAL_HEIGHT,
    opacity: '0.04', pointerEvents: 'none', zIndex: '9999',
  });
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d', { willReadFrequently: false, alpha: false });
  if (!ctx) {
    store.setExportStatus('failed');
    store.setExportError('Failed to get 2D context');
    store.setIsExporting(false);
    canvas.remove();
    return;
  }

  // ── Progress overlay ───────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'export-progress-overlay';
  Object.assign(overlay.style, {
    position: 'fixed', top: '20px', right: '20px',
    padding: '12px 20px', background: 'rgba(0,0,0,0.88)', color: '#fff',
    borderRadius: '8px', fontFamily: 'Inter,sans-serif', fontSize: '14px',
    zIndex: '10000', backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.1)',
  });
  overlay.innerText = '🎬 Preparing Export…';
  document.body.appendChild(overlay);

  let extractor: WorkerExtractor | null = null;
  let videoTrack: MediaStreamTrack | null = null;
  const chunks: Blob[] = [];

  try {
    const videoKey = (session as any)?.videoKey || 'screen-recording';
    const videoUrl = session?.assets?.[videoKey] || session?.assets?.['video'] || '';

    const stream    = (canvas as any).captureStream(RenderConstants.EXPORT_FPS);
    videoTrack      = stream.getVideoTracks()[0];
    const mimeType  = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9' : 'video/webm';
    const recorder  = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: RenderConstants.EXPORT_VIDEO_BITRATE,
    });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.start(500);

    extractor = new WorkerExtractor();
    await extractor.init(videoUrl);

    const renderer = new CanvasRenderer();
    const fps      = RenderConstants.EXPORT_FPS;

    // ── Timeline helpers ───────────────────────────────────────────────────
    const sessionStartTime =
      (session as any)?.startedAt   ? new Date((session as any).startedAt).getTime()
      : session?.capturedAt          ? new Date(session.capturedAt).getTime()
      : (steps[0]?.timestamp || 0);

    const maxDuration = extractor.getDuration();

    const toRelativeMs = (absMs: number) => {
      const rel = absMs - sessionStartTime;
      if (isNaN(rel)) return 0;
      return Math.max(0, Math.min(rel, maxDuration));
    };

    const getFrameSafe = async (targetMs: number, retries = 2) => {
      for (let i = 0; i < retries; i++) {
        const f = await extractor!.getFrame(targetMs);
        if (f) return f;
        await delay(60 * (i + 1));
      }
      return null;
    };

    // Jitter pixel — keeps MediaRecorder from emitting a blank segment
    const jitter = () => {
      ctx.save();
      ctx.globalAlpha = 0.008;
      ctx.fillStyle = `rgb(${rnd(255)},${rnd(255)},${rnd(255)})`;
      ctx.fillRect(canvas.width - 1, canvas.height - 1, 1, 1);
      ctx.restore();
    };

    // ── Spring simulator for export (mirrors framer-motion springs) ────────
    // Springs start at the full-overview position and carry momentum across
    // every step — no reset at step boundaries, targets just update.
    let springX = 50, springY = 50, springScale = 1.0;
    let velX = 0, velY = 0, velScale = 0;
    const DT = 1 / fps;
    const simSpring = (
      cur: number, vel: number, target: number,
      stiffness: number, damping: number, mass: number,
    ) => {
      const f = -stiffness * (cur - target) - damping * vel;
      const a = f / mass;
      const nv = vel + a * DT;
      const nc = cur + nv * DT;
      return { value: nc, velocity: nv };
    };

    let exportTimeMs   = 0;
    let absLastLoggedMs = -1;
    let masterFrame: ImageBitmap | null = null;

    // Chapter map for export cards (PATCH 5)
    const chapterMap = new Map<string, any>(
      (session?.metadata?.chapterBreaks || []).map((c: any) => [c.afterStepId, c]),
    );

    // ── Intro slide (3 s) ──────────────────────────────────────────────────
    if (brand.showIntro) {
      const title = session?.aiOutputs?.title || 'Walkthrough';
      const introFrames = Math.round(fps * 3);
      for (let f = 0; f < introFrames; f++) {
        const fadeA = f < 15 ? f / 15 : f > introFrames - 15 ? (introFrames - f) / 15 : 1;
        ctx.fillStyle = '#0a0a10';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.globalAlpha = fadeA;
        const ig = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        ig.addColorStop(0, brand.primaryColor + 'f0');
        ig.addColorStop(1, brand.primaryColor);
        ctx.fillStyle = ig;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.round(canvas.height * 0.08)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(title, canvas.width / 2, canvas.height / 2 - canvas.height * 0.06);
        ctx.globalAlpha = fadeA * 0.7;
        ctx.font = `400 ${Math.round(canvas.height * 0.04)}px Inter, system-ui, sans-serif`;
        ctx.fillText('A StudioBase walkthrough', canvas.width / 2, canvas.height / 2 + canvas.height * 0.04);
        ctx.restore();
        jitter();
        if (videoTrack && (videoTrack as any).requestFrame) (videoTrack as any).requestFrame();
        await delay(0);
      }
    }

    for (let i = 0; i < steps.length; i++) {
      store.setStepIndex(i);
      const step     = steps[i];
      const prevStep = i > 0 ? steps[i - 1] : null;

      // Distance-based camera target — hybrid model, scale capped at maxScale
      const { target, revealTarget } = CinematicMath.getHybridTarget(step, springX, springY);

      // Chapter card (PATCH 5) — 1.5 s branded title card before this step
      const exportChapter = i > 0 ? chapterMap.get(steps[i - 1].id) : null;
      if (exportChapter) {
        const chFrames = Math.round(fps * 1.5);
        for (let f = 0; f < chFrames; f++) {
          const fadeA = f < 10 ? f / 10 : f > chFrames - 10 ? (chFrames - f) / 10 : 1;
          ctx.fillStyle = '#0a0a10';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.save();
          ctx.globalAlpha = fadeA;
          const cg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
          cg.addColorStop(0, brand.primaryColor + 'e6');
          cg.addColorStop(1, brand.primaryColor);
          ctx.fillStyle = cg;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.font = `500 ${Math.round(canvas.height * 0.04)}px Inter, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('CHAPTER', canvas.width / 2, canvas.height * 0.40);
          ctx.fillStyle = '#fff';
          ctx.font = `bold ${Math.round(canvas.height * 0.09)}px Inter, system-ui, sans-serif`;
          ctx.fillText(exportChapter.chapterTitle, canvas.width / 2, canvas.height * 0.55);
          ctx.restore();
          jitter();
          if (videoTrack && (videoTrack as any).requestFrame) (videoTrack as any).requestFrame();
          await delay(0);
        }
      }

      // Contextual reveal beat for far moves — zoom-out + partial pan toward target,
      // then the main step frames spring the rest of the way in.
      if (revealTarget && i > 0) {
        const revealFrames = Math.round(fps * 0.35);
        for (let rf = 0; rf < revealFrames; rf++) {
          const sox = simSpring(springX, velX, revealTarget.pctX, RenderConstants.CAMERA_XY_SPRING.stiffness, RenderConstants.CAMERA_XY_SPRING.damping, RenderConstants.CAMERA_XY_SPRING.mass);
          const soy = simSpring(springY, velY, revealTarget.pctY, RenderConstants.CAMERA_XY_SPRING.stiffness, RenderConstants.CAMERA_XY_SPRING.damping, RenderConstants.CAMERA_XY_SPRING.mass);
          const sos = simSpring(springScale, velScale, revealTarget.scale, RenderConstants.CAMERA_SCALE_SPRING.stiffness, RenderConstants.CAMERA_SCALE_SPRING.damping, RenderConstants.CAMERA_SCALE_SPRING.mass);
          springX = sox.value; velX = sox.velocity;
          springY = soy.value; velY = soy.velocity;
          springScale = sos.value; velScale = sos.velocity;
          jitter();
          if (videoTrack && (videoTrack as any).requestFrame) (videoTrack as any).requestFrame();
          await delay(0);
        }
      }

      const stepDurationSec = Math.max(2,
        step.voiceoverDurationMs
          ? step.voiceoverDurationMs / 1000
          : 3.5,
      );
      const stepFrames = Math.floor(stepDurationSec * fps);
      const hasTimestamp = step.timestamp != null && step.timestamp > 0;

      for (let f = 0; f < stepFrames; f++) {
        const progress = f / stepFrames;
        exportTimeMs += 1000 / fps;

        // Advance spring
        const sx = simSpring(springX, velX, target.pctX,
          RenderConstants.CAMERA_XY_SPRING.stiffness,
          RenderConstants.CAMERA_XY_SPRING.damping,
          RenderConstants.CAMERA_XY_SPRING.mass);
        const sy = simSpring(springY, velY, target.pctY,
          RenderConstants.CAMERA_XY_SPRING.stiffness,
          RenderConstants.CAMERA_XY_SPRING.damping,
          RenderConstants.CAMERA_XY_SPRING.mass);
        const ss = simSpring(springScale, velScale, target.scale,
          RenderConstants.CAMERA_SCALE_SPRING.stiffness,
          RenderConstants.CAMERA_SCALE_SPRING.damping,
          RenderConstants.CAMERA_SCALE_SPRING.mass);
        springX = sx.value; velX = sx.velocity;
        springY = sy.value; velY = sy.velocity;
        springScale = ss.value; velScale = ss.velocity;

        // Frame extraction — skip if video has not advanced enough (≥ 30ms = 2 source frames)
        if (hasTimestamp && extractor) {
          const videoMs = (step.timestamp || 0) + progress * stepDurationSec * 1000;
          const relMs   = toRelativeMs(videoMs);
          const safeMs  = Math.max(absLastLoggedMs + 1, Math.floor(relMs));

          if (!masterFrame || (safeMs - absLastLoggedMs) >= 30) {
            const newFrame = await getFrameSafe(relMs);
            if (newFrame) {
              masterFrame?.close();
              masterFrame = newFrame;
              absLastLoggedMs = safeMs;
            }
          }
        }

        const asset = masterFrame;
        if (!asset && !hasTimestamp) continue;

        // Render
        renderer.render(
          ctx,
          {
            dimensions: { width: canvas.width, height: canvas.height },
            step, prevStep, progress,
            theme: {
              primaryColor: brand.primaryColor,
              logoUrl: brand.logoUrl ?? undefined,
              watermark: brand.watermark ?? undefined,
            },
            renderMode,
            camera: { pctX: springX, pctY: springY, scale: springScale },
            timeMs: exportTimeMs,
          },
          asset,
        );

        jitter();
        if (videoTrack && (videoTrack as any).requestFrame) {
          (videoTrack as any).requestFrame();
        }

        // Yield to browser so MediaRecorder can consume the frame.
        // requestAnimationFrame was used previously but created a hard 16.7 ms
        // wall-clock floor per frame even when the GPU was idle.
        // setTimeout(0) is much faster while still giving the browser a chance
        // to process events between frames.
        await delay(0);

        // Progress reporting (cheap, only on frame 0 of each step)
        if (f === 0) {
          const pct = Math.round((i / steps.length) * 100);
          store.setExportProgress(pct);
          overlay.innerText = `🎬 Exporting… ${pct}%  (step ${i + 1}/${steps.length})`;
        }
      }

      masterFrame?.close();
      masterFrame = null;
    }

    // ── Outro slide (3 s) ──────────────────────────────────────────────────
    if (brand.showOutro) {
      const watermarkText = brand.watermark || 'StudioBase';
      const outroFrames = Math.round(fps * 3);
      for (let f = 0; f < outroFrames; f++) {
        const fadeA = f < 15 ? f / 15 : f > outroFrames - 15 ? (outroFrames - f) / 15 : 1;
        ctx.fillStyle = '#0a0a10';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.globalAlpha = fadeA;
        const og = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        og.addColorStop(0, brand.primaryColor + 'f0');
        og.addColorStop(1, brand.primaryColor);
        ctx.fillStyle = og;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.round(canvas.height * 0.06)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(watermarkText, canvas.width / 2, canvas.height / 2);
        ctx.restore();
        jitter();
        if (videoTrack && (videoTrack as any).requestFrame) (videoTrack as any).requestFrame();
        await delay(0);
      }
    }

    // ── Finalise ───────────────────────────────────────────────────────────
    await new Promise<void>((res) => {
      recorder.onstop = () => res();
      recorder.stop();
    });

    const blob = new Blob(chunks, { type: 'video/webm' });
    if (blob.size < 1000) throw new Error('Export output is empty or corrupted');

    // Download
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), {
      href: url,
      download: `${session?.aiOutputs?.title || 'studiobase-cinematic'}.webm`,
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);

    // Cloud sync
    store.setExportStatus('finishing');
    overlay.innerText = '☁️ Uploading to Cloud…';
    try {
      const exportKey = `videos/${sessionId}/export_${Date.now()}.webm`;
      await apiClient.request(`/assets/file?key=${encodeURIComponent(exportKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/webm' },
        body: blob,
      });
      await apiClient.request(`/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ r2VideoKey: exportKey, r2ExportKey: exportKey }),
      });
    } catch (e) {
      console.error('[Export] Cloud sync failed:', e);
      store.setExportError('Cloud sync failed. File saved locally.');
    }

    store.setExportStatus('completed');
    TelemetryService.record({
      eventName: 'export.completed', sessionId, workspaceId,
      properties: { size: blob.size },
    });
    analyticsClient.track({
      sessionId, workspaceId,
      eventType: 'export_triggered',
      metadata: { size: blob.size },
    });

  } catch (err: any) {
    console.error('[Export] Fatal:', err);
    store.setExportStatus('failed');
    store.setExportError(err.message);
  } finally {
    if (extractor) await extractor.destroy().catch(() => {});
    if (videoTrack) videoTrack.stop();
    canvas.remove();
    overlay.remove();
    store.setIsExporting(false);
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

type ViewMode = 'cinematic' | 'raw';

export const VideoCanvas: React.FC = () => {
  const {
    session,
    currentStepIndex,
    playbackRate,
    setPlaying,
    setStepIndex,
    brand,
    isExporting,
    exportTrigger,
  } = useStudioStore();

  const [viewMode, setViewMode]   = useState<ViewMode>('cinematic');
  const [embedOpen, setEmbedOpen] = useState(false);
  const [isEnded, setIsEnded]     = useState(false);
  const [screenshotExporting, setScreenshotExporting] = useState(false);
  const [screenshotProgress, setScreenshotProgress]   = useState('');

  // PATCH 4: Intro / Outro slide state
  // Intro trigger was in the old play button — not yet wired to CinematicPlayer.
  // Destructure only the value (no setter) so TS doesn't flag unused setters.
  const [showIntroSlide] = useState(false);
  const [introVisible]   = useState(false);
  const [showOutroSlide, setShowOutroSlide] = useState(false);
  const [outroVisible,   setOutroVisible]   = useState(false);



  const playerRef         = useRef<HTMLDivElement>(null);
  const cinPlayerRef      = useRef<CinematicPlayerHandle>(null);
  const rawVideoRef       = useRef<HTMLVideoElement>(null);

  const renderMode = useStudioStore((s) => s.renderMode);
  const steps      = session?.steps || [];

  const rawVideoUrl = session?.videoKey
    ? (session.assets?.[session.videoKey] ?? null)
    : null;
  const hybridVideoUrl = renderMode === 'hybrid' ? rawVideoUrl : null;
  const sessionStartMs = (session as any)?.startedAt
    ? new Date((session as any).startedAt).getTime()
    : session?.capturedAt ? new Date(session.capturedAt).getTime() : 0;

  // Enrich the assets map with resolved voiceover URLs so CinematicPlayer can
  // play audio without knowing about apiClient.  Falls back gracefully if a key
  // is already in session.assets (e.g. public share page with pre-signed URLs).
  // This runs on every render but is O(steps) and cheap.
  const enrichedAssets = (() => {
    const base: Record<string, string> = { ...(session?.assets ?? {}) };
    for (const step of steps) {
      const key = (step as any).voiceoverKey as string | null | undefined;
      if (key && !base[key]) {
        base[key] = apiClient.getUrl(`/assets/${key}`);
      }
    }
    return base;
  })();

  // ── Export trigger ───────────────────────────────────────────────────────
  useEffect(() => {
    if (exportTrigger > 0 && !isExporting && useStudioStore.getState().activeView === 'video') {
      handleSOPVideoExport({ session, theme: brand, renderMode: 'slideshow' });
    }
  }, [exportTrigger]);

  // ── Sync external step changes (sidebar click, keyboard) → CinematicPlayer ──
  // Uses getCurrentStep() to check the player's actual internal index, making
  // this loop-proof: if the player already advanced naturally to this step,
  // getCurrentStep() === currentStepIndex and we skip the seek entirely.
  useEffect(() => {
    const playerStep = cinPlayerRef.current?.getCurrentStep() ?? currentStepIndex;
    console.log('[VideoCanvas] sync effect | store:', currentStepIndex, '| playerStep:', playerStep, '| will seek:', playerStep !== currentStepIndex);
    if (playerStep !== currentStepIndex) {
      cinPlayerRef.current?.seekToStep(currentStepIndex);
    }
  }, [currentStepIndex]);

  // ── Callbacks from CinematicPlayer → store ─────────────────────────────────
  const handlePlayerStepSelect = useCallback((idx: number) => {
    console.log('[VideoCanvas] handlePlayerStepSelect → setStepIndex', idx);
    setStepIndex(idx);
  }, [setStepIndex]);

  const handlePlayerPlayState = useCallback((playing: boolean) => {
    setPlaying(playing);
  }, [setPlaying]);

  // PATCH 4: Stable session-end handler — captures latest brand.showOutro
  const handleSessionEndRef = useRef<() => void>(() => { setIsEnded(true); });
  useEffect(() => {
    handleSessionEndRef.current = () => {
      setPlaying(false);
      const completionMs = Math.round(performance.now() - stepEnteredAt.current);
      analyticsClient.track({ sessionId, sopId, workspaceId, eventType: 'sop_completed', durationMs: completionMs });
      if (brand.showOutro) {
        setShowOutroSlide(true);
        setOutroVisible(true);
        setTimeout(() => {
          setOutroVisible(false);
          setTimeout(() => { setShowOutroSlide(false); setIsEnded(true); }, 400);
        }, 3000);
      } else {
        setIsEnded(true);
      }
    };
  }, [brand.showOutro]);



  // ── Raw video playback rate ──────────────────────────────────────────────
  useEffect(() => {
    if (rawVideoRef.current) rawVideoRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  // Analytics tracking refs
  const viewedSteps = useRef<Set<number>>(new Set());
  const stepEnteredAt = useRef<number>(performance.now());

  const sopId: string | null = (session as any)?.sopId ?? null;
  const sessionId: string = session?.sessionId ?? 'unknown';
  const workspaceId: string = (session as any)?.workspaceId ?? 'default';

  // Track step_viewed / step_skipped / step_replayed on step change
  useEffect(() => {
    if (!session || isExporting) return;
    const now = performance.now();
    const prevIndex = currentStepIndex - 1;
    // Record dwell on the previous step before moving
    if (viewedSteps.current.size > 0 && prevIndex >= 0) {
      const dwell = Math.round(now - stepEnteredAt.current);
      if (dwell < 2000) {
        analyticsClient.track({ sessionId, sopId, workspaceId, stepIndex: prevIndex, eventType: 'step_skipped', durationMs: dwell });
      }
    }
    stepEnteredAt.current = now;
    const alreadySeen = viewedSteps.current.has(currentStepIndex);
    if (alreadySeen) {
      analyticsClient.track({ sessionId, sopId, workspaceId, stepIndex: currentStepIndex, eventType: 'step_replayed' });
    } else {
      viewedSteps.current.add(currentStepIndex);
      analyticsClient.track({ sessionId, sopId, workspaceId, stepIndex: currentStepIndex, eventType: 'step_viewed' });
    }
  }, [currentStepIndex]);

  // Track sop_abandoned on unload
  useEffect(() => {
    if (!session) return;
    const onUnload = () => {
      const lastStep = viewedSteps.current.size > 0 ? Math.max(...viewedSteps.current) : null;
      const totalStepsCount = (session?.steps || []).length;
      if (lastStep === null || lastStep < totalStepsCount - 1) {
        analyticsClient.track({ sessionId, sopId, workspaceId, stepIndex: lastStep, eventType: 'sop_abandoned' });
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [session]);

  // Voiceover is now handled inside CinematicPlayer via the enrichedAssets map.

  if (!session) return null;

  return (
    <div className="flex-1 min-h-0 flex flex-col relative">
      <style>{`
        .studio-gradient {
          background:
            radial-gradient(ellipse at 30% 20%, rgba(99,102,241,0.10) 0%, transparent 60%),
            radial-gradient(ellipse at 70% 80%, rgba(139,92,246,0.07) 0%, transparent 60%),
            #111120;
        }
        @keyframes beam-drift {
          0%   { transform: translateX(-60%) skewX(-12deg); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateX(160%) skewX(-12deg); opacity: 0; }
        }
        .beam-drift { animation: beam-drift 5s ease-in-out infinite; }
        @keyframes border-travel {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .border-travel { animation: border-travel 4s linear infinite; }
      `}</style>

      {/* ── Viewing area ───────────────────────────────────────────────── */}
      <div className="flex-1 studio-gradient flex flex-col items-center justify-start py-16 px-8 min-h-0 overflow-y-auto">

        {/* Floating player card — outer shell clips rotating border to 1.5px edge */}
        <div
          ref={playerRef}
          className={cn(
            'relative w-full max-w-5xl rounded-[18px] overflow-hidden',
            viewMode !== 'cinematic' && 'hidden',
          )}
          style={{
            maxHeight: 'calc(100vh - 280px)',
            aspectRatio: '16/9',
            padding: '1.5px',
            filter: 'drop-shadow(0 20px 60px rgba(0,0,0,0.70)) drop-shadow(0 4px 6px rgba(0,0,0,0.30)) drop-shadow(0 0 40px rgba(99,102,241,0.05))',
          }}
        >
          {/* Traveling border light — single bright spot sweeps the perimeter */}
          <div
            className="border-travel absolute pointer-events-none"
            style={{
              inset: '-150%',
              background: `conic-gradient(from 0deg,
                transparent 0%,
                transparent 78%,
                ${brand.primaryColor}55 86%,
                rgba(255,255,255,0.32) 90%,
                ${brand.primaryColor}55 94%,
                transparent 100%
              )`,
            }}
          />

          {/* Inner card — CinematicPlayer fills the padded inset */}
          <div className="absolute inset-[1.5px] rounded-2xl overflow-hidden bg-[#12121a]">

          {/* CinematicPlayer — owns canvas, springs, timeline controls */}
          <CinematicPlayer
            ref={cinPlayerRef}
            steps={steps}
            assets={enrichedAssets}
            videoUrl={hybridVideoUrl}
            sessionStartMs={sessionStartMs ?? 0}
            chapterBreaks={session?.metadata?.chapterBreaks}
            renderMode={renderMode === 'hybrid' ? 'hybrid' : 'slideshow'}
            primaryColor={brand.primaryColor}
            onStepSelect={handlePlayerStepSelect}
            onPlayStateChange={handlePlayerPlayState}
          />

          {/* Watermark overlay — on top of player */}
          {brand.watermark && (
            <div className="absolute bottom-14 right-4 z-20 pointer-events-none opacity-55">
              {brand.logoUrl
                ? <img src={brand.logoUrl} className="h-5 object-contain" alt={brand.watermark} />
                : <span className="text-white text-[11px] font-semibold tracking-wide">{brand.watermark}</span>
              }
            </div>
          )}

          {/* Intro slide */}
          <AnimatePresence>
            {showIntroSlide && (
              <motion.div
                key="intro"
                initial={{ opacity: 0 }}
                animate={{ opacity: introVisible ? 1 : 0 }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0 z-30 flex flex-col items-center justify-center text-center p-10"
                style={{ background: `linear-gradient(135deg, ${brand.primaryColor}f0, ${brand.primaryColor})` }}
              >
                {brand.logoUrl && (
                  <img src={brand.logoUrl} className="h-14 object-contain mb-6" alt="Logo" />
                )}
                <h2 className="text-3xl font-bold text-white mb-3">
                  {session?.aiOutputs?.title || 'Walkthrough'}
                </h2>
                <p className="text-white/70 text-base">A StudioBase walkthrough</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Outro slide */}
          <AnimatePresence>
            {showOutroSlide && (
              <motion.div
                key="outro"
                initial={{ opacity: 0 }}
                animate={{ opacity: outroVisible ? 1 : 0 }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0 z-30 flex flex-col items-center justify-center text-center p-10"
                style={{ background: `linear-gradient(135deg, ${brand.primaryColor}f0, ${brand.primaryColor})` }}
              >
                {brand.logoUrl && (
                  <img src={brand.logoUrl} className="h-14 object-contain mb-4" alt="Logo" />
                )}
                <p className="text-white text-xl font-semibold tracking-wide">{brand.watermark || 'StudioBase'}</p>
              </motion.div>
            )}
          </AnimatePresence>



          {/* Ended overlay */}
          <AnimatePresence>
            {isEnded && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="absolute inset-0 z-20 bg-black/65 backdrop-blur-sm flex flex-col items-center justify-center text-center p-10"
              >
                <div className="w-16 h-16 rounded-full bg-primary/20 text-primary flex items-center justify-center mb-6">
                  <I.CheckCircle size={32} strokeWidth={2.5} />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">End of Walkthrough</h2>
                <p className="text-white/60 max-w-xs mb-8">You've reached the end of the step-by-step guide.</p>
                <div className="flex gap-3">
                  <Button variant="primary" size="md" icon={I.RotateCcw} onClick={() => {
                    setStepIndex(0); setIsEnded(false); setPlaying(true);
                  }}>Watch again</Button>
                  <Button variant="ghost" size="md"
                    className="!text-white border-white/20"
                    onClick={() => setIsEnded(false)}>
                    Stay here
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Export overlay */}
          <AnimatePresence>
            {isExporting && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="absolute inset-0 z-30 bg-black/85 flex flex-col items-center justify-center text-center p-10"
              >
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6" />
                <h2 className="text-xl font-bold text-white mb-2">🎬 Rendering Cinematic Export</h2>
                <p className="text-white/50 max-w-xs text-sm">Do not close this tab.</p>
              </motion.div>
            )}
          </AnimatePresence>
          </div>{/* /inner card */}
        </div>{/* /outer border wrapper */}

        {/* Raw video player */}
        {viewMode === 'raw' && (
          <div className="w-full max-w-5xl flex items-center justify-center rounded-2xl overflow-hidden p-4"
            style={{ background: 'rgba(9,9,15,0.45)', backdropFilter: 'blur(12px)' }}
          >
            {rawVideoUrl ? (
              <video
                ref={rawVideoRef}
                src={rawVideoUrl}
                controls
                controlsList="nodownload"
                className="max-w-full max-h-full rounded-xl shadow-2xl"
                onEnded={() => setIsEnded(true)}
              />
            ) : (
              <p className="text-white/30 text-sm">No raw video available for this session.</p>
            )}
          </div>
        )}
      </div>

      {/* ── Controls bar — export/embed/view toggle only; playback is inside CinematicPlayer ── */}
      <div className="border-t border-border bg-bg relative z-10">
        <div className="flex items-center px-4 h-12 gap-3 pr-36">

          <div className="flex-1" />

          {/* View toggle */}
          <div className="flex items-center bg-surface-2 rounded-sm p-0.5 shrink-0">
            {(['cinematic', 'raw'] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={cn(
                  'px-3 h-6 rounded-sm text-[11px] font-semibold capitalize transition-all',
                  viewMode === m ? 'bg-white shadow-sm text-primary' : 'text-text-3 hover:text-text-2',
                )}
              >
                {m === 'cinematic' ? '✦ Cinematic' : '▶ Raw'}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-border shrink-0" />

          {/* Export */}
          <Button
            variant="ghost" size="sm" icon={I.Download}
            className="text-text-2 hover:text-primary shrink-0"
            onClick={() => {
              if (rawVideoUrl) {
                Object.assign(document.createElement('a'), {
                  href: rawVideoUrl,
                  download: `raw-${session.sessionId}.webm`,
                }).click();
              }
            }}
          >
            Raw
          </Button>
          <Button
            variant="ghost" size="sm" icon={I.Code2}
            className="shrink-0"
            onClick={() => setEmbedOpen(true)}
          >
            Embed
          </Button>
          <Button
            variant="primary" size="sm" icon={I.Download}
            disabled={screenshotExporting || isExporting}
            className="shrink-0"
            title="Export session as WebM video (uses screenshots)"
            onClick={async () => {
              if (screenshotExporting) return;
              setScreenshotExporting(true);
              setScreenshotProgress('Loading…');
              try {
                await exportScreenshotsToVideo(session, (p) => {
                  if (p.phase === 'loading') setScreenshotProgress(`Loading ${p.step}/${p.total}…`);
                  else if (p.phase === 'rendering') setScreenshotProgress(`Rendering ${p.step}/${p.total}…`);
                  else setScreenshotProgress('Finishing…');
                });
              } catch (e: any) {
                alert(`Export failed: ${e.message}`);
              } finally {
                setScreenshotExporting(false);
                setScreenshotProgress('');
              }
            }}
          >
            {screenshotExporting ? screenshotProgress : 'Export Video'}
          </Button>
        </div>
      </div>
      <EmbedModal open={embedOpen} onClose={() => setEmbedOpen(false)} />
    </div>
  );
};

// ─── Utilities ────────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const rnd   = (n: number)  => Math.floor(Math.random() * n);

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSpring } from 'framer-motion';
import { I } from '../components/icons';
import { cn } from '../components/ui';
import { BACKEND_URL } from '../../../shared/constants';
import { CanvasRenderer } from '../modules/render-engine/CanvasRenderer';
import { CinematicMath } from '../modules/render-engine/CinematicMath';
import { RenderConstants } from '../modules/render-engine/RenderConstants';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PStep {
  id: string;
  sequence?: number;
  screenshotKey?: string;
  stepTitle?: string;
  generatedText?: string;
  textOverride?: string;
  elementText?: string;
  action?: string;
  url?: string;
  timestamp?: number;
  voiceoverDurationMs?: number;
  coordinates?: { x: number; y: number; viewportWidth: number; viewportHeight: number } | null;
  animationTarget?: { centerX: number; centerY: number; zoomScale: number } | null;
}

interface PSession {
  capturedAt?: any;
  capturedUrl?: string;
  aiOutputs?: { title?: string; summary?: string; tags?: string[] };
  metadata?: { stepCount?: number; chapterBreaks?: { afterStepId: string; chapterTitle: string }[] };
  steps: PStep[];
  assets?: Record<string, string>;
}

type ViewMode = 'video' | 'guide';

// ─── Constants ────────────────────────────────────────────────────────────────

const STEP_MS = 3500;

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};

const fmtDate = (ts: any) => {
  if (!ts) return '';
  return new Date(typeof ts === 'number' ? ts : ts)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getDomain = (url?: string) => {
  try { return url ? new URL(url).hostname.replace('www.', '') : null; } catch { return null; }
};

function buildChapterMap(breaks?: { afterStepId: string; chapterTitle: string }[]) {
  const map = new Map<string, string>();
  (breaks || []).forEach(b => map.set(b.afterStepId, b.chapterTitle));
  return map;
}

// ─── CinematicVideoPlayer ─────────────────────────────────────────────────────
// Uses the exact same CanvasRenderer + CinematicMath + framer-motion springs as
// the dashboard VideoCanvas — identical cinematic quality on the public share page.

interface PlayerProps {
  steps: PStep[];
  assets: Record<string, string>;
  currentIndex: number;
  isPlaying: boolean;
  speed: number;
  videoUrl: string | null;       // raw screen recording URL (if available)
  sessionStartMs: number;        // epoch ms when recording started (for video seek sync)
  onSeek: (idx: number) => void;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSpeedChange: (s: number) => void;
}

const CinematicVideoPlayer: React.FC<PlayerProps> = ({
  steps, assets, currentIndex, isPlaying, speed,
  videoUrl, sessionStartMs,
  onSeek, onTogglePlay, onPrev, onNext, onSpeedChange,
}) => {
  const containerRef  = useRef<HTMLDivElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const videoRef      = useRef<HTMLVideoElement>(null);
  const slideImageRef = useRef<HTMLImageElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const stepStartWall  = useRef(performance.now());
  const renderer      = useMemo(() => new CanvasRenderer(), []);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isEnded, setIsEnded] = useState(false);

  // Refs for RAF loop (avoids stale closures)
  const isPlayingRef      = useRef(isPlaying);
  const currentIdxRef     = useRef(currentIndex);
  const speedRef          = useRef(speed);
  const stepsRef          = useRef(steps);
  const onNextRef         = useRef(onNext);
  const onToggleRef       = useRef(onTogglePlay);
  const sessionStartMsRef = useRef(sessionStartMs);
  const videoUrlRef       = useRef(videoUrl);
  useEffect(() => { isPlayingRef.current      = isPlaying;      }, [isPlaying]);
  useEffect(() => { currentIdxRef.current     = currentIndex;   }, [currentIndex]);
  useEffect(() => { speedRef.current          = speed;          }, [speed]);
  useEffect(() => { stepsRef.current          = steps;          }, [steps]);
  useEffect(() => { onNextRef.current         = onNext;         }, [onNext]);
  useEffect(() => { onToggleRef.current       = onTogglePlay;   }, [onTogglePlay]);
  useEffect(() => { sessionStartMsRef.current = sessionStartMs; }, [sessionStartMs]);
  useEffect(() => { videoUrlRef.current       = videoUrl;       }, [videoUrl]);

  // ── Camera springs (framer-motion — matches dashboard exactly) ──────────────
  const { stiffness: sxy, damping: dxy, mass: mxy } = RenderConstants.CAMERA_XY_SPRING;
  const { stiffness: ss,  damping: ds,  mass: ms  } = RenderConstants.CAMERA_SCALE_SPRING;
  const camX     = useSpring(50,  { stiffness: sxy, damping: dxy, mass: mxy });
  const camY     = useSpring(50,  { stiffness: sxy, damping: dxy, mass: mxy });
  const camScale = useSpring(1.0, { stiffness: ss,  damping: ds,  mass: ms  });

  const currentStep = steps[currentIndex];
  const prevStep    = steps[currentIndex - 1] ?? null;

  // Reset step wall-clock timer on step change; seek video to step position
  useEffect(() => {
    stepStartWall.current = performance.now();
    setIsEnded(false);
    // Seek video to the relative timestamp of this step
    if (videoRef.current && videoUrl && currentStep?.timestamp) {
      const relSec = Math.max(0, (currentStep.timestamp - sessionStartMs) / 1000);
      if (Math.abs(videoRef.current.currentTime - relSec) > 0.2) {
        videoRef.current.currentTime = relSec;
      }
    }
  }, [currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Camera spring target on step change (mirrors VideoCanvas exactly)
  useEffect(() => {
    if (!currentStep) return;
    const target   = CinematicMath.getTarget(currentStep, 'slideshow');
    const sameCtx  = CinematicMath.isSameContext(prevStep, currentStep);

    if (sameCtx) {
      camX.set(target.pctX);
      camY.set(target.pctY);
      camScale.set(target.scale);
    } else {
      // Cross-context: briefly return to overview, then spring to new target
      camScale.set(1.0);
      camX.set(50);
      camY.set(50);
      const t = setTimeout(() => {
        camX.set(target.pctX);
        camY.set(target.pctY);
        camScale.set(target.scale);
      }, 120);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, currentStep?.id]);

  // Preload screenshot into an off-screen Image so canvas gets pixels immediately
  useEffect(() => {
    slideImageRef.current = null;
    if (!currentStep?.screenshotKey) return;
    const url = assets[currentStep.screenshotKey];
    if (!url) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    img.onload = () => { slideImageRef.current = img; };
  }, [currentStep?.id, currentStep?.screenshotKey, assets]);

  // ── Single persistent RAF render loop ──────────────────────────────────────
  useEffect(() => {
    let rafId: number;

    const tick = () => {
      const canvas = canvasRef.current;
      const step   = stepsRef.current[currentIdxRef.current];

      if (canvas && step) {
        const cW = RenderConstants.PREVIEW_WIDTH;
        const cH = RenderConstants.PREVIEW_HEIGHT;
        if (canvas.width !== cW || canvas.height !== cH) {
          canvas.width  = cW;
          canvas.height = cH;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const video     = videoRef.current;
          const hasVideo  = !!(videoUrlRef.current && video);

          // Auto-advance + progress bar
          if (isPlayingRef.current) {
            const ci  = currentIdxRef.current;
            const len = stepsRef.current.length;

            if (hasVideo && video) {
              // ── Video-driven advance: sync steps to video.currentTime ──────
              const videoMs   = video.currentTime * 1000;
              const nextStep  = stepsRef.current[ci + 1];
              if (nextStep?.timestamp) {
                const nextRelMs = nextStep.timestamp - sessionStartMsRef.current;
                if (videoMs >= nextRelMs) {
                  stepStartWall.current = performance.now();
                  onNextRef.current();
                }
              }
              if (!nextStep && video.ended) {
                onToggleRef.current();
              }
              // Progress bar based on video duration
              if (progressBarRef.current && video.duration) {
                progressBarRef.current.style.width = `${Math.min(100, (video.currentTime / video.duration) * 100)}%`;
              }
            } else {
              // ── Slideshow fallback: fixed timing ──────────────────────────
              const elapsed = performance.now() - stepStartWall.current;
              const stepMs  = STEP_MS / speedRef.current;

              if (progressBarRef.current) {
                const pct = Math.min(100, ((ci + Math.min(elapsed / stepMs, 1)) / len) * 100);
                progressBarRef.current.style.width = `${pct}%`;
              }

              if (elapsed >= stepMs) {
                stepStartWall.current = performance.now();
                if (ci < len - 1) {
                  onNextRef.current();
                } else {
                  onToggleRef.current();
                }
              }
            }
          }

          // masterFrame: real video frame when playing, else screenshot
          const masterFrame: HTMLVideoElement | HTMLImageElement | null =
            hasVideo && video && !video.paused && !video.ended
              ? video
              : slideImageRef.current;

          renderer.render(
            ctx,
            {
              dimensions: { width: cW, height: cH },
              step,
              prevStep: stepsRef.current[currentIdxRef.current - 1] ?? null,
              progress: 1.0,
              theme: { primaryColor: '#5E5CE6' },
              renderMode: hasVideo ? 'hybrid' : 'slideshow',
              camera: {
                pctX:  camX.get(),
                pctY:  camY.get(),
                scale: camScale.get(),
              },
              timeMs: performance.now(),
            },
            masterFrame,
          );
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — everything is read via refs

  // ── Video play/pause ────────────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoUrl) return;
    if (isPlaying) v.play().catch(() => {});
    else v.pause();
  }, [isPlaying, videoUrl]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);

  // ── Auto-hide controls ──────────────────────────────────────────────────────
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (isPlayingRef.current) {
      controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, []);

  useEffect(() => {
    if (!isPlaying) { setShowControls(true); }
    else { showControlsTemporarily(); }
    return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); };
  }, [isPlaying, showControlsTemporarily]);

  // ── Fullscreen ──────────────────────────────────────────────────────────────
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  };
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const totalSteps = steps.length;
  const elapsedMs  = currentIndex * STEP_MS;
  const totalMs    = totalSteps * STEP_MS;
  const stepTitle  = currentStep?.stepTitle || currentStep?.elementText || `Step ${currentIndex + 1}`;

  return (
    <div
      ref={containerRef}
      className="w-full select-none"
      onMouseMove={showControlsTemporarily}
      style={{ cursor: isPlaying && !showControls ? 'none' : 'default' }}
    >
      {/* Hidden video element — feeds canvas renderer in hybrid mode */}
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          crossOrigin="anonymous"
          className="hidden"
          playsInline
          muted={false}
          preload="auto"
        />
      )}

      {/* Player shell */}
      <div
        className="relative w-full rounded-2xl overflow-hidden"
        style={{
          aspectRatio: '16/9',
          boxShadow: '0 24px 64px rgba(0,0,0,0.70), 0 0 0 1px rgba(94,92,230,0.2)',
        }}
      >
        {/* Canvas card */}
        <div
          className="absolute inset-0 rounded-2xl overflow-hidden bg-[#12121a]"
          onClick={() => { if (!isEnded) onTogglePlay(); }}
          style={{ cursor: 'pointer' }}
        >
          {/* Canvas — the cinematic renderer draws here */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full block"
            style={{ imageRendering: 'auto' }}
          />

          {/* Play overlay when paused */}
          {!isPlaying && !isEnded && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-20 h-20 rounded-full bg-black/55 backdrop-blur-sm border border-white/20 flex items-center justify-center"
                style={{ boxShadow: '0 0 0 1px rgba(94,92,230,0.3), 0 8px 32px rgba(0,0,0,0.5)' }}>
                <I.Play size={28} className="text-white ml-1.5" />
              </div>
            </div>
          )}

          {/* Ended overlay */}
          {isEnded && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 rounded-full bg-indigo-500/20 flex items-center justify-center mb-5">
                <I.CheckCircle size={30} className="text-indigo-400" strokeWidth={2} />
              </div>
              <h2 className="text-[22px] font-bold text-white mb-2">End of Walkthrough</h2>
              <p className="text-[14px] text-white/50 max-w-xs mb-7">You've reached the end.</p>
              <div className="flex gap-3">
                <button
                  onClick={(e) => { e.stopPropagation(); onSeek(0); setIsEnded(false); onTogglePlay(); }}
                  className="flex items-center gap-2 px-5 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-semibold transition-colors"
                >
                  <I.RotateCcw size={14} /> Watch again
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setIsEnded(false); }}
                  className="flex items-center gap-2 px-5 h-10 rounded-xl border border-white/20 text-white/70 hover:text-white text-[13px] font-semibold transition-colors"
                >
                  Stay here
                </button>
              </div>
            </div>
          )}

          {/* Step counter badge */}
          {!isEnded && (
            <div
              className="absolute top-3 right-3 px-2.5 py-1 bg-black/60 rounded-full text-white text-[11px] font-semibold backdrop-blur-sm pointer-events-none"
              style={{ opacity: showControls || !isPlaying ? 1 : 0, transition: 'opacity 0.3s' }}
            >
              {currentIndex + 1} / {totalSteps}
            </div>
          )}

          {/* Lower-third step label */}
          {!isEnded && (
            <div
              className="absolute bottom-[52px] left-0 right-0 px-5 pb-3 pointer-events-none"
              style={{
                background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)',
                opacity: showControls || !isPlaying ? 1 : 0,
                transition: 'opacity 0.3s',
              }}
            >
              <p className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider mb-0.5">
                Step {currentIndex + 1}
              </p>
              <p className="text-[13px] font-semibold text-white leading-snug line-clamp-1">{stepTitle}</p>
            </div>
          )}

          {/* Controls overlay (auto-hides during playback) */}
          {!isEnded && (
            <div
              className="absolute bottom-0 left-0 right-0"
              style={{
                opacity: showControls || !isPlaying ? 1 : 0,
                transition: 'opacity 0.3s',
                pointerEvents: showControls || !isPlaying ? 'auto' : 'none',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Progress bar */}
              <div
                className="h-1 bg-white/10 cursor-pointer group"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct  = (e.clientX - rect.left) / rect.width;
                  onSeek(Math.min(totalSteps - 1, Math.floor(pct * totalSteps)));
                }}
              >
                <div
                  ref={progressBarRef}
                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500"
                  style={{ width: `${(currentIndex / totalSteps) * 100}%`, transition: 'none' }}
                />
                <div
                  className="absolute top-0 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity -translate-x-1/2 pointer-events-none"
                  style={{ left: `${(currentIndex / totalSteps) * 100}%` }}
                />
              </div>

              {/* Controls row */}
              <div className="flex items-center gap-2 px-4 h-12 bg-black/80 backdrop-blur-sm">
                <button onClick={onPrev} disabled={currentIndex === 0}
                  className="p-1.5 text-white/50 hover:text-white disabled:opacity-20 transition-colors">
                  <I.SkipBack size={16} />
                </button>
                <button
                  onClick={onTogglePlay}
                  className="w-9 h-9 rounded-full bg-white flex items-center justify-center hover:bg-white/90 active:scale-95 flex-shrink-0 transition-all shadow"
                >
                  {isPlaying
                    ? <I.Pause size={15} className="text-black" />
                    : <I.Play  size={15} className="text-black ml-0.5" />}
                </button>
                <button onClick={onNext} disabled={currentIndex === totalSteps - 1}
                  className="p-1.5 text-white/50 hover:text-white disabled:opacity-20 transition-colors">
                  <I.SkipForward size={16} />
                </button>
                <span className="text-[11px] text-white/35 tabular-nums ml-1 font-mono select-none">
                  {fmtTime(elapsedMs)} / {fmtTime(totalMs)}
                </span>
                <div className="flex-1" />
                <div className="flex items-center gap-0.5 bg-white/[0.08] rounded-md p-0.5">
                  {[0.5, 1, 1.5, 2].map(s => (
                    <button key={s} onClick={() => onSpeedChange(s)}
                      className={cn('px-2 h-5 rounded text-[10px] font-bold transition-colors',
                        speed === s ? 'bg-white text-black' : 'text-white/40 hover:text-white')}>
                      {s}×
                    </button>
                  ))}
                </div>
                <button onClick={toggleFullscreen} className="p-1.5 text-white/40 hover:text-white transition-colors ml-1">
                  {isFullscreen ? <I.Minimize2 size={14} /> : <I.Maximize size={14} />}
                </button>
              </div>
            </div>
          )}
        </div>
    </div>
  );
};

// ─── TranscriptPanel ─────────────────────────────────────────────────────────

const TranscriptPanel: React.FC<{
  steps: PStep[];
  assets: Record<string, string>;
  currentIndex: number;
  chapterMap: Map<string, string>;
  onSelect: (i: number) => void;
}> = ({ steps, assets, currentIndex, chapterMap, onSelect }) => {
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [currentIndex]);

  let chapterIdx = 0;
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-white/[0.07] flex-shrink-0 px-5 py-3">
        <span className="text-[13px] font-semibold text-white border-b-2 border-indigo-500 pb-3 -mb-3">Steps</span>
        <span className="text-[11px] text-white/30">{steps.length} total</span>
      </div>
      <div className="flex-1 overflow-y-auto py-2 min-h-0">
        {steps.map((step, i) => {
          const isActive = i === currentIndex;
          const thumb    = step.screenshotKey ? assets[step.screenshotKey] : null;
          const title    = step.stepTitle || step.elementText || `Step ${i + 1}`;
          const text     = step.textOverride || step.generatedText || '';
          const chapterTitle = chapterMap.get(step.id);
          if (chapterTitle) chapterIdx++;
          return (
            <React.Fragment key={step.id || i}>
              {chapterTitle && (
                <div className="px-4 pt-3 pb-1">
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                    Chapter {chapterIdx}: {chapterTitle}
                  </span>
                </div>
              )}
              <button
                ref={isActive ? activeRef : null}
                onClick={() => onSelect(i)}
                className={cn('w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors rounded-lg mx-1',
                  isActive ? 'bg-white/[0.09]' : 'hover:bg-white/[0.04]')}
              >
                <div className={cn('flex-shrink-0 w-14 h-9 rounded-md overflow-hidden mt-0.5 border',
                  isActive ? 'border-indigo-500/60' : 'border-white/[0.08]')}>
                  {thumb
                    ? <img src={thumb} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full bg-white/[0.06] flex items-center justify-center text-[9px] text-white/30">{i + 1}</div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {isActive && <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />}
                    <p className={cn('text-[12px] font-semibold leading-snug line-clamp-2',
                      isActive ? 'text-white' : 'text-white/70')}>{title}</p>
                  </div>
                  {text && <p className="text-[11px] text-white/35 mt-0.5 line-clamp-2 leading-relaxed">{text}</p>}
                </div>
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

// ─── GuideView (SOP document) ─────────────────────────────────────────────────

const GuideView: React.FC<{
  steps: PStep[];
  assets: Record<string, string>;
  chapterMap: Map<string, string>;
  title: string;
  summary?: string;
  tags?: string[];
}> = ({ steps, assets, chapterMap, title, summary, tags }) => {
  let chapterIdx = 0;
  return (
    <div className="max-w-[780px] mx-auto py-8 space-y-0">
      {/* Doc header */}
      <div className="mb-10 pb-8 border-b border-white/[0.07]">
        <h1 className="text-[28px] font-bold text-white leading-tight tracking-tight mb-4">{title}</h1>
        {summary && <p className="text-[15px] text-white/55 leading-relaxed">{summary}</p>}
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {tags.map(t => (
              <span key={t} className="px-2.5 py-0.5 bg-white/[0.06] border border-white/[0.08] rounded-full text-[11px] text-white/50">{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* Steps */}
      {steps.map((step, i) => {
        const screenshotUrl = step.screenshotKey ? assets[step.screenshotKey] : null;
        const stepTitle     = step.stepTitle || step.elementText || '';
        const text          = step.textOverride || step.generatedText || '';
        const chapterTitle  = chapterMap.get(step.id);
        if (chapterTitle) chapterIdx++;

        return (
          <React.Fragment key={step.id || i}>
            {chapterTitle && (
              <div className="flex items-center gap-3 py-6">
                <div className="flex-1 h-px bg-white/[0.07]" />
                <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest px-2">
                  Chapter {chapterIdx}: {chapterTitle}
                </span>
                <div className="flex-1 h-px bg-white/[0.07]" />
              </div>
            )}

            <div className="group pb-14">
              {/* Screenshot */}
              <div className="w-full rounded-xl overflow-hidden bg-[#111116] border border-white/[0.06] mb-5"
                style={{ boxShadow: '0 4px 32px rgba(0,0,0,0.4)' }}>
                {screenshotUrl ? (
                  <img
                    src={screenshotUrl}
                    alt={stepTitle || `Step ${i + 1}`}
                    className="w-full h-auto block"
                    loading="lazy"
                  />
                ) : (
                  <div className="aspect-video flex flex-col items-center justify-center gap-2 text-white/20">
                    <I.Image size={32} />
                    <span className="text-[12px]">No screenshot</span>
                  </div>
                )}
              </div>

              {/* Step heading */}
              <h2 className="text-[18px] font-bold text-white leading-snug mb-2">
                <span className="text-indigo-400 mr-2">Step {i + 1}.</span>
                {stepTitle}
              </h2>

              {text && <p className="text-[14px] text-white/60 leading-[1.75]">{text}</p>}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ─── ViewToggle ───────────────────────────────────────────────────────────────

const ViewToggle: React.FC<{ mode: ViewMode; onChange: (m: ViewMode) => void }> = ({ mode, onChange }) => (
  <div className="flex items-center bg-white/[0.05] border border-white/[0.08] rounded-xl p-1 gap-1">
    <button
      onClick={() => onChange('video')}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all duration-200',
        mode === 'video' ? 'bg-white text-black shadow-sm' : 'text-white/50 hover:text-white',
      )}
    >
      <I.Play size={14} className={mode === 'video' ? 'text-black' : 'text-white/50'} />
      Video
    </button>
    <button
      onClick={() => onChange('guide')}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all duration-200',
        mode === 'guide' ? 'bg-white text-black shadow-sm' : 'text-white/50 hover:text-white',
      )}
    >
      <I.FileText size={14} className={mode === 'guide' ? 'text-black' : 'text-white/50'} />
      Step-by-Step Guide
    </button>
  </div>
);

// ─── PlayerPage ───────────────────────────────────────────────────────────────

export const PlayerPage: React.FC<{ shareToken: string }> = ({ shareToken }) => {
  const [session,    setSession]    = useState<PSession | null>(null);
  const [ownerName,  setOwnerName]  = useState('');
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [copied,     setCopied]     = useState(false);
  const [viewMode,   setViewMode]   = useState<ViewMode>('video');

  // Player state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [speed,        setSpeed]        = useState(1);
  const speedRef = useRef(1);

  // Load session
  useEffect(() => {
    if (!shareToken) { setError('No share token.'); setLoading(false); return; }
    (async () => {
      try {
        const meta = await fetch(`${BACKEND_URL}/v1/public/${shareToken}`).then(r => r.json()) as any;
        if (meta.error) throw new Error(meta.error);
        setOwnerName(meta.owner?.name || 'Anonymous');
        if (!meta.sessionJsonUrl) throw new Error('Session not ready.');
        const data = await fetch(meta.sessionJsonUrl).then(r => r.json()) as PSession;
        setSession(data);
      } catch (e: any) {
        setError(e.message || 'Failed to load.');
      } finally {
        setLoading(false);
      }
    })();
  }, [shareToken]);

  const steps  = session?.steps  || [];
  const assets = session?.assets || {};

  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const goTo = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(steps.length - 1, idx));
    setCurrentIndex(clamped);
    // Seek video to the step's relative position
    const step = steps[clamped] as any;
    if (videoElRef.current && step?.timestamp && sessionStartMs) {
      const relSec = Math.max(0, (step.timestamp - sessionStartMs) / 1000);
      videoElRef.current.currentTime = relSec;
    }
  }, [steps, sessionStartMs]);

  const handleSpeedChange = (s: number) => {
    setSpeed(s);
    speedRef.current = s;
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') goTo(currentIndex + 1);
      if (e.key === 'ArrowLeft')  goTo(currentIndex - 1);
      if (e.key === ' ')          { e.preventDefault(); setIsPlaying(p => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentIndex, goTo]);

  // ── Loading ──
  if (loading) return (
    <div className="fixed inset-0 bg-[#0c0c0f] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // ── Error ──
  if (error || !session) return (
    <div className="fixed inset-0 bg-[#0c0c0f] flex flex-col items-center justify-center text-center p-12">
      <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
        <I.X size={24} className="text-red-400" />
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">Walkthrough unavailable</h2>
      <p className="text-sm text-white/40 max-w-xs">{error || 'This link may have expired.'}</p>
      <a href="https://studiobase-umber.vercel.app" className="mt-6 text-sm font-medium text-indigo-400 hover:underline">
        Create your own walkthrough →
      </a>
    </div>
  );

  const title        = session.aiOutputs?.title || 'Walkthrough';
  const summary      = session.aiOutputs?.summary;
  const tags         = session.aiOutputs?.tags || [];
  const chapterMap   = buildChapterMap(session.metadata?.chapterBreaks);
  const videoUrl     = (session as any).videoKey ? assets[(session as any).videoKey] ?? null : null;
  const sessionStartMs = useMemo(() => {
    const s = (session as any).startedAt;
    return s ? new Date(s).getTime() : ((steps[0] as any)?.timestamp || 0);
  }, [session, steps]);
  const currentStep  = steps[currentIndex];
  const currentTitle = currentStep?.stepTitle || currentStep?.elementText || `Step ${currentIndex + 1}`;
  const currentText  = currentStep?.textOverride || currentStep?.generatedText || '';
  const siteDomain   = getDomain(session.capturedUrl);

  let currentChapter = '';
  for (let i = currentIndex; i >= 0; i--) {
    const sid = steps[i]?.id;
    if (sid && chapterMap.has(sid)) { currentChapter = chapterMap.get(sid)!; break; }
  }

  return (
    // fixed + overflow-y-auto = own scroll context, ignores body overflow:hidden from index.css
    <div className="fixed inset-0 bg-[#0c0c0f] text-white overflow-y-auto">

      {/* ── Sticky nav ── */}
      <nav className="sticky top-0 z-50 bg-[#0c0c0f]/95 backdrop-blur border-b border-white/[0.06] h-14 flex items-center px-6 gap-4">
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <span className="text-white font-bold text-xs">S</span>
          </div>
          <span className="text-[13px] font-semibold text-white hidden sm:block">StudioBase</span>
        </div>
        <div className="flex-1 min-w-0 mx-4 hidden md:block">
          <p className="text-[13px] text-white/50 truncate">{title}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={copyLink}
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[13px] font-medium text-white/60 hover:text-white hover:bg-white/[0.07] transition-colors">
            {copied ? <I.Check size={14} className="text-green-400" /> : <I.Link size={14} />}
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <a href="https://studiobase-umber.vercel.app"
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[13px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors">
            Try for free
          </a>
        </div>
      </nav>

      {/* ── Page content ── */}
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8">

        {/* Session title + meta */}
        <div className="mb-6">
          <h1
            className="text-[26px] sm:text-[30px] font-bold text-white leading-tight tracking-tight mb-3"
            style={{ textWrap: 'balance' as any }}
          >
            {title}
          </h1>
          <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-white/40">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-[10px]">
                {ownerName[0]?.toUpperCase() || 'U'}
              </div>
              <span className="font-medium text-white/70">{ownerName}</span>
            </div>
            {session.capturedAt && <><span className="text-white/20">·</span><span>{fmtDate(session.capturedAt)}</span></>}
            <span className="text-white/20">·</span>
            <span className="flex items-center gap-1"><I.List size={12} />{steps.length} steps</span>
            {siteDomain && <><span className="text-white/20">·</span><span className="flex items-center gap-1"><I.Globe size={12} />{siteDomain}</span></>}
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {tags.map(t => (
                <span key={t} className="px-2.5 py-0.5 bg-white/[0.06] border border-white/[0.08] rounded-full text-[11px] font-medium text-white/50">{t}</span>
              ))}
            </div>
          )}
        </div>

        {/* View toggle */}
        <div className="flex items-center justify-center mb-8">
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>

        {/* ── VIDEO MODE ── */}
        {viewMode === 'video' && (
          <div className="flex flex-col lg:flex-row gap-5 items-start">

            {/* Left: cinematic player + step card */}
            <div className="flex-1 min-w-0 space-y-4">
              <CinematicVideoPlayer
                steps={steps}
                assets={assets}
                currentIndex={currentIndex}
                isPlaying={isPlaying}
                speed={speed}
                videoUrl={videoUrl}
                sessionStartMs={sessionStartMs}
                onSeek={goTo}
                onTogglePlay={() => setIsPlaying(p => !p)}
                onPrev={() => goTo(currentIndex - 1)}
                onNext={() => goTo(currentIndex + 1)}
                onSpeedChange={handleSpeedChange}
              />

              {/* Current step info card */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
                {currentChapter && (
                  <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider mb-2">{currentChapter}</p>
                )}
                <h2 className="text-[20px] sm:text-[22px] font-bold text-white leading-snug mb-2">
                  <span className="text-indigo-400 mr-1.5">Step {currentIndex + 1}.</span>
                  {currentTitle}
                </h2>
                {currentText && <p className="text-[14px] text-white/60 leading-relaxed">{currentText}</p>}

                <div className="flex items-center gap-2 mt-5 pt-4 border-t border-white/[0.06]">
                  <button onClick={() => goTo(currentIndex - 1)} disabled={currentIndex === 0}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-medium text-white/50 hover:text-white hover:bg-white/[0.07] disabled:opacity-30 transition-colors">
                    <I.ChevronLeft size={14} /> Prev
                  </button>
                  <span className="text-[12px] text-white/30 flex-1 text-center">{currentIndex + 1} of {steps.length}</span>
                  <button onClick={() => goTo(currentIndex + 1)} disabled={currentIndex === steps.length - 1}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-medium text-white/50 hover:text-white hover:bg-white/[0.07] disabled:opacity-30 transition-colors">
                    Next <I.ChevronRight size={14} />
                  </button>
                </div>
              </div>

              {summary && (
                <div className="pl-4 border-l-2 border-indigo-500/40">
                  <p className="text-[14px] text-white/50 leading-relaxed">{summary}</p>
                </div>
              )}
            </div>

            {/* Right: transcript sidebar */}
            <div className="w-full lg:w-[300px] flex-shrink-0 lg:sticky lg:top-[72px]">
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl flex flex-col"
                style={{ maxHeight: 'calc(100vh - 100px)' }}>
                <TranscriptPanel
                  steps={steps} assets={assets}
                  currentIndex={currentIndex} chapterMap={chapterMap}
                  onSelect={(i) => { goTo(i); setIsPlaying(false); }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── GUIDE MODE ── */}
        {viewMode === 'guide' && (
          <GuideView
            steps={steps}
            assets={assets}
            chapterMap={chapterMap}
            title={title}
            summary={summary}
            tags={tags}
          />
        )}

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-white/[0.06] flex flex-col items-center gap-3 text-center">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
          <p className="text-[13px] text-white/40">Made with <span className="font-semibold text-white/60">StudioBase</span></p>
          <a href="https://studiobase-umber.vercel.app" className="text-[13px] font-semibold text-indigo-400 hover:underline">
            Create your own walkthrough →
          </a>
        </div>
      </div>
    </div>
  );
};

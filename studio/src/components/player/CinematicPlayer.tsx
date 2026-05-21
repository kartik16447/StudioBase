/**
 * CinematicPlayer — shared video player component
 *
 * Single source of truth for all playback surfaces:
 *  - PlayerPage (share link)
 *  - SharePage  (embedded tab)
 *  - Dashboard  (preview panel — replaces VideoCanvas player section)
 *
 * Architecture
 * ────────────
 * Operates in **time-space** (0 → totalMs) rather than step-index-space.
 * buildTimeline() maps per-step durations (voiceoverDurationMs or fallback)
 * into a flat StepSegment[] array. The rAF clock advances currentMs and
 * binary-searches for the active step — so duration changes (audio, trim)
 * require zero player changes.
 *
 * Spring physics (framer-motion) and CanvasRenderer are identical to the
 * existing VideoCanvas / PlayerPage implementation.
 *
 * Edit-mode hook: pass onStepSelect to receive the active stepIndex whenever
 * the user clicks a segment on the timeline (no-op for now in all callers).
 */

import React, {
  forwardRef, useCallback, useEffect, useImperativeHandle,
  useMemo, useRef, useState,
} from 'react';
import { useSpring, motion, AnimatePresence } from 'framer-motion';
import { I } from '../icons';
import { cn } from '../ui';
import { CanvasRenderer } from '../../modules/render-engine/CanvasRenderer';
import { CinematicMath } from '../../modules/render-engine/CinematicMath';
import { RenderConstants } from '../../modules/render-engine/RenderConstants';
import {
  buildTimeline, buildChapterMarkers, getSegmentAt,
  type ChapterMarker,
  type StepSegment,
} from '../../modules/render-engine/PlayerTimeline';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlayerStep {
  id: string;
  screenshotKey?: string | null;
  stepTitle?: string | null;
  generatedText?: string | null;
  textOverride?: string | null;
  elementText?: string | null;
  action?: string | null;
  timestamp?: number | null;
  voiceoverDurationMs?: number | null;
  /** Asset key for the step's voiceover audio — looked up in the `assets` map */
  voiceoverKey?: string | null;
  coordinates?: {
    x: number; y: number;
    viewportWidth: number; viewportHeight: number;
  } | null;
  animationTarget?: { pctX?: number; pctY?: number; centerX?: number; centerY?: number; zoomScale: number } | null;
}

/** Imperative handle — lets parent seek to a specific step (e.g. transcript click) */
export interface CinematicPlayerHandle {
  seekToStep: (stepIndex: number) => void;
  /** Returns the player's current step index — use to avoid seek loops in parent sync effects */
  getCurrentStep: () => number;
}

export interface CinematicPlayerProps {
  steps:          PlayerStep[];
  assets:         Record<string, string>;
  /** Raw screen recording URL — enables hybrid (video-backed) mode */
  videoUrl?:      string | null;
  /** Epoch ms when the recording started — used to seek raw video to step position */
  sessionStartMs?: number;
  chapterBreaks?: { afterStepId: string; chapterTitle: string }[];
  /** 'hybrid' plays raw video behind canvas; 'slideshow' uses screenshots only */
  renderMode?:    'hybrid' | 'slideshow';
  /** Edit-mode hook — called when user clicks a timeline segment. No-op by default. */
  onStepSelect?:  (stepIndex: number) => void;
  /** Called whenever play/pause state changes — lets parent sync external store. */
  onPlayStateChange?: (isPlaying: boolean) => void;
  /** Override brand primary colour */
  primaryColor?:  string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const lerp      = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
const DISSOLVE_MS = 400;

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};

// ─── TimelineScrubber ─────────────────────────────────────────────────────────

interface ScrubberProps {
  currentMs:       number;
  totalMs:         number;
  segments:        StepSegment[];
  chapterMarkers:  ChapterMarker[];
  steps:           PlayerStep[];
  assets:          Record<string, string>;
  progressBarRef:  React.RefObject<HTMLDivElement | null>;
  onScrub:         (ms: number) => void;
  onStepSelect?:   (stepIndex: number) => void;
}

const TimelineScrubber: React.FC<ScrubberProps> = ({
  currentMs, totalMs, segments, chapterMarkers, steps, assets,
  progressBarRef, onScrub, onStepSelect,
}) => {
  const barRef       = useRef<HTMLDivElement>(null);
  const isDragging   = useRef(false);
  const [hoverMs, setHoverMs]     = useState<number | null>(null);

  const fractionToMs = (clientX: number): number => {
    const bar = barRef.current;
    if (!bar) return 0;
    const { left, width } = bar.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - left) / width));
    return frac * totalMs;
  };

  // Drag handling
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      onScrub(fractionToMs(e.clientX));
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onScrub]);

  const fillPct  = totalMs > 0 ? (currentMs / totalMs) * 100 : 0;

  // Hover thumbnail
  const hoverStep = hoverMs != null ? getSegmentAt(hoverMs, segments) : null;
  const hoverStepData = hoverStep ? steps[hoverStep.stepIndex] : null;
  const hoverImgUrl   = hoverStepData?.screenshotKey
    ? assets[hoverStepData.screenshotKey]
    : undefined;

  return (
    <div className="relative px-0">
      {/* Thumbnail preview popup */}
      {hoverMs != null && hoverImgUrl && (
        <div
          className="absolute bottom-full mb-3 pointer-events-none z-50"
          style={{
            left: `${(hoverMs / totalMs) * 100}%`,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="rounded-lg overflow-hidden border border-white/20 shadow-2xl bg-black"
            style={{ width: 160, aspectRatio: '16/9' }}>
            <img
              src={hoverImgUrl}
              alt=""
              className="w-full h-full object-contain"
            />
          </div>
          <div className="text-center mt-1 text-[10px] text-white/50 font-mono">
            {fmtTime(hoverMs)}
          </div>
        </div>
      )}

      {/* Scrub bar */}
      <div
        ref={barRef}
        className="relative h-1 bg-white/10 cursor-pointer group hover:h-1.5 transition-all duration-100"
        onMouseDown={(e) => {
          isDragging.current = true;
          onScrub(fractionToMs(e.clientX));
        }}
        onClick={(e) => {
          const ms = fractionToMs(e.clientX);
          onScrub(ms);
          const seg = getSegmentAt(ms, segments);
          onStepSelect?.(seg.stepIndex);
        }}
        onMouseMove={(e) => {
          setHoverMs(fractionToMs(e.clientX));
        }}
        onMouseLeave={() => setHoverMs(null)}
      >
        {/* Fill */}
        <div
          ref={progressBarRef}
          className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 pointer-events-none"
          style={{ width: `${fillPct}%`, transition: 'none' }}
        />

        {/* Playhead thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{ left: `${fillPct}%`, transform: 'translateX(-50%) translateY(-50%)' }}
        />

        {/* Step boundary ticks */}
        {segments.map((seg, i) => {
          if (i === 0 || !totalMs) return null;
          const pct = (seg.startMs / totalMs) * 100;
          return (
            <div
              key={seg.stepIndex}
              className="absolute top-0 bottom-0 w-px bg-white/20 pointer-events-none"
              style={{ left: `${pct}%` }}
            />
          );
        })}

        {/* Chapter markers */}
        {chapterMarkers.map((m, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 w-0.5 bg-violet-400/70 pointer-events-none"
            style={{ left: `${m.fraction * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
};

// ─── CinematicPlayer ─────────────────────────────────────────────────────────

export const CinematicPlayer = forwardRef<CinematicPlayerHandle, CinematicPlayerProps>(function CinematicPlayer({
  steps,
  assets,
  videoUrl       = null,
  sessionStartMs = 0,
  chapterBreaks,
  renderMode     = 'slideshow',
  onStepSelect,
  onPlayStateChange,
  primaryColor   = '#5E5CE6',
}, ref) {
  // ── Timeline ───────────────────────────────────────────────────────────────
  const timeline       = useMemo(
    () => buildTimeline(steps, renderMode === 'hybrid' && !!videoUrl, sessionStartMs),
    [steps, renderMode, videoUrl, sessionStartMs]
  );
  const { segments, totalMs } = timeline;
  const chapterMarkers = useMemo(
    () => buildChapterMarkers(segments, chapterBreaks ?? [], steps, totalMs),
    [segments, chapterBreaks, steps, totalMs],
  );

  // ── Playback state ─────────────────────────────────────────────────────────
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [speed,        setSpeed]        = useState(1);
  const [isMuted,      setIsMuted]      = useState(false);
  const [isEnded,      setIsEnded]      = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Step index — derived from playhead, but kept as state to trigger effects
  const [currentIndex, setCurrentIndex] = useState(0);

  // Chapter break transition state and refs
  const [showChapterCard, setShowChapterCard] = useState<string | null>(null);
  const showChapterCardRef = useRef<string | null>(null);
  const isTransitioningRef = useRef(false);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chapterBreaksRef = useRef(chapterBreaks);

  useEffect(() => { showChapterCardRef.current = showChapterCard; }, [showChapterCard]);
  useEffect(() => { chapterBreaksRef.current = chapterBreaks; }, [chapterBreaks]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, []);

  // ── Refs (avoid stale closures in rAF) ────────────────────────────────────
  const containerRef       = useRef<HTMLDivElement>(null);
  const canvasRef          = useRef<HTMLCanvasElement>(null);
  const videoRef           = useRef<HTMLVideoElement>(null);
  const progressBarRef     = useRef<HTMLDivElement>(null);
  // Audio — voiceover per step.  Single element, src-swapped on step change.
  const audioRef           = useRef<HTMLAudioElement>(new Audio());

  // Rendering state
  const slideImageRef     = useRef<HTMLImageElement | null>(null);
  const prevSlideImageRef = useRef<HTMLImageElement | null>(null);
  const blendCanvasRef    = useRef<HTMLCanvasElement | null>(null);
  const transitionStartRef= useRef<number>(-Infinity);
  const leavingStepRef    = useRef<PlayerStep | null>(null);
  const previousIdxRef    = useRef<number>(0);

  // Playback clock
  const currentMsRef   = useRef<number>(0);
  const lastTickRef    = useRef<number>(performance.now());
  const currentIdxRef  = useRef<number>(0);

  // Ref-shadows of state (read in rAF without stale closures)
  const isPlayingRef   = useRef(false);
  const speedRef       = useRef(1);
  const segmentsRef    = useRef(segments);
  const totalMsRef     = useRef(totalMs);
  const stepsRef       = useRef(steps);
  const assetsRef      = useRef(assets);
  const videoUrlRef    = useRef(videoUrl);
  const sessionStartMsRef = useRef(sessionStartMs);

  useEffect(() => { isPlayingRef.current   = isPlaying;    }, [isPlaying]);
  useEffect(() => { onPlayStateChange?.(isPlaying);        }, [isPlaying, onPlayStateChange]);
  useEffect(() => { speedRef.current       = speed;        }, [speed]);
  useEffect(() => { segmentsRef.current    = segments;     }, [segments]);
  useEffect(() => { totalMsRef.current     = totalMs;      }, [totalMs]);
  useEffect(() => { stepsRef.current       = steps;        }, [steps]);
  useEffect(() => { assetsRef.current      = assets;       }, [assets]);
  useEffect(() => { videoUrlRef.current    = videoUrl;     }, [videoUrl]);
  useEffect(() => { sessionStartMsRef.current = sessionStartMs; }, [sessionStartMs]);

  // Ref-shadow for onStepSelect so we can call it from rAF without stale closure
  const onStepSelectRef = useRef(onStepSelect);
  useEffect(() => { onStepSelectRef.current = onStepSelect; }, [onStepSelect]);

  // Deletion/Rename self-healing effect
  useEffect(() => {
    if (showChapterCard) {
      const exists = chapterBreaks?.some(c => c.chapterTitle === showChapterCard);
      if (!exists) {
        console.log('[CinematicPlayer] Active chapter card was deleted or renamed. Self-healing playback.');
        if (transitionTimerRef.current) {
          clearTimeout(transitionTimerRef.current);
          transitionTimerRef.current = null;
        }
        isTransitioningRef.current = false;
        setShowChapterCard(null);

        // Resume backing media if supposed to be playing
        if (isPlayingRef.current) {
          if (videoRef.current && videoUrlRef.current && renderMode === 'hybrid') {
            videoRef.current.play().catch(() => {});
          }
          const step = stepsRef.current[currentIdxRef.current];
          if (step?.voiceoverKey) {
            const url = assetsRef.current[step.voiceoverKey] ?? '';
            if (url) {
              audioRef.current.play().catch(() => {});
            }
          }
        }
      }
    }
  }, [chapterBreaks, showChapterCard]);

  const renderer = useMemo(() => new CanvasRenderer(), []);

  // ── Camera springs ─────────────────────────────────────────────────────────
  const { stiffness: sxy, damping: dxy, mass: mxy } = RenderConstants.CAMERA_XY_SPRING;
  const { stiffness: ss,  damping: ds,  mass: ms  } = RenderConstants.CAMERA_SCALE_SPRING;
  const camX     = useSpring(50,  { stiffness: sxy, damping: dxy, mass: mxy });
  const camY     = useSpring(50,  { stiffness: sxy, damping: dxy, mass: mxy });
  const camScale = useSpring(1.0, { stiffness: ss,  damping: ds,  mass: ms  });

  const currentStep = steps[currentIndex] ?? null;

  // Camera targets are now driven every frame from the rAF loop via
  // CinematicMath.getStepCameraTarget(step, stepProgress) — no step-change
  // effect needed.  The springs handle all easing between phase transitions.

  // ── Screenshot preload + cross-dissolve setup ──────────────────────────────
  useEffect(() => {
    prevSlideImageRef.current  = slideImageRef.current;
    leavingStepRef.current     = stepsRef.current[previousIdxRef.current] ?? null;
    previousIdxRef.current     = currentIdxRef.current;
    transitionStartRef.current = performance.now();

    slideImageRef.current = null;
    if (!currentStep?.screenshotKey) return;
    const url = assetsRef.current[currentStep.screenshotKey];
    if (!url) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    img.onload = () => { slideImageRef.current = img; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, currentStep?.id, currentStep?.screenshotKey]);

  // ── Video seek on step change ──────────────────────────────────────────────
  useEffect(() => {
    if (isPlayingRef.current) return;
    if (!videoRef.current || !videoUrl || !currentStep?.timestamp) return;
    const EPOCH_FLOOR = 1_000_000_000_000;
    const rawTs = currentStep.timestamp;
    const relMs = rawTs > EPOCH_FLOOR ? Math.max(0, rawTs - sessionStartMs) : rawTs;
    const relSec = relMs / 1000;

    if (Math.abs(videoRef.current.currentTime - relSec) > 0.2) {
      videoRef.current.currentTime = relSec;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // ── rAF render + clock loop ────────────────────────────────────────────────
  useEffect(() => {
    let rafId: number;

    const tick = (now: number) => {
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;

      const canvas    = canvasRef.current;
      const segs      = segmentsRef.current;
      const totMs     = totalMsRef.current;
      const hasVideo  = !!(videoUrlRef.current && videoRef.current);
      const video     = videoRef.current;

      // ── Advance playhead ─────────────────────────────────────────────────
      if (isPlayingRef.current) {
        if (hasVideo && video) {
          // Hybrid: video is source of truth — read currentTime
          const relMs = Math.max(0, video.currentTime * 1000);
          currentMsRef.current = relMs;
          if (video.ended) {
            setIsPlaying(false);
            setIsEnded(true);
          }
        } else {
          // Slideshow: wall-clock accumulator
          if (!showChapterCardRef.current) {
            const next = currentMsRef.current + dt * speedRef.current;
            if (next >= totMs) {
              currentMsRef.current = totMs;
              setIsPlaying(false);
              setIsEnded(true);
            } else {
              currentMsRef.current = next;
            }
          }
        }

        // Update progress bar directly (no re-render)
        if (progressBarRef.current && totMs > 0) {
          progressBarRef.current.style.width =
            `${Math.min(100, (currentMsRef.current / totMs) * 100)}%`;
        }
      }

      // ── Derive step + within-step progress (runs every frame) ────────────
      // Computed outside the isPlaying block so camera updates correctly when
      // paused (e.g. seeked to mid-step position) and after playhead advances.
      const { stepIndex: newIdx, progress: stepProgress } =
        getSegmentAt(currentMsRef.current, segs);

      if (newIdx !== currentIdxRef.current) {
        const prevIdx = currentIdxRef.current;
        const prevStep = stepsRef.current[prevIdx];
        const chapter = prevStep ? chapterBreaksRef.current?.find(c => c.afterStepId === prevStep.id) : null;

        if (chapter && isPlayingRef.current && !isTransitioningRef.current) {
          console.log('[CinematicPlayer] Chapter transition triggered for:', chapter.chapterTitle);
          isTransitioningRef.current = true;
          setShowChapterCard(chapter.chapterTitle);

          // Pause backing media immediately during overlay
          if (videoRef.current) videoRef.current.pause();
          audioRef.current.pause();

          // Advance indices so the next step's visual screen loads behind the card immediately
          currentIdxRef.current = newIdx;
          setCurrentIndex(newIdx);
          onStepSelectRef.current?.(newIdx);

          if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
          transitionTimerRef.current = setTimeout(() => {
            console.log('[CinematicPlayer] Chapter transition completed.');
            isTransitioningRef.current = false;
            setShowChapterCard(null);
          }, 1500); // 1.5 seconds transition duration
        } else {
          console.log('[CinematicPlayer] step advance', currentIdxRef.current, '→', newIdx, '| currentMs:', Math.round(currentMsRef.current), '| totalMs:', Math.round(totMs));
          currentIdxRef.current = newIdx;
          setCurrentIndex(newIdx);
          // Notify parent of natural advance — parent updates display state
          // without triggering a seek-back loop (getCurrentStep() check).
          onStepSelectRef.current?.(newIdx);
        }
      }

      // ── Camera — overview → event zoom → overview per step ───────────────
      // getStepCameraTarget maps stepProgress to a camera target; the spring
      // physics on camX/Y/Scale handle all the easing between phases.
      const camStep = stepsRef.current[currentIdxRef.current];
      if (camStep) {
        const prevStep = stepsRef.current[currentIdxRef.current - 1] ?? null;
        const nextStep = stepsRef.current[currentIdxRef.current + 1] ?? null;
        const ct = CinematicMath.getStepCameraTarget(camStep, stepProgress, prevStep, nextStep, isPlayingRef.current);
        camX.set(ct.pctX);
        camY.set(ct.pctY);
        camScale.set(ct.scale);
        // Log camera target once per phase change (not every frame)
        const phase = stepProgress < 0.20 ? 'overview' : stepProgress >= 0.80 ? 'retreat' : 'event';
        if (phase !== (camStep as any).__lastPhase) {
          (camStep as any).__lastPhase = phase;
          console.log('[CinematicPlayer] camera phase →', phase, '| step:', currentIdxRef.current, '| progress:', stepProgress.toFixed(2), '| target:', JSON.stringify(ct));
        }
      }

      // ── Canvas render ─────────────────────────────────────────────────────
      if (canvas) {
        const cW = RenderConstants.PREVIEW_WIDTH;
        const cH = RenderConstants.PREVIEW_HEIGHT;
        if (canvas.width !== cW || canvas.height !== cH) {
          canvas.width = cW; canvas.height = cH;
        }
        const ctx = canvas.getContext('2d');
        const step = stepsRef.current[currentIdxRef.current];
        if (ctx && step) {
          // Cross-dissolve
          const tRaw   = Math.min(1, (now - transitionStartRef.current) / DISSOLVE_MS);
          const tEased = easeInOut(tRaw);
          const newReady = !!slideImageRef.current;

          let masterFrame: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | null = null;

          if (hasVideo && video && !video.paused && !video.ended) {
            masterFrame = video;
          } else if (!newReady && prevSlideImageRef.current) {
            masterFrame = prevSlideImageRef.current;
          } else if (tRaw < 1 && prevSlideImageRef.current && newReady) {
            if (!blendCanvasRef.current) blendCanvasRef.current = document.createElement('canvas');
            const bc  = blendCanvasRef.current;
            const bw  = (prevSlideImageRef.current as HTMLImageElement).naturalWidth  || 1440;
            const bh  = (prevSlideImageRef.current as HTMLImageElement).naturalHeight || 900;
            if (bc.width !== bw || bc.height !== bh) { bc.width = bw; bc.height = bh; }
            const bctx = bc.getContext('2d')!;
            bctx.clearRect(0, 0, bw, bh);
            bctx.globalAlpha = 1 - tEased;
            bctx.drawImage(prevSlideImageRef.current, 0, 0, bw, bh);
            bctx.globalAlpha = tEased;
            bctx.drawImage(slideImageRef.current!, 0, 0, bw, bh);
            bctx.globalAlpha = 1;
            masterFrame = bc;
          } else {
            masterFrame = slideImageRef.current;
          }

          // Cursor lerp (smooth cursor transition between steps)
          const leaving = leavingStepRef.current;
          const renderStep =
            tRaw < 1 && leaving?.coordinates && step?.coordinates
              ? { ...step, coordinates: {
                  ...step.coordinates,
                  x: lerp(leaving.coordinates.x, step.coordinates.x, tEased),
                  y: lerp(leaving.coordinates.y, step.coordinates.y, tEased),
                }}
              : step;

          renderer.render(
            ctx,
            {
              dimensions: { width: cW, height: cH },
              step:        renderStep,
              prevStep:    stepsRef.current[currentIdxRef.current - 1] ?? null,
              progress:    1.0,
              theme:       { primaryColor },
              renderMode:  hasVideo ? 'hybrid' : 'slideshow',
              camera: {
                pctX:  camX.get(),
                pctY:  camY.get(),
                scale: camScale.get(),
              },
              timeMs: now,
              showCursor: false,  // camera pan communicates focus point; dot creates confusing 2nd cursor
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
  }, []); // intentionally empty — all reads via refs

  // ── Video play/pause ──────────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoUrl) return;
    if (isPlaying && !isTransitioningRef.current) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [isPlaying, videoUrl, showChapterCard]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
    audioRef.current.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    audioRef.current.muted = isMuted;
    // Also mute the backing video track so it never competes with the voiceover
    if (videoRef.current) videoRef.current.muted = isMuted;
  }, [isMuted]);

  // ── Voiceover — step change ────────────────────────────────────────────────
  // Fires on every step change (natural advance or seek).
  // assets map must contain resolved URLs for any voiceoverKey values.
  useEffect(() => {
    const step  = steps[currentIndex];
    const audio = audioRef.current;
    audio.pause();
    if (step?.voiceoverKey) {
      const url = assets[step.voiceoverKey] ?? '';
      if (url) {
        if (audio.src !== url) { audio.src = url; }
        audio.currentTime = 0;
        audio.playbackRate = speed;
        if (isPlaying && !isTransitioningRef.current) {
          audio.play().catch(() => {});
        }
      }
    } else {
      audio.src = '';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]); // step change drives audio; play/pause handled separately below

  // ── Voiceover — play/pause ────────────────────────────────────────────────
  useEffect(() => {
    if (isPlaying && !isTransitioningRef.current) {
      if (audioRef.current.src) audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, showChapterCard]);

  // ── Play/Pause handling during chapter transition ──────────────────────────
  useEffect(() => {
    if (!isPlaying) {
      // Pause active transition timer so it doesn't auto-resume while player is paused
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
    } else {
      // Resume transition timer if we are in transition but timer is not running
      if (showChapterCard && !transitionTimerRef.current) {
        transitionTimerRef.current = setTimeout(() => {
          console.log('[CinematicPlayer] Resumed chapter transition completed.');
          isTransitioningRef.current = false;
          setShowChapterCard(null);

          // Resume playback of backing media
          if (videoRef.current && videoUrlRef.current && renderMode === 'hybrid') {
            videoRef.current.play().catch(() => {});
          }
          if (audioRef.current.src) {
            audioRef.current.play().catch(() => {});
          }
        }, 1500);
      }
    }
  }, [isPlaying, showChapterCard, renderMode]);

  // ── Fullscreen ─────────────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ── Auto-hide controls ─────────────────────────────────────────────────────
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    if (isPlayingRef.current) {
      controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, []);

  useEffect(() => {
    if (!isPlaying) setShowControls(true);
    else showControlsTemporarily();
    return () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); };
  }, [isPlaying, showControlsTemporarily]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only respond when this player area is in focus context
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        scrubBy(-5000);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        scrubBy(5000);
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        setIsMuted(m => !m);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Controls ───────────────────────────────────────────────────────────────
  const handleTogglePlay = useCallback(() => {
    if (isEnded) {
      // Restart
      currentMsRef.current = 0;
      lastTickRef.current  = performance.now();
      currentIdxRef.current = 0;
      setCurrentIndex(0);
      setIsEnded(false);
      setIsPlaying(true);
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(() => {});
      }
      return;
    }
    setIsPlaying(p => !p);
  }, [isEnded]);

  const scrubTo = useCallback((ms: number) => {
    // Cancel any active chapter break transition
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    isTransitioningRef.current = false;
    setShowChapterCard(null);

    console.log('[CinematicPlayer] scrubTo', Math.round(ms), 'ms | currentIdxRef:', currentIdxRef.current);
    const clamped = Math.max(0, Math.min(ms, totalMsRef.current));
    currentMsRef.current  = clamped;
    lastTickRef.current   = performance.now();
    setIsEnded(false);

    const { stepIndex: newIdx } = getSegmentAt(clamped, segmentsRef.current);
    if (newIdx !== currentIdxRef.current) {
      currentIdxRef.current = newIdx;
      setCurrentIndex(newIdx);
    }

    // Seek video if hybrid
    if (videoRef.current && videoUrlRef.current) {
      videoRef.current.currentTime = clamped / 1000;
    }

    // Update progress bar immediately
    if (progressBarRef.current && totalMsRef.current > 0) {
      progressBarRef.current.style.width =
        `${Math.min(100, (clamped / totalMsRef.current) * 100)}%`;
    }
  }, []);

  const scrubBy = useCallback((deltaMs: number) => {
    scrubTo(currentMsRef.current + deltaMs);
  }, [scrubTo]);

  // Expose imperative handle so parents (TranscriptPanel, edit UI) can seek without prop drilling
  useImperativeHandle(ref, () => ({
    seekToStep: (stepIndex: number) => {
      const seg = segmentsRef.current[stepIndex];
      if (seg) scrubTo(seg.startMs);
    },
    getCurrentStep: () => currentIdxRef.current,
  }), [scrubTo]);

  const stepBack = useCallback(() => {
    const prevIdx = Math.max(0, currentIdxRef.current - 1);
    const seg = segmentsRef.current[prevIdx];
    if (seg) scrubTo(seg.startMs);
  }, [scrubTo]);

  const stepForward = useCallback(() => {
    const nextIdx = Math.min(segmentsRef.current.length - 1, currentIdxRef.current + 1);
    const seg = segmentsRef.current[nextIdx];
    if (seg) scrubTo(seg.startMs);
  }, [scrubTo]);

  // Derived display values
  const stepTitle  = currentStep?.stepTitle || currentStep?.elementText || `Step ${currentIndex + 1}`;
  const totalSteps = steps.length;

  return (
    <div
      ref={containerRef}
      className="w-full select-none"
      onMouseMove={showControlsTemporarily}
      onTouchStart={showControlsTemporarily}
      style={{
        cursor: isPlaying && !showControls ? 'none' : 'default',
        // Prevent the page from scrolling while the user is touching the player
        touchAction: 'none',
        overscrollBehavior: 'contain',
      }}
    >
      {/* Hidden video element — hybrid mode only */}
      {videoUrl && renderMode === 'hybrid' && (
        <video
          ref={videoRef}
          src={videoUrl}
          crossOrigin="anonymous"
          className="hidden"
          playsInline
          muted={true}
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
        {/* Canvas area */}
        <div
          className="absolute inset-0 rounded-2xl overflow-hidden bg-[#12121a]"
          onClick={() => { if (!isEnded) handleTogglePlay(); }}
          style={{ cursor: 'pointer' }}
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full block"
            style={{ imageRendering: 'auto' }}
          />

          {/* Chapter card */}
          <AnimatePresence>
            {showChapterCard && (
              <motion.div
                key="chapter"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.35 }}
                className="absolute inset-0 z-30 flex flex-col items-center justify-center text-center p-10"
                style={{ background: `linear-gradient(135deg, ${primaryColor}e6, ${primaryColor})` }}
              >
                <p className="text-white/70 text-sm uppercase tracking-widest mb-3">Chapter</p>
                <h2 className="text-3xl font-bold text-white leading-tight">{showChapterCard}</h2>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pause overlay */}
          {!isPlaying && !isEnded && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className="w-20 h-20 rounded-full bg-black/55 backdrop-blur-sm border border-white/20 flex items-center justify-center"
                style={{ boxShadow: '0 0 0 1px rgba(94,92,230,0.3), 0 8px 32px rgba(0,0,0,0.5)' }}
              >
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
                  onClick={(e) => { e.stopPropagation(); handleTogglePlay(); }}
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

          {/* Lower-third label */}
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
              <p className="text-[13px] font-semibold text-white leading-snug line-clamp-1">
                {stepTitle}
              </p>
            </div>
          )}

          {/* Controls bar */}
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
              {/* Timeline scrubber */}
              <TimelineScrubber
                currentMs={currentMsRef.current}
                totalMs={totalMs}
                segments={segments}
                chapterMarkers={chapterMarkers}
                steps={steps}
                assets={assets}
                progressBarRef={progressBarRef}
                onScrub={scrubTo}
                onStepSelect={onStepSelect}
              />

              {/* Controls row */}
              <div className="flex items-center gap-2 px-4 h-12 bg-black/80 backdrop-blur-sm">
                {/* Prev step */}
                <button
                  onClick={stepBack}
                  disabled={currentIndex === 0}
                  className="p-1.5 text-white/50 hover:text-white disabled:opacity-20 transition-colors"
                  title="Previous step (←)"
                >
                  <I.SkipBack size={16} />
                </button>

                {/* Play/Pause */}
                <button
                  onClick={handleTogglePlay}
                  className="w-9 h-9 rounded-full bg-white flex items-center justify-center hover:bg-white/90 active:scale-95 flex-shrink-0 transition-all shadow"
                  title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                >
                  {isPlaying
                    ? <I.Pause size={15} className="text-black" />
                    : <I.Play  size={15} className="text-black ml-0.5" />}
                </button>

                {/* Next step */}
                <button
                  onClick={stepForward}
                  disabled={currentIndex === totalSteps - 1}
                  className="p-1.5 text-white/50 hover:text-white disabled:opacity-20 transition-colors"
                  title="Next step (→)"
                >
                  <I.SkipForward size={16} />
                </button>

                {/* Time display */}
                <span className="text-[11px] text-white/35 tabular-nums ml-1 font-mono select-none">
                  {fmtTime(currentMsRef.current)} / {fmtTime(totalMs)}
                </span>

                <div className="flex-1" />

                {/* Chapter indicator */}
                {chapterMarkers.length > 0 && (() => {
                  const activeChapter = [...chapterMarkers]
                    .reverse()
                    .find(m => m.stepIndex <= currentIndex);
                  return activeChapter ? (
                    <span className="text-[10px] text-violet-400 font-semibold uppercase tracking-wide truncate max-w-[120px]">
                      {activeChapter.label}
                    </span>
                  ) : null;
                })()}

                {/* Speed selector */}
                <div className="flex items-center gap-0.5 bg-white/[0.08] rounded-md p-0.5">
                  {[0.5, 1, 1.5, 2].map(s => (
                    <button
                      key={s}
                      onClick={() => setSpeed(s)}
                      className={cn(
                        'px-2 h-5 rounded text-[10px] font-bold transition-colors',
                        speed === s ? 'bg-white text-black' : 'text-white/40 hover:text-white',
                      )}
                    >
                      {s}×
                    </button>
                  ))}
                </div>

                {/* Mute toggle */}
                <button
                  onClick={() => setIsMuted(m => !m)}
                  className="p-1.5 text-white/40 hover:text-white transition-colors ml-1"
                  title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
                >
                  {isMuted ? <I.Volume size={14} className="opacity-30" /> : <I.Volume size={14} />}
                </button>

                {/* Fullscreen */}
                <button
                  onClick={toggleFullscreen}
                  className="p-1.5 text-white/40 hover:text-white transition-colors ml-1"
                  title="Fullscreen (F)"
                >
                  {isFullscreen ? <I.Minimize2 size={14} /> : <I.Maximize size={14} />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});


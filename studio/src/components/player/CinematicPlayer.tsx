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
  useMemo, useRef, useState, useLayoutEffect,
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
import { compileAudioTrack, type AudioTrackItem } from '../../modules/render-engine/AudioTrackCompiler';
import { useStudioStore } from '../../store/useStudioStore';
import { WorkerExtractor } from '../../services/WorkerExtractor';


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
  voiceoverSource?: string | null;
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
  currentMsRef:    React.RefObject<number>;
  totalMs:         number;
  segments:        StepSegment[];
  chapterMarkers:  ChapterMarker[];
  steps:           PlayerStep[];
  assets:          Record<string, string>;
  progressBarRef:  React.RefObject<HTMLDivElement | null>;
  playheadThumbRef: React.RefObject<HTMLDivElement | null>;
  onScrub:         (ms: number) => void;
  onStepSelect?:   (stepIndex: number) => void;
}

const TimelineScrubber: React.FC<ScrubberProps> = ({
  currentMsRef, totalMs, segments, chapterMarkers, steps, assets,
  progressBarRef, playheadThumbRef, onScrub, onStepSelect,
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

  useLayoutEffect(() => {
    const curMs = currentMsRef.current;
    const fillPct = totalMs > 0 ? (curMs / totalMs) * 100 : 0;
    if (progressBarRef.current) {
      progressBarRef.current.style.width = `${fillPct}%`;
    }
    if (playheadThumbRef.current) {
      playheadThumbRef.current.style.left = `${fillPct}%`;
    }
  });

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
          style={{ width: '0%', transition: 'none' }}
        />

        {/* Playhead thumb */}
        <div
          ref={playheadThumbRef}
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{ left: '0%', transform: 'translateX(-50%) translateY(-50%)' }}
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
  const [isPlaying,       setIsPlaying]       = useState(false);
  const [speed,           setSpeed]           = useState(1);
  const [isMuted,         setIsMuted]         = useState(false);
  const [isEnded,         setIsEnded]         = useState(false);
  const [showControls,    setShowControls]    = useState(true);
  const [isFullscreen,    setIsFullscreen]    = useState(false);
  // True while decodeAudioData is running — blocks play button so first press is never silent.
  const [isDecodingAudio, setIsDecodingAudio] = useState(false);

  // Step index — derived from playhead, but kept as state to trigger effects
  const [currentIndex, setCurrentIndex] = useState(0);

  // Master compiled WAV audio track state pulled from global store
  const { masterAudioUrl, isCompilingAudio, setMasterAudioUrl, setCompilingAudio, isAudioGenerating } = useStudioStore();

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

      // Stop audio source node and close AudioContext
      if (audioSourceRef.current) {
        try { audioSourceRef.current.stop(); } catch (_) {}
        audioSourceRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }

      // Release last decoded video frame
      masterFrameRef.current?.close();
      masterFrameRef.current = null;
    };
  }, []);

  // ── Refs (avoid stale closures in rAF) ────────────────────────────────────
  const containerRef       = useRef<HTMLDivElement>(null);
  const canvasRef          = useRef<HTMLCanvasElement>(null);
  const progressBarRef     = useRef<HTMLDivElement>(null);
  const playheadThumbRef   = useRef<HTMLDivElement>(null);
  const timeDisplayRef     = useRef<HTMLSpanElement>(null);

  // ── AudioContext-based audio engine ──────────────────────────────────────
  const audioCtxRef              = useRef<AudioContext | null>(null);
  const audioBufferRef           = useRef<AudioBuffer | null>(null);
  const audioSourceRef           = useRef<AudioBufferSourceNode | null>(null);
  const audioGainRef             = useRef<GainNode | null>(null);
  // Records audioCtx.currentTime at the moment playback starts (for Step 2 clock).
  const audioStartContextTimeRef = useRef<number>(0);

  const getOrCreateAudioCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtxRef.current;
  }, []);

  // Start (or restart) audio from the given offset. Defaults to currentMsRef.
  // Always creates the AudioContext and sets audioStartContextTimeRef so the
  // rAF clock advances even when there is no audio buffer (no voiceover steps).
  const safePlayAudio = useCallback((offsetMs?: number) => {
    const audioCtx = getOrCreateAudioCtx();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});

    const resolvedOffsetMs = offsetMs ?? currentMsRef.current;
    const startOffsetSec   = resolvedOffsetMs / 1000;

    // Rebase the clock reference from NOW (not from scheduledAt).
    // Audio is scheduled 50ms ahead for a smooth start, but the visual clock
    // must start at exactly startOffsetSec immediately — otherwise the 50ms
    // dip causes the playhead to land behind a chapter boundary and re-trigger
    // the chapter break on the very next rAF tick (the looping bug).
    const scheduledAt = audioCtx.currentTime + 0.05;
    audioStartContextTimeRef.current = audioCtx.currentTime - startOffsetSec / speedRef.current;

    const buffer = audioBufferRef.current;
    if (!buffer) {
      // No audio — clock is set, playback will advance visually only
      console.log('[CinematicPlayer] No audio buffer — clock set, visual-only playback.');
      return;
    }

    // Stop any existing source node before creating a new one
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch (_) {}
      audioSourceRef.current = null;
    }

    // Ensure a single gain node (survives across source replacements)
    if (!audioGainRef.current) {
      audioGainRef.current = audioCtx.createGain();
      audioGainRef.current.connect(audioCtx.destination);
    }

    const clampedOffsetSec = Math.max(0, Math.min(startOffsetSec, buffer.duration));

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = speedRef.current;
    source.connect(audioGainRef.current);
    source.start(scheduledAt, clampedOffsetSec);
    audioSourceRef.current = source;

    console.log('[CinematicPlayer] AudioBufferSourceNode started. offset:', clampedOffsetSec.toFixed(3), 's');
  }, [getOrCreateAudioCtx]);

  const safePauseAudio = useCallback(() => {
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch (_) {}
      audioSourceRef.current = null;
    }
    console.log('[CinematicPlayer] AudioBufferSourceNode stopped.');
  }, []);


  // ── WorkerExtractor — hybrid mode frame pull ──────────────────────────────
  const extractorRef    = useRef<WorkerExtractor | null>(null);
  const pendingFrameRef = useRef<boolean>(false);          // backpressure: skip if decode in flight
  const masterFrameRef  = useRef<ImageBitmap | null>(null); // latest decoded video frame

  // Rendering state
  const slideImageRef     = useRef<HTMLImageElement | null>(null);
  const prevSlideImageRef = useRef<HTMLImageElement | null>(null);
  const blendCanvasRef    = useRef<HTMLCanvasElement | null>(null);
  const transitionStartRef= useRef<number>(-Infinity);
  const leavingStepRef    = useRef<PlayerStep | null>(null);
  const previousIdxRef    = useRef<number>(0);

  // Playback clock — position driven by AudioContext hardware clock, never accumulated
  const currentMsRef   = useRef<number>(0);
  const currentIdxRef  = useRef<number>(0);

  // Ref-shadows of state (read in rAF without stale closures)
  const isPlayingRef   = useRef(false);
  const speedRef       = useRef(1);
  const segmentsRef    = useRef(segments);
  const timelineRef    = useRef(timeline);
  const totalMsRef     = useRef(totalMs);
  const stepsRef       = useRef(steps);
  const assetsRef      = useRef(assets);
  const videoUrlRef    = useRef(videoUrl);
  const sessionStartMsRef = useRef(sessionStartMs);

  useEffect(() => { isPlayingRef.current   = isPlaying;    }, [isPlaying]);
  useEffect(() => { onPlayStateChange?.(isPlaying);        }, [isPlaying, onPlayStateChange]);
  useEffect(() => { speedRef.current       = speed;        }, [speed]);
  useEffect(() => { segmentsRef.current    = segments;     }, [segments]);
  useEffect(() => { timelineRef.current    = timeline;     }, [timeline]);
  useEffect(() => { totalMsRef.current     = totalMs;      }, [totalMs]);
  useEffect(() => { stepsRef.current       = steps;        }, [steps]);
  useEffect(() => { assetsRef.current      = assets;       }, [assets]);
  useEffect(() => { videoUrlRef.current    = videoUrl;     }, [videoUrl]);
  useEffect(() => { sessionStartMsRef.current = sessionStartMs; }, [sessionStartMs]);

  // Ref-shadow for onStepSelect so we can call it from rAF without stale closure
  const onStepSelectRef = useRef(onStepSelect);
  useEffect(() => { onStepSelectRef.current = onStepSelect; }, [onStepSelect]);

  useLayoutEffect(() => {
    const totMs = totalMs;
    const curMs = currentMsRef.current;
    if (timeDisplayRef.current && totMs > 0) {
      timeDisplayRef.current.textContent = `${fmtTime(curMs)} / ${fmtTime(totMs)}`;
    }
  }, [totalMs]);


  // ── WorkerExtractor lifecycle — hybrid mode only ─────────────────────────
  useEffect(() => {
    if (!videoUrl || renderMode !== 'hybrid') return;
    const extractor = new WorkerExtractor();
    extractorRef.current = extractor;
    extractor.init(videoUrl).catch(err =>
      console.error('[CinematicPlayer] WorkerExtractor init failed:', err)
    );
    return () => {
      extractor.destroy().catch(() => {});
      extractorRef.current = null;
      masterFrameRef.current?.close();
      masterFrameRef.current = null;
      pendingFrameRef.current = false;
    };
  }, [videoUrl, renderMode]);

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
          safePlayAudio();
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

  // ── Eager upfront screenshot preload ─────────────────────────────────────
  // Warm the browser cache for ALL step screenshots as soon as asset URLs are
  // available. This ensures that when a hold clip starts (video paused, audio
  // still narrating), the current step's screenshot is already decoded and
  // ready — avoiding the race where a 1-2 s action clip isn't long enough to
  // fetch the image before the 3-4 s hold clip begins.
  useEffect(() => {
    if (!steps.length || !Object.keys(assets).length) return;
    steps.forEach(step => {
      if (!step.screenshotKey) return;
      const url = assets[step.screenshotKey];
      if (!url) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url; // browser caches; per-step effect re-uses from cache
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, assets]);

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
    img.onload  = () => { slideImageRef.current = img; };
    img.onerror = (e) => { console.warn('[CinematicPlayer] screenshot load failed:', url, e); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, currentStep?.id, currentStep?.screenshotKey]);

  // Video seeking on step change is handled inside the rAF tick via the
  // videoTrack clip map — no separate effect needed.

  // ── rAF render + clock loop ────────────────────────────────────────────────
  useEffect(() => {
    let rafId: number;

    const tick = (now: number) => {
      const canvas    = canvasRef.current;
      const segs      = segmentsRef.current;
      const totMs     = totalMsRef.current;
      const hasVideo  = !!(videoUrlRef.current && extractorRef.current);

      // ── Advance playhead — driven by AudioContext hardware clock ─────────
      // Formula: (ctx.currentTime - startRef) * speed * 1000
      // Verified: at T wall-seconds with playbackRate=speed, audio is at
      // startOffset + T*speed seconds, and this formula matches exactly.
      // When paused, audioSourceRef is null so currentMsRef stays frozen.
      if (isPlayingRef.current) {
        if (!showChapterCardRef.current && audioCtxRef.current) {
          const elapsed = audioCtxRef.current.currentTime - audioStartContextTimeRef.current;
          const next = elapsed * speedRef.current * 1000;
          if (next >= totMs) {
            currentMsRef.current = totMs;
            setIsPlaying(false);
            setIsEnded(true);
          } else if (next >= 0) {
            currentMsRef.current = next;
          }
        }

        // Update progress bar directly (no re-render)
        if (progressBarRef.current && totMs > 0) {
          progressBarRef.current.style.width =
            `${Math.min(100, (currentMsRef.current / totMs) * 100)}%`;
        }
        if (playheadThumbRef.current && totMs > 0) {
          playheadThumbRef.current.style.left =
            `${Math.min(100, (currentMsRef.current / totMs) * 100)}%`;
        }
        if (timeDisplayRef.current && totMs > 0) {
          timeDisplayRef.current.textContent = `${fmtTime(currentMsRef.current)} / ${fmtTime(totMs)}`;
        }

        // ── WorkerExtractor frame pull (hybrid mode) ────────────────────────
        // Fire-and-forget with pendingFrameRef backpressure so we never queue
        // up more decode requests than the worker can handle.
        if (hasVideo && extractorRef.current && timelineRef.current.videoTrack && !pendingFrameRef.current) {
          const ms = currentMsRef.current;
          const clips = timelineRef.current.videoTrack.clips;
          let vClip = clips[0];
          for (let i = 0; i < clips.length; i++) {
            if (ms >= clips[i].logicalStartMs) vClip = clips[i];
            else break;
          }
          if (vClip) {
            let targetSourceMs = vClip.sourceStartMs;
            if (vClip.type === 'action') {
              targetSourceMs += (ms - vClip.logicalStartMs) * (vClip.playbackRate ?? 1.0);
            }
            pendingFrameRef.current = true;
            extractorRef.current.getFrame(targetSourceMs).then(frame => {
              if (frame) {
                masterFrameRef.current?.close();
                masterFrameRef.current = frame;
              }
              pendingFrameRef.current = false;
            }).catch(() => { pendingFrameRef.current = false; });
          }
        }
      }

      // ── Derive step + within-step progress (runs every frame) ────────────
      // Computed outside the isPlaying block so camera updates correctly when
      // paused (e.g. seeked to mid-step position) and after playhead advances.
      const { stepIndex: newIdx, progress: stepProgress } =
        getSegmentAt(currentMsRef.current, segs);

      // Audio state is managed via safePlayAudio/safePauseAudio in play/pause effects.
      // No per-frame polling needed — AudioBufferSourceNode is hardware-clocked.

      if (newIdx !== currentIdxRef.current) {
        const prevIdx = currentIdxRef.current;
        const prevStep = stepsRef.current[prevIdx];
        const chapter = prevStep ? chapterBreaksRef.current?.find(c => c.afterStepId === prevStep.id) : null;

        if (chapter && isPlayingRef.current && !isTransitioningRef.current) {
          console.log('[CinematicPlayer] Chapter transition triggered for:', chapter.chapterTitle);
          isTransitioningRef.current = true;
          setShowChapterCard(chapter.chapterTitle);

          // Pause backing media immediately during overlay
          safePauseAudio();

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
        const seg = segs[currentIdxRef.current];
        const holdFraction = seg?.holdFraction ?? 1;
        const ct = CinematicMath.getStepCameraTarget(camStep, stepProgress, prevStep, nextStep, isPlayingRef.current, holdFraction);
        camX.set(ct.pctX);
        camY.set(ct.pctY);
        camScale.set(ct.scale);
        // Log camera target once per phase change (not every frame)
        const phase = stepProgress > holdFraction && holdFraction < 0.85 ? 'hold-focus' : stepProgress < 0.20 ? 'overview' : stepProgress >= 0.80 ? 'retreat' : 'event';
        if (phase !== (camStep as any).__lastPhase) {
          (camStep as any).__lastPhase = phase;
          console.log('[CinematicPlayer] camera phase →', phase, '| step:', currentIdxRef.current, '| progress:', stepProgress.toFixed(2), '| holdFraction:', holdFraction.toFixed(2), '| target:', JSON.stringify(ct));
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

          let masterFrame: ImageBitmap | HTMLImageElement | HTMLCanvasElement | null = null;

          if (hasVideo && masterFrameRef.current) {
            masterFrame = masterFrameRef.current;
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

          // During hold clips the video is paused and the screenshot may not
          // have loaded yet (race condition on step-0 / slow networks).
          // Fall back to the previous step's screenshot so we never pass null
          // to renderer.render() and show a dark background instead of content.
          if (!masterFrame) masterFrame = prevSlideImageRef.current;

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

          // Show click ripple for click/input steps so viewers can always see where
          // the action happened, especially when the cursor moves quickly.
          const showClickRipple = !!(step?.action && ['click', 'input'].includes(step.action));

          renderer.render(
            ctx,
            {
              dimensions: { width: cW, height: cH },
              step:        renderStep,
              prevStep:    stepsRef.current[currentIdxRef.current - 1] ?? null,
              progress:    stepProgress,
              theme:       { primaryColor },
              renderMode:  hasVideo ? 'hybrid' : 'slideshow',
              camera: {
                pctX:  camX.get(),
                pctY:  camY.get(),
                scale: camScale.get(),
              },
              timeMs: now,
              showCursor: showClickRipple,
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

  // Video play/pause for hybrid mode is managed inside the rAF tick
  // via the videoTrack clip map (action vs hold clips).

  useEffect(() => {
    // Restart the source node at current position so audioStartContextTimeRef
    // stays valid for the Step 2 clock formula: (ctx.currentTime - ref) * speed * 1000.
    // A live playbackRate mutation alone would corrupt the reference point.
    if (isPlayingRef.current) {
      safePlayAudio();
    }
  }, [speed, safePlayAudio]);

  useEffect(() => {
    if (audioGainRef.current) audioGainRef.current.gain.value = isMuted ? 0 : 1;
  }, [isMuted]);



  // ── Master Audio Compilation Trigger ──────────────────────────────────────────
  const lastCompiledKeyRef = useRef<string>('');
  const compilationIdRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const masterAudioUrlRef = useRef<string | null>(null);

  useEffect(() => {
    masterAudioUrlRef.current = masterAudioUrl;
  }, [masterAudioUrl]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Invalidate any in-flight compilation immediately when dependencies change
    const compId = ++compilationIdRef.current;

    // Guard against transient empty/loading steps state
    if (steps.length === 0) {
      return;
    }

    if (isAudioGenerating) {
      console.log('[CinematicPlayer] Audio generation is in progress — postponing master track compilation.');
      return;
    }

    const voiceoverSteps = steps.filter(s => s.voiceoverKey);
    
    // If no steps need voiceover, clear masterAudioUrl
    if (voiceoverSteps.length === 0) {
      const currentMasterUrl = useStudioStore.getState().masterAudioUrl;
      if (currentMasterUrl) {
        console.log('[CinematicPlayer] No voiceover steps. Revoking master audio URL:', currentMasterUrl);
        URL.revokeObjectURL(currentMasterUrl);
        setMasterAudioUrl(null);
      }
      lastCompiledKeyRef.current = '';
      return;
    }

    // Check if all voiceover assets are resolved and ready (none generating)
    const allReady = voiceoverSteps.every(
      s => s.voiceoverSource !== 'generating' && s.voiceoverKey && assets[s.voiceoverKey]
    );

    if (!allReady) {
      console.log('[CinematicPlayer] Voiceover assets are not all ready yet (some are still generating or missing).');
      return;
    }

    // Map the steps with voiceover to AudioTrackItem
    const trackItems: AudioTrackItem[] = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (step.voiceoverKey && assets[step.voiceoverKey]) {
        const seg = segments[i];
        if (seg) {
          trackItems.push({
            url: assets[step.voiceoverKey],
            startMs: seg.startMs,
            durationMs: step.voiceoverDurationMs || seg.durationMs,
          });
        }
      }
    }

    // Generate unique representation to detect meaningful changes
    const currentKey = JSON.stringify({ items: trackItems, totalMs });
    if (currentKey === lastCompiledKeyRef.current) {
      return;
    }

    console.log(`[CinematicPlayer] All voiceover assets resolved. Triggering master WAV compilation for ${trackItems.length} segments. totalMs: ${totalMs}`);
    lastCompiledKeyRef.current = currentKey;
    setCompilingAudio(true);

    compileAudioTrack(trackItems, totalMs)
      .then((blobUrl) => {
        if (!isMountedRef.current || compId !== compilationIdRef.current) {
          URL.revokeObjectURL(blobUrl);
          return;
        }

        // Revoke the old master audio URL before setting the new one to prevent memory leaks
        const oldUrl = useStudioStore.getState().masterAudioUrl;
        if (oldUrl) {
          console.log('[CinematicPlayer] Revoking old master audio URL:', oldUrl);
          URL.revokeObjectURL(oldUrl);
        }

        setMasterAudioUrl(blobUrl);
        setCompilingAudio(false);
      })
      .catch((err) => {
        if (!isMountedRef.current || compId !== compilationIdRef.current) return;
        console.error("Compilation failed", err);
        setCompilingAudio(false);
      });
  }, [steps, assets, segments, totalMs, setMasterAudioUrl, setCompilingAudio, isAudioGenerating]);

  // ── Master Audio Decode Effect ─────────────────────────────────────────────
  // Decodes the compiled WAV blob into an AudioBuffer so AudioBufferSourceNode
  // can play it on the hardware-backed AudioContext clock.
  // Blocks the play button (isDecodingAudio) until the buffer is ready so the
  // first play press is never silently dropped.
  useEffect(() => {
    if (!masterAudioUrl) {
      audioBufferRef.current = null;
      if (audioSourceRef.current) {
        try { audioSourceRef.current.stop(); } catch (_) {}
        audioSourceRef.current = null;
      }
      return;
    }

    const audioCtx = getOrCreateAudioCtx();
    console.log('[CinematicPlayer] Decoding master audio blob:', masterAudioUrl);
    setIsDecodingAudio(true);

    fetch(masterAudioUrl)
      .then(r => r.arrayBuffer())
      .then(ab => audioCtx.decodeAudioData(ab))
      .then(buffer => {
        if (!isMountedRef.current) return;
        audioBufferRef.current = buffer;
        setIsDecodingAudio(false);
        console.log('[CinematicPlayer] Master AudioBuffer decoded. Duration:', buffer.duration.toFixed(2), 's');
        // If play was pressed while decoding, start now that the buffer is ready
        if (isPlayingRef.current && !isTransitioningRef.current) {
          safePlayAudio();
        }
      })
      .catch(err => {
        setIsDecodingAudio(false);
        console.error('[CinematicPlayer] Failed to decode master audio:', err);
      });
  }, [masterAudioUrl, getOrCreateAudioCtx, safePlayAudio]);

  // ── Tab visibility — resume suspended AudioContext ─────────────────────────
  // Browsers may auto-suspend AudioContext when the tab backgrounds. Resume it
  // when the user returns so the hardware clock keeps running.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // SEPARATE CLEANUP EFFECT
  useEffect(() => {
    return () => {
      // Only revoke if the component is being removed from the DOM
      const url = masterAudioUrlRef.current;
      if (url && url.startsWith('blob:')) {
        console.log("[CinematicPlayer] Component unmounting, revoking blob:", url);
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  // ── Voiceover — play/pause ──────────────────────────────────────────────────
  useEffect(() => {
    console.log(`[CinematicPlayer][AudioPlayPauseEffect] isPlaying: ${isPlaying} | showChapterCard: ${showChapterCard}`);
    if (isPlaying && !isTransitioningRef.current) {
      safePlayAudio();
    } else {
      safePauseAudio();
    }
  }, [isPlaying, showChapterCard, safePlayAudio, safePauseAudio]);

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

          if (audioBufferRef.current) {
            safePlayAudio();
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



  // ── Controls ───────────────────────────────────────────────────────────────
  const handleTogglePlay = useCallback(() => {
    if (isEnded) {
      // Restart from beginning — safePlayAudio(0) will set audioStartContextTimeRef
      currentMsRef.current = 0;
      currentIdxRef.current = 0;
      setCurrentIndex(0);
      setIsEnded(false);
      setIsPlaying(true);
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
    currentMsRef.current = clamped;
    // Rebase the clock reference so (ctx.currentTime - ref) * speed * 1000 = clamped
    if (audioCtxRef.current) {
      audioStartContextTimeRef.current =
        audioCtxRef.current.currentTime - clamped / (speedRef.current * 1000);
    }
    setIsEnded(false);

    const { stepIndex: newIdx } = getSegmentAt(clamped, segmentsRef.current);
    if (newIdx !== currentIdxRef.current) {
      currentIdxRef.current = newIdx;
      setCurrentIndex(newIdx);
    }

    // WorkerExtractor seeks implicitly — the next rAF tick will request
    // the frame at the new clamped position via the videoTrack clip map.

    // Restart audio from new position if currently playing
    if (isPlayingRef.current && audioBufferRef.current) {
      safePlayAudio(clamped);
    }

    // Update progress bar immediately
    if (progressBarRef.current && totalMsRef.current > 0) {
      progressBarRef.current.style.width =
        `${Math.min(100, (clamped / totalMsRef.current) * 100)}%`;
    }
    if (playheadThumbRef.current && totalMsRef.current > 0) {
      playheadThumbRef.current.style.left =
        `${Math.min(100, (clamped / totalMsRef.current) * 100)}%`;
    }
    if (timeDisplayRef.current && totalMsRef.current > 0) {
      timeDisplayRef.current.textContent = `${fmtTime(clamped)} / ${fmtTime(totalMsRef.current)}`;
    }
  }, []);

  const scrubBy = useCallback((deltaMs: number) => {
    scrubTo(currentMsRef.current + deltaMs);
  }, [scrubTo]);

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
  }, [handleTogglePlay, scrubBy, toggleFullscreen]);

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
      {/* Hybrid mode uses WorkerExtractor (WebCodecs) — no <video> element needed */}

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

          {/* Ended overlay — delayed so the trailing audio "..." sigh can finish
               before the dark overlay appears over the canvas */}
          {isEnded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2, duration: 0.5 }}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center text-center p-8"
            >
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
            </motion.div>
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
                currentMsRef={currentMsRef}
                totalMs={totalMs}
                segments={segments}
                chapterMarkers={chapterMarkers}
                steps={steps}
                assets={assets}
                progressBarRef={progressBarRef}
                playheadThumbRef={playheadThumbRef}
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
                  disabled={isCompilingAudio || isDecodingAudio}
                  className="w-9 h-9 rounded-full bg-white flex items-center justify-center hover:bg-white/90 active:scale-95 disabled:opacity-50 flex-shrink-0 transition-all shadow"
                  title={isCompilingAudio ? 'Compiling audio...' : isDecodingAudio ? 'Loading audio...' : isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                >
                  {isCompilingAudio || isDecodingAudio ? (
                    <I.Loader size={15} className="text-black animate-spin" />
                  ) : isPlaying ? (
                    <I.Pause size={15} className="text-black" />
                  ) : (
                    <I.Play  size={15} className="text-black ml-0.5" />
                  )}
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
                <span ref={timeDisplayRef} className="text-[11px] text-white/35 tabular-nums ml-1 font-mono select-none">
                  {fmtTime(0)} / {fmtTime(totalMs)}
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


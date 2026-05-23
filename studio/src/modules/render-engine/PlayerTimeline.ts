/**
 * PlayerTimeline — time-space timeline utilities
 *
 * Implements the Semantic Timeline Compiler with the Boundary Lock Rule.
 * Outputs a CompiledTimeline with independent Video and Audio tracks,
 * ensuring logical synchronization between procedural animations and raw media.
 */

export const DEFAULT_STEP_MS    = 5000; // fallback when voiceoverDurationMs absent
export const MIN_STEP_MS        = 1000; // never shorter than 1 s
export const POST_STEP_GAP_MS   = 250;  // silence gap between steps — lets Aura's trailing ... breathe

export const MIN_PLAYBACK_RATES: Record<string, number> = {
  navigate: 0.6,
  type: 0.75,
  click: 0.85,
  camera_pan: 0.5,
  default: 0.7
};

export interface TimelineStep {
  id: string;
  voiceoverDurationMs?: number | null;
  timestamp?: number | null;
  action?: string | null;
}

export interface StepSegment {
  stepIndex: number;
  startMs:   number;   // cumulative logical start of this step
  durationMs: number;  // resolved logical duration of this step
  endMs:     number;   // startMs + durationMs
}

export interface TrackClip {
  stepIndex: number;
  logicalStartMs: number;
  logicalDurationMs: number;
  sourceStartMs: number; // Raw video timestamp (for video track) or 0
  type: 'action' | 'hold';
  playbackRate?: number;
}

export interface Timeline {
  segments: StepSegment[];
  totalMs:  number;
  videoTrack: { clips: TrackClip[] };
  audioTrack: { clips: TrackClip[] };
}

/** Build a Timeline from an array of steps using the Adaptive Hybrid (Stretch + Hold) Compiler. */
export function buildTimeline(
  steps: TimelineStep[],
  useVideoTimestamps = false,
  sessionStartMs = 0,
): Timeline {
  const segments: StepSegment[] = [];
  const videoTrack = { clips: [] as TrackClip[] };
  const audioTrack = { clips: [] as TrackClip[] };
  let cursor = 0;

  const getRelativeMs = (step: TimelineStep) => {
    const raw = step.timestamp || 0;
    const EPOCH_FLOOR = 1_000_000_000_000;
    return raw > EPOCH_FLOOR ? Math.max(0, raw - sessionStartMs) : raw;
  };

  for (let i = 0; i < steps.length; i++) {
    const rawAudio = steps[i].voiceoverDurationMs;
    // Remove MIN_STEP_MS clamp for audioDuration and visualDuration
    const audioDuration = rawAudio != null && rawAudio > 0
      ? rawAudio
      : (useVideoTimestamps ? 0 : DEFAULT_STEP_MS);

    let visualDuration: number;
    const startSourceMs = useVideoTimestamps ? (i === 0 ? 0 : getRelativeMs(steps[i])) : 0;

    if (useVideoTimestamps) {
      if (i < steps.length - 1) {
        const nextSourceMs = getRelativeMs(steps[i + 1]);
        visualDuration = Math.max(0, nextSourceMs - startSourceMs);
      } else {
        // Last step: typically extends to match audio or default
        visualDuration = audioDuration > 0 ? audioDuration : DEFAULT_STEP_MS;
      }
    } else {
      // In slideshow mode, visual purely follows audio
      visualDuration = audioDuration;
    }

    // Adaptive Hybrid Stretch + Hold Calculation
    let resolvedDuration = Math.max(visualDuration, audioDuration);
    let playbackRate = 1.0;
    let actionClipDuration = visualDuration;
    let holdClipDuration = 0;

    if (useVideoTimestamps && visualDuration > 0 && audioDuration > visualDuration) {
      const actionType = steps[i].action || 'default';
      const minPlaybackRate = MIN_PLAYBACK_RATES[actionType] ?? MIN_PLAYBACK_RATES.default;
      const maxStretchedVisualMs = visualDuration / minPlaybackRate;

      if (audioDuration <= maxStretchedVisualMs) {
        // Audio fits within the safe stretch limit
        playbackRate = visualDuration / audioDuration;
        actionClipDuration = audioDuration;
        holdClipDuration = 0;
        resolvedDuration = audioDuration;
      } else {
        // Audio overflows max stretch limit; stretch to max, hold the rest
        playbackRate = minPlaybackRate;
        actionClipDuration = maxStretchedVisualMs;
        holdClipDuration = audioDuration - maxStretchedVisualMs;
        resolvedDuration = audioDuration;
      }
    } else if (visualDuration <= 0) {
      actionClipDuration = 0;
      holdClipDuration = resolvedDuration;
    }

    // 1. Audio Track
    if (audioDuration > 0) {
      audioTrack.clips.push({
        stepIndex: i,
        logicalStartMs: cursor,
        logicalDurationMs: audioDuration,
        sourceStartMs: 0,
        type: 'action',
      });
    }

    // 2. Video Track
    if (actionClipDuration > 0) {
      videoTrack.clips.push({
        stepIndex: i,
        logicalStartMs: cursor,
        logicalDurationMs: actionClipDuration,
        sourceStartMs: startSourceMs,
        type: 'action',
        playbackRate,
      });
    }

    if (holdClipDuration > 0) {
      videoTrack.clips.push({
        stepIndex: i,
        logicalStartMs: cursor + actionClipDuration,
        logicalDurationMs: holdClipDuration,
        sourceStartMs: Math.max(0, startSourceMs + visualDuration - 1), // 1ms safety buffer to avoid bleed
        type: 'hold',
      });
    }

    // 4. Inter-step gap — silence + video hold so Aura's trailing ... can breathe
    const isLastStep = i === steps.length - 1;
    if (!isLastStep) {
      // Hold the last video frame during the gap
      const gapSourceMs = useVideoTimestamps
        ? Math.max(0, startSourceMs + Math.max(0, visualDuration - 1))
        : 0;
      videoTrack.clips.push({
        stepIndex: i,
        logicalStartMs: cursor + resolvedDuration,
        logicalDurationMs: POST_STEP_GAP_MS,
        sourceStartMs: gapSourceMs,
        type: 'hold',
      });
      resolvedDuration += POST_STEP_GAP_MS;
    }

    // 5. Update logical segments
    segments.push({
      stepIndex:  i,
      startMs:    cursor,
      durationMs: resolvedDuration,
      endMs:      cursor + resolvedDuration,
    });

    cursor += resolvedDuration;
  }

  return { segments, totalMs: cursor, videoTrack, audioTrack };
}

/**
 * Map a continuous logical playhead position (ms) to the corresponding step index
 * and normalised progress within that step (0–1).
 */
export function getSegmentAt(
  currentMs: number,
  segments: StepSegment[],
): { stepIndex: number; progress: number } {
  if (!segments.length) return { stepIndex: 0, progress: 0 };

  const clamped = Math.max(0, Math.min(currentMs, segments[segments.length - 1].endMs));

  let lo = 0, hi = segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].endMs <= clamped) lo = mid + 1;
    else hi = mid;
  }

  const seg = segments[lo];
  const progress = seg.durationMs > 0
    ? Math.min(1, (clamped - seg.startMs) / seg.durationMs)
    : 0;

  return { stepIndex: seg.stepIndex, progress };
}

/** Chapter break positions as fractions (0–1) of total duration — for timeline UI. */
export interface ChapterMarker {
  fraction: number;   
  label:    string;
  stepIndex: number;
}

export function buildChapterMarkers(
  segments: StepSegment[],
  chapterBreaks: { afterStepId: string; chapterTitle: string }[],
  steps: { id: string }[],
  totalMs: number,
): ChapterMarker[] {
  if (!chapterBreaks?.length || !totalMs) return [];

  const markers: ChapterMarker[] = [];

  for (const brk of chapterBreaks) {
    const stepIdx = steps.findIndex(s => s.id === brk.afterStepId);
    if (stepIdx < 0 || stepIdx >= segments.length) continue;

    const nextSeg = segments[stepIdx + 1];
    if (!nextSeg) continue;

    markers.push({
      fraction:  nextSeg.startMs / totalMs,
      label:     brk.chapterTitle,
      stepIndex: stepIdx + 1,
    });
  }

  return markers;
}

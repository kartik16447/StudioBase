/**
 * PlayerTimeline — time-space timeline utilities
 *
 * Converts a step array into a flat, cumulative time-space representation
 * so the player operates on a continuous `currentMs` (0 → totalMs) rather
 * than a discrete step index.  This is the prerequisite for per-step audio
 * durations to work correctly.
 */

export const DEFAULT_STEP_MS = 5000; // fallback when voiceoverDurationMs absent
export const MIN_STEP_MS     = 1000; // never shorter than 1 s

export interface TimelineStep {
  id: string;
  voiceoverDurationMs?: number | null;
  [key: string]: unknown;
}

export interface StepSegment {
  stepIndex: number;
  startMs:   number;   // cumulative start of this step
  durationMs: number;  // actual duration for this step
  endMs:     number;   // startMs + durationMs
}

export interface Timeline {
  segments: StepSegment[];
  totalMs:  number;
}

/** Build a Timeline from an array of steps.  Pure function — no side-effects. */
export function buildTimeline(steps: TimelineStep[]): Timeline {
  const segments: StepSegment[] = [];
  let cursor = 0;

  for (let i = 0; i < steps.length; i++) {
    const raw = steps[i].voiceoverDurationMs;
    const durationMs = raw != null && raw > 0
      ? Math.max(MIN_STEP_MS, raw)
      : DEFAULT_STEP_MS;

    segments.push({
      stepIndex:  i,
      startMs:    cursor,
      durationMs,
      endMs:      cursor + durationMs,
    });

    cursor += durationMs;
  }

  return { segments, totalMs: cursor };
}

/**
 * Map a continuous playhead position (ms) to the corresponding step index
 * and normalised progress within that step (0–1).
 *
 * Clamped: before first step → { stepIndex: 0, progress: 0 }
 *          after last step   → { stepIndex: last, progress: 1 }
 */
export function getSegmentAt(
  currentMs: number,
  segments: StepSegment[],
): { stepIndex: number; progress: number } {
  if (!segments.length) return { stepIndex: 0, progress: 0 };

  // Clamp to valid range
  const clamped = Math.max(0, Math.min(currentMs, segments[segments.length - 1].endMs));

  // Binary search for the segment that contains `clamped`
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
  fraction: number;   // 0–1 position on timeline
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

    // Chapter marker sits at the END of the named step (start of next)
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

import { RenderConstants } from './RenderConstants';

export interface CameraTarget {
  /** X position as % of the screenshot width (0–100) */
  pctX: number;
  /** Y position as % of the screenshot height (0–100) */
  pctY: number;
  scale: number;
}

export interface HybridTarget {
  /** Final resting target the camera springs toward */
  target: CameraTarget;
  /**
   * Non-null for far moves (≥30% viewport distance).
   * Camera springs here first (zoom-out + pan toward mid-point),
   * then after 350 ms springs to `target`.  Gives a "soft reveal"
   * so the viewer understands where the camera is going before it zooms in.
   */
  revealTarget: CameraTarget | null;
  /** Euclidean distance from current camera to target, in viewport-% units */
  distance: number;
  bucket: 'near' | 'mid' | 'far';
}

export interface ScreenshotLayout {
  drawX: number;
  drawY: number;
  drawW: number;
  drawH: number;
  baseScale: number;
}

export const CinematicMath = {
  /**
   * Legacy fixed-zoom target — kept for the export simulator which doesn't
   * have a "current camera position" to compute distance from.
   */
  getTarget(step: any, _renderMode: string = 'slideshow'): CameraTarget {
    const L = RenderConstants.CAMERA_SCALE_LIMITS;
    const pos = this._getTargetPosition(step);
    if (!pos.hasData) return { pctX: 50, pctY: 50, scale: L.min };

    // Manual animationTarget carries its own scale — cap at max
    if (step?.animationTarget?.zoomScale != null) {
      return {
        pctX: pos.pctX,
        pctY: pos.pctY,
        scale: clamp(step.animationTarget.zoomScale, L.min, L.max),
      };
    }

    return { pctX: pos.pctX, pctY: pos.pctY, scale: L.mid };
  },

  /**
   * Hybrid distance-based camera target.
   *
   * Distance buckets (viewport-% Euclidean):
   *   0–10%   → near: direct pan, barely any zoom change  (nearScale = 1.08)
   *  10–30%   → mid:  pan + mild zoom                     (midScale  = 1.18)
   *  30%+     → far:  reveal (zoom-out + half-way pan),
   *                   then glide in                        (farScale  = 1.28)
   *
   * Manual animationTarget.zoomScale is respected but capped at maxScale.
   */
  getHybridTarget(
    step: any,
    currentCamX: number,
    currentCamY: number,
  ): HybridTarget {
    const L = RenderConstants.CAMERA_SCALE_LIMITS;
    const pos = this._getTargetPosition(step);

    // No positional data — stay at full overview, no movement
    if (!pos.hasData) {
      return {
        target:       { pctX: 50, pctY: 50, scale: L.min },
        revealTarget: null,
        distance:     0,
        bucket:       'near',
      };
    }

    // Euclidean distance in viewport-% space
    const dx       = pos.pctX - currentCamX;
    const dy       = pos.pctY - currentCamY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Bucket
    const bucket: 'near' | 'mid' | 'far' =
      distance <= 10 ? 'near' :
      distance <= 30 ? 'mid'  : 'far';

    // Scale — manual override respected but always capped
    let scale: number;
    if (step?.animationTarget?.zoomScale != null) {
      scale = clamp(step.animationTarget.zoomScale, L.min, L.max);
    } else {
      scale = bucket === 'near' ? L.near
            : bucket === 'mid'  ? L.mid
            :                     L.far;
    }

    // Reveal target for far moves:
    // Zoom out to full overview and pan 35% toward the destination.
    // This gives the viewer context ("I see where we're going")
    // before the camera commits to the final zoom.
    const revealTarget: CameraTarget | null = bucket === 'far'
      ? {
          pctX:  clamp(currentCamX + dx * 0.35, 15, 85),
          pctY:  clamp(currentCamY + dy * 0.35, 15, 85),
          scale: L.min,   // zoom all the way out for context
        }
      : null;

    return {
      target: { pctX: pos.pctX, pctY: pos.pctY, scale },
      revealTarget,
      distance,
      bucket,
    };
  },

  /**
   * Per-step camera target driven by within-step progress (0–1).
   *
   * ── Human Eye Model ──────────────────────────────────────────────────────
   * The human eye tracks like this during a screen tutorial:
   *
   *  1. Brief orientation frame  (50–400 ms) — "where am I on the page?"
   *  2. Track toward the action  (spring settles naturally, 800–1200 ms)
   *  3. READ / comprehend        (1000–3000 ms of still, focused view)
   *  4. Exit signal              (subtle zoom-out, 300–500 ms)
   *  5. Next context loads
   *
   * The old 20/80 split forced the camera to be in motion for 64% of each
   * step and at rest for only 36% — the opposite of what the eye needs.
   *
   * ── Phase Timing ─────────────────────────────────────────────────────────
   * Dynamic based on distance and context.  Distance is measured between the
   * PREVIOUS step's focus point and this step's focus point (viewport %).
   *
   *  Same page, near move (<20% distance):
   *    intro  0–0%   (skip — spring carries from prev position naturally)
   *    event  0–92%  (long hold; camera transitions mid-pan)
   *    exit  92–100% (very brief; skip if next step also near + same page)
   *
   *  Same page, far move (≥20% distance):
   *    intro  0–8%   (brief overview so viewer gets their bearings)
   *    event  8–90%
   *    exit  90–100%
   *
   *  Cross-page / URL change:
   *    intro  0–12%  (full overview — new page needs orientation)
   *    event 12–88%
   *    exit  88–100%
   *
   * The framer-motion springs handle all easing — targets are just set here.
   */
  getStepCameraTarget(
    step: any,
    stepProgress: number,
    prevStep: any = null,
    nextStep: any = null,
    isPlaying: boolean = true,
  ): CameraTarget {
    const L = RenderConstants.CAMERA_SCALE_LIMITS;
    const overview: CameraTarget = { pctX: 50, pctY: 50, scale: L.min };
    const pos = this._getTargetPosition(step);

    if (!pos.hasData) return overview;

    const scale = step?.animationTarget?.zoomScale != null
      ? clamp(step.animationTarget.zoomScale, L.min, L.max)
      : L.event;

    // Edit mode: settle immediately on event target — no transitions
    if (!isPlaying) {
      return { pctX: pos.pctX, pctY: pos.pctY, scale };
    }

    // ── Context analysis ─────────────────────────────────────────────────────
    const samePrev = prevStep ? this.isSameContext(prevStep, step) : false;
    const sameNext = nextStep ? this.isSameContext(step, nextStep) : false;

    // Distance from prev step's focus to this step's focus (in viewport-% space)
    const prevPos = prevStep ? this._getTargetPosition(prevStep) : null;
    const dx = prevPos?.hasData ? (pos.pctX - prevPos.pctX) : 50;
    const dy = prevPos?.hasData ? (pos.pctY - prevPos.pctY) : 50;
    const distFromPrev = Math.sqrt(dx * dx + dy * dy);

    // Distance to next step (to decide whether to hold or retreat at exit)
    const nextPos = nextStep ? this._getTargetPosition(nextStep) : null;
    const ndx = nextPos?.hasData ? (nextPos.pctX - pos.pctX) : 50;
    const ndy = nextPos?.hasData ? (nextPos.pctY - pos.pctY) : 50;
    const distToNext = Math.sqrt(ndx * ndx + ndy * ndy);

    // ── Phase thresholds ──────────────────────────────────────────────────────
    let INTRO_END: number;
    let EXIT_START: number;

    if (!samePrev) {
      // Cross-page: viewer needs full orientation
      INTRO_END   = 0.12;
      EXIT_START  = 0.88;
    } else if (distFromPrev >= 20) {
      // Same page but far jump (e.g. top nav → footer CTA)
      INTRO_END   = 0.08;
      EXIT_START  = 0.90;
    } else {
      // Same page, near move — skip intro entirely; spring carries from prev
      INTRO_END   = 0.00;
      EXIT_START  = sameNext && distToNext < 20 ? 1.00 : 0.92;
    }

    // ── Exit / retreat phase ──────────────────────────────────────────────────
    if (stepProgress >= EXIT_START) {
      if (sameNext && nextPos?.hasData) {
        // Hold at current position — spring will transition to next step naturally
        return { pctX: pos.pctX, pctY: pos.pctY, scale };
      }
      // Zoom out to overview; but if next step is cross-page use full overview
      return overview;
    }

    // ── Intro / orientation phase ─────────────────────────────────────────────
    if (stepProgress < INTRO_END) {
      if (samePrev && prevPos?.hasData) {
        // Start from where the previous step left off — seamless pan
        const prevScale = prevStep?.animationTarget?.zoomScale != null
          ? clamp(prevStep.animationTarget.zoomScale, L.min, L.max)
          : L.event;
        return { pctX: prevPos.pctX, pctY: prevPos.pctY, scale: prevScale };
      }
      // Cross-page or no prev: show full overview while screenshot cross-dissolves in
      return overview;
    }

    // ── Event / comprehension phase ───────────────────────────────────────────
    // This is where the eye READS the element. Camera holds here.
    return { pctX: pos.pctX, pctY: pos.pctY, scale };
  },

  /**
   * Given canvas dimensions and the screenshot dimensions for this step,
   * compute where (in canvas pixels) the screenshot will be drawn.
   * Uses "contain" fitting so the whole screenshot is always visible at zoom=1.
   */
  getScreenshotLayout(
    canvasW: number,
    canvasH: number,
    worldW: number,
    worldH: number,
  ): ScreenshotLayout {
    const padding  = RenderConstants.SCREENSHOT_PADDING;
    const availW   = canvasW * (1 - padding * 2);
    const availH   = canvasH * (1 - padding * 2);
    const baseScale = Math.min(availW / worldW, availH / worldH);
    const drawW    = worldW * baseScale;
    const drawH    = worldH * baseScale;
    const drawX    = (canvasW - drawW) / 2;
    const drawY    = (canvasH - drawH) / 2;
    return { drawX, drawY, drawW, drawH, baseScale };
  },

  /** Two steps share context when they are on the same URL or page title. */
  isSameContext(s1: any, s2: any): boolean {
    if (!s1 || !s2) return false;
    const hasContext = (s1.url || s1.pageTitle) && (s2.url || s2.pageTitle);
    if (!hasContext) return true;
    return !!(s1.url && s1.url === s2.url) ||
           !!(s1.pageTitle && s1.pageTitle === s2.pageTitle);
  },

  /**
   * Convert a camera target (in screenshot %) to canvas-pixel coordinates.
   */
  targetToCanvasPoint(target: CameraTarget, layout: ScreenshotLayout) {
    return {
      x: layout.drawX + (target.pctX / 100) * layout.drawW,
      y: layout.drawY + (target.pctY / 100) * layout.drawH,
    };
  },

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Extract the XY position only (no scale decision).
   *
   * ── Spatial anchor / context bias ────────────────────────────────────────
   * A camera centered exactly on the click coordinate often loses context.
   * Example: clicking a button in the top-right nav bar → if we center on
   * the button, the left side of the nav (brand logo, other links) scrolls
   * out of view.  The viewer loses the spatial anchor.
   *
   * Fix: apply a 20% pull toward the viewport center.  This means:
   *   click at 10% X → camera targets 18% X  (keeps left context)
   *   click at 90% X → camera targets 82% X  (keeps right context)
   *   click at 50% X → unchanged (center)
   *
   * Manual animationTarget overrides skip this bias — the editor made a
   * deliberate framing choice.
   */
  _getTargetPosition(step: any): { pctX: number; pctY: number; hasData: boolean } {
    const CONTEXT_BIAS = 0.20; // pull 20% toward center; 0 = exact click, 1 = always center

    // 1. Manual animationTarget — editor's explicit framing, skip bias
    const manual = step?.animationTarget;
    if (manual && manual.centerX != null) {
      return {
        pctX:    clamp(manual.centerX, 10, 90),
        pctY:    clamp(manual.centerY, 10, 90),
        hasData: true,
      };
    }
    // 2. Captured click coordinates — apply context bias
    const coords = step?.coordinates;
    if (coords && coords.x != null && coords.viewportWidth) {
      const rawX = (coords.x / coords.viewportWidth) * 100;
      const rawY = (coords.y / (coords.viewportHeight || coords.viewportWidth * 0.625)) * 100;
      // Soft bias toward center — preserves spatial awareness
      const pctX = rawX + (50 - rawX) * CONTEXT_BIAS;
      const pctY = rawY + (50 - rawY) * CONTEXT_BIAS;
      return {
        pctX:    clamp(pctX, 12, 88),
        pctY:    clamp(pctY, 12, 88),
        hasData: true,
      };
    }
    // 3. No data
    return { pctX: 50, pctY: 50, hasData: false };
  },
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

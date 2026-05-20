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

  /** Extract the XY position only (no scale decision). */
  _getTargetPosition(step: any): { pctX: number; pctY: number; hasData: boolean } {
    // 1. Manual animationTarget
    const manual = step?.animationTarget;
    if (manual && manual.centerX != null) {
      return {
        pctX:    clamp(manual.centerX, 15, 85),
        pctY:    clamp(manual.centerY, 15, 85),
        hasData: true,
      };
    }
    // 2. Captured click coordinates
    const coords = step?.coordinates;
    if (coords && coords.x != null && coords.viewportWidth) {
      const pctX = (coords.x / coords.viewportWidth) * 100;
      const pctY = (coords.y / (coords.viewportHeight || coords.viewportWidth * 0.625)) * 100;
      return {
        pctX:    clamp(pctX, 15, 85),
        pctY:    clamp(pctY, 15, 85),
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

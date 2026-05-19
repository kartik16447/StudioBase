import { RenderConstants } from './RenderConstants';

export interface CameraTarget {
  /** X position as % of the screenshot width (0–100) */
  pctX: number;
  /** Y position as % of the screenshot height (0–100) */
  pctY: number;
  scale: number;
}

export interface ScreenshotLayout {
  drawX: number;
  drawY: number;
  drawW: number;
  drawH: number;
  baseScale: number;
}

/**
 * Derive a camera target from a step.
 *
 * Priority:
 *   1. step.animationTarget  (manual override set in editor)
 *   2. step.coordinates      (captured click / interaction point — ROOT level after normalization)
 *   3. Fallback: full-view (no zoom)
 *
 * IMPORTANT: always read from step.coordinates (root), never step.data.coordinates.
 * fetchSession normalises the D1 content blob so coordinates live at the root.
 */
export const CinematicMath = {
  getTarget(step: any, _renderMode: string = 'slideshow'): CameraTarget {
    // 1. Manual override wins
    const manual = step?.animationTarget;
    if (manual && manual.centerX != null && manual.zoomScale != null) {
      return {
        pctX: clamp(manual.centerX, 15, 85),
        pctY: clamp(manual.centerY, 15, 85),
        scale: clamp(manual.zoomScale, 1.0, 4.0),
      };
    }

    // 2. Captured coordinates — always apply zoom regardless of renderMode
    const coords = step?.coordinates;
    if (coords && coords.x != null && coords.viewportWidth) {
      const pctX = (coords.x / coords.viewportWidth) * 100;
      const pctY = (coords.y / (coords.viewportHeight || coords.viewportWidth * 0.625)) * 100;

      return {
        pctX: clamp(pctX, 15, 85),
        pctY: clamp(pctY, 15, 85),
        scale: 1.2,  // gentle zoom — keeps context visible, was 1.55
      };
    }

    // 3. Default — show full screenshot, no zoom
    return { pctX: 50, pctY: 50, scale: 1.0 };
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
    const padding = RenderConstants.SCREENSHOT_PADDING;
    const availW = canvasW * (1 - padding * 2);
    const availH = canvasH * (1 - padding * 2);
    const baseScale = Math.min(availW / worldW, availH / worldH);
    const drawW = worldW * baseScale;
    const drawH = worldH * baseScale;
    const drawX = (canvasW - drawW) / 2;
    const drawY = (canvasH - drawH) / 2;
    return { drawX, drawY, drawW, drawH, baseScale };
  },

  /**
   * Two steps share context when they are on the same URL or page title.
   * Used by VideoCanvas to decide between a direct spring-pan vs a
   * cross-context reorientation beat.
   */
  isSameContext(s1: any, s2: any): boolean {
    if (!s1 || !s2) return false;
    // If neither step carries URL or pageTitle, we have no context signal —
    // default to true so the camera does a direct spring pan instead of
    // snapping back to overview on every step.
    const hasContext = (s1.url || s1.pageTitle) && (s2.url || s2.pageTitle);
    if (!hasContext) return true;
    return !!(s1.url && s1.url === s2.url) ||
           !!(s1.pageTitle && s1.pageTitle === s2.pageTitle);
  },

  /**
   * Convert a camera target (in screenshot %) to canvas-pixel coordinates.
   * The canvas transform will translate so this point appears at canvas centre.
   */
  targetToCanvasPoint(
    target: CameraTarget,
    layout: ScreenshotLayout,
  ) {
    return {
      x: layout.drawX + (target.pctX / 100) * layout.drawW,
      y: layout.drawY + (target.pctY / 100) * layout.drawH,
    };
  },
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

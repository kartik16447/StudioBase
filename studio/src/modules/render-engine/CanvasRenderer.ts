import { CinematicMath } from './CinematicMath';
import type { IRenderer, RenderSpec } from './types';
import type { ScreenshotLayout } from './CinematicMath';

/**
 * CanvasRenderer — cinematic compositor
 *
 * Coordinate model
 * ───────────────
 * "World space"  = screenshot pixel coordinates  (0,0) → (worldW, worldH)
 * "Canvas space" = output canvas pixels           (0,0) → (canvasW, canvasH)
 *
 * The screenshot is drawn centred using "contain" fit (black bars if aspect
 * ratios differ).  The camera transform zooms into a world-space target point
 * by translating/scaling around the canvas centre.
 *
 * Camera transform sequence:
 *   1. translate( canvasW/2, canvasH/2 )   ← move origin to canvas centre
 *   2. scale( zoomScale )                   ← zoom around canvas centre
 *   3. translate( -targetCanvasX, -targetCanvasY )  ← pan to target
 *
 * Everything in the "camera group" (screenshot, highlight, cursor) is drawn
 * at canvas coordinates, so the transform applies naturally.
 * Overlays (vignette, annotations) are drawn AFTER ctx.restore() — no transform.
 */
export class CanvasRenderer implements IRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    spec: RenderSpec,
    masterFrame: ImageBitmap | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null,
  ) {
    const { dimensions, progress, step, theme } = spec;
    const { width: cW, height: cH } = dimensions;

    // ── 1. Background (gradient blooms + shimmer sweep) ───────────────────
    this.drawBackground(ctx, cW, cH, theme.primaryColor, spec.timeMs ?? 0);

    if (!masterFrame || !step) return;

    // ── 2. Screenshot layout (contain fit) ────────────────────────────────
    const worldW = step?.coordinates?.viewportWidth  || 1440;
    const worldH = step?.coordinates?.viewportHeight || 900;
    const layout = CinematicMath.getScreenshotLayout(cW, cH, worldW, worldH);

    // ── 3. Camera target ───────────────────────────────────────────────────
    const cam    = spec.camera ?? CinematicMath.getTarget(step);
    const rawPt  = CinematicMath.targetToCanvasPoint(cam, layout);

    // Clamp so the screenshot always fills the canvas (no background bleeds)
    // ONLY when the scaled dimension actually overflows the canvas. Otherwise,
    // center it to prevent inverted clamps that lock the camera axis.
    const halfW = cW / (2 * cam.scale);
    const halfH = cH / (2 * cam.scale);

    let x = rawPt.x;
    if (layout.drawW * cam.scale > cW) {
      const minX = layout.drawX + halfW;
      const maxX = layout.drawX + layout.drawW - halfW;
      x = Math.max(minX, Math.min(maxX, rawPt.x));
    } else {
      x = layout.drawX + layout.drawW / 2;
    }

    let y = rawPt.y;
    if (layout.drawH * cam.scale > cH) {
      const minY = layout.drawY + halfH;
      const maxY = layout.drawY + layout.drawH - halfH;
      y = Math.max(minY, Math.min(maxY, rawPt.y));
    } else {
      y = layout.drawY + layout.drawH / 2;
    }

    const pt = { x, y };

    // ── 4. Screenshot shadow (drawn BEFORE camera transform) ───────────────
    this.drawScreenshotShadow(ctx, layout, cam.scale);

    // ── 5. Apply camera transform ──────────────────────────────────────────
    ctx.save();
    ctx.translate(cW / 2, cH / 2);
    ctx.scale(cam.scale, cam.scale);
    ctx.translate(-pt.x, -pt.y);

    // ── 6. Draw screenshot ─────────────────────────────────────────────────
    ctx.imageSmoothingEnabled  = true;
    ctx.imageSmoothingQuality  = 'high';
    this.drawScreenshot(ctx, masterFrame, layout, cam.scale);

    // ── 6b. Shimmer border ─────────────────────────────────────────────────
    this.drawScreenshotBorder(ctx, layout, theme.primaryColor, spec.timeMs ?? 0, cam.scale);

    // ── 7. Element highlight ───────────────────────────────────────────────
    this.drawElementHighlight(ctx, step, layout, worldW, worldH, theme.primaryColor, progress);

    // ── 8. Click cursor (ripple at exact click coord) ──────────────────────
    if (spec.showCursor !== false) {
      this.drawCursor(ctx, step, layout, worldW, worldH, theme.primaryColor, progress);
    }

    ctx.restore();

    // ── 9. Post-process overlays (no camera transform) ─────────────────────
    this.drawVignette(ctx, cW, cH);
    if (spec.showAnnotations !== false) this.drawAnnotations(ctx, spec, layout);
    if (step.action === 'input' && step.inputValue && progress > 0.25) {
      this.drawTypingOverlay(ctx, cW, cH, step, progress);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ───────────────────────────────────────────────────────────────────────────

  private drawBackground(
    ctx: CanvasRenderingContext2D,
    cW: number,
    cH: number,
    primaryColor: string,
    timeMs: number,
  ) {
    // ── Base ────────────────────────────────────────────────────────────────
    ctx.fillStyle = '#0d0d14';
    ctx.fillRect(0, 0, cW, cH);

    // ── Roaming gradient blooms (8 s cycle) ─────────────────────────────────
    // These are strong enough to produce the visible navy/indigo gradient
    // seen in the dark letterbox area around the screenshot.
    const t  = (timeMs / 8000) * Math.PI * 2;

    // Primary bloom — brand colour, wide, drifts slowly
    const gx = cW * (0.5 + 0.28 * Math.sin(t));
    const gy = cH * (0.5 + 0.20 * Math.cos(t * 0.71));
    const g1 = ctx.createRadialGradient(gx, gy, 0, gx, gy, cW * 0.70);
    g1.addColorStop(0, hexAlpha(primaryColor, 0.22));
    g1.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, cW, cH);

    // Secondary counter-rotating indigo bloom
    const gx2 = cW * (0.5 - 0.22 * Math.cos(t * 1.37));
    const gy2 = cH * (0.5 + 0.28 * Math.sin(t * 0.89));
    const g2  = ctx.createRadialGradient(gx2, gy2, 0, gx2, gy2, cW * 0.52);
    g2.addColorStop(0, hexAlpha('#6366f1', 0.16));
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, cW, cH);

    // Tertiary accent — small warm highlight top-right
    const g3 = ctx.createRadialGradient(cW * 0.82, cH * 0.12, 0, cW * 0.82, cH * 0.12, cW * 0.30);
    g3.addColorStop(0, hexAlpha(primaryColor, 0.09));
    g3.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g3;
    ctx.fillRect(0, 0, cW, cH);

    // ── Dot grid ────────────────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(255,255,255,0.030)';
    const sp = 56;
    for (let x = sp / 2; x < cW; x += sp) {
      for (let y = sp / 2; y < cH; y += sp) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── Skeleton-style shimmer sweep (6 s period, very gentle) ────────────
    // Slow, soft light band — stays in the dark letterbox area because the
    // screenshot is drawn on top in a later pass.
    const phase  = (timeMs % 6000) / 6000;
    const sweepX = -cW + phase * 3 * cW;
    const sweepW = cW * 0.38;
    const sg = ctx.createLinearGradient(sweepX, 0, sweepX + sweepW, 0);
    sg.addColorStop(0,   'rgba(255,255,255,0)');
    sg.addColorStop(0.5, 'rgba(255,255,255,0.032)');
    sg.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, cW, cH);
  }

  private drawScreenshotShadow(
    ctx: CanvasRenderingContext2D,
    layout: ScreenshotLayout,
    scale: number,
  ) {
    const { drawX, drawY, drawW, drawH } = layout;
    // Shadow fades out as we zoom in (it would just be a big blurry box)
    const shadowAlpha = Math.max(0, 1 - (scale - 1) * 2) * 0.55;
    if (shadowAlpha <= 0) return;
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${shadowAlpha})`;
    ctx.shadowBlur  = 60;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = '#000';
    roundRect(ctx, drawX, drawY, drawW, drawH, 12);
    ctx.fill();
    ctx.restore();
  }

  private drawScreenshot(
    ctx: CanvasRenderingContext2D,
    frame: ImageBitmap | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
    layout: ScreenshotLayout,
    scale: number,
  ) {
    const { drawX, drawY, drawW, drawH } = layout;
    const cornerR = Math.max(10, 32 / scale);

    const frameW = frame instanceof HTMLVideoElement
      ? frame.videoWidth
      : frame instanceof HTMLImageElement
      ? frame.naturalWidth
      : (frame as HTMLCanvasElement | ImageBitmap).width;
    const frameH = frame instanceof HTMLVideoElement
      ? frame.videoHeight
      : frame instanceof HTMLImageElement
      ? frame.naturalHeight
      : (frame as HTMLCanvasElement | ImageBitmap).height;

    ctx.save();
    roundRect(ctx, drawX, drawY, drawW, drawH, cornerR);
    ctx.clip();
    if (frameW > 4 && frameH > 4) {
      ctx.drawImage(frame, 2, 2, frameW - 4, frameH - 4, drawX, drawY, drawW, drawH);
    } else {
      ctx.drawImage(frame, drawX, drawY, drawW, drawH);
    }
    ctx.restore();
  }

  private drawElementHighlight(
    _ctx: CanvasRenderingContext2D,
    step: any,
    layout: ScreenshotLayout,
    worldW: number,
    worldH: number,
    color: string,
    progress: number,
  ) {
    // Highlight box disabled — cursor ripple communicates click point cleanly.
    void step; void layout; void worldW; void worldH; void color; void progress;
  }

  private drawCursor(
    ctx: CanvasRenderingContext2D,
    step: any,
    layout: ScreenshotLayout,
    worldW: number,
    worldH: number,
    color: string,
    progress: number,
  ) {
    const coords = step?.coordinates;
    if (!coords || coords.x == null) return;

    const { drawX, drawY, drawW, drawH } = layout;
    const cx = drawX + (coords.x / worldW) * drawW;
    const cy = drawY + (coords.y / worldH) * drawH;

    // Burst phase: first 30% of step is the high-visibility burst window
    const burstT = Math.min(1, progress / 0.30);

    // Outer ring — large, fast expand, fades quickly
    const outerRadius = 8 + burstT * 52;
    const outerAlpha  = Math.max(0, (1 - burstT) * 0.85);
    ctx.save();
    ctx.globalAlpha = outerAlpha;
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.5;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Inner ring — smaller, slightly delayed, holds longer
    const innerT      = Math.min(1, Math.max(0, (progress - 0.05) / 0.50));
    const innerRadius = 6 + innerT * 22;
    const innerAlpha  = Math.max(0, (1 - innerT) * 0.6);
    ctx.save();
    ctx.globalAlpha = innerAlpha;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Solid center dot — always visible throughout the step
    const dotAlpha = progress < 0.05
      ? progress / 0.05          // snap in fast
      : Math.max(0.25, 1 - (progress - 0.05) / 0.95); // hold then gentle fade
    ctx.save();
    ctx.globalAlpha = dotAlpha;
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor = color;
    ctx.shadowBlur  = 16;
    ctx.beginPath();
    ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
    ctx.fill();
    // Colored core
    ctx.globalAlpha = dotAlpha * 0.6;
    ctx.fillStyle   = color;
    ctx.shadowBlur  = 0;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawScreenshotBorder(
    ctx: CanvasRenderingContext2D,
    layout: ScreenshotLayout,
    primaryColor: string,
    timeMs: number,
    scale: number,
  ) {
    const { drawX, drawY, drawW, drawH } = layout;
    const r  = 10;
    const lw = 1.5 / scale;

    // Slow pulse for overall glow intensity (4 s cycle)
    const pulse = 0.5 + 0.5 * Math.sin((timeMs / 4000) * Math.PI * 2);

    // Outer glow border — brand colour
    ctx.save();
    ctx.lineWidth   = lw;
    ctx.strokeStyle = hexAlpha(primaryColor, 0.20 + 0.15 * pulse);
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur  = (22 + 18 * pulse) / scale;
    roundRect(ctx, drawX, drawY, drawW, drawH, r);
    ctx.stroke();
    ctx.restore();

    // Inner bright rim — subtle white gleam
    ctx.save();
    ctx.lineWidth   = lw * 0.6;
    ctx.strokeStyle = `rgba(255,255,255,${0.06 + 0.06 * pulse})`;
    ctx.shadowColor = '#fff';
    ctx.shadowBlur  = 6 / scale;
    roundRect(ctx, drawX, drawY, drawW, drawH, r);
    ctx.stroke();
    ctx.restore();

    // Sweeping shimmer spot — one bright point travels the perimeter (6 s cycle)
    const phase    = (timeMs % 6000) / 6000;
    const perim    = 2 * (drawW + drawH);
    const spotPos  = phase * perim;

    let sx: number, sy: number;
    if (spotPos <= drawW) {
      sx = drawX + spotPos;            sy = drawY;
    } else if (spotPos <= drawW + drawH) {
      sx = drawX + drawW;              sy = drawY + (spotPos - drawW);
    } else if (spotPos <= 2 * drawW + drawH) {
      sx = drawX + drawW - (spotPos - drawW - drawH); sy = drawY + drawH;
    } else {
      sx = drawX;                      sy = drawY + drawH - (spotPos - 2 * drawW - drawH);
    }

    const spotR = Math.min(drawW, drawH) * 0.10;
    const sg    = ctx.createRadialGradient(sx, sy, 0, sx, sy, spotR);
    sg.addColorStop(0,    'rgba(255,255,255,0.60)');
    sg.addColorStop(0.20, hexAlpha(primaryColor, 0.40));
    sg.addColorStop(1,    'rgba(0,0,0,0)');

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = sg;
    ctx.fillRect(sx - spotR, sy - spotR, spotR * 2, spotR * 2);
    ctx.restore();
  }

  private drawVignette(ctx: CanvasRenderingContext2D, cW: number, cH: number) {
    const g = ctx.createRadialGradient(cW / 2, cH / 2, cH * 0.3, cW / 2, cH / 2, cW * 0.8);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cW, cH);
  }

  private drawAnnotations(
    ctx: CanvasRenderingContext2D,
    spec: RenderSpec,
    layout: ScreenshotLayout,
  ) {
    const annotations = spec.step?.annotations;
    if (!Array.isArray(annotations) || annotations.length === 0) return;
    const { drawX, drawY, drawW, drawH } = layout;

    annotations.forEach((anno: any) => {
      if (!anno) return;
      const ax = drawX + (anno.x / 100) * drawW;
      const ay = drawY + (anno.y / 100) * drawH;
      const aw = anno.width  ? (anno.width  / 100) * drawW : 220;
      const ah = anno.height ? (anno.height / 100) * drawH : 80;
      const alpha = Math.min(1, (spec.progress - 0.1) * 2.5);
      if (alpha <= 0) return;

      ctx.save();
      ctx.globalAlpha = alpha;

      if (anno.shape === 'redact' || anno.shape === 'blur') {
        // Solid black redaction rectangle — bakes into export
        ctx.fillStyle = '#000000';
        ctx.fillRect(ax, ay, aw, ah);
        ctx.restore();
        return;
      }

      ctx.fillStyle   = 'rgba(10,10,20,0.82)';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 1.5;
      roundRect(ctx, ax, ay, aw, ah, 10);
      ctx.fill();
      ctx.stroke();

      if (anno.text) {
        ctx.fillStyle  = '#fff';
        ctx.font       = `500 ${Math.round(aw * 0.08)}px Inter, system-ui, sans-serif`;
        ctx.textAlign  = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(anno.text, ax + aw / 2, ay + ah / 2);
      }
      ctx.restore();
    });
  }

  private drawTypingOverlay(
    ctx: CanvasRenderingContext2D,
    cW: number,
    cH: number,
    step: any,
    progress: number,
  ) {
    const typeLen = Math.floor((progress - 0.25) * 1.4 * step.inputValue.length);
    const text = step.inputValue.slice(0, typeLen);
    if (!text) return;

    const boxW = Math.min(600, cW * 0.55);
    const boxH = 72;
    const bx   = cW / 2 - boxW / 2;
    const by   = cH - boxH - 40;

    ctx.save();
    ctx.fillStyle = 'rgba(10,10,18,0.88)';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, boxW, boxH, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle    = '#e8e8f0';
    ctx.font         = `500 ${Math.round(boxH * 0.44)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cW / 2, by + boxH / 2);
    ctx.restore();
  }
}

// ── Utilities ──────────────────────────────────────────────────────────────

function hexAlpha(hex: string, alpha: number): string {
  // Parse '#rrggbb' or '#rgb'
  const c = hex.replace('#', '');
  const r = parseInt(c.length === 3 ? c[0] + c[0] : c.slice(0, 2), 16);
  const g = parseInt(c.length === 3 ? c[1] + c[1] : c.slice(2, 4), 16);
  const b = parseInt(c.length === 3 ? c[2] + c[2] : c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  if ((ctx as any).roundRect) {
    ctx.beginPath();
    (ctx as any).roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
}

import { CinematicMath } from './CinematicMath';
import { RenderConstants } from './RenderConstants';

export interface RenderState {
  ctx: CanvasRenderingContext2D;
  dimensions: { width: number; height: number };
  masterFrame: ImageBitmap | HTMLImageElement | HTMLVideoElement | null;
  step: any;
  prevStep: any | null;
  progress: number; // 0 to 1
  theme: {
    primaryColor: string;
    logoUrl?: string;
    watermark?: string;
  };
  renderMode: 'hybrid' | 'slideshow';
}

export class CanvasRenderer {
  /**
   * Main entry point for drawing a single frame.
   */
  public render(state: RenderState) {
    const { ctx, dimensions, progress, step, prevStep, renderMode } = state;

    // 1. CLEAR & BACKGROUND
    this.drawBackground(state);

    // 2. CAMERA CALCULATION (Unified Math)
    const target = CinematicMath.getTarget(step, renderMode);
    const prevTarget = prevStep 
      ? CinematicMath.getTarget(prevStep, renderMode) 
      : target; // LATCH: Start at the current target to prevent snap from center at session start

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const currentScale = lerp(prevTarget.zoomScale, target.zoomScale, progress);
    const currentX = lerp(prevTarget.centerX, target.centerX, progress);
    const currentY = lerp(prevTarget.centerY, target.centerY, progress);

    // 3. APPLY CAMERA TRANSFORM
    ctx.save();
    
    // Move to center of screen
    ctx.translate(dimensions.width / 2, dimensions.height / 2);
    // Apply the zoom
    ctx.scale(currentScale, currentScale);
    // Offset the camera to the target pixel (moves absolute pixel target to screen center)
    ctx.translate(
      -(currentX / 100) * dimensions.width, 
      -(currentY / 100) * dimensions.height
    );

    // 4. DRAW ASSET (VIDEO OR IMAGE)
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    this.drawMainAsset(state, currentScale);

    // 5. DRAW INTERACTION HIGHLIGHT
    this.drawInteractionHighlight(state);

    // 6. RESTORE TRANSFORM
    ctx.restore();

    // 7. DRAW OVERLAYS (Annotations, Typing, etc.)
    this.drawOverlays(state);
  }

  private drawBackground(state: RenderState) {
    const { ctx, dimensions, theme } = state;
    const { width, height } = dimensions;

    // Base dark background
    ctx.fillStyle = '#11111a';
    ctx.fillRect(0, 0, width, height);

    // Grid dots
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    const spacing = RenderConstants.GRID_SPACING || 60;
    for (let x = 0; x < width; x += spacing) {
      for (let y = 0; y < height; y += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Radial Glow
    const bgGradient = ctx.createRadialGradient(
      width * 0.5, height * 0.5, 0,
      width * 0.5, height * 0.5, width * 0.8
    );
    const glowColor = theme.primaryColor || '#5e5ce6';
    bgGradient.addColorStop(0, `${glowColor}33`);
    bgGradient.addColorStop(1, 'rgba(17, 17, 26, 0)');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);
  }

  private drawMainAsset(state: RenderState, currentScale: number) {
    const { ctx, dimensions, masterFrame } = state;
    if (!masterFrame) return;

    // Viewport-based dimensioning for coordinate parity
    const coords = state.step?.data?.coordinates;
    const vw = coords?.viewportWidth || 1440;
    const vh = coords?.viewportHeight || 900;

    const dw = dimensions.width;
    const dh = (dimensions.width / vw) * vh;

    // Draw with soft corners (scaled to maintain visual weight during zoom)
    ctx.save();
    const x = 0; 
    const y = 0;

    if ((ctx as any).roundRect) {
      ctx.beginPath();
      (ctx as any).roundRect(x, y, dw, dh, 40 / currentScale); 
      ctx.clip();
    } else {
      ctx.rect(x, y, dw, dh);
      ctx.clip();
    }

    ctx.drawImage(masterFrame, x, y, dw, dh);
    ctx.restore();
  }

  private drawInteractionHighlight(state: RenderState) {
    const { ctx, dimensions, step, theme } = state;
    const coords = step?.data?.coordinates;
    if (!coords) return;

    const vw = coords.viewportWidth || 1440;
    const vh = coords.viewportHeight || 900;
    
    const dw = dimensions.width;
    const dh = (dimensions.width / vw) * vh;

    const x = (coords.x / vw) * dw;
    const y = (coords.y / vh) * dh;
    const w = (coords.width / vw) * dw;
    const h = (coords.height / vh) * dh;

    ctx.save();
    ctx.strokeStyle = theme.primaryColor;
    ctx.lineWidth = 3;
    ctx.fillStyle = `${theme.primaryColor}22`;

    if ((ctx as any).roundRect) {
      ctx.beginPath();
      (ctx as any).roundRect(x, y, w, h, 8);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }
    ctx.restore();
  }

  private drawOverlays(state: RenderState) {
    const { ctx, step, progress } = state;

    const annotations = step?.annotations || [];
    annotations.forEach((anno: any) => {
      this.drawAnnotation(ctx, anno, progress);
    });

    if (step?.action === 'input' && step?.inputValue && progress > 0.2) {
      this.drawTypingOverlay(state);
    }
  }

  private drawAnnotation(_ctx: CanvasRenderingContext2D, _anno: any, _progress: number) {
    // Placeholder for future phases
  }

  private drawTypingOverlay(state: RenderState) {
    const { ctx, dimensions, step, progress } = state;
    const { width, height } = dimensions;

    const typeLen = Math.floor((progress - 0.2) * 1.5 * step.inputValue.length);
    const text = step.inputValue.slice(0, typeLen);
    if (!text) return;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    const rx = width / 2 - 250;
    const ry = height - 160;
    const rw = 500;
    const rh = 80;
    
    if ((ctx as any).roundRect) {
      ctx.beginPath();
      (ctx as any).roundRect(rx, ry, rw, rh, 15);
      ctx.fill();
    } else {
      ctx.fillRect(rx, ry, rw, rh);
    }

    ctx.fillStyle = '#fff';
    ctx.font = '32px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, width / 2, ry + 50);
    ctx.restore();
  }
}


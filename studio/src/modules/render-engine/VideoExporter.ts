import { CinematicMath } from './CinematicMath';

const CANVAS_W = 1280;
const CANVAS_H = 720;
const FPS = 30;
const FRAME_MS = 1000 / FPS;
const TRANSITION_MS = 500;
const DWELL_MS = 1500;
const FADE_MS = 250;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export interface VideoExportProgress {
  step: number;
  total: number;
  phase: 'loading' | 'rendering' | 'finishing';
}

export async function exportScreenshotsToVideo(
  session: any,
  onProgress: (p: VideoExportProgress) => void,
): Promise<void> {
  const steps: any[] = (session?.steps || []).filter(
    (s: any) => s.screenshotKey && session?.assets?.[s.screenshotKey],
  );

  if (steps.length === 0) throw new Error('No screenshots found. Run AI processing first.');

  // ── 1. Load all images ─────────────────────────────────────────────────────
  onProgress({ step: 0, total: steps.length, phase: 'loading' });
  const images: HTMLImageElement[] = [];
  for (let i = 0; i < steps.length; i++) {
    const url = session.assets[steps[i].screenshotKey];
    const img = await loadImage(url);
    images.push(img);
    onProgress({ step: i + 1, total: steps.length, phase: 'loading' });
  }

  // ── 2. Set up canvas + MediaRecorder ──────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d')!;

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(canvas.captureStream(FPS), {
    mimeType,
    videoBitsPerSecond: 4_000_000,
  });
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const done = new Promise<void>((res) => { recorder.onstop = () => res(); });
  recorder.start();

  // ── 3. Render each step ────────────────────────────────────────────────────
  async function renderFrames(count: number, draw: (progress: number) => void) {
    for (let f = 0; f < count; f++) {
      draw(f / Math.max(count - 1, 1));
      await new Promise<void>((r) => setTimeout(r, FRAME_MS));
    }
  }

  function drawStep(img: HTMLImageElement, step: any, zoom: number, alpha: number) {
    // Always clear + fill background at full opacity so previous frames don't bleed through
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Draw the screenshot at the requested alpha
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

    const layout = CinematicMath.getScreenshotLayout(CANVAS_W, CANVAS_H, img.naturalWidth, img.naturalHeight);
    const target = CinematicMath.getTarget(step, 'slideshow');
    const pt = CinematicMath.targetToCanvasPoint(target, layout);

    const tx = CANVAS_W / 2 - pt.x * zoom;
    const ty = CANVAS_H / 2 - pt.y * zoom;

    ctx.translate(tx, ty);
    ctx.scale(zoom, zoom);
    ctx.drawImage(img, layout.drawX, layout.drawY, layout.drawW, layout.drawH);
    ctx.restore();
  }

  for (let i = 0; i < steps.length; i++) {
    onProgress({ step: i + 1, total: steps.length, phase: 'rendering' });
    const step = steps[i];
    const img = images[i];
    const target = CinematicMath.getTarget(step, 'slideshow');
    const targetZoom = target.scale;

    // Fade in / zoom in
    const transFrames = Math.round(TRANSITION_MS / FRAME_MS);
    await renderFrames(transFrames, (t) => {
      const e = easeInOut(t);
      drawStep(img, step, lerp(1.0, targetZoom, e), e);
    });

    // Dwell at zoom
    const dwellFrames = Math.round(DWELL_MS / FRAME_MS);
    await renderFrames(dwellFrames, () => {
      drawStep(img, step, targetZoom, 1.0);
    });

    // Fade out (except last step)
    if (i < steps.length - 1) {
      const fadeFrames = Math.round(FADE_MS / FRAME_MS);
      await renderFrames(fadeFrames, (t) => {
        drawStep(img, step, targetZoom, 1.0 - easeInOut(t));
      });
    }
  }

  // ── 4. Finish ──────────────────────────────────────────────────────────────
  onProgress({ step: steps.length, total: steps.length, phase: 'finishing' });
  recorder.stop();
  await done;

  const blob = new Blob(chunks, { type: mimeType });
  if (blob.size < 1000) throw new Error('Export output is empty or corrupted.');

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${session?.aiOutputs?.title || 'studiobase-demo'}.webm`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

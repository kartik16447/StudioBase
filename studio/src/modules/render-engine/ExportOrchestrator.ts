import { useStudioStore } from '../../store/useStudioStore';
import { RenderConstants } from './RenderConstants';
import { WorkerExtractor } from '../../services/WorkerExtractor';
import { CanvasRenderer } from './CanvasRenderer';
import { CinematicMath } from './CinematicMath';
import { buildTimeline, getSegmentAt } from './PlayerTimeline';
import { apiClient } from '../../lib/apiClient';
import { TelemetryService } from '../../services/TelemetryService';
import { analyticsClient } from '../../lib/analyticsClient';

const rnd = (max: number) => Math.floor(Math.random() * max);
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export async function handleSOPVideoExport(config: {
  session: any;
  theme: any;
  renderMode: string;
}) {
  const store = useStudioStore.getState();
  if (store.isExporting) return;

  const { session, theme: brand, renderMode } = config;
  const workspaceId = (session as any)?.workspaceId || 'default';
  const sessionId   = session?.sessionId || 'unknown';

  console.log('[Export] handleSOPVideoExport invoked:', { sessionId, workspaceId, renderMode, hasIntro: brand?.showIntro, hasOutro: brand?.showOutro });

  store.setIsExporting(true);
  store.setExportStatus('checking');
  store.setExportError(null);
  store.setExportProgress(0);

  const steps = session?.steps || [];

  // ── Health checks ─────────────────────────────────────────────────────────
  try {
    const videoKey = (session as any)?.videoKey || 'screen-recording';
    const videoUrl = session?.assets?.[videoKey] || session?.assets?.['video'] || '';
    console.log('[Export] Performing health checks. Video URL:', videoUrl);
    if (!videoUrl) throw new Error('Video asset URL missing. Cannot export.');
    const check = await fetch(videoUrl, { method: 'HEAD' });
    if (!check.ok) throw new Error(`Video asset unavailable (${check.status})`);
    if (!(window as any).VideoDecoder)
      throw new Error('WebCodecs (VideoDecoder) not supported in this browser.');
    console.log('[Export] Health checks passed successfully.');
  } catch (err: any) {
    console.error('[Export] Health check failed:', err);
    store.setExportStatus('failed');
    store.setExportError(err.message);
    store.setIsExporting(false);
    return;
  }

  store.setExportStatus('exporting');

  // ── Compositor canvas ──────────────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.id    = 'export-compositor';
  canvas.width  = RenderConstants.EXPORT_COMPOSITOR_WIDTH;
  canvas.height = RenderConstants.EXPORT_COMPOSITOR_HEIGHT;
  Object.assign(canvas.style, {
    position: 'fixed', left: '0', top: '0',
    width: RenderConstants.EXPORT_VISUAL_WIDTH,
    height: RenderConstants.EXPORT_VISUAL_HEIGHT,
    opacity: '0.04', pointerEvents: 'none', zIndex: '9999',
  });
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d', { willReadFrequently: false, alpha: false });
  if (!ctx) {
    store.setExportStatus('failed');
    store.setExportError('Failed to get 2D context');
    store.setIsExporting(false);
    canvas.remove();
    return;
  }

  // ── Progress overlay ───────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'export-progress-overlay';
  Object.assign(overlay.style, {
    position: 'fixed', top: '20px', right: '20px',
    padding: '12px 20px', background: 'rgba(0,0,0,0.88)', color: '#fff',
    borderRadius: '8px', fontFamily: 'Inter,sans-serif', fontSize: '14px',
    zIndex: '10000', backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.1)',
  });
  overlay.innerText = '🎬 Preparing Export…';
  document.body.appendChild(overlay);

  let extractor: WorkerExtractor | null = null;
  let videoTrack: MediaStreamTrack | null = null;
  const chunks: Blob[] = [];

  try {
    const videoKey = (session as any)?.videoKey || 'screen-recording';
    const videoUrl = session?.assets?.[videoKey] || session?.assets?.['video'] || '';

    const stream    = (canvas as any).captureStream(RenderConstants.EXPORT_FPS);
    videoTrack      = stream.getVideoTracks()[0];
    const mimeType  = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9' : 'video/webm';
    const recorder  = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: RenderConstants.EXPORT_VIDEO_BITRATE,
    });
    console.log('[Export] Starting MediaRecorder with mimeType:', mimeType);
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.start(500);

    console.log('[Export] Initializing WorkerExtractor...');
    extractor = new WorkerExtractor();
    await extractor.init(videoUrl);

    const renderer = new CanvasRenderer();
    const fps      = RenderConstants.EXPORT_FPS;

    const sessionStartTime =
      (session as any)?.startedAt   ? new Date((session as any).startedAt).getTime()
      : session?.capturedAt          ? new Date(session.capturedAt).getTime()
      : (steps[0]?.timestamp || 0);

    const maxDuration = extractor.getDuration();
    console.log('[Export] WorkerExtractor initialized. Video duration:', maxDuration, 'ms. sessionStartTime:', sessionStartTime);

    const getFrameSafe = async (targetMs: number, retries = 2) => {
      for (let i = 0; i < retries; i++) {
        const f = await extractor!.getFrame(targetMs);
        if (f) return f;
        await delay(60 * (i + 1));
      }
      return null;
    };

    const jitter = () => {
      ctx.save();
      ctx.globalAlpha = 0.008;
      ctx.fillStyle = `rgb(${rnd(255)},${rnd(255)},${rnd(255)})`;
      ctx.fillRect(canvas.width - 1, canvas.height - 1, 1, 1);
      ctx.restore();
    };

    const simSpring = (
      cur: number, vel: number, target: number,
      stiffness: number, damping: number, mass: number,
    ) => {
      const DT = 1 / fps;
      const f = -stiffness * (cur - target) - damping * vel;
      const a = f / mass;
      const nv = vel + a * DT;
      const nc = cur + nv * DT;
      return { value: nc, velocity: nv };
    };

    let springX = 50, springY = 50, springScale = 1.0;
    let velX = 0, velY = 0, velScale = 0;

    let absLastLoggedMs = -1;
    let masterFrame: ImageBitmap | null = null;

    // ── Build Timeline (Compiler) ──────────────────────────────────────────
    const hasVideo = renderMode === 'hybrid' && !!videoUrl;
    console.log('[Export] Building timeline with hasVideo:', hasVideo);
    const timeline = buildTimeline(steps, hasVideo, sessionStartTime);
    console.log('[Export] Compiled Timeline:', {
      totalMs: timeline.totalMs,
      segmentsCount: timeline.segments.length,
      videoClipsCount: timeline.videoTrack?.clips.length,
      audioClipsCount: timeline.audioTrack?.clips.length
    });
    
    const chapterBreaks = session?.metadata?.chapterBreaks || [];
    const chapterMap = new Map<string, any>(
      chapterBreaks.map((c: any) => [c.afterStepId, c])
    );

    let exportTimeMs = 0;

    // ── Intro slide (3 s) ──────────────────────────────────────────────────
    if (brand.showIntro) {
      const title = session?.aiOutputs?.title || 'Walkthrough';
      const introFrames = Math.round(fps * 3);
      for (let f = 0; f < introFrames; f++) {
        const fadeA = f < 15 ? f / 15 : f > introFrames - 15 ? (introFrames - f) / 15 : 1;
        ctx.fillStyle = '#0a0a10';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.globalAlpha = fadeA;
        const ig = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        ig.addColorStop(0, brand.primaryColor + 'f0');
        ig.addColorStop(1, brand.primaryColor);
        ctx.fillStyle = ig;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.round(canvas.height * 0.08)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(title, canvas.width / 2, canvas.height / 2 - canvas.height * 0.06);
        ctx.globalAlpha = fadeA * 0.7;
        ctx.font = `400 ${Math.round(canvas.height * 0.04)}px Inter, system-ui, sans-serif`;
        ctx.fillText('A StudioBase walkthrough', canvas.width / 2, canvas.height / 2 + canvas.height * 0.04);
        ctx.restore();
        jitter();
        if (videoTrack && (videoTrack as any).requestFrame) (videoTrack as any).requestFrame();
        await delay(0);
      }
    }

    // ── Main Timeline rendering (Frame by Frame) ──────────────────────────
    const totalFrames = Math.ceil(timeline.totalMs / 1000 * fps);
    let lastChapterIndex = -1;

    for (let f = 0; f < totalFrames; f++) {
      const logicalCurrentMs = (f / fps) * 1000;
      exportTimeMs += 1000 / fps;

      const { stepIndex, progress } = getSegmentAt(logicalCurrentMs, timeline.segments);
      const step = steps[stepIndex];
      const prevStep = stepIndex > 0 ? steps[stepIndex - 1] : null;
      const nextStep = stepIndex < steps.length - 1 ? steps[stepIndex + 1] : null;

      // ── Chapter Transition Cards ───────────────────────────────────────
      if (stepIndex > lastChapterIndex) {
        lastChapterIndex = stepIndex;
        const exportChapter = stepIndex > 0 ? chapterMap.get(steps[stepIndex - 1].id) : null;
        if (exportChapter) {
          const chFrames = Math.round(fps * 1.5);
          for (let cf = 0; cf < chFrames; cf++) {
            const fadeA = cf < 10 ? cf / 10 : cf > chFrames - 10 ? (chFrames - f) / 10 : 1;
            ctx.fillStyle = '#0a0a10';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.globalAlpha = Math.max(0, fadeA);
            const cg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
            cg.addColorStop(0, brand.primaryColor + 'e6');
            cg.addColorStop(1, brand.primaryColor);
            ctx.fillStyle = cg;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.font = `500 ${Math.round(canvas.height * 0.04)}px Inter, system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('CHAPTER', canvas.width / 2, canvas.height * 0.40);
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${Math.round(canvas.height * 0.09)}px Inter, system-ui, sans-serif`;
            ctx.fillText(exportChapter.chapterTitle, canvas.width / 2, canvas.height * 0.55);
            ctx.restore();
            jitter();
            if (videoTrack && (videoTrack as any).requestFrame) (videoTrack as any).requestFrame();
            await delay(0);
          }
        }
      }

      // ── Spring Simulation ──────────────────────────────────────────────
      const ct = CinematicMath.getStepCameraTarget(step, progress, prevStep, nextStep, true);
      const sx = simSpring(springX, velX, ct.pctX, RenderConstants.CAMERA_XY_SPRING.stiffness, RenderConstants.CAMERA_XY_SPRING.damping, RenderConstants.CAMERA_XY_SPRING.mass);
      const sy = simSpring(springY, velY, ct.pctY, RenderConstants.CAMERA_XY_SPRING.stiffness, RenderConstants.CAMERA_XY_SPRING.damping, RenderConstants.CAMERA_XY_SPRING.mass);
      const ss = simSpring(springScale, velScale, ct.scale, RenderConstants.CAMERA_SCALE_SPRING.stiffness, RenderConstants.CAMERA_SCALE_SPRING.damping, RenderConstants.CAMERA_SCALE_SPRING.mass);
      springX = sx.value; velX = sx.velocity;
      springY = sy.value; velY = sy.velocity;
      springScale = ss.value; velScale = ss.velocity;

      // ── Frame Extraction (Timeline Sync) ───────────────────────────────
      if (hasVideo && extractor && timeline.videoTrack) {
        const clips = timeline.videoTrack.clips;
        let vClip = clips[0];
        for (let i = 0; i < clips.length; i++) {
          if (logicalCurrentMs >= clips[i].logicalStartMs) vClip = clips[i];
          else break;
        }

        if (vClip) {
          let targetSourceMs = vClip.sourceStartMs;
          if (vClip.type === 'action') {
            targetSourceMs += (logicalCurrentMs - vClip.logicalStartMs);
          }
          
          const safeMs = Math.max(absLastLoggedMs + 1, Math.floor(targetSourceMs));
          // Throttle extraction slightly to prevent blocking on every single frame if source is 30fps and we're 60fps
          if (!masterFrame || (safeMs - absLastLoggedMs) >= 30) {
            const newFrame = await getFrameSafe(targetSourceMs);
            if (newFrame) {
              masterFrame?.close();
              masterFrame = newFrame;
              absLastLoggedMs = safeMs;
            }
          }
        }
      }

      // ── Render ─────────────────────────────────────────────────────────
      renderer.render(
        ctx,
        {
          dimensions: { width: canvas.width, height: canvas.height },
          step, prevStep, progress,
          theme: {
            primaryColor: brand.primaryColor,
            logoUrl: brand.logoUrl ?? undefined,
            watermark: brand.watermark ?? undefined,
          },
          renderMode,
          camera: { pctX: springX, pctY: springY, scale: springScale },
          timeMs: exportTimeMs,
        },
        masterFrame
      );

      jitter();
      if (videoTrack && (videoTrack as any).requestFrame) (videoTrack as any).requestFrame();
      await delay(0);

      // Progress reporting
      if (f % 30 === 0) {
        const pct = Math.round((f / totalFrames) * 100);
        console.log(`[Export] Rendering frame ${f}/${totalFrames} (${pct}%). Logical currentMs: ${logicalCurrentMs.toFixed(1)}ms. StepIndex: ${stepIndex}`);
        store.setExportProgress(pct);
        overlay.innerText = `🎬 Exporting… ${pct}%`;
      }
    }
    masterFrame?.close();

    // ── Outro slide (3 s) ──────────────────────────────────────────────────
    if (brand.showOutro) {
      console.log('[Export] Rendering outro slide...');
      const watermarkText = brand.watermark || 'StudioBase';
      const outroFrames = Math.round(fps * 3);
      for (let f = 0; f < outroFrames; f++) {
        const fadeA = f < 15 ? f / 15 : f > outroFrames - 15 ? (outroFrames - f) / 15 : 1;
        ctx.fillStyle = '#0a0a10';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.globalAlpha = Math.max(0, fadeA);
        const og = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        og.addColorStop(0, brand.primaryColor + 'f0');
        og.addColorStop(1, brand.primaryColor);
        ctx.fillStyle = og;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.round(canvas.height * 0.06)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(watermarkText, canvas.width / 2, canvas.height / 2);
        ctx.restore();
        jitter();
        if (videoTrack && (videoTrack as any).requestFrame) (videoTrack as any).requestFrame();
        await delay(0);
      }
    }

    // ── Finalise ───────────────────────────────────────────────────────────
    console.log('[Export] Finalizing export. Stopping MediaRecorder...');
    await new Promise<void>((res) => {
      recorder.onstop = () => res();
      recorder.stop();
    });

    const blob = new Blob(chunks, { type: 'video/webm' });
    console.log(`[Export] Blob generated successfully. Size: ${blob.size} bytes (${(blob.size / (1024 * 1024)).toFixed(2)} MB). Type: ${blob.type}`);
    if (blob.size < 1000) throw new Error('Export output is empty or corrupted');

    const url = URL.createObjectURL(blob);
    const filename = `${session?.aiOutputs?.title || 'studiobase-cinematic'}.webm`;
    console.log('[Export] Initiating local download of filename:', filename);
    const a   = Object.assign(document.createElement('a'), {
      href: url,
      download: filename,
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);

    // Cloud sync
    store.setExportStatus('finishing');
    overlay.innerText = '☁️ Uploading to Cloud…';
    try {
      const exportKey = `videos/${sessionId}/export_${Date.now()}.webm`;
      console.log('[Export] Starting upload to cloud storage. Key:', exportKey);
      await apiClient.request(`/assets/file?key=${encodeURIComponent(exportKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/webm' },
        body: blob,
      });
      console.log('[Export] Asset upload successful. Updating session record...');
      await apiClient.request(`/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ r2ExportKey: exportKey }),
      });
      console.log('[Export] Session record updated successfully.');
    } catch (e) {
      console.error('[Export] Cloud sync failed:', e);
      store.setExportError('Cloud sync failed. File saved locally.');
    }

    store.setExportStatus('completed');
    console.log('[Export] Export workflow fully completed.');
    TelemetryService.record({
      eventName: 'export.completed', sessionId, workspaceId,
      properties: { size: blob.size },
    });
    analyticsClient.track({
      sessionId, workspaceId,
      eventType: 'export_triggered',
      metadata: { size: blob.size },
    });

  } catch (err: any) {
    console.error('[Export] Fatal error during export:', err);
    store.setExportStatus('failed');
    store.setExportError(err.message);
  } finally {
    console.log('[Export] Cleaning up compositor elements and tracks.');
    if (extractor) await extractor.destroy().catch((e) => console.error('[Export] Failed to destroy extractor:', e));
    if (videoTrack) videoTrack.stop();
    canvas.remove();
    overlay.remove();
    store.setIsExporting(false);
  }
}

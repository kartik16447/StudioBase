import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStudioStore } from '../../../store/useStudioStore';
import { I } from '../../../components/icons';
import { cn, Button } from '../../../components/ui';
import { apiClient } from '../../../lib/apiClient';
import { CinematicPlayer, type CinematicPlayerHandle } from '../../player/CinematicPlayer';
import { analyticsClient } from '../../../lib/analyticsClient';
import { EmbedModal } from '../panels/EmbedModal';
import { showToast } from '../../GlobalToast';
import { handleSOPVideoExport } from '../../../modules/render-engine/ExportOrchestrator';
import { exportScreenshotsToVideo } from '../../../modules/render-engine/VideoExporter';

// ─── Component ────────────────────────────────────────────────────────────────

type ViewMode = 'cinematic' | 'raw';

export const VideoCanvas: React.FC = () => {
  const {
    session,
    currentStepIndex,
    playbackRate,
    setPlaying,
    setStepIndex,
    brand,
    isExporting,
    exportTrigger,
  } = useStudioStore();

  const [viewMode, setViewMode]   = useState<ViewMode>('cinematic');
  const [embedOpen, setEmbedOpen] = useState(false);
  const [isEnded, setIsEnded]     = useState(false);
  const [screenshotExporting, setScreenshotExporting] = useState(false);
  const [screenshotProgress, setScreenshotProgress]   = useState('');

  // PATCH 4: Intro / Outro slide state
  // Intro trigger was in the old play button — not yet wired to CinematicPlayer.
  // Destructure only the value (no setter) so TS doesn't flag unused setters.
  const [showIntroSlide] = useState(false);
  const [introVisible]   = useState(false);
  const [showOutroSlide, setShowOutroSlide] = useState(false);
  const [outroVisible,   setOutroVisible]   = useState(false);



  const playerRef         = useRef<HTMLDivElement>(null);
  const cinPlayerRef      = useRef<CinematicPlayerHandle>(null);
  const rawVideoRef       = useRef<HTMLVideoElement>(null);

  const renderMode     = useStudioStore((s) => s.renderMode);
  const scriptDirty    = useStudioStore((s) => s.scriptDirty);
  const setScriptDirty = useStudioStore((s) => s.setScriptDirty);
  const triggerExport  = useStudioStore((s) => s.triggerExport);
  const steps          = useMemo(() => session?.steps || [], [session?.steps]);

  const sopId       = session?.sopId ?? null;
  const sessionId   = session?.sessionId ?? 'unknown';
  const workspaceId = session?.workspaceId ?? 'default';

  const rawVideoUrl = session?.videoKey
    ? (session.assets?.[session.videoKey] ?? null)
    : null;
  const hybridVideoUrl = renderMode === 'hybrid' ? rawVideoUrl : null;
  const sessionStartMs = (session as unknown as Record<string, unknown>)?.startedAt
    ? new Date((session as unknown as Record<string, unknown>).startedAt as string).getTime()
    : session?.capturedAt ? new Date(session.capturedAt).getTime() : 0;

  // Enrich the assets map with resolved voiceover URLs so CinematicPlayer can
  // play audio without knowing about apiClient.  Falls back gracefully if a key
  // is already in session.assets (e.g. public share page with pre-signed URLs).
  // Memoized to prevent reference thrashing and unnecessary compilation effects.
  const enrichedAssets = useMemo(() => {
    const base: Record<string, string> = { ...(session?.assets ?? {}) };
    for (const step of steps) {
      const key = step.voiceoverKey;
      if (key && !base[key]) {
        base[key] = apiClient.getUrl(`/assets/${key}`);
      }
    }

    return base;
  }, [session?.assets, steps]);

  // ── Export trigger ───────────────────────────────────────────────────────
  useEffect(() => {
    if (exportTrigger > 0 && !isExporting && useStudioStore.getState().activeView === 'video') {
      handleSOPVideoExport({ session, theme: brand, renderMode: 'slideshow' });
    }
  }, [exportTrigger, brand, isExporting, session]);

  // ── Sync external step changes (sidebar click, keyboard) → CinematicPlayer ──
  // Uses getCurrentStep() to check the player's actual internal index, making
  // this loop-proof: if the player already advanced naturally to this step,
  // getCurrentStep() === currentStepIndex and we skip the seek entirely.
  useEffect(() => {
    const playerStep = cinPlayerRef.current?.getCurrentStep() ?? currentStepIndex;

    if (playerStep !== currentStepIndex) {
      cinPlayerRef.current?.seekToStep(currentStepIndex);
    }
  }, [currentStepIndex]);

  // ── Callbacks from CinematicPlayer → store ─────────────────────────────────
  const handlePlayerStepSelect = useCallback((idx: number) => {

    setStepIndex(idx);
  }, [setStepIndex]);

  const handlePlayerPlayState = useCallback((playing: boolean) => {
    setPlaying(playing);
  }, [setPlaying]);

  // PATCH 4: Stable session-end handler — captures latest brand.showOutro
  const handleSessionEndRef = useRef<() => void>(() => { setIsEnded(true); });
  useEffect(() => {
    handleSessionEndRef.current = () => {
      setPlaying(false);
      const completionMs = Math.round(performance.now() - (stepTimeRef.current.get('enteredAt') ?? 0));
      analyticsClient.track({ sessionId, sopId, workspaceId, eventType: 'sop_completed', durationMs: completionMs });
      if (brand.showOutro) {
        setShowOutroSlide(true);
        setOutroVisible(true);
        setTimeout(() => {
          setOutroVisible(false);
          setTimeout(() => { setShowOutroSlide(false); setIsEnded(true); }, 400);
        }, 3000);
      } else {
        setIsEnded(true);
      }
    };
  }, [brand.showOutro, sessionId, sopId, workspaceId, setPlaying]);



  // ── Raw video playback rate ──────────────────────────────────────────────
  useEffect(() => {
    if (rawVideoRef.current) rawVideoRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  // Analytics tracking refs
  const viewedSteps = useRef<Set<number>>(new Set());
  const stepTimeRef = useRef<Map<string, number>>(new Map([['enteredAt', 0]]));

  useEffect(() => {
    stepTimeRef.current.set('enteredAt', performance.now());
  }, []);

  // Track step_viewed / step_skipped / step_replayed on step change
  useEffect(() => {
    if (!session || isExporting) return;
    const now = performance.now();
    const prevIndex = currentStepIndex - 1;
    // Record dwell on the previous step before moving
    if (viewedSteps.current.size > 0 && prevIndex >= 0) {
      const dwell = Math.round(now - (stepTimeRef.current.get('enteredAt') ?? 0));
      if (dwell < 2000) {
        analyticsClient.track({ sessionId, sopId, workspaceId, stepIndex: prevIndex, eventType: 'step_skipped', durationMs: dwell });
      }
    }
    stepTimeRef.current.set('enteredAt', now);
    const alreadySeen = viewedSteps.current.has(currentStepIndex);
    if (alreadySeen) {
      analyticsClient.track({ sessionId, sopId, workspaceId, stepIndex: currentStepIndex, eventType: 'step_replayed' });
    } else {
      viewedSteps.current.add(currentStepIndex);
      analyticsClient.track({ sessionId, sopId, workspaceId, stepIndex: currentStepIndex, eventType: 'step_viewed' });
    }
  }, [currentStepIndex, session, isExporting, sessionId, sopId, workspaceId]);

  // Track sop_abandoned on unload
  useEffect(() => {
    if (!session) return;
    const onUnload = () => {
      const lastStep = viewedSteps.current.size > 0 ? Math.max(...viewedSteps.current) : null;
      const totalStepsCount = (session?.steps || []).length;
      if (lastStep === null || lastStep < totalStepsCount - 1) {
        analyticsClient.track({ sessionId, sopId, workspaceId, stepIndex: lastStep, eventType: 'sop_abandoned' });
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [session, sessionId, sopId, workspaceId]);

  // Voiceover is now handled inside CinematicPlayer via the enrichedAssets map.

  if (!session) return null;

  return (
    <div className="flex-1 min-h-0 flex flex-col relative">
      <style>{`
        .studio-gradient {
          background:
            radial-gradient(ellipse at 30% 20%, rgba(99,102,241,0.10) 0%, transparent 60%),
            radial-gradient(ellipse at 70% 80%, rgba(139,92,246,0.07) 0%, transparent 60%),
            #111120;
        }
        @keyframes beam-drift {
          0%   { transform: translateX(-60%) skewX(-12deg); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateX(160%) skewX(-12deg); opacity: 0; }
        }
        .beam-drift { animation: beam-drift 5s ease-in-out infinite; }
        @keyframes border-travel {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .border-travel { animation: border-travel 4s linear infinite; }
      `}</style>

      {/* ── Script dirty banner ──────────────────────────────────────────── */}
      {scriptDirty && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-500/15 border-b border-amber-500/30 shrink-0">
          <I.AlertTriangle size={14} className="text-amber-400 shrink-0" />
          <p className="text-[12px] text-amber-300 flex-1">
            Script was updated — regenerate the video so it matches your new narration.
          </p>
          <button
            onClick={() => { setScriptDirty(false); triggerExport(); }}
            className="text-[11px] font-semibold text-amber-300 hover:text-amber-100 border border-amber-400/40 rounded px-2.5 py-1 transition-colors shrink-0"
          >
            Regenerate ↻
          </button>
          <button
            onClick={() => setScriptDirty(false)}
            className="text-amber-500 hover:text-amber-300 transition-colors shrink-0"
            title="Dismiss"
          >
            <I.X size={13} />
          </button>
        </div>
      )}

      {/* ── Viewing area ───────────────────────────────────────────────── */}
      <div className="flex-1 studio-gradient flex flex-col items-center justify-start py-16 px-8 min-h-0 overflow-y-auto">

        {/* Floating player card — outer shell clips rotating border to 1.5px edge */}
        <div
          ref={playerRef}
          className={cn(
            'relative w-full max-w-5xl rounded-[18px] overflow-hidden',
            viewMode !== 'cinematic' && 'hidden',
          )}
          style={{
            maxHeight: 'calc(100vh - 280px)',
            aspectRatio: '16/9',
            padding: '1.5px',
            filter: 'drop-shadow(0 20px 60px rgba(0,0,0,0.70)) drop-shadow(0 4px 6px rgba(0,0,0,0.30)) drop-shadow(0 0 40px rgba(99,102,241,0.05))',
          }}
        >
          {/* Traveling border light — single bright spot sweeps the perimeter */}
          <div
            className="border-travel absolute pointer-events-none"
            style={{
              inset: '-150%',
              background: `conic-gradient(from 0deg,
                transparent 0%,
                transparent 78%,
                ${brand.primaryColor}55 86%,
                rgba(255,255,255,0.32) 90%,
                ${brand.primaryColor}55 94%,
                transparent 100%
              )`,
            }}
          />

          {/* Inner card — CinematicPlayer fills the padded inset */}
          <div className="absolute inset-[1.5px] rounded-2xl overflow-hidden bg-[#12121a]">

          {/* CinematicPlayer — owns canvas, springs, timeline controls */}
          <CinematicPlayer
            ref={cinPlayerRef}
            steps={steps}
            assets={enrichedAssets}
            videoUrl={hybridVideoUrl}
            sessionStartMs={sessionStartMs ?? 0}
            chapterBreaks={session?.metadata?.chapterBreaks}
            renderMode={renderMode === 'hybrid' ? 'hybrid' : 'slideshow'}
            primaryColor={brand.primaryColor}
            onStepSelect={handlePlayerStepSelect}
            onPlayStateChange={handlePlayerPlayState}
          />

          {/* Logo / Branding Fallback (Top-Right) */}
          <div className="absolute top-4 right-4 z-20 pointer-events-none bg-black/35 backdrop-blur-[4px] rounded-md px-2.5 py-1.5 flex items-center justify-center border border-white/10 shadow-lg">
            {brand.logoUrl ? (
              <img src={brand.logoUrl} className="h-5 max-w-[100px] object-contain" alt="Logo" />
            ) : (
              <span className="text-white/70 text-[10px] font-extrabold tracking-wider uppercase">StudioBase</span>
            )}
          </div>

          {/* Watermark overlay (Bottom-Right) */}
          {brand.watermark && (
            <div className="absolute bottom-14 right-4 z-20 pointer-events-none opacity-45 select-none">
              <span className="text-white text-[10px] font-semibold tracking-wider uppercase">{brand.watermark}</span>
            </div>
          )}

          {/* Intro slide */}
          <AnimatePresence>
            {showIntroSlide && (
              <motion.div
                key="intro"
                initial={{ opacity: 0 }}
                animate={{ opacity: introVisible ? 1 : 0 }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0 z-30 flex flex-col items-center justify-center text-center p-10"
                style={{ background: `linear-gradient(135deg, ${brand.primaryColor}f0, ${brand.primaryColor})` }}
              >
                {brand.logoUrl && (
                  <img src={brand.logoUrl} className="h-14 object-contain mb-6" alt="Logo" />
                )}
                <h2 className="text-3xl font-bold text-white mb-3">
                  {session?.aiOutputs?.title || 'Walkthrough'}
                </h2>
                <p className="text-white/70 text-base">A StudioBase walkthrough</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Outro slide */}
          <AnimatePresence>
            {showOutroSlide && (
              <motion.div
                key="outro"
                initial={{ opacity: 0 }}
                animate={{ opacity: outroVisible ? 1 : 0 }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0 z-30 flex flex-col items-center justify-center text-center p-10"
                style={{ background: `linear-gradient(135deg, ${brand.primaryColor}f0, ${brand.primaryColor})` }}
              >
                {brand.logoUrl && (
                  <img src={brand.logoUrl} className="h-14 object-contain mb-4" alt="Logo" />
                )}
                <p className="text-white text-xl font-semibold tracking-wide">{brand.watermark || 'StudioBase'}</p>
              </motion.div>
            )}
          </AnimatePresence>



          {/* Ended overlay */}
          <AnimatePresence>
            {isEnded && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="absolute inset-0 z-20 bg-black/65 backdrop-blur-sm flex flex-col items-center justify-center text-center p-10"
              >
                <div className="w-16 h-16 rounded-full bg-primary/20 text-primary flex items-center justify-center mb-6">
                  <I.CheckCircle size={32} strokeWidth={2.5} />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">End of Walkthrough</h2>
                <p className="text-white/60 max-w-xs mb-8">You've reached the end of the step-by-step guide.</p>
                <div className="flex gap-3">
                  <Button variant="primary" size="md" icon={I.RotateCcw} onClick={() => {
                    setStepIndex(0); setIsEnded(false); setPlaying(true);
                  }}>Watch again</Button>
                  <Button variant="ghost" size="md"
                    className="!text-white border-white/20"
                    onClick={() => setIsEnded(false)}>
                    Stay here
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Export overlay */}
          <AnimatePresence>
            {isExporting && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="absolute inset-0 z-30 bg-black/85 flex flex-col items-center justify-center text-center p-10"
              >
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6" />
                <h2 className="text-xl font-bold text-white mb-2">🎬 Rendering Cinematic Export</h2>
                <p className="text-white/50 max-w-xs text-sm">Do not close this tab.</p>
              </motion.div>
            )}
          </AnimatePresence>
          </div>{/* /inner card */}
        </div>{/* /outer border wrapper */}

        {/* Raw video player */}
        {viewMode === 'raw' && (
          <div className="w-full max-w-5xl flex items-center justify-center rounded-2xl overflow-hidden p-4"
            style={{ background: 'rgba(9,9,15,0.45)', backdropFilter: 'blur(12px)' }}
          >
            {rawVideoUrl ? (
              <video
                ref={rawVideoRef}
                src={rawVideoUrl}
                controls
                controlsList="nodownload"
                className="max-w-full max-h-full rounded-xl shadow-2xl"
                onEnded={() => setIsEnded(true)}
              />
            ) : (
              <p className="text-white/30 text-sm">No raw video available for this session.</p>
            )}
          </div>
        )}
      </div>

      {/* ── Controls bar — export/embed/view toggle only; playback is inside CinematicPlayer ── */}
      <div className="border-t border-border bg-bg relative z-10">
        <div className="flex items-center px-4 h-12 gap-3 pr-36">

          <div className="flex-1" />

          {/* View toggle */}
          <div className="flex items-center bg-surface-2 rounded-sm p-0.5 shrink-0">
            {(['cinematic', 'raw'] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={cn(
                  'px-3 h-6 rounded-sm text-[11px] font-semibold capitalize transition-all',
                  viewMode === m ? 'bg-white shadow-sm text-primary' : 'text-text-3 hover:text-text-2',
                )}
              >
                {m === 'cinematic' ? '✦ Cinematic' : '▶ Raw'}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-border shrink-0" />

          {/* Export */}
          <Button
            variant="ghost" size="sm" icon={I.Download}
            className="text-text-2 hover:text-primary shrink-0"
            onClick={() => {
              if (rawVideoUrl) {
                Object.assign(document.createElement('a'), {
                  href: rawVideoUrl,
                  download: `raw-${session.sessionId}.webm`,
                }).click();
              }
            }}
          >
            Download Raw
          </Button>
          <Button
            variant="ghost" size="sm" icon={I.Code2}
            className="shrink-0"
            onClick={() => setEmbedOpen(true)}
          >
            Embed
          </Button>
          <Button
            variant="primary" size="sm" icon={I.Download}
            disabled={screenshotExporting || isExporting}
            className="shrink-0"
            title="Export session as WebM video (uses screenshots)"
            onClick={async () => {
              if (screenshotExporting) return;
              setScreenshotExporting(true);
              setScreenshotProgress('Loading…');
              try {
                await exportScreenshotsToVideo(session, (p) => {
                  if (p.phase === 'loading') setScreenshotProgress(`Loading ${p.step}/${p.total}…`);
                  else if (p.phase === 'rendering') setScreenshotProgress(`Rendering ${p.step}/${p.total}…`);
                  else setScreenshotProgress('Finishing…');
                });
              } catch (e) {
                const err = e as Error;
                showToast('error', `Export failed: ${err.message}`);
              } finally {
                setScreenshotExporting(false);
                setScreenshotProgress('');
              }
            }}
          >
            {screenshotExporting ? screenshotProgress : 'Export Video'}
          </Button>
        </div>
      </div>
      <EmbedModal open={embedOpen} onClose={() => setEmbedOpen(false)} />
    </div>
  );
};

// ─── Utilities ────────────────────────────────────────────────────────────────

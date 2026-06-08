import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, useSpring } from 'framer-motion';
import { useStudioStore } from '../../../store/useStudioStore';
import { I } from '../../icons';
import { cn } from '../../ui';
import { Watermark } from './EmbedSOPView';
import { useIndexStepEvents } from '../../../hooks/useIndexStepEvents';

const SPRING_CFG = { stiffness: 260, damping: 32, mass: 1 };

function stepBg(hue: number) {
  return `radial-gradient(ellipse at 30% 30%, hsl(${hue} 65% 32%) 0%, hsl(${hue} 45% 18%) 60%, hsl(${hue} 35% 10%) 100%)`;
}

function getAutoplayMs(step: any, intervalOverride: number | null) {
  if (intervalOverride) return intervalOverride * 1000;
  return step?.voiceoverDurationMs || 4000;
}

export const EmbedSlidesView: React.FC<{ shareToken?: string }> = ({ shareToken = null }) => {
  const session = useStudioStore(state => state.session);
  const focusedStepIndex = useStudioStore(state => state.focusedStepIndex);
  const setStepIndex = useStudioStore(state => state.setStepIndex);

  const params = new URLSearchParams(window.location.search);
  const autoplayParam = params.get('autoplay') === '1';
  const intervalOverride = params.get('interval') ? Number(params.get('interval')) : null;

  const steps = session?.steps ?? [];
  const total = steps.length;
  const idx = total > 0 ? Math.max(0, Math.min(total - 1, focusedStepIndex)) : 0;
  const hue = 244 + (idx * 11) % 80;

  useIndexStepEvents(shareToken, idx, total);

  const [imgLoaded, setImgLoaded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoplay, setAutoplay] = useState(autoplayParam);
  const [autoProgress, setAutoProgress] = useState(0); // 0–1
  const dirRef = useRef<1 | -1>(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const thumbStripRef = useRef<HTMLDivElement>(null);
  const tickRef = useRef(0);
  const TICK_MS = 50;

  // Spring-animated zoom transform
  const springScale = useSpring(1, SPRING_CFG);
  const springX = useSpring(0, SPRING_CFG);
  const springY = useSpring(0, SPRING_CFG);

  useEffect(() => { setImgLoaded(false); setAutoProgress(0); tickRef.current = 0; }, [idx]);

  // Apply cinematic zoom from animationTarget
  useEffect(() => {
    const step = steps[idx];
    const at = step?.animationTarget;
    if (at && (at.zoomScale ?? 1) > 1) {
      // Pipeline emits pctX/pctY (0–100). Legacy field was centerX/Y (0–1).
      // Normalise both to 0–1 so the translate formula is uniform.
      const cx = at.pctX != null ? at.pctX / 100 : (at.centerX ?? 0.5);
      const cy = at.pctY != null ? at.pctY / 100 : (at.centerY ?? 0.5);
      // Shift the image so the focal point lands at the visual center.
      const tx = (0.5 - cx) * 100;
      const ty = (0.5 - cy) * 100;
      // Clamp zoomScale to our allowed range (mirrors CinematicMath limits)
      const clampedScale = Math.min(1.40, Math.max(1.00, at.zoomScale ?? 1.0));
      springScale.set(clampedScale);
      springX.set(tx);
      springY.set(ty);
    } else {
      springScale.set(1);
      springX.set(0);
      springY.set(0);
    }
  }, [idx]);

  // Auto-scroll thumbnail strip to active
  useEffect(() => {
    const strip = thumbStripRef.current;
    if (!strip) return;
    const thumb = strip.children[idx] as HTMLElement | undefined;
    thumb?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [idx]);

  const go = useCallback((delta: 1 | -1) => {
    const next = idx + delta;
    if (next < 0 || next >= total) return;
    dirRef.current = delta;
    setStepIndex(next);
  }, [idx, total]);

  // Keyboard nav
  useEffect(() => {
    if (!session) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [go, session]);

  // Autoplay ticker
  useEffect(() => {
    if (!autoplay || total === 0) return;
    const step = steps[idx];
    const duration = getAutoplayMs(step, intervalOverride);
    const interval = setInterval(() => {
      tickRef.current += TICK_MS;
      setAutoProgress(Math.min(tickRef.current / duration, 1));
      if (tickRef.current >= duration) {
        tickRef.current = 0;
        if (idx < total - 1) {
          dirRef.current = 1;
          setStepIndex(idx + 1);
        } else {
          setAutoplay(false);
        }
      }
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [autoplay, idx, total, intervalOverride]);

  // Fullscreen sync
  useEffect(() => {
    const onFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFSChange);
    return () => document.removeEventListener('fullscreenchange', onFSChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  if (!session) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: stepBg(hue) }}>
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
      </div>
    );
  }

  const step = steps[idx];
  const screenshotUrl = step?.screenshotKey && session.assets?.[step.screenshotKey]
    ? session.assets[step.screenshotKey] : null;
  const caption = step?.textOverride || step?.generatedText || '';

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col overflow-hidden relative select-none"
      style={{ background: stepBg(hue) }}
    >
      {/* Autoplay progress bar — top edge */}
      {autoplay && (
        <div className="absolute top-0 left-0 right-0 h-[3px] z-30 bg-white/10">
          <motion.div
            className="h-full bg-white"
            style={{ width: `${autoProgress * 100}%` }}
            transition={{ duration: 0 }}
          />
        </div>
      )}

      {/* Top-right controls */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
        {/* Autoplay toggle */}
        <button
          onClick={() => { setAutoplay(p => !p); tickRef.current = 0; }}
          className={cn(
            'h-8 px-3 rounded-full flex items-center gap-1.5 text-[12px] font-semibold transition-all border',
            autoplay
              ? 'bg-white/20 text-white border-white/30'
              : 'bg-black/40 text-white/50 border-white/10 hover:text-white hover:bg-white/10',
          )}
        >
          {autoplay ? <I.Pause size={12} strokeWidth={2.5} /> : <I.Play size={12} strokeWidth={2.5} />}
          {autoplay ? 'Pause' : 'Auto'}
        </button>

        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          className="w-8 h-8 rounded-full flex items-center justify-center bg-black/40 hover:bg-white/15 text-white/60 hover:text-white transition-all border border-white/10"
          aria-label="Toggle fullscreen"
        >
          {isFullscreen
            ? <I.Minimize2 size={14} strokeWidth={2} />
            : <I.Maximize size={14} strokeWidth={2} />}
        </button>
      </div>

      {/* Main slide — fills available space above the caption/strip */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center" style={{ paddingBottom: 96 }}>
        <AnimatePresence mode="wait" initial={false} custom={dirRef.current}>
          <motion.div
            key={step?.id ?? idx}
            custom={dirRef.current}
            variants={{
              enter: (dir: number) => ({ opacity: 0, x: dir * 60 }),
              center: { opacity: 1, x: 0 },
              exit: (dir: number) => ({ opacity: 0, x: dir * -60 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            {/* Screenshot with cinematic zoom */}
            <motion.div
              className="w-full h-full overflow-hidden"
              style={{ scale: springScale, x: springX, y: springY }}
            >
              {screenshotUrl ? (
                <img
                  key={screenshotUrl}
                  src={screenshotUrl}
                  alt={`Slide ${idx + 1}`}
                  className={cn(
                    'w-full h-full object-contain transition-opacity duration-300',
                    imgLoaded ? 'opacity-100' : 'opacity-0',
                  )}
                  onLoad={() => setImgLoaded(true)}
                  draggable={false}
                />
              ) : (
                <div className="w-full h-full" />
              )}
            </motion.div>
          </motion.div>
        </AnimatePresence>

        {/* Nav arrows */}
        <button
          onClick={() => go(-1)}
          disabled={idx === 0}
          className={cn(
            'absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full z-10',
            'flex items-center justify-center transition-all',
            'bg-black/40 hover:bg-white/20 text-white backdrop-blur-sm border border-white/10',
            idx === 0 && 'opacity-20 pointer-events-none',
          )}
        >
          <I.ChevronLeft size={20} strokeWidth={2.5} />
        </button>
        <button
          onClick={() => go(1)}
          disabled={idx === total - 1}
          className={cn(
            'absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full z-10',
            'flex items-center justify-center transition-all',
            'bg-black/40 hover:bg-white/20 text-white backdrop-blur-sm border border-white/10',
            idx === total - 1 && 'opacity-20 pointer-events-none',
          )}
        >
          <I.ChevronRight size={20} strokeWidth={2.5} />
        </button>
      </div>

      {/* Bottom panel: caption + thumbnail strip */}
      <div className="absolute bottom-0 left-0 right-0 z-10" style={{ height: 96 }}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent" />

        {/* Thumbnail strip */}
        <div
          ref={thumbStripRef}
          className="absolute top-0 left-0 right-0 flex items-center gap-1.5 px-3 overflow-x-auto scrollbar-hide"
          style={{ height: 52 }}
        >
          {steps.map((s, i) => {
            const url = s.screenshotKey && session.assets?.[s.screenshotKey]
              ? session.assets[s.screenshotKey] : null;
            return (
              <button
                key={s.id}
                onClick={() => { dirRef.current = i > idx ? 1 : -1; setStepIndex(i); tickRef.current = 0; }}
                className={cn(
                  'shrink-0 rounded overflow-hidden border-2 transition-all duration-200',
                  i === idx
                    ? 'border-white scale-105 shadow-[0_0_10px_rgba(255,255,255,0.3)]'
                    : 'border-white/20 opacity-60 hover:opacity-90 hover:border-white/50',
                )}
                style={{ width: 56, height: 36, background: stepBg(244 + (i * 11) % 80) }}
                aria-label={`Slide ${i + 1}`}
              >
                {url && (
                  <img src={url} alt="" className="w-full h-full object-cover" draggable={false} />
                )}
              </button>
            );
          })}
        </div>

        {/* Caption bar */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 pb-3 pt-1">
          <p className="text-white text-[13px] font-medium leading-snug truncate max-w-[70%] drop-shadow">
            {caption || session.aiOutputs?.title || ''}
          </p>
          <span className="text-white/50 text-[12px] font-semibold tabular-nums shrink-0 ml-3">
            {idx + 1} / {total}
          </span>
        </div>
      </div>

      <Watermark />
    </div>
  );
};

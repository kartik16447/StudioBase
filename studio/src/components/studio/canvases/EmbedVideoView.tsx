import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStudioStore } from '../../../store/useStudioStore';
import { I } from '../../icons';
import { cn } from '../../ui';
import { NavArrow, Watermark } from './EmbedSOPView';
import { displayText } from '../../../lib/textUtils';

const STEP_DURATION_MS = 3000; // ms per step in autoplay
const SPRING = { type: 'spring' as const, stiffness: 280, damping: 30 };

function stepBg(hue: number) {
  return `radial-gradient(ellipse at 30% 30%, hsl(${hue} 65% 32%) 0%, hsl(${hue} 45% 18%) 60%, hsl(${hue} 35% 10%) 100%)`;
}

export const EmbedVideoView: React.FC = () => {
  const session = useStudioStore(state => state.session);
  const focusedStepIndex = useStudioStore(state => state.focusedStepIndex);
  const setStepIndex = useStudioStore(state => state.setStepIndex);

  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0); // 0–1 within current step
  const [imgLoaded, setImgLoaded] = useState(false);
  const dirRef = useRef<1 | -1>(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef(0);
  const TICK_MS = 50;

  const steps = session?.steps ?? [];
  const total = steps.length;
  const idx = total > 0 ? Math.max(0, Math.min(total - 1, focusedStepIndex)) : 0;
  const hue = 244 + (idx * 11) % 80;

  useEffect(() => { setImgLoaded(false); setProgress(0); }, [idx]);

  // Autoplay ticker
  useEffect(() => {
    if (!playing || total === 0) return;
    intervalRef.current = setInterval(() => {
      tickRef.current += TICK_MS;
      const p = Math.min(tickRef.current / STEP_DURATION_MS, 1);
      setProgress(p);
      if (p >= 1) {
        tickRef.current = 0;
        setProgress(0);
        if (idx < total - 1) {
          dirRef.current = 1;
          setStepIndex(idx + 1);
        } else {
          setPlaying(false); // end of slideshow
        }
      }
    }, TICK_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, idx, total]);

  // Reset ticker on manual nav
  const go = (delta: 1 | -1) => {
    const next = idx + delta;
    if (next < 0 || next >= total) return;
    tickRef.current = 0;
    dirRef.current = delta;
    setStepIndex(next);
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

  const isEnd = idx === total - 1 && !playing;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center overflow-hidden relative select-none" style={{ background: stepBg(hue) }}>
      {/* Canvas */}
      <div className="relative flex items-center justify-center w-full h-full" style={{ padding: '0 56px' }}>
        <AnimatePresence mode="wait" initial={false} custom={dirRef.current}>
          <motion.div
            key={step?.id ?? idx}
            custom={dirRef.current}
            variants={{
              enter: (dir: number) => ({ opacity: 0, x: dir * 40, scale: 0.97 }),
              center: { opacity: 1, x: 0, scale: 1 },
              exit: (dir: number) => ({ opacity: 0, x: dir * -40, scale: 0.97 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={SPRING}
            className="relative w-full flex items-center justify-center"
          >
            <div
              className="relative rounded-xl overflow-hidden shadow-[0_8px_48px_rgba(0,0,0,0.6)] w-full"
              style={{ maxHeight: 'calc(100vh - 96px)', background: stepBg(hue) }}
            >
              <div style={{ paddingTop: `${(9 / 16) * 100}%` }} />

              {screenshotUrl && (
                <img
                  key={screenshotUrl}
                  src={screenshotUrl}
                  alt={`Step ${idx + 1}`}
                  className={cn(
                    'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
                    imgLoaded ? 'opacity-100' : 'opacity-0',
                  )}
                  onLoad={() => setImgLoaded(true)}
                  draggable={false}
                />
              )}

              {/* Step text */}
              {displayText(step?.textOverride || step?.generatedText) && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-6 pb-5 pt-12">
                  <p className="text-white text-[14px] leading-relaxed font-medium drop-shadow">
                    {displayText(step.textOverride || step.generatedText)}
                  </p>
                </div>
              )}

              {/* Replay overlay */}
              {isEnd && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <button
                    onClick={() => { tickRef.current = 0; dirRef.current = -1; setStepIndex(0); setPlaying(true); }}
                    className="flex items-center gap-2 px-5 h-11 rounded-full bg-white text-black font-semibold text-[14px] hover:bg-white/90 transition-all active:scale-95"
                  >
                    <I.RotateCcw size={16} strokeWidth={2.5} />
                    Replay
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {!isEnd && <NavArrow dir="left" disabled={idx === 0} onClick={() => go(-1)} />}
        {!isEnd && <NavArrow dir="right" disabled={idx === total - 1} onClick={() => go(1)} />}
      </div>

      {/* Controls bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-10 w-full max-w-[480px] px-4">
        {/* Progress bar */}
        <div className="w-full h-1 rounded-full bg-white/15 overflow-hidden">
          {/* Overall progress */}
          <div
            className="h-full bg-white/40 rounded-full transition-none"
            style={{ width: `${((idx + progress) / total) * 100}%` }}
          />
        </div>

        {/* Playback controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setPlaying(p => !p); if (!playing) tickRef.current = 0; }}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white transition-colors border border-white/10"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <I.Pause size={14} strokeWidth={2.5} /> : <I.Play size={14} strokeWidth={2.5} />}
          </button>

          <div className="bg-black/60 backdrop-blur-sm border border-white/10 rounded-full px-3 h-6 flex items-center">
            <span className="text-[12px] font-semibold text-white/90 tabular-nums">
              {idx + 1} / {total}
            </span>
          </div>

          {/* Dot track */}
          <div className="flex items-center gap-1">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => { tickRef.current = 0; dirRef.current = i > idx ? 1 : -1; setStepIndex(i); }}
                className={cn(
                  'rounded-full transition-all duration-200',
                  i === idx ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/30 hover:bg-white/60',
                )}
                aria-label={`Jump to step ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>

      <Watermark />
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStudioStore } from '../../../store/useStudioStore';
import { I } from '../../icons';
import { cn } from '../../ui';
import { Watermark } from './EmbedSOPView';

const SPRING = { type: 'spring' as const, stiffness: 300, damping: 32 };

function stepBg(hue: number) {
  return `radial-gradient(ellipse at 30% 30%, hsl(${hue} 65% 32%) 0%, hsl(${hue} 45% 18%) 60%, hsl(${hue} 35% 10%) 100%)`;
}

const PulsingHotspot: React.FC<{ xPct: number; yPct: number }> = ({ xPct, yPct }) => (
  <div
    className="absolute pointer-events-none z-20"
    style={{ left: `${xPct}%`, top: `${yPct}%`, transform: 'translate(-50%, -50%)' }}
  >
    {/* Outer pulse ring */}
    <motion.div
      className="absolute rounded-full border-2 border-white/60"
      style={{ width: 48, height: 48, top: -24, left: -24 }}
      animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
    />
    {/* Inner solid dot */}
    <div className="w-4 h-4 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)] -translate-x-1/2 -translate-y-1/2 absolute" />
  </div>
);

export const EmbedDemoView: React.FC = () => {
  const session = useStudioStore(state => state.session);
  const focusedStepIndex = useStudioStore(state => state.focusedStepIndex);
  const setStepIndex = useStudioStore(state => state.setStepIndex);

  const [imgLoaded, setImgLoaded] = useState(false);
  const dirRef = useRef<1 | -1>(1);

  const steps = session?.steps ?? [];
  const total = steps.length;
  const idx = total > 0 ? Math.max(0, Math.min(total - 1, focusedStepIndex)) : 0;
  const hue = 244 + (idx * 11) % 80;
  const isLast = idx === total - 1;

  useEffect(() => { setImgLoaded(false); }, [idx]);

  const advance = () => {
    if (isLast) return;
    dirRef.current = 1;
    setStepIndex(idx + 1);
  };

  const replay = () => {
    dirRef.current = -1;
    setStepIndex(0);
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

  // Hotspot position — coordinates are absolute px, convert to % of viewport
  const coords = step?.coordinates;
  const hotspotX = coords && coords.viewportWidth > 0 ? (coords.x / coords.viewportWidth) * 100 : null;
  const hotspotY = coords && coords.viewportHeight > 0 ? (coords.y / coords.viewportHeight) * 100 : null;

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center overflow-hidden relative select-none"
      style={{ background: stepBg(hue) }}
      onClick={!isLast ? advance : undefined}
      style={{ cursor: isLast ? 'default' : 'pointer' }}
    >
      {/* Canvas */}
      <div className="relative flex items-center justify-center w-full h-full" style={{ padding: '0 40px' }}>
        <AnimatePresence mode="wait" initial={false} custom={dirRef.current}>
          <motion.div
            key={step?.id ?? idx}
            custom={dirRef.current}
            initial={(dir: number) => ({ opacity: 0, x: dir * 40, scale: 0.97 })}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={(dir: number) => ({ opacity: 0, x: dir * -40, scale: 0.97 })}
            transition={SPRING}
            className="relative w-full flex items-center justify-center"
          >
            <div
              className="relative rounded-xl overflow-hidden shadow-[0_8px_48px_rgba(0,0,0,0.6)] w-full"
              style={{ maxHeight: 'calc(100vh - 80px)', background: stepBg(hue) }}
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

              {/* Pulsing hotspot */}
              {hotspotX !== null && hotspotY !== null && imgLoaded && !isLast && (
                <PulsingHotspot xPct={hotspotX} yPct={hotspotY} />
              )}

              {/* "Click to continue" prompt — NOT shown on last step */}
              {!isLast && (
                <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-5 pointer-events-none">
                  <motion.div
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="inline-flex items-center gap-2 bg-black/70 backdrop-blur-sm border border-white/15 rounded-full px-4 h-8 text-white text-[12px] font-semibold"
                  >
                    Click to continue
                    <I.ArrowRight size={13} strokeWidth={2.5} />
                  </motion.div>
                </div>
              )}

              {/* Replay overlay on last step */}
              {isLast && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 gap-4">
                  <div className="text-white text-[16px] font-semibold">That's a wrap!</div>
                  <button
                    onClick={(e) => { e.stopPropagation(); replay(); }}
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
      </div>

      {/* Step counter — bottom center */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10 pointer-events-none">
        <div className="bg-black/60 backdrop-blur-sm border border-white/10 rounded-full px-3 h-6 flex items-center">
          <span className="text-[12px] font-semibold text-white/90 tabular-nums">{idx + 1} / {total}</span>
        </div>
        <div className="flex items-center gap-1">
          {steps.map((_, i) => (
            <div
              key={i}
              className={cn(
                'rounded-full transition-all duration-300',
                i === idx ? 'w-4 h-1.5 bg-white' : i < idx ? 'w-1.5 h-1.5 bg-white/60' : 'w-1.5 h-1.5 bg-white/25',
              )}
            />
          ))}
        </div>
      </div>

      <Watermark />
    </div>
  );
};

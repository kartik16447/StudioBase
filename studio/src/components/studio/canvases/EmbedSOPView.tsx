import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStudioStore } from '../../../store/useStudioStore';
import { I } from '../../icons';
import { cn } from '../../ui';

const SPRING = { type: 'spring' as const, stiffness: 320, damping: 34 };

// Lighter gradient palette — hue shifts per step, lightness ~28-35% range
function stepBg(hue: number) {
  return `radial-gradient(ellipse at 30% 30%, hsl(${hue} 65% 32%) 0%, hsl(${hue} 45% 18%) 60%, hsl(${hue} 35% 10%) 100%)`;
}

export const EmbedSOPView: React.FC = () => {
  const session = useStudioStore(state => state.session);
  const focusedStepIndex = useStudioStore(state => state.focusedStepIndex);
  const setStepIndex = useStudioStore(state => state.setStepIndex);
  const dirRef = useRef<1 | -1>(1);
  const [imgLoaded, setImgLoaded] = useState(false);

  const steps = session?.steps ?? [];
  const total = steps.length;
  const idx = total > 0 ? Math.max(0, Math.min(total - 1, focusedStepIndex)) : 0;
  const hue = 244 + (idx * 11) % 80;

  // Reset loaded state when step changes
  useEffect(() => { setImgLoaded(false); }, [idx]);

  const go = (delta: 1 | -1) => {
    const next = idx + delta;
    if (next < 0 || next >= total) return;
    dirRef.current = delta;
    setStepIndex(next);
  };

  useEffect(() => {
    if (!session) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [idx, total, session]);

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

  return (
    <div className="w-full h-full flex flex-col items-center justify-center overflow-hidden relative select-none" style={{ background: stepBg(hue) }}>
      <div className="relative flex items-center justify-center w-full h-full" style={{ padding: '0 56px' }}>
        <AnimatePresence mode="wait" initial={false} custom={dirRef.current}>
          <motion.div
            key={step?.id ?? idx}
            custom={dirRef.current}
            initial={(dir: number) => ({ opacity: 0, x: dir * 48, scale: 0.97 })}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={(dir: number) => ({ opacity: 0, x: dir * -48, scale: 0.97 })}
            transition={SPRING}
            className="relative w-full flex items-center justify-center"
          >
            <div
              className="relative rounded-xl overflow-hidden shadow-[0_8px_48px_rgba(0,0,0,0.6)] w-full"
              style={{ maxHeight: 'calc(100vh - 80px)', background: stepBg(hue) }}
            >
              {/* Aspect ratio sizer */}
              <div style={{ paddingTop: `${(9 / 16) * 100}%` }} />

              {/* Screenshot */}
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

              {/* Step text overlay */}
              {(step?.textOverride || step?.generatedText) && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-6 pb-5 pt-12">
                  <p className="text-white text-[14px] leading-relaxed font-medium drop-shadow">
                    {step.textOverride || step.generatedText}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        <NavArrow dir="left" disabled={idx === 0} onClick={() => go(-1)} />
        <NavArrow dir="right" disabled={idx === total - 1} onClick={() => go(1)} />
      </div>

      <BottomBar idx={idx} total={total} steps={steps} dirRef={dirRef} setStepIndex={setStepIndex} />
      <Watermark />
    </div>
  );
};

// ─── Shared sub-components (reused by Video + Demo views) ────────────────────

export const NavArrow: React.FC<{ dir: 'left' | 'right'; disabled: boolean; onClick: () => void }> = ({ dir, disabled, onClick }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={cn(
      'absolute top-1/2 -translate-y-1/2 w-10 h-10 rounded-full',
      'flex items-center justify-center transition-all duration-150',
      'bg-white/10 hover:bg-white/22 text-white backdrop-blur-sm border border-white/10',
      dir === 'left' ? 'left-3' : 'right-3',
      disabled && 'opacity-20 pointer-events-none',
    )}
    aria-label={dir === 'left' ? 'Previous step' : 'Next step'}
  >
    {dir === 'left'
      ? <I.ChevronLeft size={20} strokeWidth={2.5} />
      : <I.ChevronRight size={20} strokeWidth={2.5} />}
  </button>
);

export const BottomBar: React.FC<{
  idx: number; total: number;
  steps: any[];
  dirRef: React.MutableRefObject<1 | -1>;
  setStepIndex: (i: number) => void;
}> = ({ idx, total, steps, dirRef, setStepIndex }) => (
  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
    <div className="bg-black/60 backdrop-blur-sm border border-white/10 rounded-full px-3 h-6 flex items-center">
      <span className="text-[12px] font-semibold text-white/90 tabular-nums">{idx + 1} / {total}</span>
    </div>
    <div className="flex items-center gap-1">
      {steps.map((_, i) => (
        <button
          key={i}
          onClick={() => { dirRef.current = i > idx ? 1 : -1; setStepIndex(i); }}
          className={cn(
            'rounded-full transition-all duration-200',
            i === idx ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/30 hover:bg-white/60',
          )}
          aria-label={`Go to step ${i + 1}`}
        />
      ))}
    </div>
  </div>
);

export const Watermark: React.FC = () => (
  <a
    href="https://studiobase.app"
    target="_blank"
    rel="noopener noreferrer"
    className="absolute bottom-4 right-4 flex items-center gap-1.5 text-white/30 hover:text-white/60 transition-colors z-10"
  >
    <div className="w-4 h-4 rounded-[4px] bg-white/20 flex items-center justify-center text-[8px] font-bold">S</div>
    <span className="text-[10px] font-medium tracking-tight">Made with StudioBase</span>
  </a>
);

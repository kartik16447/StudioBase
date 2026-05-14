import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStudioStore } from '../../../store/useStudioStore';
import { I } from '../../../components/icons';
import { ScreenshotPlaceholder } from '../../../components/ui';
import { handleSOPVideoExport } from './VideoCanvas';

export const DemoCanvas: React.FC = () => {
  const session = useStudioStore(state => state.session);
  const setActiveView = useStudioStore(state => state.setActiveView);
  const brand = useStudioStore(state => state.brand);
  const isExporting = useStudioStore(state => state.isExporting);
  const exportTrigger = useStudioStore(state => state.exportTrigger);

  const [stepIndex, setStepIndex] = React.useState(0);
  const [showChapter, setShowChapter] = React.useState<string | null>(null);
  const demoRef = React.useRef<HTMLDivElement>(null);

  // Listen for global export trigger
  useEffect(() => {
    if (exportTrigger > 0 && !isExporting && useStudioStore.getState().activeView === 'demo') {
      handleSOPVideoExport();
    }
  }, [exportTrigger]);

  const steps = session?.steps || [];
  const step = steps[stepIndex];
  const chapterMap = new Map(
    (session?.metadata?.chapterBreaks || []).map(c => [c.afterStepId, c])
  );

  const advance = React.useCallback(() => {
    const chapter = chapterMap.get(step?.id);
    if (chapter) {
      setShowChapter(chapter.chapterTitle);
      setTimeout(() => {
        setShowChapter(null);
        setStepIndex(i => Math.min(steps.length - 1, i + 1));
      }, 2000);
      return;
    }
    setStepIndex(i => Math.min(steps.length - 1, i + 1));
  }, [step, steps.length, chapterMap]);

  const retreat = React.useCallback(() => {
    setStepIndex(i => Math.max(0, i - 1));
  }, []);


  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveView('sop');
      if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); advance(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); retreat(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [advance, retreat, setActiveView]);

  if (!session || !step) return null;

  const coords = step.data?.coordinates;
  const hotspotX = coords ? (coords.x / (coords.viewportWidth || 1440)) * 100 : 50;
  const hotspotY = coords ? (coords.y / (coords.viewportHeight || 900)) * 100 : 50;
  const stepText = step.textOverride || step.generatedText || '';

  return (
    <div
      ref={demoRef}
      className="flex-1 relative bg-black flex flex-col overflow-hidden"
      onClick={advance}
      style={{ cursor: 'pointer' }}
    >
      {/* Screenshot fullscreen */}
      <div className="absolute inset-0">
        <ScreenshotPlaceholder
          step={step}
          session={session}
          showChrome={false}
          aspect="16/9"
          rounded=""
          mode="stage"
          className="w-full h-full !shadow-none"
        />
      </div>

      {/* Hotspot */}
      {coords && (
        <div
          className="absolute z-10 pointer-events-none"
          style={{ left: `${hotspotX}%`, top: `${hotspotY}%`, transform: 'translate(-50%, -50%)' }}
        >
          <div
            className="w-8 h-8 rounded-full border-4 border-white shadow-lg"
            style={{
              background: brand.primaryColor + '99',
              animation: 'demo-pulse 1.4s ease-in-out infinite',
            }}
          />
          {stepText && (
            <div
              className="absolute left-1/2 -translate-x-1/2 mt-3 top-full bg-black/80 text-white text-[13px] leading-snug px-3 py-2 rounded-lg shadow-xl max-w-[260px] text-center pointer-events-none"
              style={{ whiteSpace: 'pre-wrap' }}
            >
              {stepText}
            </div>
          )}
        </div>
      )}

      {/* Chapter card */}
      <AnimatePresence>
        {showChapter && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${brand.primaryColor}e6, ${brand.primaryColor})` }}
          >
            <div className="text-center text-white">
              <p className="text-sm font-semibold opacity-70 uppercase tracking-widest mb-3">Chapter</p>
              <h2 className="text-3xl font-bold">{showChapter}</h2>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress dots */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20 pointer-events-none">
        {steps.map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-200"
            style={{
              width: i === stepIndex ? 20 : 8,
              height: 8,
              background: i === stepIndex ? '#fff' : 'rgba(255,255,255,0.4)',
            }}
          />
        ))}
      </div>

      {!isExporting ? (
        <button
          onClick={(e) => { e.stopPropagation(); useStudioStore.getState().triggerExport(); }}
          className="absolute bottom-16 right-4 z-20 h-8 px-3 rounded-pill
                     bg-black/60 text-white/80 text-[12px] font-semibold
                     hover:bg-black/80 transition-colors flex items-center gap-1.5"
        >
          <I.Download size={13} /> Export (.webm)
        </button>
      ) : (
        <div className="absolute bottom-16 right-4 z-20 h-8 px-3 rounded-pill
                        bg-black/60 text-white/60 text-[12px] font-semibold
                        flex items-center gap-1.5">
          <I.Loader size={13} className="animate-spin" /> Recording…
        </div>
      )}

      {/* Escape hint */}
      <div className="absolute top-4 right-4 z-20 pointer-events-none">
        <div className="bg-black/50 text-white/60 text-[11px] px-2 py-1 rounded font-mono">
          ESC to exit
        </div>
      </div>
    </div>
  );
};

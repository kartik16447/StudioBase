import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStudioStore } from '../store/useStudioStore';
import { I } from '../components/icons';
import { 
  cn, Badge, Kbd, AIShimmer, AIButton, DotGrid, ScreenshotPlaceholder, Button 
} from '../components/ui';
import { 
  StudioTopBar, FloatingToolbar, SummaryCallout, StepCard, ChapterBreak 
} from '../components/studio';
import { 
  ScriptPanel, BrandPanel, ChaptersPanel, AIVoicePanel, MusicPanel, VisualsPanel, ZoomsPanel, ElementsPanel 
} from '../components/studio/Panels';
import type { Step, ChapterBreak as IChapterBreak } from '../../../shared/types/session';

const STUDIO_TABS = [
  { id: 'script',   label: 'Script',   icon: I.FileText, component: ScriptPanel },
  { id: 'brand',    label: 'Brand',    icon: I.Palette,  component: BrandPanel },
  { id: 'chapters', label: 'Chapters', icon: I.Bookmark, component: ChaptersPanel },
  { id: 'voice',    label: 'AI Voice', icon: I.Mic,      component: AIVoicePanel },
  { id: 'music',    label: 'Music',    icon: I.Music2,   component: MusicPanel },
  { id: 'visuals',  label: 'Visuals',  icon: I.Image,    component: VisualsPanel },
  { id: 'zooms',    label: 'Zooms',    icon: I.ZoomIn,   component: ZoomsPanel },
  { id: 'elements', label: 'Library',  icon: I.Layers,   component: ElementsPanel },
];

export const StudioPage: React.FC = () => {
  const { navigate, activeTab, isPanelOpen, activeView, setActiveTab, togglePanel, session } = useStudioStore();
  const activeTabItem = STUDIO_TABS.find(t => t.id === activeTab) || STUDIO_TABS[0];

  if (!session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-20 text-center">
        <div className="w-16 h-16 rounded-full bg-surface-2 flex items-center justify-center text-text-3 mb-4">
          <I.Library size={32} />
        </div>
        <h2 className="text-[22px] font-semibold text-text">No session selected</h2>
        <p className="text-[14px] text-text-2 mt-2 max-w-[320px]">
          Please select a capture session from your library to start editing in the studio.
        </p>
        <Button variant="primary" size="md" className="mt-6" onClick={() => navigate('home')}>
          Go to library
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <StudioTopBar />
      <div className="flex-1 flex min-h-0">
        
        {/* Left Panel */}
        <AnimatePresence initial={false}>
          {isPanelOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 480, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="shrink-0 border-r border-border bg-surface flex flex-col overflow-hidden"
            >
              <div className="px-3 pt-2 border-b border-border overflow-x-auto">
                <div className="flex items-center gap-0 min-w-max">
                  {STUDIO_TABS.map(t => {
                    const active = activeTab === t.id;
                    const isLocked = ['voice', 'music', 'visuals', 'zooms', 'elements'].includes(t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => setActiveTab(t.id)}
                        className={cn(
                          'relative inline-flex items-center gap-1.5 h-11 px-3 text-[12.5px] font-medium transition-colors',
                          active ? 'text-text' : 'text-text-2 hover:text-text',
                          isLocked && 'opacity-60',
                        )}
                      >
                        <t.icon size={14} strokeWidth={1.9} />
                        {t.label}
                        {isLocked && <I.Lock size={10} className="text-text-3" />}
                        {active && (
                          <motion.span
                            layoutId="tab-indicator"
                            className="absolute -bottom-px left-2 right-2 h-[2px] rounded-full bg-primary"
                            transition={{ type:'spring', stiffness:420, damping:34 }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTabItem.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                    className="h-full"
                  >
                    <activeTabItem.component />
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Canvas */}
        <section className="flex-1 min-w-0 flex flex-col relative">
          <button
            onClick={togglePanel}
            className="absolute top-3 left-3 z-20 glass rounded-pill h-8 px-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-text-2 hover:text-text"
          >
            {isPanelOpen ? <I.ChevronLeft size={14} /> : <I.ChevronRight size={14} />}
            <span>{isPanelOpen ? 'Collapse' : 'Open panel'}</span>
            <Kbd>⌘\</Kbd>
          </button>

          {activeView === 'sop' ? <SOPCanvas /> : <VideoCanvas />}
        </section>
      </div>
      <FloatingToolbar />
    </div>
  );
};

const SOPCanvas: React.FC = () => {
  const { session, focusedStepId, setFocusStep } = useStudioStore();
  const [isProcessing, setIsProcessing] = useState(false);

  if (!session) return null;

  const chapterMap = new Map((session.metadata.chapterBreaks || []).map(c => [c.afterStepId, c]));
  
  type SOPItem = 
    | { kind: 'step'; step: Step; idx: number }
    | { kind: 'chapter'; chapter: IChapterBreak };

  const items: SOPItem[] = [];
  session.steps.forEach((s, i) => {
    items.push({ kind: 'step', step: s, idx: i });
    if (chapterMap.has(s.id)) items.push({ kind: 'chapter', chapter: chapterMap.get(s.id)! });
  });

  return (
    <div className="flex-1 min-h-0 scroll-y bg-bg relative">
      <DotGrid className="!fixed" glowRadius={500} />
      <div className="max-w-[860px] mx-auto px-6 pt-16 pb-32 relative z-10">
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6"
        >
          <Badge tone="primary" size="md" icon={I.Sparkles}>AI generated · just now</Badge>
          <h1 className="text-[38px] font-semibold text-text tracking-tight leading-[1.15] mt-3" style={{ textWrap: 'balance' as any }}>
            {session.aiOutputs.title}
          </h1>
          <div className="flex items-center gap-3 mt-4 text-[13px] text-text-2">
            <span className="inline-flex items-center gap-1.5"><I.FileText size={13} /> {session.metadata.stepCount} steps</span>
            <span className="text-text-3">·</span>
            <span className="inline-flex items-center gap-1.5"><I.Clock size={13} /> 3:04</span>
            <span className="text-text-3">·</span>
            <span className="inline-flex items-center gap-1.5"><I.Globe size={13} /> linear.app</span>
            <span className="text-text-3">·</span>
            <span>captured May 9, 2026</span>
          </div>
        </motion.header>

        <SummaryCallout session={session} />

        <div className="my-6 flex items-center justify-end">
          <AIButton
            isProcessing={isProcessing}
            icon={I.Sparkles}
            onClick={() => {
              setIsProcessing(true);
              setTimeout(() => setIsProcessing(false), 3000);
            }}
          >
            {isProcessing ? 'Generating AI Content…' : 'Generate AI Content'}
          </AIButton>
        </div>

        <AIShimmer isActive={isProcessing} className="rounded-card">
          <div className="space-y-6">
            {items.map((it, i) => (
              it.kind === 'step' ? (
                <StepCard
                  key={it.step.id}
                  step={it.step}
                  index={it.idx}
                  hue={244 + (it.idx * 11) % 80}
                  focused={focusedStepId === it.step.id}
                  onFocus={() => setFocusStep(it.step.id)}
                />
              ) : (
                <ChapterBreak 
                  key={'ch-' + i} 
                  index={(items.slice(0, i+1).filter(x => x.kind === 'chapter').length) + 1} 
                  title={it.chapter.chapterTitle} 
                />
              )
            ))}
          </div>
        </AIShimmer>

        <div className="mt-12 rounded-card bg-surface p-8 text-center shadow-card">
          <div className="w-12 h-12 mx-auto rounded-full bg-primary-light flex items-center justify-center text-primary mb-3">
            <I.CheckCircle size={22} strokeWidth={2} />
          </div>
          <h3 className="text-[20px] font-semibold text-text">You're all done</h3>
          <p className="text-[13.5px] text-text-2 mt-1">Publish to share with your team or export to PDF / Notion.</p>
          <div className="flex items-center justify-center gap-2 mt-5">
            <Button variant="ghost" size="md" icon={I.Download}>Export PDF</Button>
            <Button variant="primary" size="md" icon={I.Share2}>Publish & share</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const VideoCanvas: React.FC = () => {
  return (
    <div className="flex-1 studio-gradient flex flex-col items-center justify-center px-10">
      <div className="relative w-full max-w-4xl aspect-video rounded-img shadow-card-lifted bg-white overflow-hidden">
        <ScreenshotPlaceholder aspect="16/9" rounded="" className="w-full h-full" />
        <button className="absolute inset-0 m-auto w-20 h-20 rounded-full glass flex items-center justify-center hover:scale-105 transition">
          <I.Play size={28} className="text-text translate-x-0.5" />
        </button>
      </div>
      <div className="mt-6 text-center max-w-md">
        <Badge tone="primary" size="md" icon={I.Lock}>Phase 3</Badge>
        <h3 className="text-[20px] font-semibold text-text mt-3">Cinematic video preview</h3>
        <p className="text-[13.5px] text-text-2 mt-1">Auto-zoom, smart cursor, AI voiceover and music will render right here when Phase 3 lands.</p>
      </div>
    </div>
  );
};

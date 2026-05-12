import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStudioStore } from '../store/useStudioStore';
import { I } from '../components/icons';
import { 
  cn, Badge, Kbd, AIShimmer, AIButton, DotGrid, ScreenshotPlaceholder, Button 
} from '../components/ui';
import { 
  StudioTopBar, SummaryCallout, StepCard, ChapterBreak 
} from '../components/studio';
import { 
  ScriptPanel, BrandPanel, ChaptersPanel, AIVoicePanel, MusicPanel, VisualsPanel, ZoomsPanel, ElementsPanel 
} from '../components/studio/Panels';
import type { Step, ChapterBreak as IChapterBreak } from '../../../shared/types/session';
import { BACKEND_URL } from '../../../shared/constants';

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
  const { 
    navigate, 
    activeTab, 
    isPanelOpen, 
    activeView, 
    setActiveTab, 
    togglePanel, 
    session, 
    fetchSession, 
    setSession,
    sessionError 
  } = useStudioStore();

  const activeTabItem = STUDIO_TABS.find(t => t.id === activeTab) || STUDIO_TABS[0];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session');
    if (sessionId) {
      fetchSession(sessionId);
    } else if (!session) {
      // Fallback to sample data for development when no real session provided
      import('../data/sample').then(m => setSession(m.SAMPLE_SESSION));
    }
  }, []);

  if (sessionError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-20 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Session</h2>
        <p className="text-gray-600 max-w-md">{sessionError}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

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

  if (session.steps.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-20 text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-6">
          <I.FileText size={32} className="text-amber-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">No steps captured</h2>
        <p className="text-gray-600 max-w-md">
          This session was recorded but no interactions were captured. Make sure you click, type, or navigate during the recording, then record a new session.
        </p>
        <button
          onClick={() => window.close()}
          className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
      <StudioTopBar />
      <div className="flex-1 flex min-h-0">
        
        {/* Left Panel */}
        <AnimatePresence initial={false}>
          {isPanelOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 480, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 36 }}
              className="shrink-0 border-r border-border bg-surface flex flex-col overflow-hidden"
            >
              <div className="px-3 pt-2 border-b border-border overflow-x-auto">
                <div className="flex items-center gap-0 min-w-max">
                  {STUDIO_TABS.map(t => {
                    const active = activeTab === t.id;
                    const isLocked = ['voice', 'music', 'visuals', 'elements'].includes(t.id);
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

              <div className="flex-1 min-h-0 overflow-hidden relative">
                <AnimatePresence mode="sync">
                  <motion.div
                    key={activeTabItem.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                    className="absolute inset-0 overflow-y-auto"
                  >
                    <activeTabItem.component />
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Canvas */}
        <motion.section 
          layout
          transition={{ type: 'spring', stiffness: 280, damping: 36 }}
          className="flex-1 min-w-0 flex flex-col relative"
        >
          <button
            onClick={togglePanel}
            className="absolute top-3 left-3 z-20 glass rounded-pill h-8 px-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-text-2 hover:text-text"
          >
            {isPanelOpen ? <I.ChevronLeft size={14} /> : <I.ChevronRight size={14} />}
            <span>{isPanelOpen ? 'Collapse' : 'Open panel'}</span>
            <Kbd>⌘\</Kbd>
          </button>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex-1 flex flex-col min-h-0"
            >
              {activeView === 'sop' ? <SOPCanvas /> : <VideoCanvas />}
            </motion.div>
          </AnimatePresence>
        </motion.section>
      </div>
    </div>
  );
};

const SOPCanvas: React.FC = () => {
  const { session, focusedStepId, setFocusStep, setStepIndex, scrollTrigger, triggerScroll } = useStudioStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const stepRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll the focused card into view when focus changes
  useEffect(() => {
    if (!focusedStepId || !session) return;
    const el = stepRefs.current.get(focusedStepId);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [scrollTrigger]);

  // ArrowUp / ArrowDown keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!session || !focusedStepId) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      // Don't steal arrow keys from text inputs / textareas
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      e.preventDefault();
      const currentIndex = session.steps.findIndex(s => s.id === focusedStepId);
      if (currentIndex === -1) return;
      const nextIndex = e.key === 'ArrowDown'
        ? Math.min(session.steps.length - 1, currentIndex + 1)
        : Math.max(0, currentIndex - 1);
      if (nextIndex !== currentIndex) {
        setFocusStep(session.steps[nextIndex].id);
        setStepIndex(nextIndex);
        triggerScroll();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [session, focusedStepId, setFocusStep, setStepIndex, triggerScroll]);


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
    <div ref={containerRef} className="flex-1 min-h-0 scroll-y bg-bg relative">
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
            onClick={async () => {
              if (!session) return;
              const sessionId = session.sessionId;
              const token = sessionStorage.getItem('sb_token');
              setIsProcessing(true);
              try {
                await fetch(`${BACKEND_URL}/pipeline/trigger`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  },
                  body: JSON.stringify({ sessionId, requestedOutputs: { sop: true, demo: true } }),
                });
              } finally {
                setIsProcessing(false);
              }
            }}
          >
            {isProcessing ? 'Generating AI Content…' : 'Generate AI Content'}
          </AIButton>
        </div>

        <AIShimmer isActive={isProcessing} className="rounded-card">
          <div className="space-y-6">
            {items.map((it, i) => (
              it.kind === 'step' ? (
                <div key={it.step.id} ref={el => { if (el) stepRefs.current.set(it.step.id, el); else stepRefs.current.delete(it.step.id); }}>
                  <StepCard
                    step={it.step}
                    index={it.idx}
                    hue={244 + (it.idx * 11) % 80}
                    focused={focusedStepId === it.step.id}
                    onFocus={() => {
                      setFocusStep(it.step.id);
                      setStepIndex(it.idx);
                    }}
                  />
                </div>
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
  const { 
    session, 
    currentStepIndex, 
    isPlaying, 
    playbackRate,
    setPlaying, 
    setStepIndex 
  } = useStudioStore();

  const [audio] = useState(new Audio());
  const [isEnded, setIsEnded] = useState(false);
  const [zoomPhase, setZoomPhase] = useState<'in' | 'hold' | 'out'>('in');
  const [showChapterCard, setShowChapterCard] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);

  const steps = session?.steps || [];
  const currentStep = steps[currentStepIndex];
  const chapterMap = new Map(
    (session?.metadata?.chapterBreaks || []).map(c => [c.afterStepId, c])
  );

  const isSameContext = (s1: any, s2: any) => {
    if (!s1 || !s2) return false;
    return s1.url === s2.url || s1.pageTitle === s2.pageTitle;
  };

  const prevStep = steps[currentStepIndex - 1];
  const sameContext = isSameContext(prevStep, currentStep);

  // Normalization & Target Calculation
  const getTarget = (step: any) => {
    const manual = step?.animationTarget;
    const coords = step?.data?.coordinates;
    const useAuto = !manual || manual.zoomScale <= 1;

    if (useAuto && coords) {
      return {
        centerX: Math.max(15, Math.min(85, (coords.x / (coords.viewportWidth || 1440)) * 100)),
        centerY: Math.max(15, Math.min(85, (coords.y / (coords.viewportHeight || 900)) * 100)),
        zoomScale: 1.55,
      };
    }
    return manual || { centerX: 50, centerY: 50, zoomScale: 1 };
  };

  const target = getTarget(currentStep);
  const hasZoom = target.zoomScale > 1;

  // New Camera Math: translate(tx, ty) scale(scale)
  // Order: Translate BEFORE scale for physical correctness
  const scale = (hasZoom || !isPlaying) ? target.zoomScale : 1;
  const tx = (50 - target.centerX) * scale;
  const ty = (50 - target.centerY) * scale;

  // Cinematic Re-orientation Sequence for New Context
  // scale: overview -> stabilize -> enter
  const cinematicSequence = sameContext 
    ? { scale, x: `${tx}%`, y: `${ty}%` }
    : {
        scale: [1.15, 1.45, scale],
        x: ['0%', '0%', `${tx}%`],
        y: ['0%', '0%', `${ty}%`],
        opacity: [0, 1, 1]
      };

  const springTransition = {
    type: 'spring' as const,
    stiffness: 45, // Decreased for slower, more deliberate movement
    damping: 22,   // Increased for smoother settling
    mass: 1.2,     // Added a bit more weight/inertia
    restDelta: 0.001
  };

  // Reset zoom phase on context change
  useEffect(() => {
    if (!hasZoom) {
      setZoomPhase('in');
      return;
    }
    if (!sameContext) {
      setZoomPhase('in');
      const inTimer = setTimeout(() => setZoomPhase('hold'), 600);
      return () => clearTimeout(inTimer);
    }
  }, [currentStepIndex, hasZoom, sameContext]);

  const advanceStep = React.useCallback(() => {
    const chapter = chapterMap.get(currentStep?.id);
    if (chapter) {
      setShowChapterCard(chapter.chapterTitle);
      setTimeout(() => {
        setShowChapterCard(null);
        setTimeout(() => {
          if (currentStepIndex < steps.length - 1) {
            setStepIndex(currentStepIndex + 1);
          } else {
            setPlaying(false);
            setIsEnded(true);
          }
        }, 300);
      }, 2000);
      return;
    }

    // Smart Context Advance: No zoom-out if context is same
    const nextStep = steps[currentStepIndex + 1];
    const willStayInContext = isSameContext(currentStep, nextStep);

    if (hasZoom && !willStayInContext) {
      setZoomPhase('out'); 
      setTimeout(() => {
        if (currentStepIndex < steps.length - 1) {
          setStepIndex(currentStepIndex + 1);
        } else {
          setPlaying(false);
          setIsEnded(true);
        }
      }, 400);
    } else {
      if (currentStepIndex < steps.length - 1) {
        setStepIndex(currentStepIndex + 1);
      } else {
        setPlaying(false);
        setIsEnded(true);
      }
    }
  }, [currentStepIndex, steps.length, hasZoom, currentStep, chapterMap, setStepIndex, setPlaying]);

  // Voiceover playback
  useEffect(() => {
    if (!isPlaying) {
      audio.pause();
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    if (!currentStep?.voiceoverKey) {
      timer = setTimeout(() => advanceStep(), 3000);
    } else {
      const url = `${BACKEND_URL}/assets/${currentStep.voiceoverKey}`;
      if (audio.src !== url) {
        audio.src = url;
      }
      audio.playbackRate = playbackRate;
      audio.play().catch(console.error);

      const handleEnded = () => advanceStep();
      audio.addEventListener('ended', handleEnded);
      return () => {
        audio.removeEventListener('ended', handleEnded);
      };
    }

    return () => { if (timer) clearTimeout(timer); };
  }, [currentStepIndex, isPlaying, playbackRate, steps.length, currentStep?.voiceoverKey, advanceStep]);

  // Synthetic cursor positions
  const prevCoords = prevStep?.data?.coordinates;
  const currCoords = currentStep?.data?.coordinates;

  const cursorStartX = prevCoords
    ? (prevCoords.x / (prevCoords.viewportWidth || 1440)) * 100 : 50;
  const cursorStartY = prevCoords
    ? (prevCoords.y / (prevCoords.viewportHeight || 900)) * 100 : 50;
  const cursorEndX = currCoords
    ? (currCoords.x / (currCoords.viewportWidth || 1440)) * 100 : 50;
  const cursorEndY = currCoords
    ? (currCoords.y / (currCoords.viewportHeight || 900)) * 100 : 50;

  // Export via MediaRecorder
  async function handleExport() {
    const canCapture = !!(playerRef.current as any)?.captureStream || !!(playerRef.current as any)?.mozCaptureStream;
    if (!canCapture) {
      alert('Export requires Chrome. Please open this page in Chrome to export video.');
      return;
    }
    if (!playerRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const stream = (playerRef.current as any).captureStream
        ? (playerRef.current as any).captureStream(30)
        : (playerRef.current as any).mozCaptureStream(30);

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9' : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${session?.aiOutputs?.title || 'studiobase'}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        setIsExporting(false);
      };

      recorder.start();
      setStepIndex(0);
      setPlaying(true);

      // Poll for playback end to stop recording
      const pollInterval = setInterval(() => {
        if (!useStudioStore.getState().isPlaying) {
          recorder.stop();
          clearInterval(pollInterval);
        }
      }, 500);
    } catch (err) {
      console.error('Export failed:', err);
      setIsExporting(false);
    }
  }

  if (!session) return null;

  return (
    <div className="flex-1 h-full studio-gradient flex flex-col items-center justify-start py-16 px-8 min-h-0 scroll-y">
      {/* Player */}
      <div
        ref={playerRef}
        className="relative w-full max-w-5xl rounded-img shadow-card-lifted overflow-hidden bg-[#12121a]"
        style={{ maxHeight: 'calc(100vh - 280px)', aspectRatio: '16/9' }}
      >
        {/* Vibrant Shimmering Background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Base Mesh */}
          <div className="absolute inset-0 bg-[radial-gradient(at_0%_0%,_#5e5ce644_0px,_transparent_50%),radial-gradient(at_100%_100%,_#af52de44_0px,_transparent_50%)]" />
          
          {/* High-visibility moving light beam */}
          <motion.div 
            animate={{ 
              x: ['-100%', '150%'],
              opacity: [0, 0.4, 0]
            }}
            transition={{ 
              duration: 5, 
              repeat: Infinity, 
              ease: "linear" 
            }}
            className="absolute inset-y-0 w-[500px] bg-gradient-to-r from-transparent via-primary/30 to-transparent blur-[100px] -skew-x-12"
          />

          {/* Core pulsating glow */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_#5e5ce655_0%,_transparent_60%)] animate-pulse" />
          
          <DotGrid className="opacity-30" glowRadius={500} />
        </div>
        {/* Screenshot with Hybrid Camera (Smart Context) */}
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            key={sameContext ? 'same' : currentStepIndex}
            animate={cinematicSequence}
            transition={springTransition}
            className="absolute inset-0 origin-center"
          >
            <ScreenshotPlaceholder
              step={currentStep}
              session={session}
              showChrome={false}
              aspect="16/9"
              rounded=""
              mode="stage"
              parallaxOffset={{ x: tx, y: ty }}
              className="w-full h-full !shadow-none"
            />
          </motion.div>
        </div>

        {/* Annotation Overlay */}
        <div className="absolute inset-0 pointer-events-none">
          <AnimatePresence>
            {currentStep?.annotations?.map(anno => (
              <motion.div
                key={anno.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute"
                style={{
                  left: `${anno.x}%`, top: `${anno.y}%`,
                  width: anno.width ? `${anno.width}%` : undefined,
                  height: anno.height ? `${anno.height}%` : undefined,
                }}
              >
                {anno.shape === 'box' && (
                  <div className="border-4 border-primary rounded-md w-full h-full shadow-[0_0_20px_rgba(94,92,230,0.4)]" />
                )}
                {anno.shape === 'arrow' && (
                  <div className="relative">
                    <I.ArrowUpRight size={32} className="text-primary drop-shadow-lg" />
                    {anno.text && (
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-primary text-white text-xs font-bold rounded shadow-lg whitespace-nowrap">
                        {anno.text}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Synthetic Cursor */}
        {isPlaying && currentStep?.coordinates && (
          <motion.div
            className="absolute pointer-events-none z-20"
            initial={{ left: `${cursorStartX}%`, top: `${cursorStartY}%` }}
            animate={{ left: `${cursorEndX}%`, top: `${cursorEndY}%` }}
            transition={{ duration: 0.4, ease: 'easeInOut', delay: 0.1 }}
            style={{ transform: 'translate(-4px, -4px)' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M4 2L20 12L12 13L8 22L4 2Z" fill="white" stroke="black" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
            {zoomPhase === 'in' && (
              <motion.div
                className="absolute rounded-full border-2 border-primary"
                style={{ width: 32, height: 32, top: -12, left: -12 }}
                initial={{ scale: 0, opacity: 0.8 }}
                animate={{ scale: 2, opacity: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            )}
          </motion.div>
        )}

        {/* Chapter Title Card */}
        <AnimatePresence>
          {showChapterCard && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gradient-to-br from-primary/90 to-primary flex items-center justify-center z-30"
            >
              <div className="text-center text-white">
                <p className="text-sm font-semibold opacity-70 uppercase tracking-widest mb-3">Chapter</p>
                <h2 className="text-3xl font-bold">{showChapterCard}</h2>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Player Controls Overlay */}
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300">
          <div className="p-6 flex items-center gap-4">
            <button
              onClick={() => setPlaying(!isPlaying)}
              className="w-12 h-12 rounded-full glass-dark flex items-center justify-center text-white hover:scale-105 transition active:scale-95"
            >
              {isPlaying ? <I.Pause size={20} fill="currentColor" /> : <I.Play size={20} fill="currentColor" className="translate-x-0.5" />}
            </button>

            <div className="flex-1 flex flex-col gap-1.5">
              <div className="h-1.5 rounded-full bg-white/20 overflow-hidden relative">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-primary"
                  animate={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-bold text-white/80 tracking-wider">
                <span>STEP {currentStepIndex + 1} OF {steps.length}</span>
                <span>{currentStep?.pageTitle || 'Dashboard'}</span>
              </div>
            </div>

            {/* Prev / Next */}
            <div className="flex items-center gap-2 glass-dark rounded-pill px-3 h-10">
              <button onClick={() => setStepIndex(Math.max(0, currentStepIndex - 1))} className="text-white/80 hover:text-white">
                <I.ChevronLeft size={18} />
              </button>
              <button onClick={() => setStepIndex(Math.min(steps.length - 1, currentStepIndex + 1))} className="text-white/80 hover:text-white">
                <I.ChevronRight size={18} />
              </button>
            </div>

            {/* Speed Selector */}
            <div className="flex items-center gap-1 glass-dark rounded-pill px-3 h-10">
              {[0.5, 1, 1.5, 2].map(speed => (
                <button
                  key={speed}
                  onClick={() => useStudioStore.getState().setPlaybackRate(speed)}
                  className={cn(
                    'text-[11px] font-bold px-2 py-1 rounded transition',
                    playbackRate === speed ? 'text-white' : 'text-white/50 hover:text-white/80'
                  )}
                >
                  {speed}×
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Play Overlay (Initial) */}
        {!isPlaying && currentStepIndex === 0 && !isEnded && (
          <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px] flex items-center justify-center">
            <button
              onClick={() => setPlaying(true)}
              className="w-24 h-24 rounded-full glass shadow-card-lifted flex items-center justify-center text-text hover:scale-110 transition active:scale-95 group"
            >
              <div className="w-20 h-20 rounded-full border-2 border-primary/20 flex items-center justify-center group-hover:border-primary/40 transition">
                <I.Play size={32} fill="currentColor" className="translate-x-1" />
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Caption */}
      <div className="mt-4 text-center max-w-2xl h-[72px] overflow-hidden flex flex-col justify-start">
        <h3 className="text-[20px] font-semibold text-text leading-snug line-clamp-1">{session.aiOutputs.title}</h3>
        <p className="text-[14px] text-text-2 mt-1 leading-relaxed line-clamp-2">
          {currentStep?.textOverride || currentStep?.generatedText || 'Watch this smart walkthrough generated by StudioBase AI.'}
        </p>
      </div>

      {/* Export Button */}
      <div className="mt-4">
        <Button
          variant="ghost"
          size="md"
          icon={isExporting ? I.Download : I.Download}
          onClick={handleExport}
          disabled={isExporting}
        >
          {isExporting ? 'Exporting...' : 'Export Video'}
        </Button>
      </div>
    </div>
  );
};

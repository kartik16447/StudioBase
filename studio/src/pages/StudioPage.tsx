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
    sessionError,
    brand
  } = useStudioStore();

  const activeTabItem = STUDIO_TABS.find(t => t.id === activeTab) || STUDIO_TABS[0];

  useEffect(() => {
    document.documentElement.style.setProperty('--color-primary', brand.primaryColor);
    // Convert hex to RGB for Tailwind opacity utilities (bg-primary/20 etc.)
    const hex = brand.primaryColor.replace('#', '');
    const r = parseInt(hex.substring(0,2), 16);
    const g = parseInt(hex.substring(2,4), 16);
    const b = parseInt(hex.substring(4,6), 16);
    document.documentElement.style.setProperty('--color-primary-rgb', `${r} ${g} ${b}`);
    document.documentElement.style.setProperty('--font-sans', brand.font + ', Inter, system-ui, sans-serif');
  }, [brand.primaryColor, brand.font]);

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
              {activeView === 'sop' ? <SOPCanvas /> : activeView === 'video' ? <VideoCanvas /> : <DemoCanvas />}
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


  const [isExportingVideo, setIsExportingVideo] = React.useState(false);
  const sopVideoRef = React.useRef<HTMLDivElement>(null);
  const [showEmbed, setShowEmbed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const handleSOPVideoExport = async () => {
    if (!sopVideoRef.current || isExportingVideo) return;
    const canCapture = !!(sopVideoRef.current as any).captureStream ||
                       !!(sopVideoRef.current as any).mozCaptureStream;
    if (!canCapture) { alert('Export requires Chrome.'); return; }
    setIsExportingVideo(true);

    const stream = (sopVideoRef.current as any).captureStream
      ? (sopVideoRef.current as any).captureStream(30)
      : (sopVideoRef.current as any).mozCaptureStream(30);
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
      a.download = `${session?.aiOutputs?.title || 'studiobase-sop'}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      setIsExportingVideo(false);
    };

    recorder.start();
    const stepEls = Array.from(
      sopVideoRef.current.querySelectorAll('article')
    ) as HTMLElement[];
    for (const el of stepEls) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise<void>(res => setTimeout(res, 1800));
    }
    await new Promise<void>(res => setTimeout(res, 600));
    recorder.stop();
  };

  if (!session) return null;

  const sessionId = session?.sessionId || '';
  const embedUrl = `${window.location.origin}${window.location.pathname}?session=${sessionId}`;
  const iframeCode = `<iframe\n  src="${embedUrl}&embed=1"\n  width="100%"\n  height="600"\n  frameborder="0"\n  allowfullscreen\n  title="${session?.aiOutputs?.title || 'StudioBase Walkthrough'}"\n></iframe>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(iframeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
    <div ref={sopVideoRef} className="flex-1 min-h-0 scroll-y bg-bg relative" data-print="sop">
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
          <p className="text-[13.5px] text-text-2 mt-1">
            Publish to share with your team or embed in Notion, Confluence, or any webpage.
          </p>
          <div className="flex items-center justify-center gap-2 mt-5">
            <Button
              variant="ghost"
              size="md"
              icon={I.Download}
              onClick={() => {
                const style = document.createElement('style');
                style.id = 'sb-print-style';
                style.innerHTML = `@media print {
                  body > * { display: none !important; }
                  [data-print="sop"] { display: block !important; background: white !important; padding: 32px !important; }
                  header, aside, .studio-gradient, [class*="fixed"] { display: none !important; }
                  .shadow-card { box-shadow: none !important; }
                  img { max-width: 100% !important; page-break-inside: avoid; }
                  article { page-break-inside: avoid; margin-bottom: 24px !important; }
                }`;
                document.head.appendChild(style);
                setTimeout(() => {
                  window.print();
                  setTimeout(() => document.getElementById('sb-print-style')?.remove(), 1000);
                }, 120);
              }}
            >
              Export PDF
            </Button>
            <Button
              variant="ghost"
              size="md"
              icon={I.Code2}
              onClick={() => setShowEmbed(v => !v)}
            >
              Embed
            </Button>
            <Button
              variant="ghost"
              size="md"
              icon={isExportingVideo ? I.Loader : I.Video}
              onClick={handleSOPVideoExport}
              disabled={isExportingVideo}
            >
              {isExportingVideo ? 'Recording...' : 'Export as Video (.webm)'}
            </Button>
            <Button variant="primary" size="md" icon={I.Share2}>Publish & share</Button>
          </div>

          {session.videoKey && (
            <div className="mt-8 pt-8 border-t border-border">
              <div className="flex items-center justify-center gap-3">
                <div className="flex -space-x-2">
                  <div className="w-8 h-8 rounded-full border-2 border-surface bg-primary/10 flex items-center justify-center text-primary">
                    <I.Video size={14} />
                  </div>
                </div>
                <div className="text-left">
                  <p className="text-[13px] font-semibold text-text">Full screen recording available</p>
                  <p className="text-[12px] text-text-3">Watch the real-time video of this session</p>
                </div>
                <Button 
                  variant="primary" 
                  size="sm" 
                  className="ml-4" 
                  onClick={() => useStudioStore.getState().setActiveView('video')}
                >
                  Switch to Video SOP
                </Button>
              </div>
            </div>
          )}

          <AnimatePresence>
            {showEmbed && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-6 text-left">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] font-semibold text-text-2 uppercase tracking-wider">
                      Embed code
                    </span>
                    <button
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:opacity-80 transition-opacity"
                    >
                      {copied ? <I.Check size={13} strokeWidth={2.5} /> : <I.Copy size={13} strokeWidth={2} />}
                      {copied ? 'Copied!' : 'Copy code'}
                    </button>
                  </div>
                  <pre className="bg-surface-2 rounded-sm p-4 text-[11.5px] font-mono text-text-2 overflow-x-auto whitespace-pre border border-border">
                    {iframeCode}
                  </pre>
                  <p className="text-[11.5px] text-text-3 mt-2">
                    Paste into Notion (as embed), Confluence, or any HTML page.
                    The viewer does not need to be signed in.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
    setStepIndex,
    brand
  } = useStudioStore();

  const [audio] = useState(new Audio());
  const [isEnded, setIsEnded] = useState(false);
  const [showChapterCard, setShowChapterCard] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showIntroSlide, setShowIntroSlide] = React.useState(false);
  const [introVisible, setIntroVisible] = React.useState(false);
  const [showOutroSlide, setShowOutroSlide] = React.useState(false);
  const [outroVisible, setOutroVisible] = React.useState(false);
  const [ghostText, setGhostText] = React.useState('');
  const [ghostVisible, setGhostVisible] = React.useState(false);
  const ghostIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const videoUrl = session?.videoKey ? (session.assets?.[session.videoKey] ?? null) : null;

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



  useEffect(() => {
    if (ghostIntervalRef.current) {
      clearInterval(ghostIntervalRef.current);
      ghostIntervalRef.current = null;
    }
    setGhostText('');
    setGhostVisible(false);

    if (!isPlaying) return;
    const value = currentStep?.inputValue;
    if (!value || currentStep?.action !== 'input') return;

    setGhostVisible(true);
    let i = 0;
    ghostIntervalRef.current = setInterval(() => {
      i++;
      setGhostText(value.slice(0, i));
      if (i >= value.length) {
        if (ghostIntervalRef.current) clearInterval(ghostIntervalRef.current);
        ghostIntervalRef.current = null;
      }
    }, 60);

    return () => {
      if (ghostIntervalRef.current) {
        clearInterval(ghostIntervalRef.current);
        ghostIntervalRef.current = null;
      }
    };
  }, [currentStepIndex, isPlaying]);

  // Sync video playback and seeking
  useEffect(() => {
    if (!videoRef.current || !videoUrl) return;
    const step = steps[currentStepIndex];
    if (step?.timestamp != null) {
      const targetTime = step.timestamp / 1000;
      // Only seek if far enough away to avoid jitter
      if (Math.abs(videoRef.current.currentTime - targetTime) > 0.5) {
        videoRef.current.currentTime = targetTime;
      }
    }
  }, [currentStepIndex, videoUrl]);

  useEffect(() => {
    if (!videoRef.current || !videoUrl) return;
    if (isPlaying) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying, videoUrl]);

  useEffect(() => {
    if (!videoRef.current || !videoUrl) return;
    videoRef.current.playbackRate = playbackRate;
  }, [playbackRate, videoUrl]);

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
            if (brand.showOutro) {
              setShowOutroSlide(true);
              setOutroVisible(true);
              setTimeout(() => {
                setOutroVisible(false);
                setTimeout(() => {
                  setShowOutroSlide(false);
                  setPlaying(false);
                  setShowIntroSlide(false);
                  setIsEnded(true);
                }, 400);
              }, 3000);
            } else {
              setPlaying(false);
              setShowIntroSlide(false);
              setIsEnded(true);
            }
          }
        }, 300);
      }, 2000);
      return;
    }

    // Smart Context Advance: No zoom-out if context is same
    const nextStep = steps[currentStepIndex + 1];
    const willStayInContext = isSameContext(currentStep, nextStep);

    if (hasZoom && !willStayInContext) {
      setTimeout(() => {
        if (currentStepIndex < steps.length - 1) {
          setStepIndex(currentStepIndex + 1);
        } else {
          if (brand.showOutro) {
            setShowOutroSlide(true);
            setOutroVisible(true);
            setTimeout(() => {
              setOutroVisible(false);
              setTimeout(() => {
                setShowOutroSlide(false);
                setPlaying(false);
                setShowIntroSlide(false);
                setIsEnded(true);
              }, 400);
            }, 3000);
          } else {
            setPlaying(false);
            setShowIntroSlide(false);
            setIsEnded(true);
          }
        }
      }, 400);
    } else {
      if (currentStepIndex < steps.length - 1) {
        setStepIndex(currentStepIndex + 1);
      } else {
        if (brand.showOutro) {
          setShowOutroSlide(true);
          setOutroVisible(true);
          setTimeout(() => {
            setOutroVisible(false);
            setTimeout(() => {
              setShowOutroSlide(false);
              setPlaying(false);
              setShowIntroSlide(false);
              setIsEnded(true);
            }, 400);
          }, 3000);
        } else {
          setPlaying(false);
          setShowIntroSlide(false);
          setIsEnded(true);
        }
      }
    }
  }, [currentStepIndex, steps.length, hasZoom, currentStep, chapterMap, setStepIndex, setPlaying, brand.showOutro]);

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
    if (!playerRef.current || isExporting) return;
    const canCapture = !!(playerRef.current as any).captureStream ||
                       !!(playerRef.current as any).mozCaptureStream;
    if (!canCapture) {
      alert('Export requires Chrome.');
      return;
    }
    setIsExporting(true);
    setStepIndex(0);

    await new Promise<void>(res => setTimeout(res, 300));

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
      a.download = `${session?.aiOutputs?.title || 'studiobase-video'}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      setIsExporting(false);
    };

    recorder.start();
    setPlaying(true);

    const poll = setInterval(() => {
      if (!useStudioStore.getState().isPlaying) {
        recorder.stop();
        clearInterval(poll);
      }
    }, 500);
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
            {videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full h-full object-cover"
                muted
                playsInline
                preload="auto"
              />
            ) : (
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
            )}
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
                {anno.shape === 'blur' && (
                  <div
                    className="absolute pointer-events-none w-full h-full"
                    style={{
                      backdropFilter: 'blur(12px)',
                      background: 'rgba(0,0,0,0.3)',
                    }}
                  />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Synthetic Cursor */}
        {isPlaying && currentStep?.data?.coordinates && (
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
            <AnimatePresence>
              {isPlaying && (
                <>
                  <motion.div
                    key={`ripple-1-${currentStepIndex}`}
                    className="absolute rounded-full border-2 border-primary"
                    style={{ width: 32, height: 32, top: -12, left: -12 }}
                    initial={{ scale: 0, opacity: 0.75 }}
                    animate={{ scale: 2.2, opacity: 0 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                  <motion.div
                    key={`ripple-2-${currentStepIndex}`}
                    className="absolute rounded-full border border-primary"
                    style={{ width: 32, height: 32, top: -12, left: -12 }}
                    initial={{ scale: 0, opacity: 0.5 }}
                    animate={{ scale: 2.8, opacity: 0 }}
                    transition={{ duration: 0.6, ease: 'easeOut', delay: 0.12 }}
                  />
                </>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Ghost Typing */}
        <AnimatePresence>
          {ghostVisible && ghostText && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none"
            >
              <div className="bg-black/75 backdrop-blur-sm text-white px-4 py-2 rounded-lg
                              text-[15px] font-mono shadow-card-lifted flex items-center gap-2
                              max-w-[460px] overflow-hidden">
                <I.Type size={13} className="opacity-60 shrink-0" />
                <span className="truncate">{ghostText}</span>
                <span className="w-px h-4 bg-white/80 animate-pulse shrink-0" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Intro Slide */}
        <AnimatePresence>
          {showIntroSlide && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: introVisible ? 1 : 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-0 z-30 flex flex-col items-center justify-center text-white text-center px-10"
              style={{
                background: `linear-gradient(135deg, ${brand.primaryColor}f0, ${brand.primaryColor})`
              }}
            >
              {brand.logoUrl ? (
                <img src={brand.logoUrl} className="h-14 object-contain mb-6 drop-shadow-lg" />
              ) : (
                <div className="text-5xl font-bold mb-4 tracking-tight drop-shadow-lg">
                  {session?.aiOutputs?.title}
                </div>
              )}
              <p className="text-white/70 text-[15px] font-medium tracking-wide uppercase">
                A StudioBase walkthrough
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Outro Slide */}
        <AnimatePresence>
          {showOutroSlide && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: outroVisible ? 1 : 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-0 z-30 flex flex-col items-center justify-center text-white text-center px-10"
              style={{
                background: `linear-gradient(135deg, ${brand.primaryColor}f0, ${brand.primaryColor})`
              }}
            >
              {brand.logoUrl && (
                <img src={brand.logoUrl} className="h-12 object-contain mb-6 drop-shadow-lg" />
              )}
              <div className="text-4xl font-bold mb-3 tracking-tight drop-shadow-lg">
                {session?.aiOutputs?.title}
              </div>
              {brand.watermark && (
                <p className="text-white/70 text-[15px] font-medium">{brand.watermark}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chapter Title Card */}
        <AnimatePresence>
          {showChapterCard && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center z-30"
              style={{ background: `linear-gradient(135deg, ${brand.primaryColor}e6, ${brand.primaryColor})` }}
            >
              <div className="text-center text-white">
                <p className="text-sm font-semibold opacity-70 uppercase tracking-widest mb-3">Chapter</p>
                <h2 className="text-3xl font-bold">{showChapterCard}</h2>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Watermark */}
        {brand.watermark && (
          <div
            className="absolute bottom-3 right-4 z-10 pointer-events-none"
            style={{ opacity: 0.55 }}
          >
            {brand.logoUrl
              ? <img src={brand.logoUrl} className="h-5 object-contain" />
              : <span className="text-white text-[11px] font-semibold tracking-wide">
                  {brand.watermark}
                </span>
            }
          </div>
        )}

        {/* Player Controls Overlay */}
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300">
          <div className="p-6 flex items-center gap-4">
            <button
              onClick={() => {
                if (!isPlaying && currentStepIndex === 0 && brand.showIntro) {
                  setShowIntroSlide(true);
                  setIntroVisible(true);
                  setTimeout(() => {
                    setIntroVisible(false);
                    setTimeout(() => {
                      setShowIntroSlide(false);
                      setPlaying(true);
                    }, 400);
                  }, 3000);
                } else {
                  setPlaying(!isPlaying);
                }
              }}
              className="w-12 h-12 rounded-full glass-dark flex items-center justify-center text-white hover:scale-105 transition active:scale-95"
            >
              {isPlaying ? <I.Pause size={20} fill="currentColor" /> : <I.Play size={20} fill="currentColor" className="translate-x-0.5" />}
            </button>

            <div className="flex-1 flex flex-col gap-1.5">
              <div className="h-1.5 rounded-full bg-white/20 relative" style={{ overflow: 'visible' }}>
                <motion.div
                  className="absolute inset-y-0 left-0 bg-primary rounded-full"
                  animate={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
                />
                {(session?.metadata?.chapterBreaks || []).map(c => {
                  const stepIdx = steps.findIndex(s => s.id === c.afterStepId);
                  if (stepIdx < 0) return null;
                  const pct = ((stepIdx + 1) / steps.length) * 100;
                  return (
                    <div
                      key={c.afterStepId}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
                      style={{ left: `${pct}%` }}
                      title={c.chapterTitle}
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-white border-2 shadow-sm"
                           style={{ borderColor: brand.primaryColor }} />
                    </div>
                  );
                })}
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
              onClick={() => {
                if (!isPlaying && currentStepIndex === 0 && brand.showIntro) {
                  setShowIntroSlide(true);
                  setIntroVisible(true);
                  setTimeout(() => {
                    setIntroVisible(false);
                    setTimeout(() => {
                      setShowIntroSlide(false);
                      setPlaying(true);
                    }, 400);
                  }, 3000);
                } else {
                  setPlaying(!isPlaying);
                }
              }}
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
        <h3 className="text-[20px] font-semibold text-text leading-snug line-clamp-1">
          {session.aiOutputs.title}
        </h3>
        <AnimatePresence mode="wait">
          <motion.p
            key={currentStepIndex}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="text-[14px] text-text-2 mt-1 leading-relaxed line-clamp-2"
          >
            {currentStep?.textOverride || currentStep?.generatedText || 'Watch this smart walkthrough generated by StudioBase AI.'}
          </motion.p>
        </AnimatePresence>
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
          {isExporting ? 'Exporting...' : 'Export Video (.webm)'}
        </Button>
      </div>
    </div>
  );
};

const DemoCanvas: React.FC = () => {
  const { session, setActiveView, brand } = useStudioStore();
  const [stepIndex, setStepIndex] = React.useState(0);
  const [showChapter, setShowChapter] = React.useState<string | null>(null);
  const [isExporting, setIsExporting] = React.useState(false);
  const demoRef = React.useRef<HTMLDivElement>(null);

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

  const handleDemoExport = async () => {
    if (!demoRef.current || isExporting) return;
    const canCapture = !!(demoRef.current as any).captureStream ||
                       !!(demoRef.current as any).mozCaptureStream;
    if (!canCapture) { alert('Export requires Chrome.'); return; }
    setIsExporting(true);
    setStepIndex(0);
    await new Promise<void>(res => setTimeout(res, 400));

    const stream = (demoRef.current as any).captureStream
      ? (demoRef.current as any).captureStream(30)
      : (demoRef.current as any).mozCaptureStream(30);
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
      a.download = `${session?.aiOutputs?.title || 'studiobase-demo'}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      setIsExporting(false);
    };
    recorder.start();

    const totalSteps = steps.length;
    let current = 0;
    const advanceAndRecord = () => {
      if (current >= totalSteps - 1) {
        setTimeout(() => recorder.stop(), 1500);
        return;
      }
      current++;
      setStepIndex(current);
      setTimeout(advanceAndRecord, 2500);
    };
    setTimeout(advanceAndRecord, 2000);
  };

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
          onClick={(e) => { e.stopPropagation(); handleDemoExport(); }}
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

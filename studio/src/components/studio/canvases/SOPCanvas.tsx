import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStudioStore } from '../../../store/useStudioStore';
import { I } from '../../../components/icons';
import { Badge, AIShimmer, AIButton, DotGrid, Button } from '../../../components/ui';
import { SummaryCallout, StepCard, ChapterBreak } from '../../../components/studio';
import { RenderConstants } from '../../../modules/render-engine/RenderConstants';
import { BACKEND_URL } from '../../../../../shared/constants';
import type { Step, ChapterBreak as IChapterBreak } from '../../../../../shared/types/session';

export const SOPCanvas: React.FC = () => {
  const session = useStudioStore(state => state.session);
  const focusedStepId = useStudioStore(state => state.focusedStepId);
  const setFocusStep = useStudioStore(state => state.setFocusStep);
  const setStepIndex = useStudioStore(state => state.setStepIndex);
  const scrollTrigger = useStudioStore(state => state.scrollTrigger);
  const triggerScroll = useStudioStore(state => state.triggerScroll);
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



  const sopVideoRef = React.useRef<HTMLDivElement>(null);
  const [showEmbed, setShowEmbed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);



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
      <DotGrid className="!fixed" glowRadius={RenderConstants.GLOW_RADIUS} />
      <div className="mx-auto px-6 pt-16 pb-32 relative z-10" style={{ maxWidth: RenderConstants.SOP_MAX_WIDTH }}>
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
              icon={useStudioStore.getState().isExporting ? I.Loader : I.Video}
              onClick={() => {
                useStudioStore.getState().setActiveView('video');
                setTimeout(() => {
                  useStudioStore.getState().triggerExport();
                }, 300); // Give it time to mount and find the canvas
              }}
              disabled={useStudioStore.getState().isExporting}
            >
              {useStudioStore.getState().isExporting ? 'Recording...' : 'Cinematic Export'}
            </Button>
            
            <Button
              variant="ghost"
              size="md"
              icon={I.Download}
              onClick={() => {
                const videoUrl = session.videoKey ? session.assets?.[session.videoKey] : null;
                if (videoUrl) {
                  const a = document.createElement('a');
                  a.href = videoUrl;
                  a.download = `${session.aiOutputs?.title || 'recording'}.webm`;
                  a.target = "_blank";
                  a.click();
                }
              }}
            >
              Download Raw
            </Button>

            <Button variant="primary" size="md" icon={I.Share2}>Publish & share</Button>
          </div>

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

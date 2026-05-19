import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useStudioStore } from '../../../store/useStudioStore';
import { I } from '../../../components/icons';
import { Badge, AIShimmer, AIButton, DotGrid, Button, cn } from '../../../components/ui';
import { SummaryCallout, StepCard, ChapterBreak } from '../../../components/studio';
import { RenderConstants } from '../../../modules/render-engine/RenderConstants';
import { apiClient } from '../../../lib/apiClient';
import type { Step, ChapterBreak as IChapterBreak } from '../../../../../shared/types/session';
import { CommentPanel } from '../panels/CommentPanel';
import { EmbedModal } from '../panels/EmbedModal';

export const SOPCanvas: React.FC = () => {
  const session = useStudioStore(state => state.session);
  const focusedStepId = useStudioStore(state => state.focusedStepId);
  const setFocusStep = useStudioStore(state => state.setFocusStep);
  const setStepIndex = useStudioStore(state => state.setStepIndex);
  const scrollTrigger = useStudioStore(state => state.scrollTrigger);
  const triggerScroll = useStudioStore(state => state.triggerScroll);
  
  // Phase 5 Store Hooks
  const sopStatus = useStudioStore(state => state.sopStatus);
  const publishSOP = useStudioStore(state => state.publishSOP);
  const forkSOP = useStudioStore(state => state.forkSOP);
  const shareSession = useStudioStore(state => state.shareSession);

  // Phase 6 — Comments
  const comments = useStudioStore(state => state.comments);
  const commentsPanelOpen = useStudioStore(state => state.commentsPanelOpen);
  const setCommentsPanelOpen = useStudioStore(state => state.setCommentsPanelOpen);
  const unresolvedCount = comments.filter((c) => !c.resolvedAt).length;

  const fetchSession = useStudioStore(state => state.fetchSession);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Poll every 3s after trigger until session is ready or failed
  const startPolling = (sessionId: string) => {
    console.log('[SOPCanvas] startPolling — sessionId:', sessionId);
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      console.log('[SOPCanvas] polling tick — fetching session...');
      await fetchSession(sessionId);
      const status = useStudioStore.getState().sessionStatus;
      console.log('[SOPCanvas] poll result — sessionStatus:', status);
      if (status === 'ready' || status === 'failed' || status === 'credit_exhausted') {
        console.log('[SOPCanvas] polling done — status:', status);
        clearInterval(pollingRef.current!);
        pollingRef.current = null;
        setIsProcessing(false);
      }
    }, 3000);
  };

  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);

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
  const [embedOpen, setEmbedOpen] = React.useState(false);

  if (!session) return null;

  const sopId = session.sopId ?? null;

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
    <div ref={sopVideoRef} className="flex-1 min-h-0 overflow-y-auto bg-bg relative" data-print="sop">
      <CommentPanel />
      <EmbedModal open={embedOpen} onClose={() => setEmbedOpen(false)} />
      <DotGrid className="!fixed" glowRadius={RenderConstants.GLOW_RADIUS} />
      <div className="mx-auto px-6 pt-16 pb-32 relative z-10" style={{ maxWidth: RenderConstants.SOP_MAX_WIDTH }}>
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6"
        >
          <Badge tone="primary" size="md" icon={I.Sparkles}>AI generated · just now</Badge>

          {/* Action bar — sits above the title so it's always visible */}
          <div className="flex items-center gap-2 mt-3 mb-2">
            {/* Comments toggle — purple, always prominent */}
            <button
              onClick={() => setCommentsPanelOpen(!commentsPanelOpen)}
              className={cn(
                'relative flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-all',
                commentsPanelOpen
                  ? 'bg-primary border-primary text-white shadow-lg shadow-primary/30'
                  : 'bg-primary/15 border-primary/40 text-primary hover:bg-primary/25',
              )}
            >
              <I.MessageSquare className="w-3.5 h-3.5" />
              Comments
              {unresolvedCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {unresolvedCount}
                </span>
              )}
            </button>

            {/* Status pill — solid, readable */}
            <span className={cn(
              'text-[11px] px-3 py-1.5 rounded-lg font-bold tracking-wide border',
              sopStatus === 'published' && 'bg-green-500/25 text-green-300 border-green-500/40',
              sopStatus === 'review'    && 'bg-yellow-500/25 text-yellow-200 border-yellow-500/40',
              (sopStatus === 'draft' || !sopStatus) && 'bg-white/15 text-white border-white/30',
            )}>
              {(sopStatus ?? 'draft').toUpperCase()}
            </span>

            {/* Workflow action buttons */}
            {(sopStatus === 'draft' || sopStatus === null) && sopId && (
              <button
                onClick={() => publishSOP(sopId, 'review')}
                className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/30 transition-colors"
              >
                <I.Eye className="w-3.5 h-3.5" />
                Submit for Review
              </button>
            )}
            {sopStatus === 'review' && (
              <button
                onClick={() => sopId && publishSOP(sopId, 'published')}
                className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/40 text-green-300 hover:bg-green-500/30 transition-colors"
              >
                <I.CheckCircle className="w-3.5 h-3.5" />
                Publish
              </button>
            )}
            {sopStatus === 'published' && (
              <button
                onClick={async () => {
                  if (!sopId) return;
                  const newSopId = await forkSOP(sopId);
                  useStudioStore.setState(s => ({
                    session: s.session ? { ...s.session, sopId: newSopId } : s.session,
                    sopStatus: 'draft',
                  }));
                }}
                className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white/80 hover:bg-white/15 transition-colors"
              >
                <I.Edit2 className="w-3.5 h-3.5" />
                Edit (Fork)
              </button>
            )}
          </div>

          <h1 className="text-[34px] font-semibold text-text tracking-tight leading-[1.15]" style={{ textWrap: 'balance' as any }}>
            {session.aiOutputs?.title ?? session.capturedTitle ?? 'Untitled Recording'}
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
              if (!session || isProcessing) return;
              console.log('[SOPCanvas] Generate AI Content clicked — sessionId:', session.sessionId);
              setIsProcessing(true);
              try {
                const res = await apiClient.post('/pipeline/trigger', {
                  sessionId: session.sessionId,
                  requestedOutputs: { sop: true, demo: true },
                });
                console.log('[SOPCanvas] /pipeline/trigger response:', res);
                startPolling(session.sessionId);
              } catch (err) {
                console.error('[SOPCanvas] /pipeline/trigger failed:', err);
                setIsProcessing(false);
              }
            }}
          >
            {isProcessing ? 'Generating AI Content…' : 'Generate AI Content'}
          </AIButton>
        </div>

        <AIShimmer isActive={isProcessing} className="rounded-card">
          <div className="space-y-6">
            {items.map((it, i) => {
              const itemKey = it.kind === 'step' ? (it.step.id || `step-${it.idx}`) : `ch-${i}`;
              return it.kind === 'step' ? (
                <div key={itemKey} ref={el => { if (el) stepRefs.current.set(it.step.id, el); else stepRefs.current.delete(it.step.id); }}>
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
            })}
          </div>
        </AIShimmer>

        <div className="mt-12 rounded-card bg-surface shadow-card overflow-hidden">
          {/* Primary CTA */}
          <div className="px-8 pt-8 pb-6 text-center">
            <div className="w-11 h-11 mx-auto rounded-full bg-primary-light flex items-center justify-center text-primary mb-3">
              <I.CheckCircle size={20} strokeWidth={2} />
            </div>
            <h3 className="text-[18px] font-semibold text-text">You're all done</h3>
            <p className="text-[13px] text-text-2 mt-1">
              Publish to share with your team or embed anywhere.
            </p>
            {shareUrl ? (
              <div className="mt-4 flex items-center gap-2 w-full max-w-sm mx-auto">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 text-[12px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg truncate outline-none"
                />
                <Button
                  variant="ghost" size="sm" icon={shareCopied ? I.Check : I.Copy}
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl);
                    setShareCopied(true);
                    setTimeout(() => setShareCopied(false), 2000);
                  }}
                >
                  {shareCopied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
            ) : (
              <Button
                variant="primary" size="md" icon={I.Share2} className="mt-4 px-6"
                disabled={isSharing}
                onClick={async () => {
                  setIsSharing(true);
                  try {
                    const result = await shareSession();
                    setShareUrl(result.shareUrl);
                    navigator.clipboard.writeText(result.shareUrl).catch(() => {});
                  } catch (e: any) {
                    console.error('[Share] failed:', e);
                  } finally {
                    setIsSharing(false);
                  }
                }}
              >
                {isSharing ? 'Generating link…' : 'Publish & share'}
              </Button>
            )}
          </div>

          {/* Secondary actions */}
          <div className="border-t border-border px-8 py-4 flex items-center justify-center gap-2 flex-wrap">
            <Button
              variant="ghost" size="sm" icon={I.Download}
              onClick={() => {
                if (!session) return;
                const steps = session.steps || [];
                const title = session.aiOutputs?.title || session.capturedTitle || 'Untitled';
                const summary = session.aiOutputs?.summary || '';
                const tags = session.aiOutputs?.tags || [];

                // Build print HTML matching competitor layout
                const tagsHtml = tags.length ? `<p class="tags">${tags.map(t => `<span>${t}</span>`).join('')}</p>` : '';

                const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
                <style>
                  * { margin: 0; padding: 0; box-sizing: border-box; }
                  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #111; background: white; }
                  .cover { padding: 72px 64px 48px; }
                  .cover h1 { font-size: 32px; font-weight: 700; line-height: 1.25; margin-bottom: 20px; }
                  .summary-block { border-left: 3px solid #ddd; padding-left: 20px; margin-bottom: 28px; }
                  .summary-block p { font-size: 14px; line-height: 1.7; color: #444; }
                  .tags { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
                  .tags span { background: #f0f0f0; border-radius: 4px; padding: 3px 10px; font-size: 12px; color: #555; }
                  .step-page { page-break-before: always; padding: 48px 64px 40px; }
                  .screenshot-wrap { margin-bottom: 28px; }
                  .screenshot-wrap img { width: 100%; border-radius: 8px; box-shadow: 0 2px 16px rgba(0,0,0,0.12); display: block; }
                  h2 { font-size: 17px; font-weight: 700; margin-bottom: 10px; }
                  p { font-size: 14px; line-height: 1.7; color: #333; }
                  .first-step h2 { margin-top: 0; }
                </style></head><body>
                <div class="cover">
                  <h1>${title}</h1>
                  ${summary ? `<div class="summary-block"><p>${summary}</p></div>` : ''}
                  ${tagsHtml}
                  ${steps[0] ? (() => {
                    const s = steps[0];
                    const st = s.stepTitle || s.elementText || 'Step 1';
                    const tx = s.textOverride || s.generatedText || s.elementText || '';
                    return `<div class="first-step" style="margin-top:32px"><h2>Step 1: ${st}</h2><p>${tx}</p></div>`;
                  })() : ''}
                </div>
                ${steps.slice(1).map((step, i) => {
                  const screenshotUrl = step.screenshotKey && session.assets?.[step.screenshotKey]
                    ? session.assets[step.screenshotKey] : null;
                  const st = step.stepTitle || step.elementText || `Step ${i + 2}`;
                  const tx = step.textOverride || step.generatedText || step.elementText || '';
                  return `<div class="step-page">${screenshotUrl ? `<div class="screenshot-wrap"><img src="${screenshotUrl}" /></div>` : ''}<h2>Step ${i + 2}: ${st}</h2><p>${tx}</p></div>`;
                }).join('')}
                </body></html>`;

                const w = window.open('', '_blank');
                if (!w) return;
                w.document.write(html);
                w.document.close();
                // Wait for images to load then print
                w.onload = () => { w.focus(); w.print(); };
                setTimeout(() => { try { w.focus(); w.print(); } catch(e) {} }, 1500);
              }}
            >
              Export PDF
            </Button>
            <Button variant="ghost" size="sm" icon={I.Code2} onClick={() => setEmbedOpen(true)}>
              Embed
            </Button>
            <Button
              variant="ghost" size="sm" icon={I.Video}
              onClick={() => {
                useStudioStore.getState().setActiveView('video');
                setTimeout(() => useStudioStore.getState().triggerExport(), 300);
              }}
              disabled={useStudioStore.getState().isExporting}
            >
              {useStudioStore.getState().isExporting ? 'Recording…' : 'Cinematic Export'}
            </Button>
            <Button
              variant="ghost" size="sm" icon={I.Download}
              onClick={() => {
                const videoUrl = session.videoKey ? session.assets?.[session.videoKey] : null;
                if (videoUrl) {
                  Object.assign(document.createElement('a'), {
                    href: videoUrl,
                    download: `${session.aiOutputs?.title || 'recording'}.webm`,
                    target: '_blank',
                  }).click();
                }
              }}
            >
              Download Raw
            </Button>
          </div>

          {/* Video recording row */}
          <div className="border-t border-border px-8 py-4 flex items-center gap-3 bg-surface-2/40">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <I.Video size={14} />
            </div>
            <div className="text-left flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-text">Full screen recording available</p>
              <p className="text-[11.5px] text-text-3">Watch the real-time video of this session</p>
            </div>
            <Button
              variant="ghost" size="sm"
              onClick={() => useStudioStore.getState().setActiveView('video')}
              className="shrink-0"
            >
              Switch to Video
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
};

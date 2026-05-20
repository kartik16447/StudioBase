import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { I } from '../components/icons';
import { cn } from '../components/ui';
import { BACKEND_URL } from '../../../shared/constants';
import { CinematicPlayer, type CinematicPlayerHandle } from '../components/player/CinematicPlayer';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PStep {
  id: string;
  sequence?: number;
  screenshotKey?: string | null;
  stepTitle?: string | null;
  generatedText?: string | null;
  textOverride?: string | null;
  elementText?: string | null;
  action?: string | null;
  url?: string | null;
  timestamp?: number | null;
  voiceoverDurationMs?: number | null;
  coordinates?: { x: number; y: number; viewportWidth: number; viewportHeight: number } | null;
  animationTarget?: { centerX: number; centerY: number; zoomScale: number } | null;
}

interface PSession {
  capturedAt?: any;
  capturedUrl?: string;
  aiOutputs?: { title?: string; summary?: string; tags?: string[] };
  metadata?: { stepCount?: number; chapterBreaks?: { afterStepId: string; chapterTitle: string }[] };
  steps: PStep[];
  assets?: Record<string, string>;
}

type ViewMode = 'video' | 'guide';

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtDate = (ts: any) => {
  if (!ts) return '';
  return new Date(typeof ts === 'number' ? ts : ts)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getDomain = (url?: string) => {
  try { return url ? new URL(url).hostname.replace('www.', '') : null; } catch { return null; }
};

function buildChapterMap(breaks?: { afterStepId: string; chapterTitle: string }[]) {
  const map = new Map<string, string>();
  (breaks || []).forEach(b => map.set(b.afterStepId, b.chapterTitle));
  return map;
}
// ─── TranscriptPanel ─────────────────────────────────────────────────────────

const TranscriptPanel: React.FC<{
  steps: PStep[];
  assets: Record<string, string>;
  currentIndex: number;
  chapterMap: Map<string, string>;
  onSelect: (i: number) => void;
}> = ({ steps, assets, currentIndex, chapterMap, onSelect }) => {
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [currentIndex]);

  let chapterIdx = 0;
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-white/[0.07] flex-shrink-0 px-5 py-3">
        <span className="text-[13px] font-semibold text-white border-b-2 border-indigo-500 pb-3 -mb-3">Steps</span>
        <span className="text-[11px] text-white/30">{steps.length} total</span>
      </div>
      <div className="flex-1 overflow-y-auto py-2 min-h-0">
        {steps.map((step, i) => {
          const isActive = i === currentIndex;
          const thumb    = step.screenshotKey ? assets[step.screenshotKey] : null;
          const title    = step.stepTitle || step.elementText || `Step ${i + 1}`;
          const text     = step.textOverride || step.generatedText || '';
          const chapterTitle = chapterMap.get(step.id);
          if (chapterTitle) chapterIdx++;
          return (
            <React.Fragment key={step.id || i}>
              {chapterTitle && (
                <div className="px-4 pt-3 pb-1">
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                    Chapter {chapterIdx}: {chapterTitle}
                  </span>
                </div>
              )}
              <button
                ref={isActive ? activeRef : null}
                onClick={() => onSelect(i)}
                className={cn('w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors rounded-lg mx-1',
                  isActive ? 'bg-white/[0.09]' : 'hover:bg-white/[0.04]')}
              >
                <div className={cn('flex-shrink-0 w-14 h-9 rounded-md overflow-hidden mt-0.5 border',
                  isActive ? 'border-indigo-500/60' : 'border-white/[0.08]')}>
                  {thumb
                    ? <img src={thumb} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full bg-white/[0.06] flex items-center justify-center text-[9px] text-white/30">{i + 1}</div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {isActive && <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />}
                    <p className={cn('text-[12px] font-semibold leading-snug line-clamp-2',
                      isActive ? 'text-white' : 'text-white/70')}>{title}</p>
                  </div>
                  {text && <p className="text-[11px] text-white/35 mt-0.5 line-clamp-2 leading-relaxed">{text}</p>}
                </div>
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

// ─── GuideView (SOP document) ─────────────────────────────────────────────────

const GuideView: React.FC<{
  steps: PStep[];
  assets: Record<string, string>;
  chapterMap: Map<string, string>;
  title: string;
  summary?: string;
  tags?: string[];
}> = ({ steps, assets, chapterMap, title, summary, tags }) => {
  let chapterIdx = 0;
  return (
    <div className="max-w-[780px] mx-auto py-8 space-y-0">
      {/* Doc header */}
      <div className="mb-10 pb-8 border-b border-white/[0.07]">
        <h1 className="text-[28px] font-bold text-white leading-tight tracking-tight mb-4">{title}</h1>
        {summary && <p className="text-[15px] text-white/55 leading-relaxed">{summary}</p>}
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {tags.map(t => (
              <span key={t} className="px-2.5 py-0.5 bg-white/[0.06] border border-white/[0.08] rounded-full text-[11px] text-white/50">{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* Steps */}
      {steps.map((step, i) => {
        const screenshotUrl = step.screenshotKey ? assets[step.screenshotKey] : null;
        const stepTitle     = step.stepTitle || step.elementText || '';
        const text          = step.textOverride || step.generatedText || '';
        const chapterTitle  = chapterMap.get(step.id);
        if (chapterTitle) chapterIdx++;

        return (
          <React.Fragment key={step.id || i}>
            {chapterTitle && (
              <div className="flex items-center gap-3 py-6">
                <div className="flex-1 h-px bg-white/[0.07]" />
                <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest px-2">
                  Chapter {chapterIdx}: {chapterTitle}
                </span>
                <div className="flex-1 h-px bg-white/[0.07]" />
              </div>
            )}

            <div className="group pb-14">
              {/* Screenshot */}
              <div className="w-full rounded-xl overflow-hidden bg-[#111116] border border-white/[0.06] mb-5"
                style={{ boxShadow: '0 4px 32px rgba(0,0,0,0.4)' }}>
                {screenshotUrl ? (
                  <img
                    src={screenshotUrl}
                    alt={stepTitle || `Step ${i + 1}`}
                    className="w-full h-auto block"
                    loading="lazy"
                  />
                ) : (
                  <div className="aspect-video flex flex-col items-center justify-center gap-2 text-white/20">
                    <I.Image size={32} />
                    <span className="text-[12px]">No screenshot</span>
                  </div>
                )}
              </div>

              {/* Step heading */}
              <h2 className="text-[18px] font-bold text-white leading-snug mb-2">
                <span className="text-indigo-400 mr-2">Step {i + 1}.</span>
                {stepTitle}
              </h2>

              {text && <p className="text-[14px] text-white/60 leading-[1.75]">{text}</p>}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ─── ViewToggle ───────────────────────────────────────────────────────────────

const ViewToggle: React.FC<{ mode: ViewMode; onChange: (m: ViewMode) => void }> = ({ mode, onChange }) => (
  <div className="flex items-center bg-white/[0.05] border border-white/[0.08] rounded-xl p-1 gap-1">
    <button
      onClick={() => onChange('video')}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all duration-200',
        mode === 'video' ? 'bg-white text-black shadow-sm' : 'text-white/50 hover:text-white',
      )}
    >
      <I.Play size={14} className={mode === 'video' ? 'text-black' : 'text-white/50'} />
      Video
    </button>
    <button
      onClick={() => onChange('guide')}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all duration-200',
        mode === 'guide' ? 'bg-white text-black shadow-sm' : 'text-white/50 hover:text-white',
      )}
    >
      <I.FileText size={14} className={mode === 'guide' ? 'text-black' : 'text-white/50'} />
      Step-by-Step Guide
    </button>
  </div>
);

// ─── PlayerPage ───────────────────────────────────────────────────────────────

export const PlayerPage: React.FC<{ shareToken: string }> = ({ shareToken }) => {
  const [session,    setSession]    = useState<PSession | null>(null);
  const [ownerName,  setOwnerName]  = useState('');
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [copied,     setCopied]     = useState(false);
  const [viewMode,   setViewMode]   = useState<ViewMode>('video');

  // displayIndex tracks which step the player is on — updated via onStepSelect
  // Used for step info card, transcript highlight, chapter label.
  const [displayIndex, setDisplayIndex] = useState(0);
  const playerRef = useRef<CinematicPlayerHandle>(null);

  // ── Fetch session JSON (shared by initial load + background refresh) ──────
  const sessionJsonUrlRef = useRef<string | null>(null);

  const fetchSessionData = useCallback(async (isInitial = false) => {
    try {
      // Only fetch meta once; subsequent polls use the cached sessionJsonUrl
      if (!sessionJsonUrlRef.current) {
        const meta = await fetch(`${BACKEND_URL}/v1/public/${shareToken}`).then(r => r.json()) as any;
        if (meta.error) throw new Error(meta.error);
        setOwnerName(meta.owner?.name || 'Anonymous');
        if (!meta.sessionJsonUrl) throw new Error('Session not ready.');
        sessionJsonUrlRef.current = meta.sessionJsonUrl;
      }
      // Cache-bust with ?t= so Cloudflare doesn't serve a stale copy
      const url = `${sessionJsonUrlRef.current}?t=${Date.now()}`;
      const data = await fetch(url).then(r => r.json()) as PSession;
      setSession(data);
    } catch (e: any) {
      if (isInitial) setError(e.message || 'Failed to load.');
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [shareToken]);

  // Initial load
  useEffect(() => {
    if (!shareToken) { setError('No share token.'); setLoading(false); return; }
    fetchSessionData(true);
  }, [shareToken, fetchSessionData]);

  // Background refresh every 30 s — picks up zoom/text edits made in dashboard
  useEffect(() => {
    const id = setInterval(() => fetchSessionData(false), 30_000);
    return () => clearInterval(id);
  }, [fetchSessionData]);

  const steps  = session?.steps  || [];
  const assets = session?.assets || {};

  const sessionStartMs = useMemo(() => {
    const s = (session as any)?.startedAt;
    return s ? new Date(s).getTime() : ((steps[0] as any)?.timestamp || 0);
  }, [session, steps]);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Loading ──
  if (loading) return (
    <div className="fixed inset-0 bg-[#0c0c0f] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // ── Error ──
  if (error || !session) return (
    <div className="fixed inset-0 bg-[#0c0c0f] flex flex-col items-center justify-center text-center p-12">
      <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
        <I.X size={24} className="text-red-400" />
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">Walkthrough unavailable</h2>
      <p className="text-sm text-white/40 max-w-xs">{error || 'This link may have expired.'}</p>
      <a href="https://studiobase-umber.vercel.app" className="mt-6 text-sm font-medium text-indigo-400 hover:underline">
        Create your own walkthrough →
      </a>
    </div>
  );

  const title        = session.aiOutputs?.title || 'Walkthrough';
  const summary      = session.aiOutputs?.summary;
  const tags         = session.aiOutputs?.tags || [];
  const chapterMap   = buildChapterMap(session.metadata?.chapterBreaks);
  const videoUrl     = (session as any).videoKey ? assets[(session as any).videoKey] ?? null : null;
  const currentStep  = steps[displayIndex];
  const currentTitle = currentStep?.stepTitle || currentStep?.elementText || `Step ${displayIndex + 1}`;
  const currentText  = currentStep?.textOverride || currentStep?.generatedText || '';
  const siteDomain   = getDomain(session.capturedUrl);

  let currentChapter = '';
  for (let i = displayIndex; i >= 0; i--) {
    const sid = steps[i]?.id;
    if (sid && chapterMap.has(sid)) { currentChapter = chapterMap.get(sid)!; break; }
  }

  return (
    // fixed + overflow-y-auto = own scroll context, ignores body overflow:hidden from index.css
    <div className="fixed inset-0 bg-[#0c0c0f] text-white overflow-y-auto">

      {/* ── Sticky nav ── */}
      <nav className="sticky top-0 z-50 bg-[#0c0c0f]/95 backdrop-blur border-b border-white/[0.06] h-14 flex items-center px-6 gap-4">
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <span className="text-white font-bold text-xs">S</span>
          </div>
          <span className="text-[13px] font-semibold text-white hidden sm:block">StudioBase</span>
        </div>
        <div className="flex-1 min-w-0 mx-4 hidden md:block">
          <p className="text-[13px] text-white/50 truncate">{title}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={copyLink}
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[13px] font-medium text-white/60 hover:text-white hover:bg-white/[0.07] transition-colors">
            {copied ? <I.Check size={14} className="text-green-400" /> : <I.Link size={14} />}
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <a href="https://studiobase-umber.vercel.app"
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[13px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors">
            Try for free
          </a>
        </div>
      </nav>

      {/* ── Page content ── */}
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8">

        {/* Session title + meta */}
        <div className="mb-6">
          <h1
            className="text-[26px] sm:text-[30px] font-bold text-white leading-tight tracking-tight mb-3"
            style={{ textWrap: 'balance' as any }}
          >
            {title}
          </h1>
          <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-white/40">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-[10px]">
                {ownerName[0]?.toUpperCase() || 'U'}
              </div>
              <span className="font-medium text-white/70">{ownerName}</span>
            </div>
            {session.capturedAt && <><span className="text-white/20">·</span><span>{fmtDate(session.capturedAt)}</span></>}
            <span className="text-white/20">·</span>
            <span className="flex items-center gap-1"><I.List size={12} />{steps.length} steps</span>
            {siteDomain && <><span className="text-white/20">·</span><span className="flex items-center gap-1"><I.Globe size={12} />{siteDomain}</span></>}
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {tags.map(t => (
                <span key={t} className="px-2.5 py-0.5 bg-white/[0.06] border border-white/[0.08] rounded-full text-[11px] font-medium text-white/50">{t}</span>
              ))}
            </div>
          )}
        </div>

        {/* View toggle */}
        <div className="flex items-center justify-center mb-8">
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>

        {/* ── VIDEO MODE ── */}
        {viewMode === 'video' && (
          <div className="flex flex-col lg:flex-row gap-5 items-start">

            {/* Left: cinematic player + step card */}
            <div className="flex-1 min-w-0 space-y-4">
              <CinematicPlayer
                ref={playerRef}
                steps={steps}
                assets={assets}
                videoUrl={videoUrl}
                sessionStartMs={sessionStartMs}
                chapterBreaks={session.metadata?.chapterBreaks}
                renderMode={videoUrl ? 'hybrid' : 'slideshow'}
                onStepSelect={setDisplayIndex}
              />

              {/* Current step info card */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
                {currentChapter && (
                  <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider mb-2">{currentChapter}</p>
                )}
                <h2 className="text-[20px] sm:text-[22px] font-bold text-white leading-snug mb-2">
                  <span className="text-indigo-400 mr-1.5">Step {displayIndex + 1}.</span>
                  {currentTitle}
                </h2>
                {currentText && <p className="text-[14px] text-white/60 leading-relaxed">{currentText}</p>}

                <div className="flex items-center gap-2 mt-5 pt-4 border-t border-white/[0.06]">
                  <button onClick={() => playerRef.current?.seekToStep(displayIndex - 1)} disabled={displayIndex === 0}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-medium text-white/50 hover:text-white hover:bg-white/[0.07] disabled:opacity-30 transition-colors">
                    <I.ChevronLeft size={14} /> Prev
                  </button>
                  <span className="text-[12px] text-white/30 flex-1 text-center">{displayIndex + 1} of {steps.length}</span>
                  <button onClick={() => playerRef.current?.seekToStep(displayIndex + 1)} disabled={displayIndex === steps.length - 1}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-medium text-white/50 hover:text-white hover:bg-white/[0.07] disabled:opacity-30 transition-colors">
                    Next <I.ChevronRight size={14} />
                  </button>
                </div>
              </div>

              {summary && (
                <div className="pl-4 border-l-2 border-indigo-500/40">
                  <p className="text-[14px] text-white/50 leading-relaxed">{summary}</p>
                </div>
              )}
            </div>

            {/* Right: transcript sidebar */}
            <div className="w-full lg:w-[300px] flex-shrink-0 lg:sticky lg:top-[72px]">
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl flex flex-col overflow-hidden"
                style={{ height: 'calc(100vh - 100px)' }}>
                <TranscriptPanel
                  steps={steps} assets={assets}
                  currentIndex={displayIndex} chapterMap={chapterMap}
                  onSelect={(i) => { playerRef.current?.seekToStep(i); setDisplayIndex(i); }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── GUIDE MODE ── */}
        {viewMode === 'guide' && (
          <GuideView
            steps={steps}
            assets={assets}
            chapterMap={chapterMap}
            title={title}
            summary={summary}
            tags={tags}
          />
        )}

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-white/[0.06] flex flex-col items-center gap-3 text-center">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
          <p className="text-[13px] text-white/40">Made with <span className="font-semibold text-white/60">StudioBase</span></p>
          <a href="https://studiobase-umber.vercel.app" className="text-[13px] font-semibold text-indigo-400 hover:underline">
            Create your own walkthrough →
          </a>
        </div>
      </div>
    </div>
  );
};

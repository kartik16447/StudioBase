import React, { useEffect, useState, useRef, useCallback } from 'react';
import { I } from '../components/icons';
import { cn } from '../components/ui';
import { BACKEND_URL } from '../../../shared/constants';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PStep {
  id: string;
  sequence?: number;
  screenshotKey?: string;
  stepTitle?: string;
  generatedText?: string;
  textOverride?: string;
  elementText?: string;
  action?: string;
  url?: string;
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtDate = (ts: any) => {
  if (!ts) return '';
  return new Date(typeof ts === 'number' ? ts : ts)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getDomain = (url?: string) => {
  try { return url ? new URL(url).hostname.replace('www.', '') : null; } catch { return null; }
};

// Build chapter map: stepId → chapter title
function buildChapterMap(breaks?: { afterStepId: string; chapterTitle: string }[]) {
  const map = new Map<string, string>();
  (breaks || []).forEach(b => map.set(b.afterStepId, b.chapterTitle));
  return map;
}

// ─── CinematicPlayer ─────────────────────────────────────────────────────────

interface PlayerProps {
  steps: PStep[];
  assets: Record<string, string>;
  currentIndex: number;
  isPlaying: boolean;
  progress: number; // 0–100 within current step
  onSeek: (idx: number) => void;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
}

const CinematicPlayer: React.FC<PlayerProps> = ({
  steps, assets, currentIndex, isPlaying, progress,
  onSeek, onTogglePlay, onPrev, onNext,
}) => {
  const [speed, setSpeed] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const step = steps[currentIndex];
  const screenshotUrl = step?.screenshotKey ? assets[step.screenshotKey] : null;

  // Zoom/pan transform from animationTarget or coordinates
  const getTransform = () => {
    if (!isPlaying) return 'scale(1)';
    const t = step?.animationTarget;
    const c = step?.coordinates;
    if (t) {
      const s = t.zoomScale || 1.8;
      const tx = (50 - t.centerX) * (s - 1) / s;
      const ty = (50 - t.centerY) * (s - 1) / s;
      return `scale(${s}) translate(${tx}%, ${ty}%)`;
    }
    if (c) {
      const s = 1.8;
      const cx = (c.x / (c.viewportWidth || 1440)) * 100;
      const cy = (c.y / (c.viewportHeight || 900)) * 100;
      const tx = (50 - cx) * (s - 1) / s;
      const ty = (50 - cy) * (s - 1) / s;
      return `scale(${s}) translate(${tx}%, ${ty}%)`;
    }
    return 'scale(1)';
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Overall timeline progress for scrubber
  const totalSteps = steps.length;
  const overallPct = totalSteps > 0
    ? ((currentIndex + progress / 100) / totalSteps) * 100
    : 0;

  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    onSeek(Math.min(totalSteps - 1, Math.floor(pct * totalSteps)));
  };

  return (
    <div ref={containerRef} className="w-full bg-black rounded-2xl overflow-hidden select-none">
      {/* Screenshot area */}
      <div className="relative aspect-video bg-black">
        {screenshotUrl ? (
          <img
            key={step?.id}
            src={screenshotUrl}
            alt={step?.stepTitle || ''}
            className="w-full h-full object-contain transition-transform duration-700 ease-in-out"
            style={{ transform: getTransform(), transformOrigin: 'center center' }}
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <I.Video size={48} className="text-white/20" />
          </div>
        )}

        {/* Step counter */}
        <div className="absolute top-3 right-3 px-2.5 py-1 bg-black/60 rounded-full text-white text-[11px] font-semibold backdrop-blur-sm">
          {currentIndex + 1} / {totalSteps}
        </div>

        {/* Click overlay: click left half = prev, right half = next */}
        <div className="absolute inset-0 flex">
          <div className="flex-1 cursor-pointer" onClick={onPrev} />
          <div className="flex-1 cursor-pointer" onClick={onNext} />
        </div>

        {/* Play/pause overlay on center click */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ background: isPlaying ? 'transparent' : 'rgba(0,0,0,0.15)' }}
        />
      </div>

      {/* Scrubber */}
      <div
        className="h-1.5 bg-white/10 cursor-pointer group relative mx-0"
        onClick={handleScrubberClick}
      >
        <div
          className="h-full bg-indigo-500 group-hover:bg-indigo-400 transition-colors"
          style={{ width: `${overallPct}%`, transition: 'none' }}
        />
        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `calc(${overallPct}% - 6px)` }}
        />
      </div>

      {/* Controls bar */}
      <div className="flex items-center gap-3 px-4 h-12 bg-[#0c0c0f]">
        {/* Prev / Play / Next */}
        <button onClick={onPrev} disabled={currentIndex === 0}
          className="p-1.5 text-white/60 hover:text-white disabled:opacity-30 transition-colors">
          <I.SkipBack size={16} />
        </button>
        <button onClick={onTogglePlay}
          className="w-8 h-8 rounded-full bg-white flex items-center justify-center hover:bg-white/90 transition-colors flex-shrink-0">
          {isPlaying
            ? <I.Pause size={14} className="text-black" />
            : <I.Play size={14} className="text-black ml-0.5" />}
        </button>
        <button onClick={onNext} disabled={currentIndex === totalSteps - 1}
          className="p-1.5 text-white/60 hover:text-white disabled:opacity-30 transition-colors">
          <I.SkipForward size={16} />
        </button>

        {/* Time */}
        <span className="text-[11px] text-white/40 tabular-nums ml-1">
          {currentIndex + 1}:{String(Math.round(progress / 100 * 3)).padStart(2, '0')} / {totalSteps}:00
        </span>

        <div className="flex-1" />

        {/* Speed */}
        <div className="flex items-center gap-0.5 bg-white/[0.08] rounded-md p-0.5">
          {[0.5, 1, 1.5, 2].map(s => (
            <button key={s} onClick={() => setSpeed(s)}
              className={cn('px-2 h-5 rounded text-[10px] font-bold transition-colors',
                speed === s ? 'bg-white text-black' : 'text-white/50 hover:text-white')}>
              {s}×
            </button>
          ))}
        </div>

        {/* Fullscreen */}
        <button onClick={toggleFullscreen}
          className="p-1.5 text-white/50 hover:text-white transition-colors">
          {isFullscreen ? <I.Minimize2 size={15} /> : <I.Maximize size={15} />}
        </button>
      </div>
    </div>
  );
};

// ─── TranscriptPanel ─────────────────────────────────────────────────────────

const TranscriptPanel: React.FC<{
  steps: PStep[];
  assets: Record<string, string>;
  currentIndex: number;
  chapterMap: Map<string, string>;
  onSelect: (i: number) => void;
}> = ({ steps, assets, currentIndex, chapterMap, onSelect }) => {
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentIndex]);

  let chapterIdx = 0;

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-white/[0.07] flex-shrink-0">
        <div className="px-5 py-3 text-[13px] font-semibold text-white border-b-2 border-indigo-500">
          Transcript
        </div>
      </div>

      {/* Step list */}
      <div ref={listRef} className="flex-1 overflow-y-auto py-2 space-y-0.5 scrollbar-hide">
        {steps.map((step, i) => {
          const isActive = i === currentIndex;
          const thumb = step.screenshotKey ? assets[step.screenshotKey] : null;
          const title = step.stepTitle || step.elementText || `Step ${i + 1}`;
          const text = step.textOverride || step.generatedText || '';
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
                className={cn(
                  'w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors rounded-lg mx-1',
                  isActive ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                )}
              >
                {/* Thumbnail */}
                <div className="flex-shrink-0 w-14 h-9 rounded-md overflow-hidden bg-white/[0.06] mt-0.5">
                  {thumb
                    ? <img src={thumb} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-[9px] text-white/30">{i + 1}</div>
                  }
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />}
                    <p className={cn('text-[12px] font-semibold leading-snug truncate',
                      isActive ? 'text-white' : 'text-white/70')}>
                      {title}
                    </p>
                  </div>
                  {text && (
                    <p className="text-[11px] text-white/40 mt-0.5 line-clamp-2 leading-relaxed">{text}</p>
                  )}
                </div>
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

// ─── PlayerPage ───────────────────────────────────────────────────────────────

export const PlayerPage: React.FC<{ shareToken: string }> = ({ shareToken }) => {
  const [session, setSession] = useState<PSession | null>(null);
  const [ownerName, setOwnerName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Player state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const STEP_MS = 3000;

  // Load session
  useEffect(() => {
    if (!shareToken) { setError('No share token.'); setLoading(false); return; }

    (async () => {
      try {
        const meta = await fetch(`${BACKEND_URL}/v1/public/${shareToken}`).then(r => r.json()) as any;
        if (meta.error) throw new Error(meta.error);
        setOwnerName(meta.owner?.name || 'Anonymous');
        if (!meta.sessionJsonUrl) throw new Error('Session not ready.');
        const data = await fetch(meta.sessionJsonUrl).then(r => r.json()) as PSession;
        setSession(data);
      } catch (e: any) {
        setError(e.message || 'Failed to load.');
      } finally {
        setLoading(false);
      }
    })();
  }, [shareToken]);

  const steps = session?.steps || [];
  const assets = session?.assets || {};

  // Playback engine
  const advance = useCallback(() => {
    setCurrentIndex(prev => {
      if (prev >= steps.length - 1) { setIsPlaying(false); return prev; }
      setProgress(0);
      return prev + 1;
    });
  }, [steps.length]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!isPlaying) return;
    const startTime = Date.now() - (progress / 100) * STEP_MS;
    intervalRef.current = setInterval(() => {
      const pct = Math.min(((Date.now() - startTime) / STEP_MS) * 100, 100);
      setProgress(pct);
      if (pct >= 100) advance();
    }, 50);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, currentIndex, advance]);

  const goTo = (idx: number) => {
    setCurrentIndex(idx);
    setProgress(0);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Loading ──
  if (loading) return (
    <div className="min-h-screen bg-[#0c0c0f] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // ── Error ──
  if (error || !session) return (
    <div className="min-h-screen bg-[#0c0c0f] flex flex-col items-center justify-center text-center p-12">
      <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
        <I.X size={24} className="text-red-400" />
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">Walkthrough unavailable</h2>
      <p className="text-sm text-white/40 max-w-xs">{error || 'This link may have expired.'}</p>
      <a href="https://studiobase-umber.vercel.app"
        className="mt-6 text-sm font-medium text-indigo-400 hover:underline">
        Create your own walkthrough →
      </a>
    </div>
  );

  const title = session.aiOutputs?.title || 'Walkthrough';
  const summary = session.aiOutputs?.summary;
  const tags = session.aiOutputs?.tags || [];
  const chapterMap = buildChapterMap(session.metadata?.chapterBreaks);
  const currentStep = steps[currentIndex];
  const currentTitle = currentStep?.stepTitle || currentStep?.elementText || `Step ${currentIndex + 1}`;
  const currentText = currentStep?.textOverride || currentStep?.generatedText || '';
  const siteDomain = getDomain(session.capturedUrl);

  // Current chapter for this step
  let currentChapter = '';
  for (let i = currentIndex; i >= 0; i--) {
    const sid = steps[i]?.id;
    if (sid && chapterMap.has(sid)) { currentChapter = chapterMap.get(sid)!; break; }
  }

  return (
    <div className="min-h-screen bg-[#0c0c0f] text-white">

      {/* ── Nav ── */}
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

      {/* ── Main content ── */}
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8">

        {/* Title + meta */}
        <div className="mb-6">
          <h1 className="text-[26px] sm:text-[32px] font-bold text-white leading-tight tracking-tight mb-3"
            style={{ textWrap: 'balance' as any }}>
            {title}
          </h1>
          <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-white/40">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-[10px]">
                {ownerName[0]?.toUpperCase() || 'U'}
              </div>
              <span className="font-medium text-white/70">{ownerName}</span>
            </div>
            {session.capturedAt && (
              <><span className="text-white/20">·</span><span>{fmtDate(session.capturedAt)}</span></>
            )}
            <span className="text-white/20">·</span>
            <span className="flex items-center gap-1"><I.List size={12} />{steps.length} steps</span>
            {siteDomain && (
              <><span className="text-white/20">·</span>
              <span className="flex items-center gap-1"><I.Globe size={12} />{siteDomain}</span></>
            )}
          </div>
          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {tags.map(t => (
                <span key={t} className="px-2.5 py-0.5 bg-white/[0.06] border border-white/[0.08] rounded-full text-[11px] font-medium text-white/50">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Two-column layout ── */}
        <div className="flex flex-col lg:flex-row gap-5">

          {/* Left: Player + description */}
          <div className="flex-1 min-w-0 space-y-5">
            <CinematicPlayer
              steps={steps}
              assets={assets}
              currentIndex={currentIndex}
              isPlaying={isPlaying}
              progress={progress}
              onSeek={goTo}
              onTogglePlay={() => setIsPlaying(p => !p)}
              onPrev={() => goTo(Math.max(0, currentIndex - 1))}
              onNext={() => goTo(Math.min(steps.length - 1, currentIndex + 1))}
            />

            {/* Current step description — the Trupeer "big title" section */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
              {currentChapter && (
                <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider mb-2">
                  {currentChapter}
                </p>
              )}
              <h2 className="text-[22px] sm:text-[26px] font-bold text-white leading-snug mb-3">
                {currentTitle}
              </h2>
              {currentText && (
                <p className="text-[14px] text-white/60 leading-relaxed">{currentText}</p>
              )}

              {/* Step nav pills */}
              <div className="flex items-center gap-2 mt-5 pt-4 border-t border-white/[0.06]">
                <button
                  onClick={() => goTo(Math.max(0, currentIndex - 1))}
                  disabled={currentIndex === 0}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-medium text-white/50 hover:text-white hover:bg-white/[0.07] disabled:opacity-30 transition-colors">
                  <I.ChevronLeft size={14} /> Prev
                </button>
                <span className="text-[12px] text-white/30 flex-1 text-center">
                  Step {currentIndex + 1} of {steps.length}
                </span>
                <button
                  onClick={() => goTo(Math.min(steps.length - 1, currentIndex + 1))}
                  disabled={currentIndex === steps.length - 1}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-medium text-white/50 hover:text-white hover:bg-white/[0.07] disabled:opacity-30 transition-colors">
                  Next <I.ChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* Summary */}
            {summary && (
              <div className="pl-4 border-l-2 border-indigo-500/40">
                <p className="text-[14px] text-white/50 leading-relaxed">{summary}</p>
              </div>
            )}
          </div>

          {/* Right: Transcript sidebar */}
          <div className="w-full lg:w-[320px] flex-shrink-0">
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden h-full lg:max-h-[calc(100vh-180px)] lg:sticky lg:top-20">
              <TranscriptPanel
                steps={steps}
                assets={assets}
                currentIndex={currentIndex}
                chapterMap={chapterMap}
                onSelect={(i) => { goTo(i); setIsPlaying(false); }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-white/[0.06] flex flex-col items-center gap-3 text-center">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
          <p className="text-[13px] text-white/40">
            Made with <span className="font-semibold text-white/60">StudioBase</span>
          </p>
          <a href="https://studiobase-umber.vercel.app"
            className="text-[13px] font-semibold text-indigo-400 hover:underline">
            Create your own walkthrough →
          </a>
        </div>
      </div>
    </div>
  );
};

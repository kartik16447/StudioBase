import React, { useEffect, useState, useRef, useCallback } from 'react';
import { I } from '../components/icons';
import { cn } from '../components/ui';
import { BACKEND_URL } from '../../../shared/constants';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublicStep {
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
  animationTarget?: { centerX: number; centerY: number; zoomScale: number; transitionType?: string } | null;
}

interface PublicSession {
  sessionId?: string;
  capturedAt?: string;
  capturedUrl?: string;
  aiOutputs?: { title?: string; summary?: string; tags?: string[] };
  metadata?: { stepCount?: number; durationMs?: number; chapterBreaks?: { afterStepId: string; chapterTitle: string }[] };
  steps: PublicStep[];
  assets?: Record<string, string>;
  owner?: { name: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatDate = (ts: any) => {
  if (!ts) return '';
  const d = new Date(typeof ts === 'number' ? ts : ts);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const domain = (url?: string) => {
  if (!url) return null;
  try { return new URL(url).hostname.replace('www.', ''); } catch { return null; }
};

// ─── PublicStepCard ───────────────────────────────────────────────────────────

const PublicStepCard: React.FC<{ step: PublicStep; index: number; assets?: Record<string, string> }> = ({ step, index, assets }) => {
  const [imgLoaded, setImgLoaded] = useState(false);
  const screenshotUrl = step.screenshotKey && assets?.[step.screenshotKey] ? assets[step.screenshotKey] : null;
  const title = step.stepTitle || step.elementText || `Step ${index + 1}`;
  const text = step.textOverride || step.generatedText || step.elementText || '';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {screenshotUrl && (
        <div className="bg-gray-50 border-b border-gray-100">
          <img
            src={screenshotUrl}
            alt={title}
            className={cn('w-full object-contain transition-opacity duration-300', imgLoaded ? 'opacity-100' : 'opacity-0')}
            onLoad={() => setImgLoaded(true)}
          />
          {!imgLoaded && <div className="w-full aspect-video bg-gray-100 animate-pulse" />}
        </div>
      )}
      <div className="px-7 py-5">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center">
            <span className="text-[11px] font-bold text-indigo-600">{index + 1}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-semibold text-gray-900 leading-snug mb-1.5">{title}</h3>
            {text && <p className="text-[14px] text-gray-600 leading-relaxed">{text}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── ChapterDivider ───────────────────────────────────────────────────────────

const ChapterDivider: React.FC<{ title: string; index: number }> = ({ title, index }) => (
  <div className="flex items-center gap-4 py-2">
    <div className="flex-1 h-px bg-gray-200" />
    <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-50 border border-gray-200 rounded-full">
      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Part {index}</span>
      <span className="w-1 h-1 rounded-full bg-gray-300" />
      <span className="text-[13px] font-semibold text-gray-700">{title}</span>
    </div>
    <div className="flex-1 h-px bg-gray-200" />
  </div>
);

// ─── VideoPlayer ──────────────────────────────────────────────────────────────

const VideoPlayer: React.FC<{ steps: PublicStep[]; assets?: Record<string, string> }> = ({ steps, assets }) => {
  const stepsWithScreenshots = steps.filter(s => s.screenshotKey && assets?.[s.screenshotKey]);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0–100
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const STEP_DURATION_MS = 3000; // 3s per step
  const progressRef = useRef(0);
  const startTimeRef = useRef(0);

  const goTo = useCallback((idx: number) => {
    setCurrent(idx);
    setProgress(0);
    progressRef.current = 0;
  }, []);

  const advance = useCallback(() => {
    setCurrent(prev => {
      const next = prev + 1;
      if (next >= stepsWithScreenshots.length) {
        setPlaying(false);
        return prev;
      }
      setProgress(0);
      progressRef.current = 0;
      return next;
    });
  }, [stepsWithScreenshots.length]);

  useEffect(() => {
    if (!playing) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    startTimeRef.current = Date.now() - (progressRef.current / 100) * STEP_DURATION_MS;
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min((elapsed / STEP_DURATION_MS) * 100, 100);
      progressRef.current = pct;
      setProgress(pct);
      if (pct >= 100) {
        advance();
        startTimeRef.current = Date.now();
      }
    }, 50);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, current, advance]);

  if (stepsWithScreenshots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <I.Video size={32} className="mb-3 opacity-40" />
        <p className="text-sm">No screenshots available for video playback.</p>
      </div>
    );
  }

  const step = stepsWithScreenshots[current];
  const screenshotUrl = step.screenshotKey ? assets?.[step.screenshotKey] : null;
  const title = step.stepTitle || step.elementText || `Step ${current + 1}`;
  const text = step.textOverride || step.generatedText || '';

  // Compute zoom/pan from animationTarget or coordinates
  const target = step.animationTarget;
  const coords = step.coordinates;
  let transform = 'scale(1) translate(0, 0)';
  if (playing && target) {
    const scale = target.zoomScale || 2;
    const tx = (50 - target.centerX) * (scale - 1) / scale;
    const ty = (50 - target.centerY) * (scale - 1) / scale;
    transform = `scale(${scale}) translate(${tx}%, ${ty}%)`;
  } else if (playing && coords) {
    const scale = 2;
    const cx = (coords.x / (coords.viewportWidth || 1440)) * 100;
    const cy = (coords.y / (coords.viewportHeight || 900)) * 100;
    const tx = (50 - cx) * (scale - 1) / scale;
    const ty = (50 - cy) * (scale - 1) / scale;
    transform = `scale(${scale}) translate(${tx}%, ${ty}%)`;
  }

  return (
    <div className="space-y-4">
      {/* Screen */}
      <div className="bg-black rounded-2xl overflow-hidden aspect-video relative select-none">
        {screenshotUrl ? (
          <img
            key={step.id}
            src={screenshotUrl}
            alt={title}
            className="w-full h-full object-contain transition-transform duration-700 ease-in-out"
            style={{ transform, transformOrigin: 'center center' }}
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600">
            <I.Image size={40} className="opacity-30" />
          </div>
        )}

        {/* Step counter overlay */}
        <div className="absolute top-3 right-3 px-2.5 py-1 bg-black/50 rounded-full text-white text-[11px] font-semibold backdrop-blur-sm">
          {current + 1} / {stepsWithScreenshots.length}
        </div>

        {/* Step caption */}
        {text && (
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-5 pb-4 pt-8">
            <p className="text-white text-[13px] font-medium leading-snug line-clamp-2">{text}</p>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 transition-none rounded-full"
          style={{ width: `${((current / stepsWithScreenshots.length) + (progress / 100) * (1 / stepsWithScreenshots.length)) * 100}%` }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => goTo(Math.max(0, current - 1))}
          disabled={current === 0}
          className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors"
        >
          <I.ChevronLeft size={18} />
        </button>

        <button
          onClick={() => setPlaying(p => !p)}
          className="flex-1 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center gap-2 text-[13px] font-semibold hover:bg-indigo-700 transition-colors"
        >
          {playing ? <><I.Pause size={15} /> Pause</> : <><I.Play size={15} /> {current === stepsWithScreenshots.length - 1 ? 'Replay' : 'Play cinematic'}</>}
        </button>

        <button
          onClick={() => goTo(Math.min(stepsWithScreenshots.length - 1, current + 1))}
          disabled={current === stepsWithScreenshots.length - 1}
          className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors"
        >
          <I.ChevronRight size={18} />
        </button>
      </div>

      {/* Step strip */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {stepsWithScreenshots.map((s, i) => {
          const url = s.screenshotKey ? assets?.[s.screenshotKey] : null;
          return (
            <button
              key={s.id}
              onClick={() => { goTo(i); setPlaying(false); }}
              className={cn(
                'flex-shrink-0 w-16 h-10 rounded-lg overflow-hidden border-2 transition-all',
                i === current ? 'border-indigo-500 opacity-100' : 'border-transparent opacity-50 hover:opacity-80'
              )}
            >
              {url
                ? <img src={url} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full bg-gray-200 flex items-center justify-center text-[9px] text-gray-400">{i + 1}</div>
              }
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── SharePage ────────────────────────────────────────────────────────────────

export const SharePage: React.FC = () => {
  const [session, setSession] = useState<PublicSession | null>(null);
  const [ownerName, setOwnerName] = useState<string>('');
  const [capturedAt, setCapturedAt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'guide' | 'video'>('guide');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareToken = params.get('share') || params.get('session');

    if (!shareToken) {
      setError('Invalid share link.');
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const meta = await fetch(`${BACKEND_URL}/v1/public/${shareToken}`).then(r => r.json()) as any;
        if (meta.error) throw new Error(meta.error);

        setOwnerName(meta.owner?.name || 'Anonymous');
        setCapturedAt(meta.capturedAt);

        if (!meta.sessionJsonUrl) throw new Error('Session not ready.');

        const data = await fetch(meta.sessionJsonUrl).then(r => r.json()) as PublicSession;
        setSession(data);
      } catch (e: any) {
        setError(e.message || 'Failed to load walkthrough.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <nav className="h-14 border-b border-gray-100 flex items-center px-6">
          <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
        </nav>
        <div className="max-w-[720px] mx-auto px-6 pt-12 space-y-6">
          <div className="h-9 w-2/3 bg-gray-100 rounded-lg animate-pulse" />
          <div className="h-4 w-1/3 bg-gray-100 rounded animate-pulse" />
          <div className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          {[1,2,3].map(i => <div key={i} className="h-64 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error || !session) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-12 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
          <I.X size={24} className="text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Walkthrough unavailable</h2>
        <p className="text-sm text-gray-500 max-w-xs">{error || 'This link may have expired or been made private.'}</p>
        <a href="https://studiobase-umber.vercel.app" className="mt-6 text-sm font-medium text-indigo-600 hover:underline">
          Create your own walkthrough →
        </a>
      </div>
    );
  }

  const title = session.aiOutputs?.title || session.capturedAt?.toString() || 'Walkthrough';
  const summary = session.aiOutputs?.summary;
  const tags = session.aiOutputs?.tags || [];
  const steps = session.steps || [];
  const stepCount = session.metadata?.stepCount || steps.length;
  const chapterMap = new Map((session.metadata?.chapterBreaks || []).map(c => [c.afterStepId, c]));
  let chapterIndex = 1;
  const siteDomain = domain(session.capturedUrl);
  const hasScreenshots = steps.some(s => s.screenshotKey && session.assets?.[s.screenshotKey]);

  return (
    <div className="min-h-screen bg-[#fafafa]">

      {/* ── Sticky Header ── */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-[760px] mx-auto px-6 h-14 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center">
              <span className="text-white font-bold text-xs">S</span>
            </div>
            <span className="text-[13px] font-semibold text-gray-900 hidden sm:block">StudioBase</span>
          </div>

          <div className="flex-1 min-w-0 mx-4 hidden md:block">
            <p className="text-[13px] text-gray-500 truncate">{title}</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={copyLink}
              className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[13px] font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              {copied ? <I.Check size={14} className="text-green-500" /> : <I.Link size={14} />}
              {copied ? 'Copied!' : 'Copy link'}
            </button>
            <a
              href="https://studiobase-umber.vercel.app"
              className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[13px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
            >
              Create for free
            </a>
          </div>
        </div>
      </nav>

      {/* ── Body ── */}
      <main className="max-w-[720px] mx-auto px-6 pt-12 pb-24">

        {/* Title */}
        <h1 className="text-[32px] font-bold text-gray-950 leading-[1.2] tracking-tight" style={{ textWrap: 'balance' as any }}>
          {title}
        </h1>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-2.5 mt-4 text-[13px] text-gray-500">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-[10px]">
              {ownerName[0]?.toUpperCase() || 'U'}
            </div>
            <span className="font-medium text-gray-700">{ownerName}</span>
          </div>
          {capturedAt && <><span className="text-gray-300">·</span><span>{formatDate(capturedAt)}</span></>}
          <span className="text-gray-300">·</span>
          <span className="flex items-center gap-1"><I.List size={13} />{stepCount} steps</span>
          {siteDomain && <><span className="text-gray-300">·</span><span className="flex items-center gap-1"><I.Globe size={13} />{siteDomain}</span></>}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {tags.map(tag => (
              <span key={tag} className="px-2.5 py-1 bg-gray-100 rounded-full text-[11.5px] font-medium text-gray-600">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Summary */}
        {summary && (
          <div className="mt-6 pl-4 border-l-2 border-indigo-200">
            <p className="text-[14.5px] text-gray-600 leading-relaxed">{summary}</p>
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-gray-200 my-8" />

        {/* ── Tabs ── */}
        {hasScreenshots && (
          <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl mb-8 w-fit">
            <button
              onClick={() => setActiveTab('guide')}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all',
                activeTab === 'guide'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <I.List size={14} />
              Step Guide
            </button>
            <button
              onClick={() => setActiveTab('video')}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all',
                activeTab === 'video'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <I.Play size={14} />
              Cinematic
            </button>
          </div>
        )}

        {/* ── Guide Tab ── */}
        {activeTab === 'guide' && (
          <div className="space-y-4">
            {steps.map((step, i) => (
              <React.Fragment key={step.id || i}>
                {chapterMap.has(step.id) && (
                  <ChapterDivider
                    title={chapterMap.get(step.id)!.chapterTitle}
                    index={chapterIndex++}
                  />
                )}
                <PublicStepCard step={step} index={i} assets={session.assets} />
              </React.Fragment>
            ))}
          </div>
        )}

        {/* ── Video Tab ── */}
        {activeTab === 'video' && (
          <VideoPlayer steps={steps} assets={session.assets} />
        )}

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-gray-100 flex flex-col items-center gap-3 text-center">
          <div className="w-8 h-8 rounded-xl bg-gray-900 flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
          <p className="text-[13px] text-gray-500">
            Made with <span className="font-semibold text-gray-700">StudioBase</span>
          </p>
          <a
            href="https://studiobase-umber.vercel.app"
            className="text-[13px] font-semibold text-indigo-600 hover:underline"
          >
            Create your own walkthrough →
          </a>
        </div>
      </main>
    </div>
  );
};

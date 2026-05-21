import React, { useEffect, useRef, useState } from 'react';
import { I } from '../components/icons';
import { cn } from '../components/ui';
import { BACKEND_URL } from '../../../shared/constants';
import { CinematicPlayer } from '../components/player/CinematicPlayer';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublicStep {
  id: string;
  sequence?: number;
  screenshotKey?: string | null;
  stepTitle?: string | null;
  generatedText?: string | null;
  textOverride?: string | null;
  elementText?: string | null;
  action?: string | null;
  url?: string | null;
  coordinates?: { x: number; y: number; viewportWidth: number; viewportHeight: number } | null;
  animationTarget?: { pctX?: number; pctY?: number; centerX?: number; centerY?: number; zoomScale: number; transitionType?: string } | null;
}

interface PublicSession {
  sessionId?: string;
  capturedAt?: string;
  capturedUrl?: string;
  videoKey?: string | null;
  aiOutputs?: { title?: string; summary?: string; tags?: string[] };
  metadata?: { stepCount?: number; durationMs?: number; chapterBreaks?: { afterStepId: string; chapterTitle: string }[] };
  steps: PublicStep[];
  assets?: Record<string, string>;
  owner?: { name: string };
}

type Tab = 'guide' | 'recording' | 'cinematic';

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
        <div className="bg-gray-50 border-b border-gray-100 relative">
          {!imgLoaded && <div className="w-full aspect-video bg-gray-100 animate-pulse absolute inset-0" />}
          <img
            src={screenshotUrl}
            alt={title}
            className={cn('w-full object-contain transition-opacity duration-300', imgLoaded ? 'opacity-100' : 'opacity-0')}
            onLoad={() => setImgLoaded(true)}
          />
        </div>
      )}
      <div className="px-4 sm:px-7 py-4 sm:py-5">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center">
            <span className="text-[11px] font-bold text-indigo-600">{index + 1}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] sm:text-[15px] font-semibold text-gray-900 leading-snug mb-1.5">{title}</h3>
            {text && <p className="text-[13px] sm:text-[14px] text-gray-600 leading-relaxed">{text}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── ChapterDivider ───────────────────────────────────────────────────────────

const ChapterDivider: React.FC<{ title: string; index: number }> = ({ title, index }) => (
  <div className="flex items-center gap-3 sm:gap-4 py-2">
    <div className="flex-1 h-px bg-gray-200" />
    <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 bg-gray-50 border border-gray-200 rounded-full">
      <span className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Part {index}</span>
      <span className="w-1 h-1 rounded-full bg-gray-300" />
      <span className="text-[12px] sm:text-[13px] font-semibold text-gray-700">{title}</span>
    </div>
    <div className="flex-1 h-px bg-gray-200" />
  </div>
);

// ─── RawVideoPlayer ───────────────────────────────────────────────────────────

const RawVideoPlayer: React.FC<{ url: string }> = ({ url }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  return (
    <div className="w-full rounded-2xl overflow-hidden bg-black shadow-2xl"
      style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.40)' }}>
      <video
        ref={videoRef}
        src={url}
        controls
        playsInline
        className="w-full"
        style={{ aspectRatio: '16/9', background: '#000' }}
      />
      <div className="px-4 py-3 bg-gray-950 flex items-center gap-2">
        <I.Video size={13} className="text-gray-400" />
        <span className="text-[12px] text-gray-400">Raw screen recording</span>
        <a
          href={url}
          download
          className="ml-auto flex items-center gap-1.5 text-[12px] text-gray-300 hover:text-white transition-colors"
        >
          <I.Download size={12} />
          Download
        </a>
      </div>
    </div>
  );
};

// ─── CinematicLocked ─────────────────────────────────────────────────────────

const CinematicLocked: React.FC = () => (
  <div
    className="w-full rounded-2xl overflow-hidden flex flex-col items-center justify-center text-center p-10 sm:p-16 gap-5"
    style={{
      background: 'linear-gradient(135deg, #12121a 0%, #1a1a2e 100%)',
      border: '1px solid rgba(94,92,230,0.2)',
      boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      aspectRatio: '16/9',
    }}
  >
    <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
      <I.Lock size={22} className="text-indigo-400" />
    </div>
    <div>
      <h3 className="text-[18px] sm:text-[20px] font-bold text-white mb-2">Cinematic player not enabled</h3>
      <p className="text-[13px] text-white/50 max-w-xs mx-auto leading-relaxed">
        The creator hasn't unlocked cinematic sharing for this walkthrough yet.
      </p>
    </div>
    <a
      href="https://studiobase-umber.vercel.app"
      className="mt-2 flex items-center gap-2 px-5 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-semibold transition-colors"
    >
      Create your own →
    </a>
  </div>
);

// ─── SharePage ────────────────────────────────────────────────────────────────

export const SharePage: React.FC = () => {
  const [session, setSession] = useState<PublicSession | null>(null);
  const [cinematicEnabled, setCinematicEnabled] = useState(false);
  const [ownerName, setOwnerName] = useState<string>('');
  const [capturedAt, setCapturedAt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('guide');

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
        setCinematicEnabled(!!meta.cinematicEnabled);

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
        <nav className="h-14 border-b border-gray-100 flex items-center px-4 sm:px-6">
          <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
        </nav>
        <div className="max-w-[720px] mx-auto px-4 sm:px-6 pt-10 sm:pt-12 space-y-6">
          <div className="h-8 sm:h-9 w-2/3 bg-gray-100 rounded-lg animate-pulse" />
          <div className="h-4 w-1/3 bg-gray-100 rounded animate-pulse" />
          <div className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          {[1,2,3].map(i => <div key={i} className="h-48 sm:h-64 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error || !session) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 sm:p-12 text-center">
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

  const title = session.aiOutputs?.title || 'Walkthrough';
  const summary = session.aiOutputs?.summary;
  const tags = session.aiOutputs?.tags || [];
  const steps = session.steps || [];
  const stepCount = session.metadata?.stepCount || steps.length;
  const chapterMap = new Map((session.metadata?.chapterBreaks || []).map(c => [c.afterStepId, c]));
  let chapterIndex = 1;
  const siteDomain = domain(session.capturedUrl);

  // Raw video URL from asset proxy
  const videoUrl = session.videoKey && session.assets?.[session.videoKey]
    ? session.assets[session.videoKey]
    : null;

  // Tabs to show — recording tab only if video exists
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'guide',     label: 'Step Guide',  icon: <I.List size={13} /> },
    ...(videoUrl ? [{ id: 'recording' as Tab, label: 'Recording', icon: <I.Video size={13} /> }] : []),
    { id: 'cinematic', label: 'Cinematic',   icon: <I.Play size={13} /> },
  ];

  return (
    <div className="min-h-screen bg-[#fafafa]">

      {/* ── Sticky Header ── */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center">
              <span className="text-white font-bold text-xs">S</span>
            </div>
            <span className="text-[13px] font-semibold text-gray-900 hidden sm:block">StudioBase</span>
          </div>

          <div className="flex-1 min-w-0 mx-2 sm:mx-4 hidden md:block">
            <p className="text-[13px] text-gray-500 truncate">{title}</p>
          </div>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <button
              onClick={copyLink}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 h-8 rounded-lg text-[12px] sm:text-[13px] font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              {copied ? <I.Check size={14} className="text-green-500" /> : <I.Link size={14} />}
              <span className="hidden sm:inline">{copied ? 'Copied!' : 'Copy link'}</span>
            </button>
            <a
              href="https://studiobase-umber.vercel.app"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 h-8 rounded-lg text-[12px] sm:text-[13px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors whitespace-nowrap"
            >
              <span className="hidden sm:inline">Create for free</span>
              <span className="sm:hidden">Try free</span>
            </a>
          </div>
        </div>
      </nav>

      {/* ── Header section (narrow) ── */}
      <div className="max-w-[760px] mx-auto px-4 sm:px-6 pt-8 sm:pt-12">

        {/* Title */}
        <h1
          className="text-2xl sm:text-[30px] lg:text-[32px] font-bold text-gray-950 leading-[1.2] tracking-tight"
          style={{ textWrap: 'balance' as any }}
        >
          {title}
        </h1>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 mt-3 sm:mt-4 text-[12px] sm:text-[13px] text-gray-500">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-[9px] sm:text-[10px]">
              {ownerName[0]?.toUpperCase() || 'U'}
            </div>
            <span className="font-medium text-gray-700">{ownerName}</span>
          </div>
          {capturedAt && <><span className="text-gray-300">·</span><span>{formatDate(capturedAt)}</span></>}
          <span className="text-gray-300">·</span>
          <span className="flex items-center gap-1"><I.List size={12} />{stepCount} steps</span>
          {siteDomain && <><span className="text-gray-300">·</span><span className="flex items-center gap-1"><I.Globe size={12} />{siteDomain}</span></>}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3 sm:mt-4">
            {tags.map(tag => (
              <span key={tag} className="px-2.5 py-1 bg-gray-100 rounded-full text-[11px] sm:text-[11.5px] font-medium text-gray-600">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Summary */}
        {summary && (
          <div className="mt-5 sm:mt-6 pl-3 sm:pl-4 border-l-2 border-indigo-200">
            <p className="text-[13px] sm:text-[14.5px] text-gray-600 leading-relaxed">{summary}</p>
          </div>
        )}

        <div className="h-px bg-gray-200 my-6 sm:my-8" />

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl mb-6 sm:mb-8 w-full sm:w-fit">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-[12px] sm:text-[13px] font-semibold transition-all relative',
                activeTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {tab.icon}
              {tab.label}
              {/* Lock badge on cinematic if not enabled */}
              {tab.id === 'cinematic' && !cinematicEnabled && (
                <span className="ml-0.5 w-3.5 h-3.5 bg-amber-100 rounded-full flex items-center justify-center">
                  <I.Lock size={8} className="text-amber-600" />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Guide Tab ── (narrow column) */}
      {activeTab === 'guide' && (
        <div className="max-w-[760px] mx-auto px-4 sm:px-6 pb-20 sm:pb-24">
          <div className="space-y-3 sm:space-y-4">
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
        </div>
      )}

      {/* ── Recording Tab ── (wide) */}
      {activeTab === 'recording' && videoUrl && (
        <div className="w-full px-3 sm:px-6 lg:px-10 pb-12 sm:pb-20 max-w-[1200px] mx-auto">
          <RawVideoPlayer url={videoUrl} />
          <div className="mt-4 p-4 bg-green-50 border border-green-100 rounded-xl flex items-start gap-3">
            <I.CheckCircle size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
            <p className="text-[13px] text-green-700">
              <strong>Free</strong> — raw screen recording is always available to anyone with this link. No credits required.
            </p>
          </div>
        </div>
      )}

      {/* ── Cinematic Tab ── (wide) */}
      {activeTab === 'cinematic' && (
        <div className="w-full px-3 sm:px-6 lg:px-10 pb-12 sm:pb-20 max-w-[1200px] mx-auto">
          {cinematicEnabled ? (
            <>
              <CinematicPlayer
                steps={steps}
                assets={session.assets ?? {}}
                chapterBreaks={session.metadata?.chapterBreaks}
                renderMode="slideshow"
              />
              <p className="mt-3 text-center text-[12px] text-gray-400 sm:hidden">
                Tap the player to pause · swipe the timeline to scrub
              </p>
            </>
          ) : (
            <CinematicLocked />
          )}
        </div>
      )}

      {/* ── Footer ── */}
      <div className="max-w-[760px] mx-auto px-4 sm:px-6 pb-20 sm:pb-24">
        <div className="mt-12 sm:mt-16 pt-6 sm:pt-8 border-t border-gray-100 flex flex-col items-center gap-3 text-center">
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
      </div>
    </div>
  );
};

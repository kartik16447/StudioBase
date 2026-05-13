import React, { useEffect, useState } from 'react';
import { useStudioStore } from '../store/useStudioStore';
import { I } from '../components/icons';
import { SummaryCallout, StepCard, ChapterBreak, ShareHeader } from '../components/studio';
import { Avatar, StepCardSkeleton, Button } from '../components/ui';
import { BACKEND_URL } from '../../../shared/constants/index';

export const SharePage: React.FC = () => {
  const session = useStudioStore(state => state.session);
  const setSession = useStudioStore(state => state.setSession);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareToken = params.get('session');

    if (!shareToken) {
      setError('No session token provided. Please check the link.');
      setLoading(false);
      return;
    }

    const fetchSession = async () => {
      try {
        setLoading(true);
        // Step 1: Fetch session metadata from backend
        const res = await fetch(`${BACKEND_URL}/sessions/${shareToken}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to fetch session metadata');
        }
        const meta = await res.json();

        if (meta.status !== 'ready' || !meta.sessionJsonUrl) {
          setError(`Session is still ${meta.status}. Please try again later.`);
          setLoading(false);
          return;
        }

        // Step 2: Fetch actual session JSON from R2
        const jsonRes = await fetch(meta.sessionJsonUrl);
        if (!jsonRes.ok) throw new Error('Failed to fetch session data from storage');
        
        const sessionData = await jsonRes.json();
        setSession(sessionData);
      } catch (err: any) {
        setError(err.message || 'An unexpected error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, [setSession]);

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex-1 min-h-0 scroll-y bg-bg">
        <div className="h-14 bg-surface border-b border-border" />
        <div className="max-w-[860px] mx-auto px-6 pt-10 pb-32 space-y-6">
          <div className="h-10 w-3/4 bg-surface-2 rounded-sm animate-pulse" />
          <div className="flex items-center gap-3 mt-4">
            <div className="w-6 h-6 rounded-full bg-surface-2 animate-pulse" />
            <div className="w-32 h-4 bg-surface-2 rounded-pill animate-pulse" />
          </div>
          <StepCardSkeleton />
          <StepCardSkeleton />
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-20 text-center">
        <div className="w-16 h-16 rounded-full bg-danger/10 text-danger flex items-center justify-center mb-4">
          <I.X size={32} />
        </div>
        <h2 className="text-[22px] font-semibold text-text">Unable to load session</h2>
        <p className="text-[14px] text-text-2 mt-2 max-w-[320px]">
          {error || 'Something went wrong while fetching the walkthrough.'}
        </p>
        <Button variant="ghost" size="md" className="mt-6" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    );
  }

  const chapterMap = new Map((session.metadata.chapterBreaks || []).map(c => [c.afterStepId, c]));

  return (
    <div className="flex-1 min-h-0 scroll-y bg-bg">
      <ShareHeader session={session} />

      <div className="max-w-[860px] mx-auto px-6 pt-10 pb-32">
        <h1 className="text-[36px] font-semibold text-text tracking-tight leading-[1.15]" style={{ textWrap: 'balance' as any }}>
          {session.aiOutputs.title}
        </h1>
        <div className="flex items-center gap-3 mt-3 text-[13px] text-text-2">
          <Avatar name="Kartik Upadhyay" size={22} hue={244} />
          <span className="font-medium text-text">Kartik Upadhyay</span>
          <span className="text-text-3">·</span>
          <span>{formatDate(session.capturedAt)}</span>
        </div>

        <SummaryCallout session={session} />

        <div className="space-y-6">
          {session.steps.map((s, i) => (
            <React.Fragment key={s.id}>
              <StepCard step={s} index={i} hue={244 + (i*11) % 80} />
              {chapterMap.has(s.id) && (
                <ChapterBreak 
                   index={[...chapterMap.values()].indexOf(chapterMap.get(s.id)!) + 2} 
                   title={chapterMap.get(s.id)!.chapterTitle} 
                />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="mt-16 text-center text-[12.5px] text-text-3 flex items-center justify-center gap-1.5">
          <I.Sparkles size={12} /> Created with StudioBase ·
          <a className="text-primary font-medium hover:opacity-80" href="#">Make your own walkthrough</a>
        </div>
      </div>
    </div>
  );
};

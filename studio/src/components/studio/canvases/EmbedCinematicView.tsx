import React, { useMemo } from 'react';
import { useStudioStore } from '../../../store/useStudioStore';
import { CinematicPlayer } from '../../player/CinematicPlayer';
import { Watermark } from './EmbedSOPView';

export const EmbedCinematicView: React.FC = () => {
  const session = useStudioStore(state => state.session);

  const steps = useMemo(() => {
    const raw = (session?.steps ?? []) as any[];
    return [...raw].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  }, [session?.steps]);

  const assets = (session?.assets ?? {}) as Record<string, string>;

  const videoUrl = useMemo(() => {
    const key = (session as any)?.videoKey;
    return key ? (assets[key] ?? null) : null;
  }, [session, assets]);

  const sessionStartMs = useMemo(() => {
    const s = (session as any)?.startedAt;
    return s ? new Date(s).getTime() : (steps[0]?.timestamp ?? 0);
  }, [session, steps]);

  const chapterBreaks = session?.metadata?.chapterBreaks;

  if (!session) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#0c0c0f]">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-[#0c0c0f] relative">
      <CinematicPlayer
        steps={steps}
        assets={assets}
        videoUrl={videoUrl}
        sessionStartMs={sessionStartMs}
        chapterBreaks={chapterBreaks}
        renderMode={videoUrl ? 'hybrid' : 'slideshow'}
      />
      <Watermark />
    </div>
  );
};

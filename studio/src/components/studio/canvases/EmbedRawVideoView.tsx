import React, { useMemo } from 'react';
import { useStudioStore } from '../../../store/useStudioStore';
import { Watermark } from './EmbedSOPView';

export const EmbedRawVideoView: React.FC = () => {
  const session = useStudioStore(state => state.session);
  const assets  = (session?.assets ?? {}) as Record<string, string>;

  const videoUrl = useMemo(() => {
    const key = (session as any)?.videoKey;
    return key ? (assets[key] ?? null) : null;
  }, [session, assets]);

  if (!session) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
      </div>
    );
  }

  if (!videoUrl) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-black gap-3">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5">
          <rect x="2" y="7" width="15" height="10" rx="2"/>
          <path d="M17 9.5 22 7v10l-5-2.5"/>
        </svg>
        <p className="text-[13px] text-white/30">No raw video available for this session.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-black relative">
      <video
        src={videoUrl}
        controls
        playsInline
        className="w-full h-full object-contain"
        style={{ display: 'block' }}
      />
      <Watermark />
    </div>
  );
};

import { useMemo } from 'react';

export type EmbedMode = 'sop' | 'video' | 'demo' | 'slides' | 'rawvideo';

export function useIsEmbed(): { isEmbed: boolean; mode: EmbedMode } {
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const embedParam = params.get('embed') === '1';
    let inIframe = false;
    try { inIframe = window.self !== window.top; } catch { inIframe = true; }
    const isEmbed = embedParam || inIframe;
    const raw = params.get('mode') || 'sop';
    const mode: EmbedMode = (['video', 'demo', 'slides', 'rawvideo'] as EmbedMode[]).includes(raw as EmbedMode)
      ? (raw as EmbedMode)
      : 'sop';
    return { isEmbed, mode };
  }, []);
}

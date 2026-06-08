import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStudioStore } from '../../../store/useStudioStore';
import { I } from '../../icons';
import { cn } from '../../ui';

type EmbedTab = 'sop' | 'video' | 'demo' | 'slides' | 'rawvideo';

const TAB_META: { id: EmbedTab; label: string; icon: React.FC<any>; desc: string }[] = [
  { id: 'sop',      label: 'SOP',       icon: I.FileText,     desc: 'Step-by-step guide with arrows' },
  { id: 'slides',   label: 'Slides',    icon: I.Presentation, desc: 'Presentation mode with thumbnail strip' },
  { id: 'video',    label: 'Cinematic', icon: I.Play,         desc: 'Auto-playing narrated walkthrough with voiceover' },
  { id: 'demo',     label: 'Demo',      icon: I.Cursor,       desc: 'Interactive click-through' },
  { id: 'rawvideo', label: 'Raw Video', icon: I.Video,        desc: 'Original unedited screen recording' },
];

function buildEmbedUrl(mode: EmbedTab, shareToken: string | null) {
  if (!shareToken) return null;
  return `${window.location.origin}/s/${shareToken}?embed=1&mode=${mode}`;
}

function iframeSnippet(url: string, title: string, aspectStr: string) {
  return `<iframe\n  src="${url}"\n  width="100%"\n  style="aspect-ratio: ${aspectStr}; border: none;"\n  allowfullscreen\n  title="${title}"\n></iframe>`;
}

export const EmbedModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const session = useStudioStore(s => s.session);
  const [activeTab, setActiveTab] = useState<EmbedTab>('sop');
  const [copied, setCopied] = useState(false);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const title = session?.aiOutputs?.title ?? 'StudioBase Walkthrough';
  const shareToken = (session as any)?.shareToken ?? null;
  const embedUrl = buildEmbedUrl(activeTab, shareToken);

  const coords = session?.steps?.[0]?.coordinates;
  const aspectStr = (coords && coords.viewportWidth && coords.viewportHeight) 
    ? `${coords.viewportWidth} / ${coords.viewportHeight}` 
    : '16 / 9';

  const snippet = embedUrl ? iframeSnippet(embedUrl, title, aspectStr) : '<!-- Share this session publicly first to get an embed URL -->';

  const handleCopy = () => {
    if (!embedUrl) return;
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[200]"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed inset-0 flex items-center justify-center z-[201] pointer-events-none p-4"
          >
            <div className="pointer-events-auto w-full max-w-[620px] bg-[#111118] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col">

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
                <div className="flex items-center gap-2">
                  <I.Code2 className="w-4 h-4 text-primary" />
                  <span className="text-[14px] font-semibold text-white">Embed</span>
                  <span className="text-[12px] text-white/40 truncate max-w-[200px]">{title}</span>
                </div>
                <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-1 rounded">
                  <I.X className="w-4 h-4" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 px-5 pt-4">
                {TAB_META.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setActiveTab(t.id); setCopied(false); }}
                    className={cn(
                      'flex items-center gap-1.5 px-3 h-8 rounded-lg text-[13px] font-medium transition-all',
                      activeTab === t.id
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-white/50 hover:text-white hover:bg-white/[0.06]',
                    )}
                  >
                    <t.icon size={13} strokeWidth={2} />
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="p-5 space-y-4">
                {/* Description */}
                <p className="text-[12px] text-white/40">
                  {TAB_META.find(t => t.id === activeTab)?.desc}
                </p>

                {/* Live preview — scaled-down iframe so the full embed is visible */}
                <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-black relative" style={{ height: 220 }}>
                  {embedUrl ? (
                    <iframe
                      key={embedUrl}
                      src={embedUrl}
                      title="Embed preview"
                      sandbox="allow-scripts allow-same-origin"
                      style={{
                        position: 'absolute',
                        top: 0, left: 0,
                        width: '200%',
                        height: '200%',
                        border: 0,
                        transform: 'scale(0.5)',
                        transformOrigin: 'top left',
                        pointerEvents: 'none',
                      }}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-white/30 text-[13px]">
                      Share this session publicly first to enable embedding
                    </div>
                  )}
                </div>

                {/* Code block */}
                <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
                    <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">iframe snippet</span>
                    <button
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:opacity-80 transition-opacity"
                    >
                      {copied
                        ? <><I.Check size={12} strokeWidth={3} /> Copied!</>
                        : <><I.Copy size={12} strokeWidth={2} /> Copy</>}
                    </button>
                  </div>
                  <pre className="px-4 py-3 text-[11.5px] font-mono text-white/60 overflow-x-auto whitespace-pre leading-relaxed">
                    {snippet}
                  </pre>
                </div>

                <p className="text-[11px] text-white/25">
                  Paste into Notion (as /embed), Confluence, or any HTML page. Viewers don't need to be signed in.
                </p>
                <p className="text-[11px] text-white/25 mt-2">
                  Note: iframes do not render in Gmail or most email clients. For email, use a linked image or thumbnail that links to the share URL instead.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

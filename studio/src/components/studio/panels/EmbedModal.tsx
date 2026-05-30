import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStudioStore } from '../../../store/useStudioStore';
import { I } from '../../icons';
import { cn } from '../../ui';

type EmbedTab = 'sop' | 'video' | 'demo' | 'slides';

const TAB_META: { id: EmbedTab; label: string; icon: React.FC<any>; desc: string }[] = [
  { id: 'sop',    label: 'SOP',    icon: I.FileText,       desc: 'Step-by-step guide with arrows' },
  { id: 'slides', label: 'Slides', icon: I.Presentation,      desc: 'Presentation mode with thumbnail strip' },
  { id: 'video',  label: 'Video',  icon: I.Play,           desc: 'Auto-playing slideshow' },
  { id: 'demo',   label: 'Demo',   icon: I.Cursor,         desc: 'Interactive click-through' },
];

function buildEmbedUrl(mode: EmbedTab) {
  // Start from the current URL so all existing params (session, workspaceId, etc.) are preserved
  const params = new URLSearchParams(window.location.search);
  params.set('embed', '1');
  params.set('mode', mode);
  // Remove any stale non-embed-related params that shouldn't be in the embed URL
  params.delete('token');
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

function iframeSnippet(url: string, title: string) {
  return `<iframe\n  src="${url}"\n  width="100%"\n  height="560"\n  frameborder="0"\n  allowfullscreen\n  title="${title}"\n></iframe>`;
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
  const embedUrl = buildEmbedUrl(activeTab);
  const snippet = iframeSnippet(embedUrl, title);

  const handleCopy = () => {
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

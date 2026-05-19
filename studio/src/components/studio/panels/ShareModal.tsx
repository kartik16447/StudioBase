import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStudioStore } from '../../../store/useStudioStore';
import { I } from '../../icons';
import { apiClient } from '../../../lib/apiClient';

interface ShareState {
  isPublic: boolean;
  shareUrl: string | null;
  shareToken: string | null;
}

export const ShareModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const session = useStudioStore((s) => s.session);
  const sessionId = (session as any)?.sessionId ?? (session as any)?.id ?? null;
  const title = session?.aiOutputs?.title ?? 'Untitled';

  const [shareState, setShareState] = useState<ShareState>({
    isPublic: !!(session as any)?.isPublic,
    shareUrl: null,
    shareToken: (session as any)?.shareToken ?? null,
  });
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Derive share URL from token — always use /s/:token format
  useEffect(() => {
    if (shareState.shareToken) {
      setShareState((s) => ({
        ...s,
        shareUrl: `${window.location.origin}/s/${s.shareToken}`,
      }));
    }
  }, [shareState.shareToken]);

  const togglePublic = async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const res = await apiClient.sessions.setShare(sessionId, !shareState.isPublic);
      setShareState({
        isPublic: res.isPublic,
        shareToken: res.shareToken,
        shareUrl: res.shareUrl,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (!shareState.shareUrl) return;
    navigator.clipboard.writeText(shareState.shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[200]"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed inset-0 flex items-center justify-center z-[201] pointer-events-none"
          >
            <div className="pointer-events-auto w-[420px] bg-[#111118] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
                <div className="flex items-center gap-2">
                  <I.Share2 className="w-4 h-4 text-primary" />
                  <span className="text-[14px] font-semibold text-text">Share</span>
                </div>
                <button
                  onClick={onClose}
                  className="text-text-3 hover:text-text transition-colors p-1 rounded"
                >
                  <I.X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Session title */}
                <p className="text-[12px] text-text-3 truncate">{title}</p>

                {/* Public toggle */}
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                  <div>
                    <p className="text-[13px] font-medium text-text">Public link</p>
                    <p className="text-[11px] text-text-3 mt-0.5">Anyone with the link can view this session</p>
                  </div>
                  <button
                    onClick={togglePublic}
                    disabled={loading}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 overflow-hidden ${
                      shareState.isPublic ? 'bg-primary' : 'bg-white/[0.12]'
                    } ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                        shareState.isPublic ? 'translate-x-[1.375rem]' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Share URL */}
                {shareState.isPublic && shareState.shareUrl && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-2"
                  >
                    <p className="text-[11px] font-semibold text-text-3 uppercase tracking-wider">Share link</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-text-2 truncate font-mono">
                        {shareState.shareUrl}
                      </div>
                      <button
                        onClick={copyLink}
                        className="flex-shrink-0 flex items-center gap-1.5 text-[12px] px-3 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white font-semibold transition-colors"
                      >
                        {copied ? <I.Check className="w-3.5 h-3.5" /> : <I.Copy className="w-3.5 h-3.5" />}
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Workspace-only note */}
                {!shareState.isPublic && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <I.Lock className="w-3.5 h-3.5 text-text-3 mt-0.5 flex-shrink-0" />
                    <p className="text-[12px] text-text-3">
                      Only workspace members can access this session. Enable public link to share externally.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStudioStore } from '../../../store/useStudioStore';
import { I } from '../../icons';
import { apiClient } from '../../../lib/apiClient';
import { cn } from '../../ui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShareFormats {
  sopEnabled: boolean;
  rawEnabled: boolean;
  cinematicEnabled: boolean; // true = unlocked (paid)
}

const CINEMATIC_CREDIT_COST = 1;

// ─── FormatCard ──────────────────────────────────────────────────────────────

interface FormatCardProps {
  icon: React.ReactNode;
  gradient: string;
  title: string;
  description: string;
  badge: 'free' | 'credit' | 'on';
  enabled: boolean;
  disabled?: boolean; // greys out when public link is off
  locked?: boolean;   // cinematic pre-unlock state
  onToggle?: () => void;
  onUnlock?: () => void;
  unlockLoading?: boolean;
}

const FormatCard: React.FC<FormatCardProps> = ({
  icon, gradient, title, description, badge,
  enabled, disabled, locked, onToggle, onUnlock, unlockLoading,
}) => (
  <div
    className={cn(
      'relative flex flex-col gap-3 rounded-xl p-4 border transition-all duration-200',
      disabled
        ? 'opacity-40 pointer-events-none border-white/[0.06] bg-white/[0.02]'
        : locked
        ? 'border-white/[0.08] bg-white/[0.03]'
        : enabled
        ? 'border-indigo-500/25 bg-indigo-500/[0.06]'
        : 'border-white/[0.06] bg-white/[0.03]',
    )}
  >
    {/* Icon + gradient bubble */}
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: gradient }}
    >
      {icon}
    </div>

    {/* Text */}
    <div className="flex-1 min-w-0">
      <p className="text-[13px] font-semibold text-text leading-tight">{title}</p>
      <p className="text-[11px] text-text-3 mt-0.5 leading-snug">{description}</p>
    </div>

    {/* Badge */}
    <div className="flex items-center justify-between">
      {badge === 'free' && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
          FREE
        </span>
      )}
      {badge === 'credit' && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
          {CINEMATIC_CREDIT_COST} credit
        </span>
      )}
      {badge === 'on' && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
          UNLOCKED
        </span>
      )}

      {/* Toggle (SOP + Raw) */}
      {!locked && onToggle && (
        <button
          onClick={onToggle}
          className={cn(
            'relative w-9 h-5 rounded-full transition-colors duration-200',
            enabled ? 'bg-indigo-500' : 'bg-white/[0.12]',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200',
              enabled ? 'translate-x-4' : 'translate-x-0',
            )}
          />
        </button>
      )}

      {/* Unlock button (cinematic locked) */}
      {locked && onUnlock && (
        <button
          onClick={onUnlock}
          disabled={unlockLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold transition-colors disabled:opacity-50"
        >
          {unlockLoading ? (
            <I.Loader size={11} className="animate-spin" />
          ) : (
            <I.Lock size={11} />
          )}
          {unlockLoading ? 'Unlocking…' : `Unlock · ${CINEMATIC_CREDIT_COST}cr`}
        </button>
      )}
    </div>
  </div>
);

// ─── ShareModal ───────────────────────────────────────────────────────────────

export const ShareModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const session    = useStudioStore((s) => s.session);
  const sessionId  = (session as any)?.sessionId ?? (session as any)?.id ?? null;
  const title      = session?.aiOutputs?.title ?? 'Untitled';
  const hasVideo   = !!((session as any)?.videoKey);

  // Public link
  const [isPublic,   setIsPublic]   = useState(!!(session as any)?.isPublic);
  const [shareToken, setShareToken] = useState<string | null>((session as any)?.shareToken ?? null);
  const [publicLoading, setPublicLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Format visibility
  const [formats, setFormats] = useState<ShareFormats>({
    sopEnabled:       (session as any)?.sopEnabled       !== false,
    rawEnabled:       (session as any)?.rawEnabled       !== false,
    cinematicEnabled: !!(session as any)?.cinematicEnabled,
  });
  const [_formatSaving, setFormatSaving] = useState(false);

  // Cinematic unlock
  const [cinematicLoading, setCinematicLoading] = useState(false);
  const [cinematicError,   setCinematicError]   = useState<string | null>(null);

  // Derive share URL
  const shareUrl = shareToken
    ? `${window.location.origin}/s/${shareToken}`
    : null;

  // Sync when session changes (e.g. after publish)
  useEffect(() => {
    setIsPublic(!!(session as any)?.isPublic);
    setShareToken((session as any)?.shareToken ?? null);
    setFormats({
      sopEnabled:       (session as any)?.sopEnabled       !== false,
      rawEnabled:       (session as any)?.rawEnabled       !== false,
      cinematicEnabled: !!(session as any)?.cinematicEnabled,
    });
    setCinematicError(null);
  }, [session]);

  // ── Public link toggle ──────────────────────────────────────────────────────
  const togglePublic = async () => {
    if (!sessionId) return;
    setPublicLoading(true);
    try {
      const res = await apiClient.sessions.setShare(sessionId, !isPublic);
      setIsPublic(res.isPublic);
      setShareToken(res.shareToken);
    } catch (e) {
      console.error(e);
    } finally {
      setPublicLoading(false);
    }
  };

  // ── Format toggle (SOP / Raw) ───────────────────────────────────────────────
  const toggleFormat = async (field: 'sopEnabled' | 'rawEnabled') => {
    if (!sessionId) return;
    const next = !formats[field];
    setFormats(f => ({ ...f, [field]: next }));
    setFormatSaving(true);
    try {
      await apiClient.patch(`/sessions/${sessionId}/share-formats`, { [field]: next });
    } catch (e) {
      // Revert on error
      setFormats(f => ({ ...f, [field]: !next }));
      console.error(e);
    } finally {
      setFormatSaving(false);
    }
  };

  // ── Cinematic unlock ────────────────────────────────────────────────────────
  const unlockCinematic = async () => {
    if (!sessionId || formats.cinematicEnabled) return;
    setCinematicLoading(true);
    setCinematicError(null);
    try {
      const res = await apiClient.patch<{ cinematicEnabled: boolean; charged: boolean; error?: string }>(
        `/sessions/${sessionId}/enable-cinematic`,
        {}
      );
      if ((res as any).error === 'INSUFFICIENT_CREDITS') {
        setCinematicError(`Not enough credits. You need ${CINEMATIC_CREDIT_COST} credit.`);
        return;
      }
      setFormats(f => ({ ...f, cinematicEnabled: true }));
    } catch (e: any) {
      setCinematicError(e?.message || 'Failed to unlock cinematic.');
    } finally {
      setCinematicLoading(false);
    }
  };

  const copyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const allDisabled = !formats.sopEnabled && !formats.rawEnabled && !formats.cinematicEnabled;

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
            className="fixed inset-0 flex items-center justify-center z-[201] pointer-events-none p-4"
          >
            <div className="pointer-events-auto w-full max-w-[480px] bg-[#111118] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
                <div className="flex items-center gap-2">
                  <I.Share2 className="w-4 h-4 text-primary" />
                  <span className="text-[14px] font-semibold text-text">Share walkthrough</span>
                </div>
                <button onClick={onClose} className="text-text-3 hover:text-text transition-colors p-1 rounded">
                  <I.X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">

                {/* Session title */}
                <p className="text-[12px] text-text-3 truncate">{title}</p>

                {/* Public link toggle */}
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                  <div>
                    <p className="text-[13px] font-medium text-text">Public link</p>
                    <p className="text-[11px] text-text-3 mt-0.5">Anyone with the link can view</p>
                  </div>
                  <button
                    onClick={togglePublic}
                    disabled={publicLoading}
                    className={cn(
                      'relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0',
                      isPublic ? 'bg-primary' : 'bg-white/[0.12]',
                      publicLoading && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200',
                        isPublic ? 'translate-x-[1.375rem]' : 'translate-x-0',
                      )}
                    />
                  </button>
                </div>

                {/* ── Format Cards ── */}
                <div>
                  <p className="text-[11px] font-semibold text-text-3 uppercase tracking-wider mb-3">
                    What viewers can access
                  </p>

                  <div className="grid grid-cols-3 gap-2">
                    {/* SOP */}
                    <FormatCard
                      icon={<I.List size={16} className="text-white" />}
                      gradient="linear-gradient(135deg, #22c55e88, #16a34a88)"
                      title="Step Guide"
                      description="Full SOP walkthrough"
                      badge="free"
                      enabled={formats.sopEnabled}
                      disabled={!isPublic}
                      onToggle={() => toggleFormat('sopEnabled')}
                    />

                    {/* Raw Recording */}
                    <FormatCard
                      icon={<I.Video size={16} className="text-white" />}
                      gradient="linear-gradient(135deg, #3b82f688, #2563eb88)"
                      title="Recording"
                      description={hasVideo ? 'Screen capture' : 'No recording'}
                      badge="free"
                      enabled={formats.rawEnabled && hasVideo}
                      disabled={!isPublic || !hasVideo}
                      onToggle={hasVideo ? () => toggleFormat('rawEnabled') : undefined}
                    />

                    {/* Cinematic */}
                    <FormatCard
                      icon={<I.Play size={16} className="text-white" />}
                      gradient={
                        formats.cinematicEnabled
                          ? 'linear-gradient(135deg, #6366f188, #4f46e588)'
                          : 'linear-gradient(135deg, #ffffff18, #ffffff08)'
                      }
                      title="Cinematic"
                      description={formats.cinematicEnabled ? 'AI-powered player' : 'Unlock to share'}
                      badge={formats.cinematicEnabled ? 'on' : 'credit'}
                      enabled={formats.cinematicEnabled}
                      disabled={!isPublic}
                      locked={!formats.cinematicEnabled}
                      onUnlock={!formats.cinematicEnabled ? unlockCinematic : undefined}
                      unlockLoading={cinematicLoading}
                    />
                  </div>

                  {/* Credit error */}
                  {cinematicError && (
                    <p className="mt-2 text-[11px] text-red-400 px-1">{cinematicError}</p>
                  )}

                  {/* All-disabled warning */}
                  {isPublic && allDisabled && (
                    <div className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <I.AlertTriangle size={13} className="text-amber-400 flex-shrink-0" />
                      <p className="text-[11px] text-amber-300">
                        All formats hidden — viewers will see an empty page.
                      </p>
                    </div>
                  )}
                </div>

                {/* Share link */}
                {isPublic && shareUrl && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                  >
                    <p className="text-[11px] font-semibold text-text-3 uppercase tracking-wider mb-2">Share link</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[11px] text-text-2 truncate font-mono">
                        {shareUrl}
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

                {/* Private note */}
                {!isPublic && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <I.Lock className="w-3.5 h-3.5 text-text-3 mt-0.5 flex-shrink-0" />
                    <p className="text-[12px] text-text-3">
                      Only workspace members can access this session. Enable the public link to share externally.
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

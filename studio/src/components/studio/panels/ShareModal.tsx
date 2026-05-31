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
  cinematicEnabled: boolean;
}

const CINEMATIC_CREDIT_COST = 2;

// ─── FormatCard ──────────────────────────────────────────────────────────────

interface FormatCardProps {
  icon: React.ReactNode;
  accentColor: string;        // e.g. '#22c55e'
  title: string;
  description: string;
  badge: 'free' | 'credit' | 'on';
  enabled: boolean;
  disabled?: boolean;
  locked?: boolean;
  onToggle?: () => void;
  onUnlock?: () => void;
  unlockLoading?: boolean;
  creditBalance?: number | null;
}

const FormatCard: React.FC<FormatCardProps> = ({
  icon, accentColor, title, description, badge,
  enabled, disabled, locked, onToggle, onUnlock, unlockLoading, creditBalance,
}) => (
  <div
    className={cn(
      'relative flex flex-col gap-3 rounded-xl p-4 border transition-all duration-200 cursor-default',
      disabled
        ? 'opacity-40 pointer-events-none border-white/[0.06] bg-white/[0.02]'
        : locked
        ? 'border-white/[0.08] bg-white/[0.03]'
        : enabled
        ? 'border-white/20 bg-white/[0.06]'
        : 'border-white/[0.06] bg-white/[0.03]',
    )}
    style={enabled && !disabled ? { borderColor: `${accentColor}40` } : undefined}
  >
    {/* Icon bubble */}
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: `${accentColor}22` }}
    >
      {icon}
    </div>

    {/* Text */}
    <div className="flex-1 min-w-0">
      <p className="text-[13px] font-semibold text-white leading-tight">{title}</p>
      <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'rgba(255,255,255,0.50)' }}>{description}</p>
    </div>

    {/* Badge + action row */}
    <div className="flex items-center justify-between gap-2">
      {badge === 'free' && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          FREE
        </span>
      )}
      {badge === 'credit' && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
          {CINEMATIC_CREDIT_COST} credit
        </span>
      )}
      {badge === 'on' && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
          UNLOCKED
        </span>
      )}

      {/* Toggle (SOP + Raw) */}
      {!locked && onToggle && (
        <button
          onClick={onToggle}
          className={cn(
            'relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0',
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
          {unlockLoading
            ? 'Unlocking…'
            : `Unlock (${CINEMATIC_CREDIT_COST}cr · ${creditBalance} left)`}
        </button>
      )}
    </div>
  </div>
);

// ─── ShareModal ───────────────────────────────────────────────────────────────

export const ShareModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const session          = useStudioStore((s) => s.session);
  const setSession       = useStudioStore((s) => s.setSession);
  const creditsBalance   = useStudioStore((s) => s.creditsBalance);
  const openCreditsModal = useStudioStore((s) => s.setCreditsModalOpen);
  const sessionId  = (session as any)?.sessionId ?? (session as any)?.id ?? null;
  const title      = session?.aiOutputs?.title ?? 'Untitled';
  const hasVideo   = !!((session as any)?.videoKey);

  // Public link
  const [isPublic,     setIsPublic]     = useState(!!(session as any)?.isPublic);
  const [shareToken,   setShareToken]   = useState<string | null>((session as any)?.shareToken ?? null);
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
  const [cinematicConfirmOpen, setCinematicConfirmOpen] = useState(false);

  // Credit balance comes from the global store (fetched on app load)

  const shareUrl = shareToken
    ? `${window.location.origin}/s/${shareToken}`
    : null;

  // Sync when session changes
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


  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setCinematicConfirmOpen(false); onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

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

  // ── Format toggle ───────────────────────────────────────────────────────────
  const toggleFormat = async (field: 'sopEnabled' | 'rawEnabled') => {
    if (!sessionId) return;
    const next = !formats[field];
    setFormats(f => ({ ...f, [field]: next }));
    setFormatSaving(true);
    try {
      await apiClient.patch(`/sessions/${sessionId}/share-formats`, { [field]: next });
      // Keep store in sync so re-opening the modal reads fresh values
      if (session) setSession({ ...session, [field]: next } as any);
    } catch {
      setFormats(f => ({ ...f, [field]: !next }));
    } finally {
      setFormatSaving(false);
    }
  };

  // ── Cinematic unlock ────────────────────────────────────────────────────────
  const requestUnlock = () => {
    if (!sessionId || formats.cinematicEnabled) return;
    setCinematicConfirmOpen(true);
  };

  const unlockCinematic = async () => {
    setCinematicConfirmOpen(false);
    if (!sessionId || formats.cinematicEnabled) return;
    setCinematicLoading(true);
    setCinematicError(null);
    try {
      const res = await apiClient.patch<{ cinematicEnabled: boolean; charged: boolean; error?: string }>(
        `/sessions/${sessionId}/enable-cinematic`,
        {}
      );
      if ((res as any).error === 'INSUFFICIENT_CREDITS') {
        setCinematicError(`Not enough credits. You need ${CINEMATIC_CREDIT_COST} credits.`);
        return;
      }
      setFormats(f => ({ ...f, cinematicEnabled: true }));
      // Keep store in sync — cinematic is now unlocked (credit spent)
      if (session) setSession({ ...session, cinematicEnabled: true } as any);
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
            className="fixed inset-0 bg-black/60 z-[200]"
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
            <div
              className="pointer-events-auto w-full max-w-[480px] rounded-2xl shadow-2xl overflow-hidden"
              style={{
                background: '#16161e',
                border: '1px solid rgba(255,255,255,0.09)',
                boxShadow: '0 24px 64px rgba(0,0,0,0.60), 0 0 0 1px rgba(94,92,230,0.12)',
              }}
            >

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(94,92,230,0.18)' }}>
                    <I.Share2 className="w-3.5 h-3.5" style={{ color: '#818cf8' }} />
                  </div>
                  <span className="text-[14px] font-semibold text-white">Share walkthrough</span>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.08]"
                  style={{ color: 'rgba(255,255,255,0.40)' }}
                >
                  <I.X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">

                {/* Session title */}
                <p
                  className="text-[12px] truncate font-medium"
                  style={{ color: 'rgba(255,255,255,0.45)' }}
                >
                  {title}
                </p>

                {/* Public link toggle */}
                <div
                  className="flex items-center justify-between p-3.5 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <div>
                    <p className="text-[13px] font-semibold text-white">Public link</p>
                    <p className="text-[11.5px] mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      Anyone with the link can view
                    </p>
                  </div>
                  <button
                    onClick={togglePublic}
                    disabled={publicLoading}
                    className={cn(
                      'relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0',
                      isPublic ? 'bg-indigo-500' : 'bg-white/[0.12]',
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
                  <p
                    className="text-[10.5px] font-bold uppercase tracking-wider mb-3"
                    style={{ color: 'rgba(255,255,255,0.35)' }}
                  >
                    What viewers can access
                  </p>

                  <div className="grid grid-cols-3 gap-2">

                    {/* SOP Guide */}
                    <FormatCard
                      icon={<I.List size={16} color="#4ade80" />}
                      accentColor="#22c55e"
                      title="Step Guide"
                      description="Full SOP walkthrough"
                      badge="free"
                      enabled={formats.sopEnabled}
                      disabled={!isPublic}
                      onToggle={() => toggleFormat('sopEnabled')}
                    />

                    {/* Raw Recording */}
                    <FormatCard
                      icon={<I.Video size={16} color="#60a5fa" />}
                      accentColor="#3b82f6"
                      title="Recording"
                      description={hasVideo ? 'Original, unedited screen capture' : 'No recording'}
                      badge="free"
                      enabled={formats.rawEnabled && hasVideo}
                      disabled={!isPublic || !hasVideo}
                      onToggle={hasVideo ? () => toggleFormat('rawEnabled') : undefined}
                    />

                    {/* Cinematic */}
                    <FormatCard
                      icon={<I.Play size={16} color={formats.cinematicEnabled ? '#a78bfa' : 'rgba(255,255,255,0.35)'} />}
                      accentColor={formats.cinematicEnabled ? '#8b5cf6' : '#666'}
                      title="Cinematic"
                      description={formats.cinematicEnabled ? 'AI camera · math transitions' : 'Unlock to share'}
                      badge={formats.cinematicEnabled ? 'on' : 'credit'}
                      enabled={formats.cinematicEnabled}
                      disabled={!isPublic}
                      locked={!formats.cinematicEnabled}
                      onUnlock={!formats.cinematicEnabled ? requestUnlock : undefined}
                      unlockLoading={cinematicLoading}
                      creditBalance={creditsBalance}
                    />
                  </div>

                  {/* Credit preview / insufficient guard for cinematic */}
                  {!formats.cinematicEnabled && (
                    creditsBalance < CINEMATIC_CREDIT_COST ? (
                      <p className="mt-1.5 text-[10.5px] text-text-3 px-1">
                        Not enough credits —{' '}
                        <button onClick={() => openCreditsModal(true)} className="text-primary underline underline-offset-2">top up to continue</button>
                      </p>
                    ) : (
                      <p className="mt-1.5 text-[10.5px] text-text-3 px-1">
                        Uses {CINEMATIC_CREDIT_COST} credits — {creditsBalance} remaining
                      </p>
                    )
                  )}

                  {/* Credit error */}
                  {cinematicError && (
                    <p className="mt-2 text-[11px] text-red-400 px-1">{cinematicError}</p>
                  )}

                  {/* All-disabled warning */}
                  {isPublic && allDisabled && (
                    <div
                      className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-lg"
                      style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.18)' }}
                    >
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
                    <p
                      className="text-[10.5px] font-bold uppercase tracking-wider mb-2"
                      style={{ color: 'rgba(255,255,255,0.35)' }}
                    >
                      Share link
                    </p>
                    <div className="flex items-center gap-2">
                      <div
                        className="flex-1 rounded-lg px-3 py-2 text-[11px] truncate font-mono"
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          color: 'rgba(255,255,255,0.65)',
                        }}
                      >
                        {shareUrl}
                      </div>
                      <button
                        onClick={copyLink}
                        className="flex-shrink-0 flex items-center gap-1.5 text-[12px] px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors"
                      >
                        {copied ? <I.Check className="w-3.5 h-3.5" /> : <I.Copy className="w-3.5 h-3.5" />}
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Private note */}
                {!isPublic && (
                  <div
                    className="flex items-start gap-2 p-3 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    <I.Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }} />
                    <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      Only workspace members can access this session. Enable the public link to share externally.
                    </p>
                  </div>
                )}

              </div>
            </div>
          </motion.div>
        </>
      )}

      {/* Cinematic unlock confirmation */}
      <AnimatePresence>
        {cinematicConfirmOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-[300]"
              onClick={() => setCinematicConfirmOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="fixed inset-0 z-[310] flex items-center justify-center p-4"
              onClick={e => e.stopPropagation()}
            >
              <div
                className="w-full max-w-sm rounded-2xl overflow-hidden"
                style={{ background: 'rgba(18,18,28,0.98)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                {/* Blurred preview */}
                {session?.steps?.[0] && (
                  <div className="relative h-36 overflow-hidden">
                    <div
                      className="absolute inset-0 bg-cover bg-center"
                      style={{
                        backgroundImage: `url(${(session.steps[0] as any).screenshotUrl || (session.steps[0] as any).url || ''})`,
                        filter: 'blur(8px) saturate(0.5)',
                        transform: 'scale(1.1)',
                      }}
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <I.Play size={32} className="text-white/60" />
                    </div>
                  </div>
                )}

                <div className="p-5">
                  <h3 className="text-[15px] font-semibold text-white mb-1">Unlock Cinematic AI</h3>
                  <p className="text-[12.5px] text-white/55 mb-4">
                    Cinematic mode adds smooth AI camera movements, animated transitions, and a polished video experience for your viewers.
                  </p>

                  <div className="flex items-center justify-between mb-5 px-3 py-2.5 rounded-lg" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)' }}>
                    <span className="text-[12px] text-purple-300 font-medium">Cost</span>
                    <span className="text-[13px] text-white font-semibold">{CINEMATIC_CREDIT_COST} credits</span>
                    <span className="text-[11px] text-white/40">{creditsBalance} remaining</span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setCinematicConfirmOpen(false)}
                      className="flex-1 py-2.5 rounded-lg text-[13px] font-medium text-white/60 hover:text-white transition-colors"
                      style={{ background: 'rgba(255,255,255,0.06)' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={unlockCinematic}
                      disabled={cinematicLoading}
                      className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 transition-colors"
                    >
                      {cinematicLoading ? 'Unlocking…' : 'Confirm & Unlock'}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </AnimatePresence>
  );
};

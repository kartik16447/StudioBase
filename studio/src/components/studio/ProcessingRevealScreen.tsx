import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '../ui';
import { I } from '../icons';
import type { SessionEnvelope } from '../../../../shared/types/session';
import { analyticsClient } from '../../lib/analyticsClient';

interface ProcessingRevealScreenProps {
  session: SessionEnvelope;
  onViewSOP: () => void;
  onViewVideo: () => void;
  onViewDocs: () => void;
  onViewEmbed: () => void;
}

function formatDuration(ms: number | null | undefined): string | null {
  if (!ms || ms <= 0) return null;
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function getPrefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

const HABITUATION_KEY = 'isomerflow_reveal_count';

function getAndIncrementRecordingCount(): number {
  try {
    const current = parseInt(localStorage.getItem(HABITUATION_KEY) ?? '0', 10);
    const next = isNaN(current) ? 1 : current + 1;
    localStorage.setItem(HABITUATION_KEY, String(next));
    return next;
  } catch {
    return 1;
  }
}

interface CardSpec {
  primary: string;
  secondary: string;
}

// Easing for header entrance — matches existing reveal screen design
const EASE_RISE = [0.22, 1, 0.36, 1] as const;

export const ProcessingRevealScreen: React.FC<ProcessingRevealScreenProps> = ({
  session,
  onViewSOP,
  onViewVideo,
  onViewDocs,
  onViewEmbed,
}) => {
  const { durationMs, stepCount } = session.metadata;
  const duration = formatDuration(durationMs);

  // ── Stable setup (computed once on mount) ──────────────────────────────
  const reducedMotion = useRef(getPrefersReducedMotion()).current;
  const recordingCount = useRef(getAndIncrementRecordingCount()).current;
  // After 5 full-animation views, skip the stagger and show cards immediately
  const skipStagger = reducedMotion || recordingCount > 5;
  const mountTime = useRef(Date.now());
  const revealFired = useRef(false);
  const wasSkippedRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ── Animation state ────────────────────────────────────────────────────
  const [visibleCount, setVisibleCount] = useState(skipStagger ? 4 : 0);
  const [ctaVisible, setCtaVisible] = useState(skipStagger);
  const [pulsing, setPulsing] = useState(false);

  // ── Analytics helpers ──────────────────────────────────────────────────
  const fireRevealViewed = (skipped: boolean) => {
    if (revealFired.current) return;
    revealFired.current = true;
    analyticsClient.track({
      sessionId: session.sessionId,
      workspaceId: session.workspaceId ?? '',
      eventType: 'reveal_card_viewed',
      metadata: {
        step_count: stepCount ?? null,
        duration_seconds: durationMs ? Math.round(durationMs / 1000) : null,
        is_first_recording: recordingCount === 1,
        recording_count: recordingCount,
        was_skipped: skipped,
      },
    });
  };

  const handleCtaClick = (
    output: 'sop' | 'video' | 'docs' | 'embed',
    handler: () => void,
  ) => {
    analyticsClient.track({
      sessionId: session.sessionId,
      workspaceId: session.workspaceId ?? '',
      eventType: 'reveal_cta_click',
      metadata: {
        output,
        time_on_screen_ms: Date.now() - mountTime.current,
        was_skipped: wasSkippedRef.current,
        recording_count: recordingCount,
      },
    });
    handler();
  };

  // ── Animation sequence ─────────────────────────────────────────────────
  useEffect(() => {
    if (skipStagger) {
      // Habituation: cards already visible; pulse at 200ms (skip if reduced motion)
      if (!reducedMotion) {
        const t = setTimeout(() => setPulsing(true), 200);
        timersRef.current.push(t);
      }
      fireRevealViewed(false);
      return () => timersRef.current.forEach(clearTimeout);
    }

    // Normal stagger sequence
    const schedule: [number, () => void][] = [
      [200,  () => setVisibleCount(1)],
      [400,  () => setVisibleCount(2)],
      [600,  () => setVisibleCount(3)],
      [800,  () => setVisibleCount(4)],
      [1000, () => setPulsing(true)],
      [1100, () => { setCtaVisible(true); fireRevealViewed(false); }],
    ];

    schedule.forEach(([delay, fn]) => {
      timersRef.current.push(setTimeout(fn, delay));
    });

    return () => timersRef.current.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Skip: click anywhere → jump to final state ─────────────────────────
  const handleSkip = () => {
    if (visibleCount >= 4 && ctaVisible) return;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    wasSkippedRef.current = true;
    setVisibleCount(4);
    setCtaVisible(true);
    // Pulse does NOT fire on skip (per spec)
    fireRevealViewed(true);
  };

  // ── Card definitions (Accent variant copy) ─────────────────────────────
  const cards: CardSpec[] = [
    {
      primary: stepCount != null ? `${stepCount}-step SOP` : 'Your SOP',
      secondary: 'Annotated screenshots',
    },
    { primary: 'Your original recording', secondary: 'Ready to view' },
    { primary: 'Docs export',             secondary: 'Ready for Notion · Confluence' },
    { primary: 'Embeddable player',       secondary: 'Drop it anywhere' },
  ];

  return (
    <div
      className="flex-1 flex flex-col items-center justify-center bg-sidebar min-h-0 px-6 py-12 relative overflow-hidden"
      onClick={handleSkip}
    >
      {/* Ambient glow */}
      <motion.div
        aria-hidden
        initial={reducedMotion ? undefined : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, ease: 'easeOut', delay: 0.1 }}
        style={{
          position: 'absolute',
          top: '38%', left: '50%',
          width: 620, height: 620,
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(94,92,230,0.16) 0%, rgba(94,92,230,0) 62%)',
          pointerEvents: 'none',
        }}
      />

      <div className="relative w-full max-w-[480px] flex flex-col gap-8">

        {/* Block 1 — Header */}
        <div className="flex flex-col gap-3">
          <motion.p
            initial={reducedMotion ? undefined : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.62, ease: EASE_RISE, delay: 0 }}
            className="text-[11px] font-semibold text-white/30 tracking-[0.12em] uppercase"
          >
            Ready
          </motion.p>

          <motion.h1
            initial={reducedMotion ? undefined : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.62, ease: EASE_RISE, delay: 0.06 }}
            className="text-[22px] font-semibold text-white leading-snug"
            style={{ letterSpacing: '-0.01em', textWrap: 'balance' } as React.CSSProperties}
          >
            {duration
              ? <>From your <span className="tabular-nums">{duration}</span> recording, IsomerFlow built:</>
              : <>From your recording, IsomerFlow built:</>}
          </motion.h1>

          {(duration || stepCount != null) && (
            <motion.div
              initial={reducedMotion ? undefined : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.62, ease: EASE_RISE, delay: 0.15 }}
              className="flex items-center gap-2 mt-1"
            >
              {duration && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-lg"
                  style={{ padding: '5px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <I.Clock size={12} className="text-white/40" />
                  <span className="text-[12px] font-semibold text-white/60 tabular-nums">{duration}</span>
                </span>
              )}
              {stepCount != null && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-lg"
                  style={{ padding: '5px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <I.ClipboardList size={12} className="text-white/40" />
                  <span className="text-[12px] font-semibold text-white/60 tabular-nums">{stepCount} steps</span>
                </span>
              )}
            </motion.div>
          )}
        </div>

        {/* Block 2 — Cards (group pulse wraps all 4) */}
        <motion.div
          className="flex flex-col gap-3"
          animate={pulsing ? { scale: [1, 1.008, 1] } : { scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
          onAnimationComplete={() => { if (pulsing) setPulsing(false); }}
        >
          {cards.map((card, i) => (
            <motion.div
              key={i}
              initial={skipStagger ? undefined : { y: 12, opacity: 0 }}
              animate={
                skipStagger
                  ? { y: 0, opacity: 1 }
                  : visibleCount > i
                    ? { y: 0, opacity: 1 }
                    : { y: 12, opacity: 0 }
              }
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="flex items-center gap-2 rounded-card"
              style={{
                padding: '16px 20px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {/* Checkmark well — 38×38, radius 8px, tinted */}
              <div
                className="flex-shrink-0 flex items-center justify-center"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 8,
                  background: 'rgba(94,92,230,0.15)',
                }}
              >
                <I.Check size={16} strokeWidth={2.5} style={{ color: '#5E5CE6' }} />
              </div>

              {/* Text block */}
              <div className="flex flex-col">
                <span className="text-sm font-medium text-white leading-snug">
                  {card.primary}
                </span>
                <span className="text-xs font-normal text-white/60 leading-snug mt-0.5">
                  {card.secondary}
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Block 3 — CTA + secondary nav */}
        <motion.div
          initial={reducedMotion ? undefined : { opacity: 0 }}
          animate={{ opacity: ctaVisible ? 1 : 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="flex flex-col items-start gap-4"
          onClick={e => e.stopPropagation()}
        >
          <Button
            variant="primary"
            size="md"
            onClick={() => handleCtaClick('sop', onViewSOP)}
            iconRight={I.ArrowRight}
          >
            View your SOP
          </Button>

          <div className="flex items-center gap-5">
            {(
              [
                ['Video', 'video', onViewVideo],
                ['Docs',  'docs',  onViewDocs],
                ['Embed', 'embed', onViewEmbed],
              ] as [string, 'video' | 'docs' | 'embed', () => void][]
            ).map(([label, output, handler], i, arr) => (
              <React.Fragment key={label}>
                <button
                  onClick={() => handleCtaClick(output, handler)}
                  className="text-[13px] text-white/40 hover:text-white/60 transition-colors"
                >
                  {label}
                </button>
                {i < arr.length - 1 && (
                  <span className="text-white/20 select-none">·</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </motion.div>

      </div>
    </div>
  );
};

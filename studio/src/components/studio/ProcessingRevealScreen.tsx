import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../ui';
import { I } from '../icons';
import type { SessionEnvelope } from '../../../../shared/types/session';
import { analyticsClient } from '../../lib/analyticsClient';

interface ProcessingRevealScreenProps {
  session: SessionEnvelope | null;  // null while pipeline is still running
  isProcessing: boolean;            // true = show skeleton cards; false = reveal real cards
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

const EASE_RISE = [0.22, 1, 0.36, 1] as const;

// Skeleton stagger — parent controls timing, children inherit via variants
const skeletonContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.15, delayChildren: 0.1 },
  },
};
const skeletonItem = {
  hidden: { y: 12, opacity: 0 },
  show:   { y: 0,  opacity: 1, transition: { duration: 0.28, ease: 'easeOut' } },
};

export const ProcessingRevealScreen: React.FC<ProcessingRevealScreenProps> = ({
  session,
  isProcessing,
  onViewSOP,
  onViewVideo,
  onViewDocs,
  onViewEmbed,
}) => {
  const stepCount = session?.metadata?.stepCount ?? null;
  const durationMs = session?.metadata?.durationMs ?? null;
  const duration = formatDuration(durationMs);

  // ── Stable setup (computed once on mount) ──────────────────────────────
  const reducedMotion = useRef(getPrefersReducedMotion()).current;
  const recordingCount = useRef(getAndIncrementRecordingCount()).current;
  // After 5 full-animation views, skip the stagger
  const skipStagger = reducedMotion || recordingCount > 5;
  const mountTime = useRef(Date.now());
  const revealFired = useRef(false);
  const wasSkippedRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const animationStartedRef = useRef(false);

  // ── Phase: skeleton while pipeline runs, revealing once ready ──────────
  const [phase, setPhase] = useState<'skeleton' | 'revealing'>(
    isProcessing ? 'skeleton' : 'revealing'
  );

  // ── Card reveal state ──────────────────────────────────────────────────
  // For already-ready sessions with skipStagger: start at 4 so there's no
  // blank-on-first-render before the useEffect fires.
  const [visibleCount, setVisibleCount] = useState(
    !isProcessing && skipStagger ? 4 : 0
  );
  const [ctaVisible, setCtaVisible] = useState(
    !isProcessing && skipStagger
  );
  const [pulsing, setPulsing] = useState(false);

  // ── Analytics helpers ──────────────────────────────────────────────────
  const fireRevealViewed = (skipped: boolean) => {
    if (revealFired.current) return;
    revealFired.current = true;
    analyticsClient.track({
      sessionId: session?.sessionId ?? '',
      workspaceId: session?.workspaceId ?? '',
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
      sessionId: session?.sessionId ?? '',
      workspaceId: session?.workspaceId ?? '',
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

  // ── Card reveal animation (called once — guarded by animationStartedRef) ─
  const startRevealAnimation = () => {
    if (animationStartedRef.current) return;
    animationStartedRef.current = true;

    if (skipStagger) {
      setVisibleCount(4);
      setCtaVisible(true);
      if (!reducedMotion) {
        const t = setTimeout(() => setPulsing(true), 200);
        timersRef.current.push(t);
      }
      fireRevealViewed(false);
    } else {
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
    }
  };

  // On mount: if already ready (direct URL visit to a completed session), animate now
  useEffect(() => {
    if (!isProcessing) {
      startRevealAnimation();
    }
    return () => timersRef.current.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When polling flips isProcessing false during the component's life
  useEffect(() => {
    if (!isProcessing && phase === 'skeleton') {
      setPhase('revealing');
      // Small delay so skeleton's exit animation has time to start before cards stagger in
      const t = setTimeout(() => startRevealAnimation(), 150);
      timersRef.current.push(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProcessing]);

  // ── Skip: click anywhere → jump to final state ─────────────────────────
  const handleSkip = () => {
    if (isProcessing) return; // can't skip while skeleton is showing
    if (visibleCount >= 4 && ctaVisible) return;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    wasSkippedRef.current = true;
    setVisibleCount(4);
    setCtaVisible(true);
    fireRevealViewed(true);
  };

  // ── Card definitions (Accent variant copy) ─────────────────────────────
  const cards: CardSpec[] = [
    {
      primary: stepCount != null && stepCount > 0 ? `${stepCount}-step SOP` : 'Your SOP',
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

          {/* Eyebrow label — pulses while generating */}
          <motion.p
            initial={reducedMotion ? undefined : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.62, ease: EASE_RISE, delay: 0 }}
            className="text-[11px] font-semibold text-white/30 tracking-[0.12em] uppercase"
          >
            <AnimatePresence mode="wait">
              {isProcessing ? (
                <motion.span
                  key="generating"
                  initial={{ opacity: 0 }}
                  animate={reducedMotion
                    ? { opacity: 1 }
                    : { opacity: [0.3, 0.7, 0.3] }
                  }
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  Generating
                </motion.span>
              ) : (
                <motion.span
                  key="ready"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  Ready
                </motion.span>
              )}
            </AnimatePresence>
          </motion.p>

          {/* Heading */}
          <motion.h1
            initial={reducedMotion ? undefined : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.62, ease: EASE_RISE, delay: 0.06 }}
            className="text-[22px] font-semibold text-white leading-snug"
            style={{ letterSpacing: '-0.01em', textWrap: 'balance' } as React.CSSProperties}
          >
            {duration
              ? <>From your <span className="tabular-nums">{duration}</span> recording, StudioBase built:</>
              : <>From your recording, StudioBase built:</>}
          </motion.h1>

          {/* Duration + step count chips — only when session data is available */}
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
              {stepCount != null && stepCount > 0 && (
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

        {/* Block 2 — Cards: skeleton while processing, real cards once ready */}
        {/* No mode="wait" — concurrent so real cards start entering while skeleton fades */}
        <AnimatePresence>
          {phase === 'skeleton' ? (

            /* ── Skeleton cards — stagger in one by one via variants ─────── */
            <motion.div
              key="skeletons"
              className="flex flex-col gap-3"
              variants={reducedMotion ? undefined : skeletonContainer}
              initial={reducedMotion ? undefined : 'hidden'}
              animate={reducedMotion ? undefined : 'show'}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
            >
              {[0, 1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  variants={reducedMotion ? undefined : skeletonItem}
                  className="flex items-center gap-2 rounded-card"
                  style={{
                    padding: '16px 20px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {/* Skeleton checkmark well */}
                  <motion.div
                    className="flex-shrink-0"
                    animate={reducedMotion ? undefined : { opacity: [0.25, 0.55, 0.25] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.18 }}
                    style={{ width: 38, height: 38, borderRadius: 8, background: 'rgba(255,255,255,0.07)', flexShrink: 0 }}
                  />
                  {/* Skeleton text lines */}
                  <div className="flex flex-col gap-2">
                    <motion.div
                      animate={reducedMotion ? undefined : { opacity: [0.25, 0.55, 0.25] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.18 + 0.08 }}
                      style={{ width: 100 + i * 18, height: 12, borderRadius: 4, background: 'rgba(255,255,255,0.09)' }}
                    />
                    <motion.div
                      animate={reducedMotion ? undefined : { opacity: [0.15, 0.4, 0.15] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.18 + 0.18 }}
                      style={{ width: 65 + i * 12, height: 10, borderRadius: 4, background: 'rgba(255,255,255,0.05)' }}
                    />
                  </div>
                </motion.div>
              ))}
            </motion.div>

          ) : (

            /* ── Real cards with stagger ────────────────────────────────── */
            <motion.div
              key="real"
              className="flex flex-col gap-3"
              animate={pulsing ? { scale: [1, 1.008, 1] } : { scale: 1 }}
              transition={{ duration: 0.4, ease: 'easeInOut' }}
              onAnimationComplete={() => { if (pulsing) setPulsing(false); }}
            >
              {cards.map((card, i) => (
                <motion.div
                  key={i}
                  initial={{ y: 12, opacity: 0 }}
                  animate={visibleCount > i ? { y: 0, opacity: 1 } : { y: 12, opacity: 0 }}
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                  className="flex items-center gap-2 rounded-card"
                  style={{
                    padding: '16px 20px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {/* Checkmark well */}
                  <div
                    className="flex-shrink-0 flex items-center justify-center"
                    style={{ width: 38, height: 38, borderRadius: 8, background: 'rgba(94,92,230,0.15)' }}
                  >
                    <I.Check size={16} strokeWidth={2.5} style={{ color: '#5E5CE6' }} />
                  </div>
                  {/* Text */}
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

          )}
        </AnimatePresence>

        {/* Block 3 — CTA area */}
        <div
          className="flex flex-col items-start gap-4"
          onClick={e => e.stopPropagation()}
        >
          <AnimatePresence mode="wait">
            {isProcessing ? (

              /* Processing state — spinner + copy, no button */
              <motion.div
                key="processing-cta"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                transition={{ duration: 0.35, delay: 0.2 }}
                className="flex items-center gap-3"
              >
                <div
                  className="rounded-full border-2 flex-shrink-0"
                  style={{
                    width: 16, height: 16,
                    borderColor: 'rgba(255,255,255,0.12)',
                    borderTopColor: 'rgba(255,255,255,0.45)',
                    animation: 'spin 0.9s linear infinite',
                  }}
                />
                <span className="text-[13px] text-white/40">
                  Generating your SOP narration…
                </span>
              </motion.div>

            ) : ctaVisible ? (

              /* Ready — CTA button + secondary nav */
              <motion.div
                key="ready-cta"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-start gap-4"
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

            ) : null}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
};

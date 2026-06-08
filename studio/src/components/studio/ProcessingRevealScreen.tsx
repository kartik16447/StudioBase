import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '../ui';
import { I } from '../icons';
import type { SessionEnvelope } from '../../../shared/types/session';

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

// Matches design's `.deliverable-text b` — rgba(255,255,255,0.82), weight 600
const Bold: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <strong style={{ color: 'rgba(255,255,255,0.82)', fontWeight: 600 }}>{children}</strong>
);

// Easing curves from the design file
const EASE_RISE = [0.22, 1, 0.36, 1] as const;   // cubic-bezier for text blocks
const EASE_POP  = [0.34, 1.56, 0.64, 1] as const; // spring-like for check circles

// Stagger delays (ms → s), computed from design's sequential stagger logic
const D = {
  eyebrow:  0,
  h1:       0.06,
  pills:    0.15,
  check:    [0.26, 0.355, 0.45, 0.545],
  text:     [0.305, 0.40, 0.495, 0.59],
  cta:      0.64,
  nav:      0.68,
};

const rise = (delay: number) => ({
  initial:    { opacity: 0, y: 10 },
  animate:    { opacity: 1, y: 0 },
  transition: { duration: 0.62, ease: EASE_RISE, delay },
});

const pop = (delay: number) => ({
  initial:    { opacity: 0, scale: 0.4 },
  animate:    { opacity: 1, scale: 1 },
  transition: { duration: 0.5, ease: EASE_POP, delay },
});

export const ProcessingRevealScreen: React.FC<ProcessingRevealScreenProps> = ({
  session,
  onViewSOP,
  onViewVideo,
  onViewDocs,
  onViewEmbed,
}) => {
  const { durationMs, stepCount } = session.metadata;
  const duration = formatDuration(durationMs);

  const deliverables: React.ReactNode[] = [
    stepCount != null
      ? <>A <Bold>{stepCount}-step SOP</Bold> with annotated screenshots</>
      : <>A <Bold>step-by-step SOP</Bold> with annotated screenshots</>,
    <>A cinematic walkthrough video</>,
    <>A docs-ready export</>,
    <>An embeddable player — ready to drop anywhere</>,
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-sidebar min-h-0 px-6 py-12 relative overflow-hidden">

      {/* Ambient glow — fades in behind content */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
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

      <div className="relative w-full max-w-[480px] flex flex-col gap-10">

        {/* Block 1 — Header */}
        <div className="flex flex-col gap-3">
          <motion.p
            {...rise(D.eyebrow)}
            className="text-[11px] font-semibold text-white/30 tracking-[0.12em] uppercase"
          >
            Ready
          </motion.p>

          <motion.h1
            {...rise(D.h1)}
            className="text-[22px] font-semibold text-white leading-snug"
            style={{ letterSpacing: '-0.01em', textWrap: 'balance' } as React.CSSProperties}
          >
            {duration
              ? <>From your <span className="tabular-nums">{duration}</span> recording, IsomerFlow built:</>
              : <>From your recording, IsomerFlow built:</>}
          </motion.h1>

          {(duration || stepCount != null) && (
            <motion.div {...rise(D.pills)} className="flex items-center gap-2 mt-1">
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

        {/* Block 2 — Deliverables */}
        <ul className="flex flex-col gap-3.5">
          {deliverables.map((text, i) => (
            <li key={i} className="flex items-start gap-3">
              <motion.span
                {...pop(D.check[i])}
                className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center mt-[3px]"
                style={{ background: 'rgba(94,92,230,0.18)' }}
              >
                <I.Check size={10} className="text-primary" strokeWidth={3} />
              </motion.span>
              <motion.span
                {...rise(D.text[i])}
                className="text-[15px] text-white/60 leading-snug"
              >
                {text}
              </motion.span>
            </li>
          ))}
        </ul>

        {/* Block 3 — CTA + secondary nav */}
        <div className="flex flex-col items-start gap-4">
          <motion.div {...rise(D.cta)}>
            <Button variant="primary" size="md" onClick={onViewSOP} className="gap-1.5">
              View your SOP
              <I.ArrowRight size={14} />
            </Button>
          </motion.div>

          <motion.div {...rise(D.nav)} className="flex items-center gap-5">
            {(
              [
                ['Video', onViewVideo],
                ['Docs',  onViewDocs],
                ['Embed', onViewEmbed],
              ] as [string, () => void][]
            ).map(([label, handler], i, arr) => (
              <React.Fragment key={label}>
                <button
                  onClick={handler}
                  className="text-[13px] text-white/40 hover:text-white/60 transition-colors"
                >
                  {label}
                </button>
                {i < arr.length - 1 && (
                  <span className="text-white/20 select-none">·</span>
                )}
              </React.Fragment>
            ))}
          </motion.div>
        </div>

      </div>
    </div>
  );
};

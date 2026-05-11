// Premium visual effects: DotGrid, Skeleton variants, AIShimmer.
// Rule of thumb for this codebase:
//   - Infinite decorative loop  → CSS @keyframes
//   - State-driven animation    → Framer Motion
//   - Mouse coords              → useRef + style.setProperty (never useState)
//   - Mount/unmount             → AnimatePresence

const { motion: fx_motion, AnimatePresence: fx_AP } = window.Motion;
const { useRef: fxUseRef, useEffect: fxUseEffect, useState: fxUseState } = React;

// Reduced-motion detector — read once at module scope, listen for changes.
function usePrefersReducedMotion() {
  const [r, setR] = fxUseState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );
  fxUseEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e) => setR(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return r;
}

// ─── DotGrid ───────────────────────────────────────────────────────────
// Decorative bg of dots + a soft mouse-following glow. The glow uses
// style.setProperty on CSS vars so React never re-renders on mousemove.
function DotGrid({ className = '', dotColor = 'rgba(94,92,230,0.18)', glowColor = 'rgba(94,92,230,0.12)', size = 16, glowRadius = 250 }) {
  const wrapRef = fxUseRef(null);
  const glowRef = fxUseRef(null);
  const reduced = usePrefersReducedMotion();

  fxUseEffect(() => {
    if (reduced) return;
    const el = glowRef.current;
    if (!el) return;
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mouse-x', `${e.clientX - r.left}px`);
      el.style.setProperty('--mouse-y', `${e.clientY - r.top}px`);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [reduced]);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className={cn('absolute inset-0 z-0 pointer-events-none overflow-hidden', className)}
    >
      {/* Dots */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(circle, ${dotColor} 1px, transparent 1px)`,
          backgroundSize: `${size}px ${size}px`,
          maskImage: 'radial-gradient(ellipse 90% 80% at 50% 30%, black 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 90% 80% at 50% 30%, black 40%, transparent 100%)',
        }}
      />
      {/* Mouse glow */}
      {!reduced && (
        <div
          ref={glowRef}
          className="absolute inset-0"
          style={{
            background: `radial-gradient(${glowRadius}px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(94,92,230,0.22) 0%, rgba(94,92,230,0.08) 40%, transparent 100%)`,
            mixBlendMode: 'multiply',
            transition: 'background 0.05s linear',
          }}
        />
      )}
    </div>
  );
}

// ─── Skeleton primitives ──────────────────────────────────────────────
// CSS keyframes do the shimmer (compositor-only — no JS overhead).
// Defined once, globally, via a <style> tag injected on first mount.
let __skeletonStylesInjected = false;
function ensureSkeletonStyles() {
  if (__skeletonStylesInjected) return;
  __skeletonStylesInjected = true;
  const css = `
    @keyframes sb-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
    .sb-skel { position: relative; overflow: hidden; background: #F0F0F5; }
    .sb-skel::after {
      content: ''; position: absolute; inset: 0; transform: translateX(-100%);
      background: linear-gradient(
        90deg,
        transparent 0%,
        rgba(255,255,255,0.7) 45%,
        rgba(94,92,230,0.06) 50%,
        rgba(255,255,255,0.7) 55%,
        transparent 100%
      );
      animation: sb-shimmer 1.6s ease-in-out infinite;
      will-change: transform;
    }
    @media (prefers-reduced-motion: reduce) {
      .sb-skel::after { animation: none; display: none; }
    }
  `;
  const tag = document.createElement('style');
  tag.id = 'sb-skeleton-styles';
  tag.textContent = css;
  document.head.appendChild(tag);
}

function Skeleton({ className = '', style }) {
  fxUseEffect(ensureSkeletonStyles, []);
  return <div className={cn('sb-skel rounded-sm', className)} style={style} />;
}

// Skeleton variants — sized to match the real components.
function TextLineSkeleton({ width = '100%', height = 12, className = '' }) {
  return <Skeleton className={cn('rounded-pill', className)} style={{ width, height }} />;
}

function ScreenshotSkeleton({ aspect = '16 / 10', rounded = 'rounded-img', className = '' }) {
  return (
    <div className={cn(rounded, 'relative overflow-hidden bg-[#FAFAFC] shadow-card', className)} style={{ aspectRatio: aspect, boxShadow: '0 4px 20px rgba(0,0,0,0.08), inset 0 0 0 1px rgba(0,0,0,0.04)' }}>
      {/* Fake browser chrome row */}
      <div className="h-9 px-3 border-b border-border flex items-center gap-2 bg-[#FAFAFC]">
        <span className="w-2.5 h-2.5 rounded-full bg-[#E5E5EA]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#E5E5EA]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#E5E5EA]" />
        <Skeleton className="flex-1 mx-3 rounded-md" style={{ height: 20 }} />
      </div>
      <Skeleton className="absolute inset-0 top-9 rounded-none" />
    </div>
  );
}

function SessionCardSkeleton() {
  fxUseEffect(ensureSkeletonStyles, []);
  return (
    <div className="bg-surface rounded-card shadow-card overflow-hidden">
      <ScreenshotSkeleton aspect="16 / 10" rounded="rounded-none" className="!shadow-none" />
      <div className="p-5 space-y-3">
        <TextLineSkeleton width="80%" height={16} />
        <TextLineSkeleton width="55%" height={12} />
        <div className="flex items-center gap-2 pt-2">
          <Skeleton className="rounded-full" style={{ width: 22, height: 22 }} />
          <Skeleton className="rounded-full" style={{ width: 22, height: 22 }} />
          <TextLineSkeleton width={70} height={11} className="ml-auto" />
        </div>
      </div>
    </div>
  );
}

function StepCardSkeleton() {
  return (
    <div className="bg-surface rounded-card shadow-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="rounded-pill" style={{ width: 28, height: 22 }} />
        <TextLineSkeleton width={80} height={11} />
        <TextLineSkeleton width={120} height={12} />
      </div>
      <TextLineSkeleton width="92%" height={20} className="mb-2" />
      <TextLineSkeleton width="64%" height={20} className="mb-5" />
      <ScreenshotSkeleton aspect="16 / 9" />
    </div>
  );
}

// ─── AIShimmer ─────────────────────────────────────────────────────────
// Framer Motion is correct here — state-driven, not a pure decorative loop.
// Sweep happens by animating backgroundPosition on the brand gradient.
function AIShimmer({ isActive, className = '', children, opacity = 0.08 }) {
  const reduced = usePrefersReducedMotion();
  return (
    <div className={cn('relative', className)}>
      <fx_AP>
        {isActive && (
          <fx_motion.div
            key="aishimmer"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{
              opacity,
              backgroundPosition: reduced ? '50% 50%' : ['0% 50%', '100% 50%', '0% 50%'],
            }}
            exit={{ opacity: 0 }}
            transition={{
              opacity: { duration: 0.25 },
              backgroundPosition: reduced
                ? { duration: 0 }
                : { duration: 3, repeat: Infinity, ease: 'linear' },
            }}
            className="absolute inset-0 z-0 pointer-events-none rounded-[inherit]"
            style={{
              background: 'linear-gradient(135deg, #5E5CE6 0%, #7C3AED 35%, #5E5CE6 65%, #3B82F6 100%)',
              backgroundSize: '300% 300%',
            }}
          />
        )}
      </fx_AP>
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}

// AIButton — convenience: a primary button whose background turns into the
// brand-shimmer gradient while processing. Mirrors <Button variant="primary">.
function AIButton({ isProcessing, onClick, icon: Icon, children, className = '' }) {
  const reduced = usePrefersReducedMotion();
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-md text-[13px] font-semibold text-white overflow-hidden transition-colors',
        isProcessing ? '' : 'bg-primary hover:bg-primary-hover',
        className,
      )}
    >
      <fx_AP>
        {isProcessing && (
          <fx_motion.span
            key="aibtn-bg"
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              backgroundPosition: reduced ? '50% 50%' : ['0% 50%', '100% 50%', '0% 50%'],
            }}
            exit={{ opacity: 0 }}
            transition={{
              opacity: { duration: 0.2 },
              backgroundPosition: reduced
                ? { duration: 0 }
                : { duration: 2.4, repeat: Infinity, ease: 'linear' },
            }}
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(135deg, #5E5CE6 0%, #7C3AED 35%, #5E5CE6 65%, #3B82F6 100%)',
              backgroundSize: '300% 300%',
            }}
          />
        )}
      </fx_AP>
      <span className="relative z-[1] inline-flex items-center gap-1.5">
        {Icon && <Icon size={14} strokeWidth={2.2} />}
        {children}
      </span>
    </button>
  );
}

Object.assign(window, {
  DotGrid,
  Skeleton, TextLineSkeleton, ScreenshotSkeleton, SessionCardSkeleton, StepCardSkeleton,
  AIShimmer, AIButton,
  usePrefersReducedMotion,
});

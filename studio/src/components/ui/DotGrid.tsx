import React, { useRef, useEffect, useState } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

interface DotGridProps {
  className?: string;
  dotColor?: string;
  glowColor?: string;
  size?: number;
  glowRadius?: number;
}

export const DotGrid: React.FC<DotGridProps> = ({
  className = '',
  dotColor = 'rgba(94,92,230,0.18)',
  size = 16,
  glowRadius = 250,
}) => {
  const glowRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const el = glowRef.current;
    if (!el) return;

    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mouse-x', `${e.clientX - r.left}px`);
      el.style.setProperty('--mouse-y', `${e.clientY - r.top}px`);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [reduced]);

  return (
    <div
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
};

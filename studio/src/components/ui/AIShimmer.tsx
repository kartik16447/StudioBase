import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { LucideIcon } from 'lucide-react';

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

interface AIShimmerProps {
  isActive: boolean;
  className?: string;
  children: React.ReactNode;
  opacity?: number;
}

export const AIShimmer: React.FC<AIShimmerProps> = ({ 
  isActive, 
  className = '', 
  children, 
  opacity = 0.08 
}) => {
  const reduced = usePrefersReducedMotion();
  
  return (
    <div className={cn('relative', className)}>
      <AnimatePresence>
        {isActive && (
          <motion.div
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
      </AnimatePresence>
      <div className="relative z-[1]">{children}</div>
    </div>
  );
};

interface AIButtonProps {
  isProcessing: boolean;
  onClick?: () => void;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}

export const AIButton: React.FC<AIButtonProps> = ({ 
  isProcessing, 
  onClick, 
  icon: Icon, 
  children, 
  className = '' 
}) => {
  const reduced = usePrefersReducedMotion();

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-md text-[13px] font-semibold text-white overflow-hidden transition-colors',
        isProcessing ? '' : 'bg-primary hover:bg-primary-600',
        className,
      )}
    >
      <AnimatePresence>
        {isProcessing && (
          <motion.span
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
      </AnimatePresence>
      <span className="relative z-[1] inline-flex items-center gap-1.5">
        {Icon && <Icon size={14} strokeWidth={2.2} />}
        {children}
      </span>
    </button>
  );
};

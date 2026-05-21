import React, { useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Step, SessionEnvelope } from '../../../../shared/types/session';

export * from './DotGrid';
export * from './AIShimmer';
export * from './Skeleton';

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Button ────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger' | 'ghost-dark';
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  locked?: boolean;
  lockedHint?: string;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  locked = false,
  lockedHint,
  children,
  className = '',
  onClick,
  ...rest
}) => {
  const sizes = {
    sm: 'h-8 px-3 text-[13px] gap-1.5',
    md: 'h-9 px-4 text-sm gap-2',
    lg: 'h-11 px-5 text-[15px] gap-2',
  };
  const variants = {
    primary: 'bg-primary text-white hover:bg-primary-600 shadow-[0_2px_10px_rgba(94,92,230,0.32)] active:scale-[0.97]',
    secondary: 'bg-text text-white hover:bg-black active:scale-[0.97]',
    ghost: 'bg-transparent border border-border text-text hover:bg-surface-2 active:scale-[0.97]',
    subtle: 'bg-surface-2 text-text hover:bg-[#E6E6EC] active:scale-[0.97]',
    danger: 'bg-danger text-white hover:opacity-90 active:scale-[0.97]',
    'ghost-dark': 'bg-white/5 text-white/80 hover:bg-white/10 border border-white/10',
  };

  return (
    <button
      type="button"
      onClick={locked ? undefined : onClick}
      className={cn(
        'inline-flex items-center justify-center rounded-pill font-medium transition-all duration-150 ease-out whitespace-nowrap select-none',
        sizes[size],
        variants[variant],
        locked && 'opacity-50 cursor-not-allowed pointer-events-none',
        className,
      )}
      title={locked ? lockedHint : undefined}
      {...rest}
    >
      {Icon && <Icon size={size === 'lg' ? 18 : 16} strokeWidth={2} />}
      <span>{children}</span>
      {IconRight && <IconRight size={size === 'lg' ? 18 : 16} strokeWidth={2} />}
    </button>
  );
};

// ─── IconButton ───────────────────────────────────────────────────────
interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  dark?: boolean;
  size?: number;
}

export const IconButton: React.FC<IconButtonProps> = ({ 
  icon: Icon, 
  label, 
  active = false, 
  dark = false, 
  size = 36, 
  onClick, 
  className = '',
  disabled,
  ...rest
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center rounded-full transition-all duration-150 ease-out',
        dark
          ? (active ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/8')
          : (active ? 'bg-primary-light text-primary' : 'text-text-2 hover:text-text hover:bg-surface-2'),
        disabled && 'opacity-45 cursor-not-allowed pointer-events-none',
        className,
      )}
      style={{ width: size, height: size }}
      {...rest}
    >
      <Icon size={size === 36 ? 18 : 16} strokeWidth={1.9} />
    </button>
  );
};

// ─── Card ─────────────────────────────────────────────────────────────
interface CardProps {
  variant?: 'default' | 'interactive' | 'flat' | 'dashed';
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export const Card: React.FC<CardProps> = ({ 
  variant = 'default', 
  children, 
  className = '', 
  as: As = 'div', 
  onClick, 
  ...rest 
}) => {
  const base = 'rounded-card overflow-hidden';
  const variants = {
    default: 'bg-surface shadow-card',
    interactive: 'bg-surface shadow-card hover:shadow-card-hover transition-shadow',
    flat: 'bg-surface border border-border',
    dashed: 'grad-border',
  };
  return (
    <As className={cn(base, variants[variant], className)} onClick={onClick} {...rest}>
      {children}
    </As>
  );
};

// ─── Badge / Pill ─────────────────────────────────────────────────────
interface BadgeProps {
  children: React.ReactNode;
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'dark' | 'glass';
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ 
  children, 
  tone = 'neutral', 
  size = 'md', 
  icon: Icon, 
  className = '' 
}) => {
  const tones = {
    neutral: 'bg-surface-2 text-text-2',
    primary: 'bg-primary-light text-primary',
    success: 'bg-[#E5F8EC] text-[#1B7F3B]',
    warning: 'bg-[#FFF1DD] text-[#9A5B00]',
    danger: 'bg-[#FFE6E5] text-[#C8261D]',
    dark: 'bg-text text-white',
    glass: 'glass text-text',
  };
  const sizes = { sm: 'text-[10px] h-5 px-2', md: 'text-[11px] h-6 px-2.5', lg: 'text-xs h-7 px-3' };
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-pill font-semibold tracking-wide uppercase whitespace-nowrap',
      tones[tone], sizes[size], className,
    )}>
      {Icon && <Icon size={12} strokeWidth={2.5} />}
      {children}
    </span>
  );
};

// ─── GlassPanel ───────────────────────────────────────────────────────
export const GlassPanel: React.FC<{ children: React.ReactNode, className?: string, dark?: boolean, style?: React.CSSProperties }> = ({ 
  children, 
  className = '', 
  dark = false, 
  ...rest 
}) => {
  return (
    <div className={cn(dark ? 'glass-dark' : 'glass', 'rounded-card', className)} {...rest}>
      {children}
    </div>
  );
};

// ─── StepNumber ────────────────────────────────────────────────────────
export const StepNumber: React.FC<{ n: number | string, size?: 'sm' | 'badge' | 'lg', className?: string }> = ({ 
  n, 
  size = 'lg', 
  className = '' 
}) => {
  const padded = String(n).padStart(2, '0');
  if (size === 'lg') {
    return (
      <div className={cn(
        'select-none font-black text-primary leading-none tracking-tight tabular-nums',
        'text-[110px]',
        className,
      )} style={{ opacity: 0.10, letterSpacing: '-0.04em', fontWeight: 900 }}>
        {padded}
      </div>
    );
  }
  if (size === 'badge') {
    return (
      <span className={cn(
        'inline-flex items-center justify-center text-[11px] font-bold text-primary bg-primary-light rounded-full',
        'w-6 h-6',
        className,
      )}>{n}</span>
    );
  }
  return (
    <span className={cn('text-sm font-bold text-primary tabular-nums', className)}>{padded}</span>
  );
};

// ─── Toggle ────────────────────────────────────────────────────────────
interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  dark?: boolean;
  label?: string;
  size?: 'sm' | 'md';
}

export const Toggle: React.FC<ToggleProps> = ({ checked, onChange, dark = false, label, size = 'md' }) => {
  const w = size === 'sm' ? 32 : 40;
  const h = size === 'sm' ? 18 : 22;
  const d = h - 4;
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      {label && <span className={cn('text-sm', dark ? 'text-white/80' : 'text-text-2')}>{label}</span>}
      <span
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative inline-block rounded-full transition-colors duration-200"
        style={{
          width: w, height: h,
          background: checked ? '#5E5CE6' : (dark ? 'rgba(255,255,255,0.16)' : '#D1D1D6'),
        }}
      >
        <span
          className="absolute top-1/2 -translate-y-1/2 left-0.5 bg-white rounded-full shadow transition-transform duration-200 ease-out"
          style={{ 
            width: d, 
            height: d, 
            transform: checked ? `translateX(${w - d - 4}px) translateY(-50%)` : 'translateY(-50%)' 
          }}
        />
      </span>
    </label>
  );
};

// ─── Tooltip ──────────────────────────────────────────────────────────
export const Tooltip: React.FC<{ children: React.ReactNode, content: React.ReactNode, side?: 'top' | 'bottom' | 'left' | 'right' }> = ({ 
  children, 
  content, 
  side = 'top' 
}) => {
  const pos = {
    top: 'bottom-full mb-1.5 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-1.5 left-1/2 -translate-x-1/2',
    right: 'left-full ml-1.5 top-1/2 -translate-y-1/2',
    left: 'right-full mr-1.5 top-1/2 -translate-y-1/2',
  }[side];
  return (
    <span className="relative inline-flex group">
      {children}
      <span className={cn(
        'pointer-events-none absolute z-50 px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap',
        'bg-text text-white shadow-[0_4px_16px_rgba(0,0,0,0.18)]',
        'opacity-0 translate-y-0.5 group-hover:opacity-100 group-hover:translate-y-0',
        'transition-all duration-150 ease-out',
        pos,
      )}>{content}</span>
    </span>
  );
};

// ─── Kbd ──────────────────────────────────────────────────────────────
export const Kbd: React.FC<{ children: React.ReactNode, dark?: boolean, className?: string }> = ({ 
  children, 
  dark = false, 
  className = '' 
}) => {
  return <span className={cn(dark ? 'kbd' : 'kbd-light', className)}>{children}</span>;
};

// ─── Avatar ───────────────────────────────────────────────────────────
export const Avatar: React.FC<{ name?: string, size?: number, hue?: number, className?: string }> = ({ 
  name = '', 
  size = 32, 
  hue, 
  className = '' 
}) => {
  const initials = name.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase();
  const h = hue ?? (name.charCodeAt(0) * 13) % 360;
  return (
    <span
      className={cn('inline-flex items-center justify-center font-semibold text-white rounded-full select-none', className)}
      style={{
        width: size, height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(135deg, hsl(${h} 70% 55%), hsl(${(h+40)%360} 70% 45%))`,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12), 0 1px 2px rgba(0,0,0,0.12)',
      }}
    >
      {initials || '?'}
    </span>
  );
};

// ─── ScreenshotPlaceholder ────────────────────────────────────────────
export const ScreenshotPlaceholder: React.FC<{
  step?: Partial<Step>;
  session?: SessionEnvelope | null;
  hue?: number;
  aspect?: string;
  rounded?: string;
  showChrome?: boolean;
  className?: string;
  url?: string;
  mode?: 'blueprint' | 'stage';
  parallaxOffset?: { x: number; y: number };
}> = ({
  step,
  session,
  hue = 244,
  aspect = '16 / 10',
  rounded = 'rounded-img',
  className = '',
  mode = 'blueprint',
  parallaxOffset = { x: 0, y: 0 },
}) => {
  const [isLoaded, setIsLoaded] = React.useState(false);
  const tint = `hsl(${hue} 70% 60%)`;
  const tintSoft = `hsl(${hue} 70% 96%)`;

  const coords = (step?.data?.coordinates as { viewportWidth?: number; viewportHeight?: number } | undefined);
  const vw = step?.coordinates?.viewportWidth || coords?.viewportWidth || 1440;
  const vh = step?.coordinates?.viewportHeight || coords?.viewportHeight || 900;
  const adaptiveRatio = vw / vh;

  const realUrl = step?.screenshotKey && session?.assets?.[step.screenshotKey] 
    ? session.assets[step.screenshotKey] 
    : null;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!realUrl || !canvasRef.current) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = realUrl;
    img.onload = () => {
      [canvasRef.current, bgCanvasRef.current].forEach(canvas => {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
      });
      setIsLoaded(true);
    };
  }, [realUrl]);

  // Explicitly reset load state when step changes to prevent ghosting
  React.useEffect(() => {
    if (isLoaded) {
      console.log(`🖼️ [ScreenshotPlaceholder] Invalidate: ${step?.id}`);
      setIsLoaded(false);
    }
  }, [step?.id]);

  // Render Blueprint (Native Proportions)
  if (mode === 'blueprint') {
    return (
      <div
        className={cn(rounded, 'relative overflow-hidden shadow-card', className)}
        style={{
          aspectRatio: adaptiveRatio,
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          background: `radial-gradient(ellipse at 30% 30%, hsl(${hue} 60% 14%) 0%, hsl(${hue} 40% 8%) 60%, #111120 100%)`,
        }}
      >
        {realUrl ? (
          <canvas 
            ref={canvasRef}
            className={cn(
              "w-full h-full object-contain transition-opacity duration-200",
              isLoaded ? "opacity-100" : "opacity-0"
            )}
          />
        ) : (
          <SkeletonPlaceholder tintSoft={tintSoft} tint={tint} />
        )}
      </div>
    );
  }

  // Render Stage (Cinematic 16:9 with Layers)
  return (
    <div 
      className={cn(rounded, 'relative overflow-hidden bg-black', className)}
      style={{ aspectRatio: aspect }}
    >
      {/* LAYER 1: Ambient Backdrop (Blurred & Parallax) */}
      <div 
        className={cn(
          "absolute inset-0 pointer-events-none will-change-transform transition-opacity duration-300",
          isLoaded ? "opacity-80" : "opacity-0"
        )}
        style={{
          transform: `scale(1.25) translate(${parallaxOffset.x * 0.35}%, ${parallaxOffset.y * 0.35}%)`,
          filter: 'blur(36px) brightness(0.6) saturate(0.9)',
        }}
      >
        <canvas 
          ref={bgCanvasRef} 
          className="w-full h-full object-cover" 
        />
      </div>

      {/* LAYER 2: Sharp Foreground */}
      <div className="absolute inset-0 flex items-center justify-center">
        {realUrl ? (
          <canvas 
            ref={canvasRef}
            className={cn(
              "max-w-full max-h-full object-contain shadow-2xl transition-all duration-300",
              isLoaded ? "opacity-100 scale-100" : "opacity-0 scale-95"
            )}
          />
        ) : (
          <SkeletonPlaceholder tintSoft={tintSoft} tint={tint} />
        )}
      </div>

      {/* LAYER 3: Depth Overlay (Vignette) */}
      <div 
        className="absolute inset-0 pointer-events-none" 
        style={{
          background: 'radial-gradient(circle at center, transparent 45%, rgba(0,0,0,0.25) 100%)'
        }}
      />
    </div>
  );
};

const SkeletonPlaceholder: React.FC<{ tintSoft: string, tint: string }> = ({ tintSoft, tint }) => (
  <div className="absolute inset-0 flex">
    <div className="w-[18%] h-full p-2 space-y-1.5" style={{ background: tintSoft }}>
      <div className="h-3 rounded bg-white/80 w-3/4" />
      <div className="h-2.5 rounded bg-white/60 w-1/2 mt-3" />
      <div className="h-2 rounded bg-white/60 w-2/3" />
      <div className="h-2 rounded bg-white/60 w-1/2" />
      <div className="h-2 rounded mt-2" style={{ background: tint, width:'70%', opacity: 0.85 }} />
      <div className="h-2 rounded bg-white/60 w-3/4" />
      <div className="h-2 rounded bg-white/60 w-1/2" />
    </div>
    <div className="flex-1 p-3 bg-white">
      <div className="h-3 rounded bg-text/80 w-1/3 mb-4" />
      <div className="h-2 rounded bg-surface-2 w-1/2 mb-3" />
      <div className="grid grid-cols-3 gap-2 mb-2.5">
        {[0,1,2].map(i => <div key={i} className="h-12 rounded-md border border-border bg-[#FAFAFC]" />)}
      </div>
      <div className="space-y-1.5">
        {[0,1,2,3,4].map(i => <div key={i} className="h-5 rounded-md border border-border bg-[#FAFAFC]" />)}
      </div>
    </div>
  </div>
);

// ─── SectionLabel ──────────────────────────────────────────────────────
export const SectionLabel: React.FC<{ children: React.ReactNode, hint?: string, className?: string }> = ({ 
  children, 
  hint, 
  className = '' 
}) => {
  return (
    <div className={cn('flex items-center justify-between mb-2', className)}>
      <span className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-text-3">{children}</span>
      {hint && <span className="text-[11px] text-text-3">{hint}</span>}
    </div>
  );
};

// ─── FieldShell ────────────────────────────────────────────────────────
export const FieldShell: React.FC<{ icon?: LucideIcon, children: React.ReactNode, className?: string, dark?: boolean }> = ({ 
  icon: Icon, 
  children, 
  className = '', 
  dark = false 
}) => {
  return (
    <div className={cn(
      'flex items-center gap-2 h-10 px-3 rounded-sm border transition-colors',
      dark ? 'bg-white/5 border-white/10 text-white' : 'bg-surface-2 border-transparent focus-within:bg-white focus-within:border-primary',
      className,
    )}>
      {Icon && <Icon size={15} className={dark ? 'text-white/50' : 'text-text-3'} />}
      {children}
    </div>
  );
};

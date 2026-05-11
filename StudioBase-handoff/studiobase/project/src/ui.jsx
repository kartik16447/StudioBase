// UI primitives — Button, Card, Badge, ComingSoon, GlassPanel, StepNumber,
// Tooltip, Toggle, IconButton, ScreenshotPlaceholder, AvatarChip, KbdChip.

const { motion, AnimatePresence } = window['Motion'] || window['framerMotion'] || window;
// Note: framer-motion UMD attaches to window as `Motion` in v11
const M = window.Motion || window.framerMotion || { motion: undefined, AnimatePresence: undefined };

function cn(...parts) {
  return parts.filter(Boolean).join(' ');
}

// ─── Button ────────────────────────────────────────────────────────────
function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon = null,
  iconRight: IconRight = null,
  locked = false,
  lockedHint,
  children,
  className = '',
  onClick,
  ...rest
}) {
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
}

// ─── IconButton ───────────────────────────────────────────────────────
function IconButton({ icon: Icon, label, active = false, dark = false, size = 36, onClick, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex items-center justify-center rounded-full transition-all duration-150 ease-out',
        dark
          ? (active ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/8')
          : (active ? 'bg-primary-light text-primary' : 'text-text-2 hover:text-text hover:bg-surface-2'),
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Icon size={size === 36 ? 18 : 16} strokeWidth={1.9} />
    </button>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────
function Card({ variant = 'default', children, className = '', as: As = 'div', onClick, ...rest }) {
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
}

// ─── Badge / Pill ─────────────────────────────────────────────────────
function Badge({ children, tone = 'neutral', size = 'md', icon: Icon = null, className = '' }) {
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
}

// ─── GlassPanel ───────────────────────────────────────────────────────
function GlassPanel({ children, className = '', dark = false, ...rest }) {
  return (
    <div className={cn(dark ? 'glass-dark' : 'glass', 'rounded-card', className)} {...rest}>
      {children}
    </div>
  );
}

// ─── StepNumber ────────────────────────────────────────────────────────
function StepNumber({ n, size = 'lg', className = '' }) {
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
}

// ─── Toggle ────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, dark = false, label, size = 'md' }) {
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
          style={{ width: d, height: d, transform: checked ? `translateX(${w - d - 4}px) translateY(-50%)` : 'translateY(-50%)' }}
        />
      </span>
    </label>
  );
}

// ─── Tooltip (CSS-only via title attribute on parent + custom) ────────
function Tooltip({ children, content, side = 'top' }) {
  // Hover-driven CSS tooltip — kept lightweight to avoid portal complexity.
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
}

// ─── KbdChip — single key or sequence ──────────────────────────────────
function Kbd({ children, dark = false, className = '' }) {
  return <span className={cn(dark ? 'kbd' : 'kbd-light', className)}>{children}</span>;
}

// ─── AvatarChip ────────────────────────────────────────────────────────
function Avatar({ name = '', size = 32, hue, className = '' }) {
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
}

// ─── Screenshot Placeholder ────────────────────────────────────────────
// Used everywhere instead of real screenshots. Visually convincing as a
// "captured browser screenshot" stand-in.
function ScreenshotPlaceholder({
  step,                // optional Step object
  hue = 244,           // base tone of the fake UI inside the placeholder
  aspect = '16 / 10',
  rounded = 'rounded-img',
  showChrome = true,
  className = '',
  url,
}) {
  const tint = `hsl(${hue} 70% 60%)`;
  const tintSoft = `hsl(${hue} 70% 96%)`;
  const pageTitle = step?.pageTitle || 'Workspace';
  const elementText = step?.elementText;
  const action = step?.action;

  // Click ripple position from step coordinates if available
  const cx = step?.coordinates?.x ? `${(step.coordinates.x / (step.coordinates.viewportWidth||1440)) * 100}%` : '62%';
  const cy = step?.coordinates?.y ? `${(step.coordinates.y / (step.coordinates.viewportHeight||900)) * 100}%` : '58%';

  return (
    <div
      className={cn(rounded, 'relative overflow-hidden shadow-card bg-white', className)}
      style={{ aspectRatio: aspect, boxShadow: '0 4px 20px rgba(0,0,0,0.08), inset 0 0 0 1px rgba(0,0,0,0.04)' }}
    >
      {/* Fake browser chrome */}
      {showChrome && (
        <div className="h-9 px-3 border-b border-border flex items-center gap-2 bg-[#FAFAFC]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
          <div className="flex-1 mx-3 h-5 rounded-md bg-white border border-border flex items-center px-2 text-[10px] text-text-3 font-mono truncate">
            {url || step?.url || 'https://app.example.com/dashboard'}
          </div>
        </div>
      )}
      {/* Fake app body — sidebar + content */}
      <div className="absolute inset-0 top-9 flex">
        <div className="w-[18%] h-full p-2 space-y-1.5" style={{ background: tintSoft }}>
          <div className="h-3 rounded bg-white/80 w-3/4" />
          <div className="h-2.5 rounded bg-white/60 w-1/2 mt-3" />
          <div className="h-2 rounded bg-white/60 w-2/3" />
          <div className="h-2 rounded bg-white/60 w-1/2" />
          <div className="h-2 rounded mt-2" style={{ background: tint, width:'70%', opacity: 0.85 }} />
          <div className="h-2 rounded bg-white/60 w-2/3" />
          <div className="h-2 rounded bg-white/60 w-3/4" />
          <div className="h-2 rounded bg-white/60 w-1/2" />
          <div className="h-2 rounded bg-white/60 w-2/3" />
          <div className="h-2 rounded bg-white/60 w-3/4 mt-4" />
          <div className="h-2 rounded bg-white/60 w-1/2" />
        </div>
        <div className="flex-1 p-3 bg-white">
          <div className="flex items-center justify-between mb-2">
            <div className="h-3 rounded bg-text/80 w-1/3" />
            <div className="flex gap-1.5">
              <div className="h-5 w-12 rounded-md bg-surface-2" />
              <div className="h-5 w-14 rounded-md" style={{ background: tint }} />
            </div>
          </div>
          <div className="h-2 rounded bg-surface-2 w-1/2 mb-3" />
          <div className="grid grid-cols-3 gap-2 mb-2.5">
            {[0,1,2].map(i => (
              <div key={i} className="h-12 rounded-md border border-border bg-[#FAFAFC] p-1.5 flex flex-col justify-between">
                <div className="h-1.5 rounded bg-text/60 w-2/3" />
                <div className="flex items-end gap-0.5 h-5">
                  {[0,1,2,3,4,5].map(b => (
                    <div key={b} className="flex-1 rounded-sm" style={{ background: tint, opacity: 0.2 + (b*0.13), height: `${20 + (b*9 % 60)}%` }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            {[0,1,2,3,4].map(i => (
              <div key={i} className="h-5 rounded-md border border-border bg-[#FAFAFC] flex items-center px-2 gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: i === 2 ? tint : '#AEAEB2' }} />
                <div className="h-1.5 rounded bg-text/40 flex-1" style={{ maxWidth: `${40 + (i * 11 % 50)}%` }} />
                <div className="h-1.5 rounded bg-surface-2 w-8" />
                <div className="h-3.5 w-3.5 rounded-full" style={{ background: `hsl(${(hue + i*40) % 360} 70% 60%)` }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Click ripple / spotlight if action is click */}
      {action === 'click' && (
        <>
          <div className="absolute pointer-events-none" style={{ left: cx, top: cy, transform: 'translate(-50%,-50%)' }}>
            <span className="absolute -inset-6 rounded-full" style={{ background: 'radial-gradient(circle, rgba(94,92,230,0.25), transparent 70%)' }} />
            <span className="block w-3 h-3 rounded-full bg-primary ring-4 ring-primary/30" />
          </div>
          {elementText && (
            <div className="absolute pointer-events-none px-2 py-1 rounded-md bg-text text-white text-[10px] font-medium shadow-lg"
              style={{ left: `calc(${cx} + 14px)`, top: `calc(${cy} - 16px)` }}>
              {elementText}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── ComingSoon overlay ───────────────────────────────────────────────
function ComingSoon({ title, phase = 3, description, children }) {
  return (
    <div className="relative h-full">
      <div className="pointer-events-none opacity-25 blur-[1px] select-none">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <GlassPanel className="max-w-sm w-full text-center p-8">
          <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-primary-light flex items-center justify-center">
            <I.Lock size={20} strokeWidth={2} className="text-primary" />
          </div>
          <div className="text-[11px] font-semibold tracking-widest uppercase text-primary mb-1.5">Phase {phase}</div>
          <h3 className="text-[18px] font-semibold text-text mb-1.5">{title}</h3>
          {description && <p className="text-[13px] text-text-2 leading-relaxed mb-5">{description}</p>}
          <Button variant="ghost" size="sm" icon={I.Bell}>Notify me on release</Button>
        </GlassPanel>
      </div>
    </div>
  );
}

// ─── Section header inside panels ──────────────────────────────────────
function SectionLabel({ children, hint, className = '' }) {
  return (
    <div className={cn('flex items-center justify-between mb-2', className)}>
      <span className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-text-3">{children}</span>
      {hint && <span className="text-[11px] text-text-3">{hint}</span>}
    </div>
  );
}

// ─── Field shell — used by inputs in panels ───────────────────────────
function FieldShell({ icon: Icon, children, className = '', dark = false }) {
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
}

Object.assign(window, {
  cn, Button, IconButton, Card, Badge, GlassPanel, StepNumber, Toggle, Tooltip,
  Kbd, Avatar, ScreenshotPlaceholder, ComingSoon, SectionLabel, FieldShell,
});

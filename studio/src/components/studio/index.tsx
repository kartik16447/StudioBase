import React from 'react';
import { motion } from 'framer-motion';
import type { Step, SessionEnvelope, AnnotationShape, Annotation } from '../../../../shared/types/session';
import { I } from '../icons';
import { 
  cn, Badge, IconButton, Tooltip, ScreenshotPlaceholder,
  GlassPanel, Avatar, Button
} from '../ui';
import { useStudioStore } from '../../store/useStudioStore';
import { AnimatePresence } from 'framer-motion';

// ─── CopyLinkButton ───────────────────────────────────────────────────
const CopyLinkButton: React.FC<{ url: string }> = ({ url }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'w-6 h-6 rounded-full inline-flex items-center justify-center transition-all duration-300 relative group overflow-hidden',
        copied ? 'bg-green-50' : 'hover:bg-white/80 active:scale-90'
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.div
            key="check"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            <I.Check size={11} className="text-green-600" strokeWidth={3} />
          </motion.div>
        ) : (
          <motion.div
            key="copy"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="text-text-3 group-hover:text-text"
          >
            <I.Copy size={11} strokeWidth={2.5} />
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
};

export const AnnotationCanvas: React.FC<{
  step: Step;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onSave: (annotation: NonNullable<Step['annotations']>[number]) => void;
  onClear: () => void;
}> = ({ step, containerRef: _containerRef, onSave, onClear }) => {
  const activeTool = useStudioStore(state => state.activeTool);
  const [drawing, setDrawing] = React.useState(false);
  const [startPct, setStartPct] = React.useState({ x: 0, y: 0 });
  const [currentPct, setCurrentPct] = React.useState({ x: 0, y: 0 });
  const [textInput, setTextInput] = React.useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = React.useState('');
  const svgRef = React.useRef<SVGSVGElement>(null);

  const isActive = activeTool !== 'cursor' && activeTool !== 'zoom' && activeTool !== 'move' && activeTool !== 'spotlight';
  const annotations = step.annotations || [];

  const getPct = (e: React.MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isActive) return;
    if (activeTool === 'text') {
      const pct = getPct(e);
      setTextInput(pct);
      setTextValue('');
      return;
    }
    e.preventDefault();
    const pct = getPct(e);
    setStartPct(pct);
    setCurrentPct(pct);
    setDrawing(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drawing) return;
    setCurrentPct(getPct(e));
  };

  const handleMouseUp = () => {
    if (!drawing) return;
    setDrawing(false);
    const x = Math.min(startPct.x, currentPct.x);
    const y = Math.min(startPct.y, currentPct.y);
    const w = Math.abs(currentPct.x - startPct.x);
    const h = Math.abs(currentPct.y - startPct.y);
    if (w < 1 && h < 1) return;
    const shape = activeTool === 'highlight' ? 'box'
      : activeTool === 'blur' ? 'blur'
      : activeTool === 'circle' ? 'circle'
      : activeTool as AnnotationShape;
    const color = activeTool === 'highlight' ? '#FFC107'
      : activeTool === 'blur' ? 'blur'
      : 'var(--color-primary, #5E5CE6)';
    onSave({
      id: `anno-${Date.now()}`,
      shape,
      x,
      y,
      width: w,
      height: h,
      color,
    });
  };

  const handleTextSubmit = () => {
    if (!textInput || !textValue.trim()) { setTextInput(null); return; }
    onSave({
      id: `anno-${Date.now()}`,
      shape: 'text',
      x: textInput.x,
      y: textInput.y,
      text: textValue.trim(),
      color: 'var(--color-primary, #5E5CE6)',
    });
    setTextInput(null);
    setTextValue('');
  };

  const draftX = Math.min(startPct.x, currentPct.x);
  const draftY = Math.min(startPct.y, currentPct.y);
  const draftW = Math.abs(currentPct.x - startPct.x);
  const draftH = Math.abs(currentPct.y - startPct.y);

  return (
    <div className="absolute inset-0 z-10">
      <svg
        ref={svgRef}
        className="absolute inset-0 w-full h-full"
        style={{ cursor: isActive ? 'crosshair' : 'default', pointerEvents: isActive ? 'all' : 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => setDrawing(false)}
      >
        {/* Saved annotations */}
        {annotations.map((a: Annotation) => {
          if (a.shape === 'blur') return null;
          if (a.shape === 'box') return (
            <rect key={a.id}
              x={`${a.x}%`} y={`${a.y}%`}
              width={`${a.width}%`} height={`${a.height}%`}
              fill={a.color === '#FFC107' ? 'rgba(255,193,7,0.25)' : 'none'}
              stroke={a.color === '#FFC107' ? '#FFC107' : 'var(--color-primary,#5E5CE6)'}
              strokeWidth="2" rx="3"
            />
          );
          if (a.shape === 'arrow') {
            const x1 = a.x; const y1 = a.y;
            const x2 = (a.x + (a.width ?? 10)); const y2 = (a.y + (a.height ?? 10));
            return (
              <g key={a.id}>
                <defs>
                  <marker id={`ah-${a.id}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L8,3 z" fill="var(--color-primary,#5E5CE6)" />
                  </marker>
                </defs>
                <line x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`}
                  stroke="var(--color-primary,#5E5CE6)" strokeWidth="2.5"
                  markerEnd={`url(#ah-${a.id})`} />
              </g>
            );
          }
          if (a.shape === 'circle') return (
            <ellipse
              key={a.id}
              cx={`${a.x + (a.width ?? 10) / 2}%`}
              cy={`${a.y + (a.height ?? 10) / 2}%`}
              rx={`${(a.width ?? 10) / 2}%`}
              ry={`${(a.height ?? 10) / 2}%`}
              fill="none"
              stroke="var(--color-primary,#5E5CE6)"
              strokeWidth="2"
            />
          );
          if (a.shape === 'text') return (
            <foreignObject key={a.id} x={`${a.x}%`} y={`${a.y}%`} width="200" height="40">
              <div className="bg-primary text-white text-[12px] font-bold px-2 py-1 rounded shadow-lg whitespace-nowrap" style={{ background: 'var(--color-primary,#5E5CE6)' }}>
                {a.text}
              </div>
            </foreignObject>
          );
          return null;
        })}

        {/* Draft shape while drawing */}
        {drawing && (activeTool === 'box' || activeTool === 'highlight' || activeTool === 'blur') && (
          <rect
            x={`${draftX}%`} y={`${draftY}%`}
            width={`${draftW}%`} height={`${draftH}%`}
            fill={activeTool === 'highlight' ? 'rgba(255,193,7,0.2)' : activeTool === 'blur' ? 'rgba(0,0,0,0.2)' : 'none'}
            stroke={activeTool === 'highlight' ? '#FFC107' : activeTool === 'blur' ? '#888' : 'var(--color-primary,#5E5CE6)'}
            strokeWidth="2" strokeDasharray="4 2" rx="3"
          />
        )}
        {drawing && activeTool === 'circle' && (
          <ellipse
            cx={`${draftX + draftW / 2}%`}
            cy={`${draftY + draftH / 2}%`}
            rx={`${draftW / 2}%`}
            ry={`${draftH / 2}%`}
            fill="none"
            stroke="var(--color-primary,#5E5CE6)"
            strokeWidth="2" strokeDasharray="4 2"
          />
        )}
        {drawing && activeTool === 'arrow' && (
          <line x1={`${startPct.x}%`} y1={`${startPct.y}%`}
            x2={`${currentPct.x}%`} y2={`${currentPct.y}%`}
            stroke="var(--color-primary,#5E5CE6)" strokeWidth="2.5" strokeDasharray="4 2" />
        )}
      </svg>

      {/* Blur annotations as DOM divs (backdrop-filter) */}
      {annotations.filter((a: Annotation) => a.shape === 'blur').map((a: Annotation) => (
        <div key={a.id}
          className="absolute pointer-events-none"
          style={{
            left: `${a.x}%`, top: `${a.y}%`,
            width: `${a.width}%`, height: `${a.height}%`,
            backdropFilter: 'blur(12px)',
            background: 'rgba(0,0,0,0.3)',
          }}
        />
      ))}

      {/* Text input popover */}
      {textInput && (
        <div className="absolute z-20" style={{ left: `${textInput.x}%`, top: `${textInput.y}%` }}>
          <input
            autoFocus
            value={textValue}
            onChange={e => setTextValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleTextSubmit(); if (e.key === 'Escape') setTextInput(null); }}
            onBlur={handleTextSubmit}
            placeholder="Type label…"
            className="bg-white border-2 border-primary rounded px-2 py-1 text-[13px] outline-none shadow-card-lifted min-w-[120px]"
          />
        </div>
      )}

      {/* Clear button */}
      {annotations.length > 0 && !isActive && (
        <button
          onClick={onClear}
          className="absolute top-2 right-2 z-20 h-6 px-2 rounded-pill bg-surface/90 text-[11px] font-semibold text-text-2 hover:text-danger hover:bg-surface transition-colors shadow-card flex items-center gap-1"
        >
          <I.X size={10} /> Clear
        </button>
      )}
    </div>
  );
};

// ─── FaviconImg ────────────────────────────────────────────────────────
const FaviconImg: React.FC<{ src: string; domain: string }> = ({ src, domain }) => {
  const [failed, setFailed] = React.useState(false);
  if (failed) return <I.Globe size={12} aria-hidden />;
  return (
    <img
      src={src}
      alt={domain}
      width={12}
      height={12}
      className="rounded-sm object-contain"
      onError={() => setFailed(true)}
    />
  );
};

// ─── StepCard ──────────────────────────────────────────────────────────
export const StepCard: React.FC<{
  step: Step;
  index: number;
  hue?: number;
  onEdit?: (step: Step) => void;
  onAnnotate?: (step: Step) => void;
  onDelete?: (step: Step) => void;
  focused?: boolean;
  onFocus?: () => void;
}> = ({ step, hue = 244, onEdit, onAnnotate, onDelete, focused, onFocus }) => {
  const session = useStudioStore(state => state.session);
  const updateStep = useStudioStore(state => state.updateStep);
  const sopStatus = useStudioStore(state => state.sopStatus);
  const text = step.textOverride || step.generatedText || '';
  const stepLabel = `Step ${step.sequence ?? (step as any).index + 1}`;
  const stepTitle = step.stepTitle || step.elementText || '';

  const [textValue, setTextValue] = React.useState(step.textOverride ?? step.generatedText ?? '');

  React.useEffect(() => {
    setTextValue(step.textOverride ?? step.generatedText ?? '');
  }, [step.textOverride, step.generatedText]);

  return (
    <article
      onClick={onFocus}
      className={cn(
        'group relative bg-white rounded-xl overflow-hidden cursor-default transition-all duration-200 ease-out',
        'shadow-[0_2px_12px_rgba(0,0,0,0.07)] hover:shadow-[0_6px_24px_rgba(0,0,0,0.11)]',
        focused && 'ring-2 ring-primary ring-offset-2 ring-offset-bg',
      )}
    >
      {/* ── Full-width screenshot ── */}
      <div className="relative w-full">
        <ScreenshotPlaceholder step={step} session={session} mode="blueprint" hue={hue} rounded="" className="rounded-none" />
        <AnnotationCanvas
          step={step}
          containerRef={React.useRef<HTMLDivElement>(null)}
          onSave={(anno) => {
            const existing = step.annotations || [];
            updateStep(step.id, { annotations: [...existing, anno] });
          }}
          onClear={() => updateStep(step.id, { annotations: [] })}
        />
        {/* Hover toolbar — top-right of screenshot */}
        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-white/90 rounded-lg px-1 py-1 shadow-sm">
          <Tooltip content="Annotate" side="top">
            <IconButton icon={I.Wand} label="Annotate" onClick={(e) => { e.stopPropagation(); onAnnotate?.(step); }} size={28} />
          </Tooltip>
          <Tooltip content="Edit text" side="top">
            <IconButton icon={I.Edit2} label="Edit" onClick={(e) => { e.stopPropagation(); onEdit?.(step); }} size={28} />
          </Tooltip>
          <Tooltip content="Translate" side="top">
            <IconButton icon={I.Languages} label="Translate" size={28} />
          </Tooltip>
          <Tooltip content="Delete step" side="top">
            <IconButton icon={I.Trash2} label="Delete" onClick={(e) => { e.stopPropagation(); onDelete?.(step); }} size={28} />
          </Tooltip>
        </div>
      </div>

      {/* ── Content below screenshot ── */}
      <div className="px-7 pt-5 pb-6">
        {/* "Step N: Title" heading — matches PDF format */}
        <h3 className="text-[17px] font-bold text-text leading-snug mb-3">
          {stepLabel}{stepTitle ? `: ${stepTitle}` : ''}
        </h3>

        {/* Step description — editable when draft, read-only when published */}
        {sopStatus !== 'published' ? (
          <textarea
            className="w-full bg-surface-2/60 border border-border rounded-sm p-3 text-[14px] resize-none focus:outline-none focus:border-primary/40 text-text-2 leading-[1.7] transition-colors"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            rows={3}
            placeholder="Step description…"
            onBlur={() => {
              const newText = textValue.trim();
              const original = step.textOverride ?? step.generatedText ?? '';
              if (newText !== original) {
                useStudioStore.getState().saveStep(step.id, { textOverride: newText });
              }
            }}
          />
        ) : (
          <p className="text-[14px] leading-[1.7] text-text-2" style={{ textWrap: 'pretty' as any }}>
            {text}
          </p>
        )}

        {/* Footer: URL pill + edited badge */}
        <div className="mt-4 flex items-center gap-2">
          {(() => {
            const rawUrl = step.url || session?.capturedUrl || '';
            if (!rawUrl) return null;
            const domain = rawUrl.replace(/^https?:\/\//, '').split('/')[0];
            if (!domain) return null;
            const faviconSrc = `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
            return (
              <div className="flex items-center bg-surface-2 rounded-pill pr-1">
                <div className="inline-flex items-center gap-1 rounded-pill font-semibold tracking-wide uppercase whitespace-nowrap text-text-2 text-[10px] h-5 px-2">
                  <FaviconImg src={faviconSrc} domain={domain} />
                  {domain}
                </div>
                <CopyLinkButton url={rawUrl} />
              </div>
            );
          })()}
          {step.textOverride && (
            <Badge tone="primary" size="sm">edited</Badge>
          )}
        </div>
      </div>
    </article>
  );
};

// ─── ChapterBreak ──────────────────────────────────────────────────────
export const ChapterBreak: React.FC<{ index: number; title: string }> = ({ index, title }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-surface-2 rounded-card py-4 px-6 my-8 border-l-4 border-primary flex items-center gap-4"
    >
      <Badge tone="primary" size="md">Chapter {index}</Badge>
      <h3 className="text-[17px] font-semibold text-text">{title}</h3>
    </motion.div>
  );
};

// ─── SummaryCallout ────────────────────────────────────────────────────
export const SummaryCallout: React.FC<{ session: SessionEnvelope }> = ({ session }) => {
  const summary = session.aiOutputs?.summary;
  const tags = session.aiOutputs?.tags ?? [];
  if (!summary) return null;
  return (
    <GlassPanel className="p-6 border-l-4 border-primary mb-8" style={{ borderTopLeftRadius: 4, borderBottomLeftRadius: 4 }}>
      <div className="flex items-center gap-2 mb-2">
        <I.Sparkles size={14} className="text-primary" strokeWidth={2.2} />
        <span className="text-[10.5px] font-bold tracking-[0.16em] uppercase text-primary">AI summary</span>
      </div>
      <p className="text-[15px] leading-[1.65] text-text-2" style={{ textWrap: 'pretty' as any }}>
        {summary}
      </p>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-4">
          {tags.map(t => (
            <span key={t} className="text-[11px] font-medium text-text-2 bg-surface-2 px-2.5 h-6 inline-flex items-center rounded-pill">
              {t}
            </span>
          ))}
        </div>
      )}
    </GlassPanel>
  );
};

// ─── SessionCard ───────────────────────────────────────────────────────
export const SessionCard: React.FC<{ 
  session: SessionEnvelope; 
  onClick?: () => void;
  onRename?: (newTitle: string) => void;
  onDelete?: () => void;
}> = ({ session, onClick, onRename, onDelete }) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  
  // @ts-ignore
  const hue = session._hue ?? 244;
  
  const formatDuration = (ms: number) => {
    const s = Math.round(ms/1000);
    const m = Math.floor(s/60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2,'0')}`;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    if (diff < 3600) return `${Math.round(diff/60)}m ago`;
    if (diff < 86400) return `${Math.round(diff/3600)}h ago`;
    if (diff < 604800) return `${Math.round(diff/86400)}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  React.useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    const newTitle = prompt('Enter new session title:', session.aiOutputs.title || undefined);
    if (newTitle && newTitle.trim()) {
      onRename?.(newTitle.trim());
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    onDelete?.();
  };

  return (
    <div
      onClick={onClick}
      className="bg-surface rounded-card shadow-card hover:shadow-card-hover transition-all duration-200 cursor-pointer overflow-hidden group hover:-translate-y-1"
    >
      <div className="relative">
        <ScreenshotPlaceholder
          step={session.steps?.[0]}
          session={session}
          hue={hue}
          aspect="16 / 10"
          rounded=""
          url={session.steps?.[0]?.url || 'https://app.example.com'}
        />
        <div className="absolute top-3 left-3">
          <Badge tone="glass" size="sm" icon={session.sessionType === 'video' ? I.Play : I.FileText}>
            {session.sessionType === 'video' ? 'Video' : 'SOP'}
          </Badge>
        </div>
        <div className="absolute top-3 right-3">
          <Badge tone="glass" size="sm" icon={I.Clock}>
            {formatDuration(session.metadata.durationMs)}
          </Badge>
        </div>
      </div>

      <div className="p-5">
        <h3 className="text-[15px] font-semibold text-text leading-snug line-clamp-2 mb-2 group-hover:text-primary transition-colors">
          {session.aiOutputs.title}
        </h3>
        <div className="flex items-center gap-2 text-[12px] text-text-2">
          <span className="inline-flex items-center gap-1">
            <I.FileText size={12} strokeWidth={2} />
            {session.metadata.stepCount} steps
          </span>
          <span className="text-text-3">·</span>
          <span>{formatDate(session.capturedAt)}</span>
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <div className="flex -space-x-1.5">
            <Avatar name="Kartik Upadhyay" size={22} hue={244} />
            <Avatar name="Maya Chen" size={22} hue={198} />
            <Avatar name="Diego Ramos" size={22} hue={22} />
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-text-3 inline-flex items-center gap-1">
              <I.Eye size={12} strokeWidth={2} /> {12 + ((session.sessionId.charCodeAt(6) || 0) % 80)}
            </span>
            <div className="relative" ref={menuRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
                className="w-6 h-6 rounded-full inline-flex items-center justify-center text-text-3 hover:text-text hover:bg-surface-2 transition-colors"
              >
                <I.MoreHorizontal size={15} />
              </button>
              {menuOpen && (
                <div className="absolute bottom-full right-0 mb-1 z-50 min-w-[120px] bg-surface border border-border rounded-sm shadow-card py-1 overflow-hidden">
                  <button
                    onClick={handleRename}
                    className="w-full px-3 py-1.5 text-left text-[13px] text-text hover:bg-surface-2 transition-colors"
                  >
                    Rename
                  </button>
                  <button
                    onClick={handleDelete}
                    className="w-full px-3 py-1.5 text-left text-[13px] text-danger hover:bg-surface-2 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── FloatingToolbar ───────────────────────────────────────────────────
export const FloatingToolbar: React.FC = () => {
  const isToolbarVisible = useStudioStore(state => state.isToolbarVisible);
  const activeTool = useStudioStore(state => state.activeTool);
  const setActiveTool = useStudioStore(state => state.setActiveTool);
  const activeView = useStudioStore(state => state.activeView);
  
  if (!isToolbarVisible || activeView !== 'sop') return null;

  const tools = [
    { id: 'cursor',    icon: I.Cursor,     label: 'Select (V)', key: 'v' },
    { id: 'spotlight', icon: I.Crosshair,  label: 'Spotlight (S)', key: 's' },
    { id: 'highlight', icon: I.Highlighter, label: 'Highlight (B)', key: 'b' },
    { id: 'circle', icon: I.Circle, label: 'Circle (C)', key: 'c' },
    { id: 'text',      icon: I.Type,        label: 'Text (T)', key: 't' },
    { id: 'zoom',      icon: I.ZoomIn,      label: 'Zoom (Z)', key: 'z' },
    { id: 'move',      icon: I.Move,        label: 'Move canvas', key: 'm' },
    { id: 'blur', icon: I.EyeOff, label: 'Blur / Redact (R)', key: 'r' },
  ];

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
      <GlassPanel dark className="flex items-center gap-1 p-1.5 !rounded-pill shadow-card-lifted">
        {tools.map(t => (
          <Tooltip key={t.id} content={t.label}>
            <IconButton
              icon={t.icon}
              label={t.label}
              dark
              active={activeTool === t.id}
              onClick={() => setActiveTool(t.id)}
              size={38}
            />
          </Tooltip>
        ))}
        <div className="w-px h-6 bg-white/10 mx-1" />
        <Tooltip content="More tools">
          <IconButton icon={I.MoreHorizontal} label="More" dark size={38} />
        </Tooltip>
      </GlassPanel>
    </div>
  );
};

export * from './StudioHeader';
export * from './SidebarControls';

// ─── ShareHeader ──────────────────────────────────────────────────────
export const ShareHeader: React.FC<{ session: SessionEnvelope }> = ({ session }) => {
  const formatDuration = (ms: number) => {
    const s = Math.round(ms/1000);
    const m = Math.floor(s/60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2,'0')}`;
  };

  return (
    <header className="sticky top-0 z-40 glass rounded-none">
      <div className="max-w-[1100px] mx-auto px-6 h-14 flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[10px] bg-text text-white flex items-center justify-center font-bold text-[15px]">S</div>
          <div>
            <div className="text-[13.5px] font-semibold text-text leading-tight truncate max-w-[200px]">{session.aiOutputs.title}</div>
            <div className="text-[11px] text-text-3 leading-tight">studiobase.app · published walkthrough</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[12px] text-text-2 hidden sm:inline">{session.metadata.stepCount} steps · {formatDuration(session.metadata.durationMs)}</span>
          <div className="w-px h-6 bg-border mx-1 hidden sm:block" />
          <Button variant="ghost" size="sm" icon={I.Languages}>English</Button>
          <Button variant="ghost" size="sm" icon={I.Share2}>Copy link</Button>
          <Button variant="primary" size="sm" icon={I.Download}>Export PDF</Button>
        </div>
      </div>
    </header>
  );
};

import React from 'react';
import { motion } from 'framer-motion';
import type { Step, SessionEnvelope } from '../../../../shared/types/session';
import { I } from '../icons';
import { 
  cn, Badge, IconButton, Tooltip, StepNumber, ScreenshotPlaceholder, 
  GlassPanel, Avatar, Button
} from '../ui';
import { useStudioStore } from '../../store/useStudioStore';

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
  const text = step.textOverride || step.generatedText || '';
  return (
    <article
      onClick={onFocus}
      className={cn(
        'group relative bg-surface rounded-card shadow-card p-6 cursor-default transition-all duration-200 ease-out',
        'hover:shadow-card-hover hover:-translate-y-1',
        focused && 'ring-2 ring-primary ring-offset-2 ring-offset-bg',
      )}
    >
      <div className="absolute top-3 right-6 pointer-events-none">
        <StepNumber n={step.sequence} size="lg" />
      </div>

      <div className="flex items-center gap-2 mb-4 relative z-10">
        <StepNumber n={step.sequence} size="badge" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-3">
          {step.action}
        </span>
        {step.elementText && (
          <span className="text-[12px] text-text-2 truncate">
            <span className="text-text-3">·</span>{' '}
            <span className="font-mono">{step.elementText}</span>
          </span>
        )}
      </div>

      <ScreenshotPlaceholder step={step} session={session} hue={hue} className="mb-5" />

      <p className="text-[16px] leading-[1.65] text-text relative z-10" style={{ textWrap: 'pretty' as any }}>
        {text}
      </p>

      <div className="mt-4 flex items-center gap-3 relative z-10">
        <Badge tone="neutral" size="sm" icon={I.Globe}>
          {(step.url || '').replace(/^https?:\/\//,'').split('/')[0]}
        </Badge>
        {step.textOverride && (
          <Badge tone="primary" size="sm">edited</Badge>
        )}

        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <Tooltip content="Edit text" side="top">
            <IconButton icon={I.Edit2} label="Edit" onClick={(e) => { e.stopPropagation(); onEdit?.(step); }} />
          </Tooltip>
          <Tooltip content="Annotate screenshot" side="top">
            <IconButton icon={I.Wand} label="Annotate" onClick={(e) => { e.stopPropagation(); onAnnotate?.(step); }} />
          </Tooltip>
          <Tooltip content="Translate this step" side="top">
            <IconButton icon={I.Languages} label="Translate" />
          </Tooltip>
          <Tooltip content="Delete step" side="top">
            <IconButton icon={I.Trash2} label="Delete" onClick={(e) => { e.stopPropagation(); onDelete?.(step); }} />
          </Tooltip>
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
  return (
    <GlassPanel className="p-6 border-l-4 border-primary mb-8" style={{ borderTopLeftRadius: 4, borderBottomLeftRadius: 4 }}>
      <div className="flex items-center gap-2 mb-2">
        <I.Sparkles size={14} className="text-primary" strokeWidth={2.2} />
        <span className="text-[10.5px] font-bold tracking-[0.16em] uppercase text-primary">AI summary</span>
      </div>
      <p className="text-[15px] leading-[1.65] text-text-2" style={{ textWrap: 'pretty' as any }}>
        {session.aiOutputs.summary}
      </p>
      <div className="flex flex-wrap gap-1.5 mt-4">
        {session.aiOutputs.tags?.map(t => (
          <span key={t} className="text-[11px] font-medium text-text-2 bg-surface-2 px-2.5 h-6 inline-flex items-center rounded-pill">
            {t}
          </span>
        ))}
      </div>
    </GlassPanel>
  );
};

// ─── SessionCard ───────────────────────────────────────────────────────
export const SessionCard: React.FC<{ session: SessionEnvelope; onClick?: () => void }> = ({ session, onClick }) => {
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
          <span className="text-[11px] text-text-3 inline-flex items-center gap-1">
            <I.Eye size={12} strokeWidth={2} /> {12 + ((session.sessionId.charCodeAt(6) || 0) % 80)}
          </span>
        </div>
      </div>
    </div>
  );
};

// ─── FloatingToolbar ───────────────────────────────────────────────────
export const FloatingToolbar: React.FC = () => {
  const { isToolbarVisible, activeTool, setActiveTool } = useStudioStore();
  
  if (!isToolbarVisible) return null;

  const tools = [
    { id: 'cursor',    icon: I.Cursor,     label: 'Select (V)', key: 'v' },
    { id: 'spotlight', icon: I.Crosshair,  label: 'Spotlight (S)', key: 's' },
    { id: 'highlight', icon: I.Highlighter, label: 'Highlight (B)', key: 'b' },
    { id: 'text',      icon: I.Type,        label: 'Text (T)', key: 't' },
    { id: 'zoom',      icon: I.ZoomIn,      label: 'Zoom (Z)', key: 'z' },
    { id: 'move',      icon: I.Move,        label: 'Move canvas', key: 'm' },
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

// ─── StudioTopBar ──────────────────────────────────────────────────────
export const StudioTopBar: React.FC = () => {
  const { navigate, activeView, setActiveView } = useStudioStore();
  return (
    <header className="h-14 bg-surface border-b border-border flex items-center px-4 gap-4 z-40 relative">
      <button 
        onClick={() => navigate('home')}
        className="w-9 h-9 rounded-full hover:bg-surface-2 inline-flex items-center justify-center transition-colors text-text-2 hover:text-text"
      >
        <I.ArrowLeft size={18} strokeWidth={2.2} />
      </button>

      <div className="w-px h-6 bg-border mx-1" />

      <div className="flex items-center bg-surface-2 rounded-pill p-0.5 relative">
        <button 
          onClick={() => setActiveView('sop')}
          className={cn('relative px-4 h-8 rounded-pill text-[12.5px] font-semibold transition-colors', activeView==='sop' ? 'text-text' : 'text-text-2')}
        >
          {activeView==='sop' && <motion.span layoutId="view-bg" className="absolute inset-0 bg-white rounded-pill shadow-sm" />}
          <span className="relative inline-flex items-center gap-1.5">
            <I.FileText size={14} /> SOP View
          </span>
        </button>
        <button 
          onClick={() => setActiveView('video')}
          className={cn('relative px-4 h-8 rounded-pill text-[12.5px] font-semibold transition-colors', activeView==='video' ? 'text-text' : 'text-text-2')}
        >
          {activeView==='video' && <motion.span layoutId="view-bg" className="absolute inset-0 bg-white rounded-pill shadow-sm" />}
          <span className="relative inline-flex items-center gap-1.5">
            <I.Play size={14} /> Video Preview
          </span>
        </button>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex -space-x-1.5 mr-2">
          <Avatar name="Kartik Upadhyay" size={24} />
          <div className="w-6 h-6 rounded-full border-2 border-white bg-surface-2 flex items-center justify-center text-[10px] font-bold text-text-3">+2</div>
        </div>
        <Button variant="ghost" size="sm" icon={I.History}>Revisions</Button>
        <Button variant="ghost" size="sm" icon={I.Settings}>Settings</Button>
        <Button variant="primary" size="sm" icon={I.Share2}>Publish</Button>
      </div>
    </header>
  );
};

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

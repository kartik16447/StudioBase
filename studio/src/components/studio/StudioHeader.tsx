import React from 'react';
import { motion } from 'framer-motion';
import { cn, Button, Avatar } from '../ui';
import { NotificationBell } from '../ui/NotificationBell';
import { I } from '../icons';

export interface StudioHeaderProps {
  activeView: 'sop' | 'video' | 'demo';
  setActiveView: (view: 'sop' | 'video' | 'demo') => void;
  renderMode: 'hybrid' | 'slideshow';
  setRenderMode: (mode: 'hybrid' | 'slideshow') => void;
  onNavigateHome: () => void;
  onShareClick?: () => void;
  onSandboxExport?: () => void;
  onOpenInDocs?: () => void;
  isOpeningInDocs?: boolean;
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  activeView,
  setActiveView,
  renderMode,
  setRenderMode,
  onNavigateHome,
  onShareClick,
  onSandboxExport,
  onOpenInDocs,
  isOpeningInDocs,
}) => {
  return (
    <header className="h-14 bg-surface border-b border-border flex items-center px-4 gap-3 z-40 relative min-w-0">
      {/* Back to Library */}
      <button
        onClick={onNavigateHome}
        className="px-2.5 h-9 rounded-pill hover:bg-surface-2 inline-flex items-center gap-2 transition-colors text-text-2 hover:text-text font-medium text-[13px] shrink-0"
      >
        <I.Home size={16} strokeWidth={2.2} />
        <span className="hidden sm:inline">Library</span>
      </button>

      <div className="w-px h-6 bg-border shrink-0" />

      {/* View switcher */}
      <div className="flex items-center bg-surface-2 rounded-pill p-0.5 relative shrink-0">
        {([
          { id: 'sop', icon: I.FileText, label: 'SOP', fullLabel: 'SOP View' },
          { id: 'video', icon: I.Play, label: 'Video', fullLabel: 'Video Preview' },
          { id: 'demo', icon: I.Presentation, label: 'Demo', fullLabel: 'Demo' },
        ] as const).map(({ id, icon: Icon, label, fullLabel }) => (
          <button
            key={id}
            onClick={() => setActiveView(id)}
            className={cn(
              'relative px-3 h-8 rounded-pill text-[12.5px] font-semibold transition-colors',
              activeView === id ? 'text-text' : 'text-text-2',
            )}
          >
            {activeView === id && (
              <motion.span layoutId="view-bg" className="absolute inset-0 bg-white rounded-pill shadow-sm" />
            )}
            <span className="relative inline-flex items-center gap-1.5">
              <Icon size={14} />
              <span className="hidden md:inline">{fullLabel}</span>
              <span className="md:hidden">{label}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Render mode — only in video view */}
      {activeView === 'video' && (
        <>
          <div className="w-px h-6 bg-border shrink-0" />
          <div className="flex items-center bg-surface-2 rounded-pill p-0.5 relative shrink-0">
            {([
              { id: 'hybrid', icon: I.Video, label: 'Video' },
              { id: 'slideshow', icon: I.Layers, label: 'Slides' },
            ] as const).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setRenderMode(id)}
                className={cn(
                  'relative px-3 h-8 rounded-pill text-[11px] font-bold uppercase tracking-wider transition-colors',
                  renderMode === id ? 'text-text' : 'text-text-2',
                )}
              >
                {renderMode === id && (
                  <motion.span layoutId="mode-bg" className="absolute inset-0 bg-white rounded-pill shadow-sm" />
                )}
                <span className="relative inline-flex items-center gap-1.5">
                  <Icon size={12} />
                  <span className="hidden sm:inline">{label}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Right section */}
      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        {/* Collaborator avatars */}
        <div className="flex -space-x-1.5 mr-1 hidden sm:flex">
          <Avatar name="Kartik Upadhyay" size={24} />
          <div className="w-6 h-6 rounded-full border-2 border-white bg-surface-2 flex items-center justify-center text-[10px] font-bold text-text-3">+2</div>
        </div>

        {/* Revisions — icon-only on md and below */}
        <button className="h-8 px-2.5 rounded-pill inline-flex items-center gap-1.5 border border-border text-text hover:bg-surface-2 transition-colors text-[13px] font-medium">
          <I.History size={15} />
          <span className="hidden lg:inline">Revisions</span>
        </button>

        {/* Settings — icon-only on md and below */}
        <button className="h-8 px-2.5 rounded-pill inline-flex items-center gap-1.5 border border-border text-text hover:bg-surface-2 transition-colors text-[13px] font-medium">
          <I.Settings size={15} />
          <span className="hidden lg:inline">Settings</span>
        </button>

        <NotificationBell />

        {activeView === 'sop' && onOpenInDocs && (
          <button
            onClick={onOpenInDocs}
            disabled={isOpeningInDocs}
            className="h-8 px-2.5 rounded-pill inline-flex items-center gap-1.5 border border-border text-text hover:bg-surface-2 transition-colors text-[13px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            title="Export this SOP as a Docs page"
          >
            {isOpeningInDocs ? (
              <I.Loader size={14} className="animate-spin" />
            ) : (
              <I.FileText size={14} />
            )}
            <span className="hidden lg:inline">{isOpeningInDocs ? 'Creating…' : 'Open in Docs'}</span>
          </button>
        )}

        {onSandboxExport && (
          <Button variant="ghost" size="sm" icon={I.Download} onClick={onSandboxExport}>
            <span className="hidden sm:inline text-primary">Sandbox Export</span>
          </Button>
        )}

        <Button variant="primary" size="sm" icon={I.Share2} onClick={onShareClick}>
          <span className="hidden sm:inline">Share</span>
        </Button>
      </div>
    </header>
  );
};

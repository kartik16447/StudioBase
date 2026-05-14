import React from 'react';
import { motion } from 'framer-motion';
import { cn, Button, Avatar } from '../ui';
import { I } from '../icons';

export interface StudioHeaderProps {
  activeView: 'sop' | 'video' | 'demo';
  setActiveView: (view: 'sop' | 'video' | 'demo') => void;
  renderMode: 'hybrid' | 'slideshow';
  setRenderMode: (mode: 'hybrid' | 'slideshow') => void;
  onNavigateHome: () => void;
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  activeView,
  setActiveView,
  renderMode,
  setRenderMode,
  onNavigateHome
}) => {
  return (
    <header className="h-14 bg-surface border-b border-border flex items-center px-4 gap-4 z-40 relative">
      <button 
        onClick={onNavigateHome}
        className="px-3 h-9 rounded-pill hover:bg-surface-2 inline-flex items-center gap-2 transition-colors text-text-2 hover:text-text font-medium text-[13px]"
      >
        <I.Home size={16} strokeWidth={2.2} />
        Library
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
        <button
          onClick={() => setActiveView('demo')}
          className={cn('relative px-4 h-8 rounded-pill text-[12.5px] font-semibold transition-colors', activeView==='demo' ? 'text-text' : 'text-text-2')}
        >
          {activeView==='demo' && <motion.span layoutId="view-bg" className="absolute inset-0 bg-white rounded-pill shadow-sm" />}
          <span className="relative inline-flex items-center gap-1.5">
            <I.Presentation size={14} /> Demo
          </span>
        </button>
      </div>
      
      {activeView === 'video' && (
        <>
          <div className="w-px h-6 bg-border mx-1" />
          <div className="flex items-center bg-surface-2 rounded-pill p-0.5 relative">
            <button 
              onClick={() => setRenderMode('hybrid')}
              className={cn('relative px-3 h-8 rounded-pill text-[11px] font-bold uppercase tracking-wider transition-colors', renderMode==='hybrid' ? 'text-text' : 'text-text-2')}
            >
              {renderMode==='hybrid' && <motion.span layoutId="mode-bg" className="absolute inset-0 bg-white rounded-pill shadow-sm" />}
              <span className="relative inline-flex items-center gap-1.5">
                <I.Video size={12} /> Video
              </span>
            </button>
            <button 
              onClick={() => setRenderMode('slideshow')}
              className={cn('relative px-3 h-8 rounded-pill text-[11px] font-bold uppercase tracking-wider transition-colors', renderMode==='slideshow' ? 'text-text' : 'text-text-2')}
            >
              {renderMode==='slideshow' && <motion.span layoutId="mode-bg" className="absolute inset-0 bg-white rounded-pill shadow-sm" />}
              <span className="relative inline-flex items-center gap-1.5">
                <I.Layers size={12} /> Slides
              </span>
            </button>
          </div>
        </>
      )}

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

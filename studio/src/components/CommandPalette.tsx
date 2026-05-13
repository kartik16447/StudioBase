import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStudioStore } from '../store/useStudioStore';
import { I } from '../components/icons';
import { Kbd } from '../components/ui';

export const CommandPalette: React.FC = () => {
  const commandOpen = useStudioStore(state => state.commandOpen);
  const setCommandOpen = useStudioStore(state => state.setCommandOpen);
  const navigate = useStudioStore(state => state.navigate);
  const setActiveTab = useStudioStore(state => state.setActiveTab);
  const [q, setQ] = useState('');

  const items = [
    { id: 'home',     label: 'Go to Home',     icon: I.Home,     run: () => navigate('home') },
    { id: 'studio',   label: 'Open last session in Studio', icon: I.Wand2, run: () => navigate('studio') },
    { id: 'brand',    label: 'Open Brand Kit', icon: I.Palette,  run: () => navigate('brand') },
    { id: 'share',    label: 'Open public Share view', icon: I.Share2, run: () => navigate('share') },
    { id: 'capture',  label: 'Capture new session…', icon: I.Plus, run: () => alert('Open the StudioBase browser extension to capture a session.') },
    { id: 'tab-script',   label: 'Studio: Script tab',   icon: I.FileText, run: () => { navigate('studio'); setActiveTab('script'); } },
    { id: 'tab-brand',    label: 'Studio: Brand tab',    icon: I.Palette,  run: () => { navigate('studio'); setActiveTab('brand'); } },
    { id: 'tab-chapters', label: 'Studio: Chapters tab', icon: I.Bookmark, run: () => { navigate('studio'); setActiveTab('chapters'); } },
  ].filter(it => !q || it.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <AnimatePresence>
      {commandOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-sm flex items-start justify-center pt-32"
          onClick={() => setCommandOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-[560px] max-w-[92vw] glass rounded-card overflow-hidden shadow-card-lifted"
          >
            <div className="flex items-center gap-3 px-4 h-14 border-b border-border">
              <I.Search size={18} className="text-text-3" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Type a command, page, or session…"
                className="flex-1 bg-transparent outline-none text-[14.5px] placeholder:text-text-3 text-text"
              />
              <Kbd>esc</Kbd>
            </div>
            <div className="max-h-80 scroll-y py-2">
              {items.map((it) => (
                <button
                  key={it.id}
                  onClick={() => { it.run(); setCommandOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 h-11 text-left text-[13.5px] text-text hover:bg-primary-light hover:text-primary transition-colors group"
                >
                  <it.icon size={16} className="text-text-2 group-hover:text-primary" />
                  <span className="flex-1">{it.label}</span>
                  <I.ChevronRight size={14} className="text-text-3 group-hover:text-primary" />
                </button>
              ))}
              {items.length === 0 && (
                <div className="text-center py-10 text-text-3 text-sm">No matches for "{q}"</div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const KeyboardHintPill: React.FC = () => {
  const setCommandOpen = useStudioStore(state => state.setCommandOpen);
  return (
    <button
      onClick={() => setCommandOpen(true)}
      className="fixed bottom-6 right-6 z-30 glass rounded-pill h-10 px-3 inline-flex items-center gap-2 text-[12px] text-text-2 hover:text-text shadow-card"
    >
      <I.Command size={14} /> Quick actions <Kbd>⌘K</Kbd>
    </button>
  );
};

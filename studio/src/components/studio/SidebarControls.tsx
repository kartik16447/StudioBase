import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../ui';
import { I } from '../icons';
import { RenderConstants } from '../../modules/render-engine/RenderConstants';

export interface TabConfig {
  id: string;
  label: string;
  icon: any;
  component: React.FC;
}

export interface SidebarControlsProps {
  isPanelOpen: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  tabs: TabConfig[];
}

export const SidebarControls: React.FC<SidebarControlsProps> = ({
  isPanelOpen,
  activeTab,
  setActiveTab,
  tabs
}) => {
  const activeTabItem = tabs.find(t => t.id === activeTab) || tabs[0];

  return (
    <AnimatePresence initial={false}>
      {isPanelOpen && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: RenderConstants.PANEL_WIDTH, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={RenderConstants.PANEL_SPRING}
          className="shrink-0 border-r border-border bg-surface flex flex-col overflow-hidden"
        >
          <div className="px-3 pt-2 border-b border-border overflow-x-auto">
            <div className="flex items-center gap-0 min-w-max">
              {tabs.map(t => {
                const active = activeTab === t.id;
                const isLocked = ['voice', 'music', 'visuals', 'elements'].includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={cn(
                      'relative inline-flex items-center gap-1.5 h-11 px-3 text-[12.5px] font-medium transition-colors',
                      active ? 'text-text' : 'text-text-2 hover:text-text',
                      isLocked && 'opacity-60',
                    )}
                  >
                    <t.icon size={14} strokeWidth={1.9} />
                    {t.label}
                    {isLocked && <I.Lock size={10} className="text-text-3" />}
                    {active && (
                      <motion.span
                        layoutId="tab-indicator"
                        className="absolute -bottom-px left-2 right-2 h-[2px] rounded-full bg-primary"
                        transition={{ type:'spring', stiffness:420, damping:34 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden relative">
            <AnimatePresence mode="sync">
              <motion.div
                key={activeTabItem.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                className="absolute inset-0"
              >
                <activeTabItem.component />
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};

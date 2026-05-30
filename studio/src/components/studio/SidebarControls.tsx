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
  const visibleTabs = tabs.filter(t => !['music', 'visuals', 'elements'].includes(t.id));
  const activeTabItem = visibleTabs.find(t => t.id === activeTab) || visibleTabs[0] || tabs[0];

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
              {visibleTabs.map(t => {
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={cn(
                      'relative inline-flex items-center gap-1.5 h-11 px-3 text-[12.5px] font-medium transition-colors',
                      active ? 'text-text' : 'text-text-2 hover:text-text',
                    )}
                  >
                    <t.icon size={14} strokeWidth={1.9} />
                    {t.label}
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

          {/* Collapsible More (soon) Row */}
          <div className="border-t border-border bg-surface-2/20 shrink-0">
            <details className="group">
              <summary className="flex items-center justify-between px-4 h-10 text-[12.5px] font-semibold text-text-2 hover:text-text cursor-pointer select-none">
                <span className="flex items-center gap-2">
                  <I.Plus size={13} className="text-text-3 group-open:rotate-45 transition-transform duration-200" />
                  <span>More features</span>
                </span>
                <span className="text-[10px] bg-white/[0.06] border border-white/5 text-text-3 font-semibold px-1.5 py-0.5 rounded-full">Soon</span>
              </summary>
              <div className="px-4 pb-3.5 pt-1.5 flex flex-col gap-2.5 border-t border-border/5 bg-surface-2/40 text-[12px] text-text-3">
                <div className="flex items-center gap-2">
                  <I.Music2 size={13} className="text-text-3" />
                  <span>Music Tracks — generate AI background scores</span>
                </div>
                <div className="flex items-center gap-2">
                  <I.Image size={13} className="text-text-3" />
                  <span>Visual Overlays — inject media & custom slides</span>
                </div>
                <div className="flex items-center gap-2">
                  <I.Layers size={13} className="text-text-3" />
                  <span>Asset Library — upload reusable brand templates</span>
                </div>
              </div>
            </details>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};

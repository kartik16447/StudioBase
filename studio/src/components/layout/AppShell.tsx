import React from 'react';
import { motion } from 'framer-motion';
import { useStudioStore } from '../../store/useStudioStore';
import type { RouteName } from '../../store/useStudioStore';
import { I } from '../icons';
import { cn, Avatar, Kbd } from '../ui';
import type { LucideIcon } from 'lucide-react';

interface SidebarItemProps {
  id: RouteName;
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: string | number;
  shortcut?: string;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon: Icon, label, active, onClick, badge, shortcut }) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative w-full h-10 px-3 rounded-sm flex items-center gap-3 transition-all duration-150',
        active ? 'bg-sidebar-active text-primary' : 'text-text-3 hover:bg-sidebar-hover hover:text-white',
      )}
    >
      <Icon size={18} strokeWidth={active ? 2.2 : 1.9} />
      <span className={cn('text-[13.5px] font-medium transition-colors', active ? 'text-white' : '')}>{label}</span>
      {badge && (
        <span className="ml-auto text-[10px] font-bold px-1.5 h-4.5 min-w-[18px] inline-flex items-center justify-center rounded-full bg-primary text-white">
          {badge}
        </span>
      )}
      {!badge && shortcut && (
        <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
          <Kbd className="bg-white/10 border-white/5 text-white/40">{shortcut}</Kbd>
        </span>
      )}
      {active && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-primary"
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}
    </button>
  );
};

export const Sidebar: React.FC = () => {
  const { route, navigate } = useStudioStore();
  const active = route.name;

  return (
    <aside className="w-[240px] shrink-0 bg-sidebar border-r border-white/5 flex flex-col z-50">
      <div className="h-14 px-5 flex items-center gap-3 border-b border-white/5">
        <div className="w-8 h-8 rounded-[10px] bg-primary text-white flex items-center justify-center font-bold text-[16px] shadow-lg shadow-primary/20">S</div>
        <span className="text-[15px] font-bold text-white tracking-tight">StudioBase</span>
      </div>

      <div className="flex-1 scroll-y-dark px-3 py-4 space-y-6">
        <section>
          <div className="px-3 mb-2 text-[10.5px] font-bold text-white/30 uppercase tracking-[0.16em]">Workspace</div>
          <div className="space-y-0.5">
            <SidebarItem id="home" icon={I.Home} label="Library" active={active === 'home'} onClick={() => navigate('home')} shortcut="G H" />
            <SidebarItem id="recent" icon={I.History} label="Recent" active={active === 'recent'} onClick={() => navigate('home')} />
            <SidebarItem id="shared" icon={I.Users} label="Shared with me" active={active === 'shared'} onClick={() => navigate('home')} />
          </div>
        </section>

        <section>
          <div className="px-3 mb-2 text-[10.5px] font-bold text-white/30 uppercase tracking-[0.16em]">Editor</div>
          <div className="space-y-0.5">
            <SidebarItem id="studio" icon={I.Wand2} label="Smart Studio" active={active === 'studio'} onClick={() => navigate('studio')} shortcut="G S" />
            <SidebarItem id="templates" icon={I.Layers} label="Templates" active={active === 'templates'} onClick={() => navigate('templates')} />
            <SidebarItem id="brand" icon={I.Palette} label="Brand Kit" active={active === 'brand'} onClick={() => navigate('brand')} shortcut="G B" />
          </div>
        </section>

        <section>
          <div className="px-3 mb-2 text-[10.5px] font-bold text-white/30 uppercase tracking-[0.16em]">Resources</div>
          <div className="space-y-0.5">
            <SidebarItem id="knowledge" icon={I.Bookmark} label="Knowledge Base" active={active === 'knowledge'} onClick={() => navigate('home')} />
            <SidebarItem id="team" icon={I.User} label="Team Settings" active={active === 'team'} onClick={() => navigate('home')} />
          </div>
        </section>
      </div>

      <div className="mt-auto p-4 border-t border-white/5 bg-sidebar-2">
        <div className="flex items-center gap-3">
          <Avatar name="Kartik Upadhyay" size={32} />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-white truncate">Kartik Upadhyay</div>
            <div className="text-[11px] text-white/40 truncate">Free Plan · 12/50 mins</div>
          </div>
          <button className="ml-auto text-white/40 hover:text-white transition-colors">
            <I.Settings size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
};

export const AppShell: React.FC<{ children: React.ReactNode, hideSidebar?: boolean }> = ({ children, hideSidebar = false }) => {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg">
      {!hideSidebar && <Sidebar />}
      <main className="flex-1 min-w-0 flex flex-col relative overflow-hidden">
        {children}
      </main>
    </div>
  );
};

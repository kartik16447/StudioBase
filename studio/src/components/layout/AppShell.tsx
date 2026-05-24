import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useStudioStore } from '../../store/useStudioStore';
import type { RouteName } from '../../store/useStudioStore';
import { I } from '../icons';
import { cn, Avatar, Kbd, Tooltip } from '../ui';
import type { LucideIcon } from 'lucide-react';
import { sessionManager } from '../../lib/auth/sessionManager';
import { usePlan, PLAN_FEATURES } from '../../hooks/usePlan';

const SIDEBAR_EXPANDED = 240;
const SIDEBAR_COLLAPSED = 56;

interface SidebarItemProps {
  id: RouteName;
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: string | number;
  shortcut?: string;
  collapsed: boolean;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon: Icon, label, active, onClick, badge, shortcut, collapsed }) => {
  const btn = (
    <button
      onClick={onClick}
      className={cn(
        'group relative w-full rounded-sm flex items-center transition-all duration-150',
        collapsed ? 'h-10 w-10 mx-auto justify-center px-0' : 'h-10 px-3 gap-3',
        active ? 'bg-sidebar-active text-primary' : 'text-text-3 hover:bg-sidebar-hover hover:text-white',
      )}
    >
      <Icon size={18} strokeWidth={active ? 2.2 : 1.9} className="shrink-0" />
      {!collapsed && (
        <>
          <span className={cn('text-[13.5px] font-medium transition-colors truncate', active && 'text-white')}>{label}</span>
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
        </>
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

  if (collapsed) {
    return <Tooltip content={label} side="right">{btn}</Tooltip>;
  }
  return btn;
};

export const Sidebar: React.FC = () => {
  const route = useStudioStore(state => state.route);
  const navigate = useStudioStore(state => state.navigate);
  const active = route.name;
  const plan = usePlan();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sb_sidebar_collapsed') === 'true'; } catch { return false; }
  });

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem('sb_sidebar_collapsed', String(next)); } catch {}
  };

  return (
    <motion.aside
      animate={{ width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED }}
      transition={{ type: 'spring', stiffness: 380, damping: 36, mass: 0.8 }}
      className="shrink-0 bg-sidebar border-r border-white/5 flex flex-col z-50 overflow-hidden"
    >
      {/* Header — expanded: [S] StudioBase [←] | collapsed: [→] on top, [S] below */}
      {collapsed ? (
        <div className="flex flex-col items-center border-b border-white/5 shrink-0 py-2 gap-2">
          {/* Toggle at top */}
          <button
            onClick={toggle}
            title="Expand sidebar"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <I.ChevronRight size={16} strokeWidth={2} />
          </button>
          {/* Logo below toggle */}
          <div className="w-8 h-8 rounded-[10px] bg-primary text-white flex items-center justify-center font-bold text-[16px] shadow-lg shadow-primary/20">
            S
          </div>
        </div>
      ) : (
        <div className="h-14 flex items-center border-b border-white/5 shrink-0 px-5 gap-3">
          <div className="w-8 h-8 rounded-[10px] bg-primary text-white flex items-center justify-center font-bold text-[16px] shadow-lg shadow-primary/20 shrink-0">S</div>
          <span className="text-[15px] font-bold text-white tracking-tight flex-1 truncate">StudioBase</span>
          <button
            onClick={toggle}
            title="Collapse sidebar"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0"
          >
            <I.ChevronLeft size={15} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Nav */}
      <div className={cn('flex-1 scroll-y-dark py-4 space-y-6 overflow-y-auto overflow-x-hidden', collapsed ? 'px-1' : 'px-3')}>
        <section>
          {!collapsed && <div className="px-3 mb-2 text-[10.5px] font-bold text-white/30 uppercase tracking-[0.16em]">Workspace</div>}
          <div className={cn('space-y-0.5', collapsed && 'flex flex-col items-center')}>
            <SidebarItem collapsed={collapsed} id="home" icon={I.Home} label="Library" active={active === 'home'} onClick={() => navigate('home')} shortcut="G H" />
            <SidebarItem collapsed={collapsed} id="recent" icon={I.History} label="Recent" active={active === 'recent'} onClick={() => navigate('home')} />
            <SidebarItem collapsed={collapsed} id="shared" icon={I.Users} label="Shared with me" active={active === 'shared'} onClick={() => navigate('home')} />
          </div>
        </section>

        <section>
          {!collapsed && <div className="px-3 mb-2 text-[10.5px] font-bold text-white/30 uppercase tracking-[0.16em]">Editor</div>}
          <div className={cn('space-y-0.5', collapsed && 'flex flex-col items-center')}>
            <SidebarItem collapsed={collapsed} id="studio" icon={I.Wand2} label="Smart Studio" active={active === 'studio'} onClick={() => navigate('studio')} shortcut="G S" />
            <SidebarItem collapsed={collapsed} id="templates" icon={I.Layers} label="Templates" active={active === 'templates'} onClick={() => navigate('templates')} />
            <SidebarItem collapsed={collapsed} id="docs" icon={I.BookOpen} label="Docs" active={active === 'docs'} onClick={() => navigate('docs')} shortcut="G D" />
            <SidebarItem collapsed={collapsed} id="brand" icon={I.Palette} label="Brand Kit" active={active === 'brand'} onClick={() => navigate('brand')} shortcut="G B" />
          </div>
        </section>

        <section>
          {!collapsed && <div className="px-3 mb-2 text-[10.5px] font-bold text-white/30 uppercase tracking-[0.16em]">Resources</div>}
          <div className={cn('space-y-0.5', collapsed && 'flex flex-col items-center')}>
            <SidebarItem collapsed={collapsed} id="knowledge" icon={I.Bookmark} label="Knowledge Base" active={active === 'knowledge'} onClick={() => navigate('home')} />
            <SidebarItem collapsed={collapsed} id="team" icon={I.Settings} label="Workspace Settings" active={active === 'team'} onClick={() => navigate('team')} />
            <SidebarItem collapsed={collapsed} id="analytics" icon={I.BarChart2} label="Analytics" active={active === 'analytics'} onClick={() => navigate('analytics')} />
            {/* Audit Logs — enterprise only */}
            {PLAN_FEATURES.auditLogs(plan) && (
              <SidebarItem collapsed={collapsed} id={'audit-logs' as any} icon={I.Shield} label="Audit Logs" active={active === ('audit-logs' as any)} onClick={() => navigate('audit-logs' as any)} />
            )}
            {import.meta.env.VITE_DEV_MODE === 'true' && (
              <SidebarItem collapsed={collapsed} id={'admin' as any} icon={I.Activity} label="Diagnostics" active={active === ('admin' as any)} onClick={() => navigate('admin' as any)} />
            )}
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="mt-auto border-t border-white/5 bg-sidebar-2">
        {/* Quick actions */}
        {collapsed ? (
          <Tooltip content="Quick actions (⌘K)" side="right">
            <button
              onClick={() => useStudioStore.getState().setCommandOpen(true)}
              className="w-full h-10 flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors border-b border-white/5"
            >
              <I.Command size={15} />
            </button>
          </Tooltip>
        ) : (
          <button
            onClick={() => useStudioStore.getState().setCommandOpen(true)}
            className="w-full px-4 py-2.5 flex items-center gap-2 text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors border-b border-white/5"
          >
            <I.Command size={13} />
            <span className="text-[12px] font-medium">Quick actions</span>
            <Kbd className="ml-auto bg-white/10 border-white/5 text-white/30 text-[10px]">⌘K</Kbd>
          </button>
        )}

        {/* Profile row */}
        <div className={cn('flex items-center gap-3', collapsed ? 'p-2 flex-col' : 'p-4')}>
          {collapsed ? (
            <>
              <Avatar name="Kartik Upadhyay" size={32} />
              <Tooltip content="Sign out" side="right">
                <button onClick={() => sessionManager.logout()} className="text-white/40 hover:text-red-400 transition-colors">
                  <I.LogOut size={14} />
                </button>
              </Tooltip>
            </>
          ) : (
            <>
              <Avatar name="Kartik Upadhyay" size={32} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-white truncate">Kartik Upadhyay</div>
                <div className="text-[11px] text-white/40 truncate">Free Plan · 12/50 mins</div>
              </div>
              <button title="Sign out" onClick={() => sessionManager.logout()} className="text-white/40 hover:text-red-400 transition-colors">
                <I.LogOut size={16} />
              </button>
            </>
          )}
        </div>

      </div>
    </motion.aside>
  );
};

export const AppShell: React.FC<{ children: React.ReactNode; hideSidebar?: boolean; hideChrome?: boolean }> = ({
  children,
  hideSidebar = false,
  hideChrome = false,
}) => {
  if (hideChrome) {
    return (
      <div className="flex h-screen w-screen overflow-hidden bg-[#0d0d12]">
        <main className="flex-1 min-w-0 flex flex-col relative overflow-hidden">
          {children}
        </main>
      </div>
    );
  }
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg">
      {!hideSidebar && <Sidebar />}
      <main className="flex-1 min-w-0 flex flex-col relative overflow-hidden">
        {children}
      </main>
    </div>
  );
};

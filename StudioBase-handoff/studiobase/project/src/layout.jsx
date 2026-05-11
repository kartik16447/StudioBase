// Layout: Sidebar, TopBar, AppShell, FloatingToolbar.
// Also exports STUDIO_TABS — the plugin slot registry from the spec.

const { motion: l_motion, AnimatePresence: LAP } = window.Motion;
const { useState: lUseState, useRef: lUseRef } = React;

// ─── Plugin slot registry (the heart of the architecture) ──────────────
const CURRENT_PHASE = 2;

const STUDIO_TABS = [
  { id: 'script',   label: 'Script',   icon: I.FileText,  phase: 2, component: ScriptPanel },
  { id: 'brand',    label: 'Brand',    icon: I.Palette,   phase: 2, component: BrandPanel },
  { id: 'chapters', label: 'Chapters', icon: I.Bookmark,  phase: 2, component: ChaptersPanel },
  { id: 'ai-voice', label: 'AI Voice', icon: I.Mic,       phase: 3, component: AIVoicePanel },
  { id: 'music',    label: 'Music',    icon: I.Music2,    phase: 3, component: MusicPanel },
  { id: 'visuals',  label: 'Visuals',  icon: I.Image,     phase: 4, component: VisualsPanel },
  { id: 'zooms',    label: 'Zooms',    icon: I.ZoomIn,    phase: 4, component: ZoomsPanel },
  { id: 'elements', label: 'Elements', icon: I.Layers,    phase: 4, component: ElementsPanel },
];
const isLocked = (tab) => tab.phase > CURRENT_PHASE;

// ─── Sidebar (dark, 260px) ─────────────────────────────────────────────
function Sidebar() {
  const { state, navigate } = useStudioStore();
  const route = state.route.name;

  const NavItem = ({ icon: Icon, label, id, locked, badge }) => {
    const active = route === id;
    return (
      <button
        onClick={() => !locked && navigate(id)}
        className={cn(
          'group relative w-full flex items-center gap-3 h-10 px-3 rounded-sm text-[13.5px] font-medium transition-all',
          active
            ? 'text-white bg-sidebar-active'
            : 'text-white/65 hover:text-white hover:bg-sidebar-hover',
          locked && 'opacity-60 cursor-not-allowed',
        )}
      >
        {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-primary" />}
        <Icon size={17} strokeWidth={1.9} />
        <span className="flex-1 text-left">{label}</span>
        {locked && <I.Lock size={12} className="opacity-60" />}
        {badge && <Badge tone="primary" size="sm">{badge}</Badge>}
      </button>
    );
  };

  return (
    <aside className="w-[260px] shrink-0 h-screen bg-sidebar flex flex-col text-white">
      {/* Wordmark */}
      <div className="px-5 pt-6 pb-7 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-primary to-[#8B5CF6] flex items-center justify-center font-black text-white shadow-[0_4px_14px_rgba(94,92,230,0.45)]">
          <I.Wand2 size={16} strokeWidth={2.2} />
        </div>
        <div>
          <div className="text-[15px] font-semibold text-white tracking-tight">StudioBase</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 leading-none">Smart Studio</div>
        </div>
      </div>

      {/* Primary nav */}
      <nav className="px-3 space-y-0.5">
        <NavItem icon={I.Home} label="Home" id="home" />
        <NavItem icon={I.Library} label="Library" id="library" />
        <NavItem icon={I.Share2} label="Shared with me" id="shared" />
        <NavItem icon={I.Clock} label="Recent" id="recent" />
      </nav>

      {/* Workspace section */}
      <div className="mt-7 px-5 mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Workspace</span>
      </div>
      <nav className="px-3 space-y-0.5">
        <NavItem icon={I.Palette} label="Brand Kit" id="brand" />
        <NavItem icon={I.Folder} label="Templates" id="templates" />
        <NavItem icon={I.Sparkles} label="Knowledge" id="knowledge" locked />
        <NavItem icon={I.Users} label="Team" id="team" locked />
      </nav>

      {/* Storage / upgrade */}
      <div className="mt-6 mx-3 px-3 py-3 rounded-sm bg-white/[0.04] border border-white/[0.06]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">Storage</span>
          <span className="text-[11px] text-white/45 tabular-nums">2.1 / 5 GB</span>
        </div>
        <div className="h-1 rounded-full bg-white/[0.08] overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-primary to-[#8B5CF6]" style={{ width: '42%' }} />
        </div>
        <button className="mt-3 w-full h-7 rounded-pill bg-white text-text text-[11.5px] font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5">
          <I.Zap size={11} strokeWidth={2.4} /> Upgrade to Pro
        </button>
      </div>

      <div className="flex-1" />

      {/* User chip */}
      <div className="px-3 pb-4">
        <div className="flex items-center gap-2.5 p-2 rounded-sm hover:bg-sidebar-hover cursor-pointer">
          <Avatar name="Kartik Upadhyay" size={32} hue={244} />
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold text-white truncate leading-tight">Kartik Upadhyay</div>
            <div className="text-[11px] text-white/40 truncate leading-tight">kartik@studiobase.app</div>
          </div>
          <I.Settings size={14} className="text-white/40" />
        </div>
      </div>
    </aside>
  );
}

// ─── TopBar — used inside StudioPage ───────────────────────────────────
function StudioTopBar() {
  const { state, navigate, setActiveView } = useStudioStore();
  const session = state.session;
  const [titleEditing, setTitleEditing] = lUseState(false);
  const [title, setTitle] = lUseState(session?.aiOutputs?.title || '');
  return (
    <header className="h-14 shrink-0 px-4 flex items-center gap-3 bg-surface border-b border-border">
      {/* Back */}
      <IconButton icon={I.ArrowLeft} label="Back to library" onClick={() => navigate('home')} />
      <span className="w-px h-5 bg-border" />

      {/* View toggle pill */}
      <div className="flex items-center bg-surface-2 rounded-pill p-0.5 relative">
        {['sop','video'].map(v => {
          const active = state.activeView === v;
          const locked = v === 'video';
          return (
            <button
              key={v}
              onClick={() => !locked && setActiveView(v)}
              className={cn(
                'relative px-3.5 h-7 rounded-pill text-[12.5px] font-semibold transition-colors inline-flex items-center gap-1.5',
                active ? 'text-text' : 'text-text-2',
                locked && 'opacity-50 cursor-not-allowed',
              )}
              title={locked ? 'Video mode unlocks in Phase 3' : undefined}
            >
              {active && (
                <l_motion.span
                  layoutId="view-pill"
                  className="absolute inset-0 bg-white rounded-pill shadow-sm"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative inline-flex items-center gap-1.5">
                {v === 'sop' ? <I.FileText size={13} /> : <I.Play size={13} />}
                {v === 'sop' ? 'SOP' : 'Video'}
                {locked && <I.Lock size={10} />}
              </span>
            </button>
          );
        })}
      </div>

      {/* Centered title */}
      <div className="flex-1 flex justify-center min-w-0">
        <div className="max-w-xl w-full flex items-center justify-center">
          {titleEditing ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setTitleEditing(false)}
              onKeyDown={(e) => { if (e.key === 'Enter') setTitleEditing(false); }}
              className="w-full text-center text-[14px] font-semibold bg-surface-2 px-3 h-8 rounded-sm outline-none focus:bg-white focus:ring-2 focus:ring-primary"
            />
          ) : (
            <button
              onClick={() => setTitleEditing(true)}
              className="text-[14px] font-semibold text-text px-3 h-8 rounded-sm hover:bg-surface-2 inline-flex items-center gap-1.5 transition-colors max-w-full"
            >
              <span className="truncate">{title}</span>
              <I.Edit2 size={12} className="text-text-3 shrink-0" />
            </button>
          )}
        </div>
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-1">
        <Tooltip content="Translate" side="bottom"><IconButton icon={I.Languages} label="Translate" /></Tooltip>
        <Tooltip content="Version history" side="bottom"><IconButton icon={I.History} label="History" /></Tooltip>
        <Tooltip content="Comments" side="bottom"><IconButton icon={I.Users} label="Comments" /></Tooltip>
        <Tooltip content="More" side="bottom"><IconButton icon={I.MoreHorizontal} label="More" /></Tooltip>
        <span className="w-px h-5 bg-border mx-1.5" />
        <Button variant="ghost" size="sm" icon={I.Download}>Export</Button>
        <Button variant="primary" size="sm" icon={I.Share2} onClick={() => navigate('share')}>Share</Button>
      </div>
    </header>
  );
}

// ─── FloatingToolbar — bottom-center, tools for SOP & canvas ──────────
function FloatingToolbar() {
  const { state, setActiveTool, toggleToolbar } = useStudioStore();
  const tools = [
    { id: 'cursor', icon: I.MousePointer, label: 'Cursor', key: 'V' },
    { id: 'spotlight', icon: I.Crosshair, label: 'Spotlight', key: 'S' },
    { id: 'highlight', icon: I.Highlighter, label: 'Highlight', key: 'B' },
    { id: 'text', icon: I.Type, label: 'Text', key: 'T' },
    { id: 'zoom', icon: I.ZoomIn, label: 'Zoom region', key: 'Z' },
  ];
  return (
    <LAP>
      {state.isToolbarVisible && (
        <l_motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
          className="fixed left-1/2 bottom-6 -translate-x-1/2 z-30"
        >
          <div className="glass rounded-pill flex items-center gap-1 p-1.5">
            {tools.map(t => {
              const active = state.activeTool === t.id;
              return (
                <Tooltip key={t.id} content={<span className="inline-flex items-center gap-1.5">{t.label} <Kbd dark>{t.key}</Kbd></span>} side="top">
                  <button
                    onClick={() => setActiveTool(t.id)}
                    className={cn(
                      'inline-flex items-center justify-center w-9 h-9 rounded-pill transition-all',
                      active ? 'bg-primary text-white shadow-[0_2px_10px_rgba(94,92,230,0.4)]' : 'text-text-2 hover:text-text hover:bg-surface-2',
                    )}
                  >
                    <t.icon size={17} strokeWidth={1.9} />
                  </button>
                </Tooltip>
              );
            })}
            <span className="w-px h-6 bg-border mx-1" />
            <Tooltip content={<span className="inline-flex items-center gap-1.5">Hide toolbar <Kbd dark>H</Kbd></span>} side="top">
              <button onClick={toggleToolbar} className="inline-flex items-center justify-center w-9 h-9 rounded-pill text-text-2 hover:bg-surface-2">
                <I.ChevronDown size={16} />
              </button>
            </Tooltip>
          </div>
        </l_motion.div>
      )}
      {!state.isToolbarVisible && (
        <l_motion.button
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          onClick={toggleToolbar}
          className="fixed left-1/2 bottom-6 -translate-x-1/2 z-30 glass rounded-pill h-10 px-4 text-[12.5px] font-medium text-text-2 inline-flex items-center gap-2"
        >
          <I.MousePointer size={14} /> Show tools <Kbd>H</Kbd>
        </l_motion.button>
      )}
    </LAP>
  );
}

// ─── AppShell — top-level wrapper that places sidebar + content ────────
function AppShell({ children, hideSidebar = false }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg">
      {!hideSidebar && <Sidebar />}
      <main className="flex-1 min-w-0 flex flex-col">
        {children}
      </main>
    </div>
  );
}

Object.assign(window, {
  STUDIO_TABS, isLocked, CURRENT_PHASE,
  Sidebar, StudioTopBar, FloatingToolbar, AppShell,
});

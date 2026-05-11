// Top-level app: routing state, keyboard shortcuts, command palette, mounts everything.

const { useEffect: appUseEffect, useState: appUseState } = React;
const { motion: app_motion, AnimatePresence: AppAP } = window.Motion;

function App() {
  return (
    <StoreProvider>
      <Bootstrap />
    </StoreProvider>
  );
}

function Bootstrap() {
  const { state, navigate, setSession, togglePanel, toggleToolbar, setActiveTab, setActiveTool, setCommandOpen } = useStudioStore();

  // Seed a session on first mount so Studio / SOP / Share pages render meaningful data
  appUseEffect(() => {
    if (!state.session) setSession(SAMPLE_SESSION);
  }, []);

  // ⌘\ — toggle left panel
  useKeyboardShortcut('cmd+\\', () => togglePanel(), []);
  // H — toggle floating toolbar
  useKeyboardShortcut('h', () => toggleToolbar(), []);
  // ⌘K — command palette
  useKeyboardShortcut('cmd+k', () => setCommandOpen(!state.commandOpen), [state.commandOpen]);
  // Esc — close palette
  useKeyboardShortcut('escape', () => setCommandOpen(false), []);
  // 1–8 — switch tabs by index (only when in studio)
  ['1','2','3','4','5','6','7','8'].forEach((k, i) => {
    useKeyboardShortcut(k, () => {
      if (state.route.name === 'studio') {
        const t = STUDIO_TABS[i];
        if (t) setActiveTab(t.id);
      }
    }, [state.route.name]);
  });
  // V / S / B / T / Z — tool keys
  useKeyboardShortcut('v', () => setActiveTool('cursor'), []);
  useKeyboardShortcut('s', () => setActiveTool('spotlight'), []);
  useKeyboardShortcut('b', () => setActiveTool('highlight'), []);
  useKeyboardShortcut('t', () => setActiveTool('text'), []);
  useKeyboardShortcut('z', () => setActiveTool('zoom'), []);

  // Route dispatch — keep `share` as a chromeless full-bleed view (no sidebar)
  const r = state.route.name;
  const isShare = r === 'share';

  return (
    <>
      <AppShell hideSidebar={isShare}>
        {renderRoute(r)}
      </AppShell>

      <CommandPalette />
      <KeyboardHintPill />
    </>
  );
}

function renderRoute(r) {
  if (r === 'studio') return <StudioPage />;
  if (r === 'brand' || r === 'templates') return <BrandKitPage />;
  if (r === 'share') return <SharePage />;
  return <HomePage />;
}

function KeyedPage({ children }) {
  return (
    <app_motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      style={{ display: 'contents' }}
    >
      <div style={{ display: 'contents' }}>{children}</div>
    </app_motion.div>
  );
}

// ─── Command palette ───────────────────────────────────────────────────
function CommandPalette() {
  const { state, navigate, setCommandOpen, setActiveTab } = useStudioStore();
  const [q, setQ] = appUseState('');

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
    <AppAP>
      {state.commandOpen && (
        <app_motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-start justify-center pt-32"
          onClick={() => setCommandOpen(false)}
        >
          <app_motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-[560px] max-w-[92vw] glass rounded-card overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 h-14 border-b border-border">
              <I.Search size={18} className="text-text-3" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Type a command, page, or session…"
                className="flex-1 bg-transparent outline-none text-[14.5px] placeholder:text-text-3"
              />
              <Kbd>esc</Kbd>
            </div>
            <div className="max-h-80 scroll-y py-2">
              {items.map((it, i) => (
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
          </app_motion.div>
        </app_motion.div>
      )}
    </AppAP>
  );
}

// ─── Tiny keyboard hint pill (bottom-right) ────────────────────────────
function KeyboardHintPill() {
  const { setCommandOpen } = useStudioStore();
  return (
    <button
      onClick={() => setCommandOpen(true)}
      className="fixed bottom-6 right-6 z-30 glass rounded-pill h-10 px-3 inline-flex items-center gap-2 text-[12px] text-text-2 hover:text-text"
    >
      <I.Command size={14} /> Quick actions <Kbd>⌘K</Kbd>
    </button>
  );
}

// ─── Mount ─────────────────────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

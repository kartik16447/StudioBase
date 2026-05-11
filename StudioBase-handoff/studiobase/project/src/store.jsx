// Zustand-flavored store using React Context + useReducer.
// Surface mirrors the spec exactly so the real Vite app can drop in zustand.

const { createContext, useContext, useReducer, useEffect, useCallback } = React;

const initialState = {
  route: { name: 'home', params: {} },     // home | studio | sop | share | brand
  session: null,                           // SessionEnvelope-shaped
  activeTab: 'script',
  isPanelOpen: true,
  activeView: 'sop',                       // 'sop' | 'video'
  activeTool: 'cursor',                    // cursor | spotlight | highlight | text | zoom
  isToolbarVisible: true,
  focusedStepId: null,
  commandOpen: false,
};

function reducer(state, action) {
  switch (action.type) {
    case 'NAVIGATE':         return { ...state, route: action.route };
    case 'SET_SESSION':      return { ...state, session: action.session };
    case 'SET_ACTIVE_TAB':   return { ...state, activeTab: action.id };
    case 'TOGGLE_PANEL':     return { ...state, isPanelOpen: !state.isPanelOpen };
    case 'SET_ACTIVE_VIEW':  return { ...state, activeView: action.view };
    case 'SET_ACTIVE_TOOL':  return { ...state, activeTool: action.tool };
    case 'TOGGLE_TOOLBAR':   return { ...state, isToolbarVisible: !state.isToolbarVisible };
    case 'SET_FOCUS_STEP':   return { ...state, focusedStepId: action.id };
    case 'SET_COMMAND_OPEN': return { ...state, commandOpen: action.open };
    default: return state;
  }
}

const StoreCtx = createContext(null);

function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const api = {
    state,
    navigate: (name, params = {}) => dispatch({ type: 'NAVIGATE', route: { name, params } }),
    setSession: (s) => dispatch({ type: 'SET_SESSION', session: s }),
    setActiveTab: (id) => dispatch({ type: 'SET_ACTIVE_TAB', id }),
    togglePanel: () => dispatch({ type: 'TOGGLE_PANEL' }),
    setActiveView: (v) => dispatch({ type: 'SET_ACTIVE_VIEW', view: v }),
    setActiveTool: (t) => dispatch({ type: 'SET_ACTIVE_TOOL', tool: t }),
    toggleToolbar: () => dispatch({ type: 'TOGGLE_TOOLBAR' }),
    setFocusStep: (id) => dispatch({ type: 'SET_FOCUS_STEP', id }),
    setCommandOpen: (open) => dispatch({ type: 'SET_COMMAND_OPEN', open }),
  };

  return <StoreCtx.Provider value={api}>{children}</StoreCtx.Provider>;
}

function useStudioStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStudioStore must be used inside StoreProvider');
  return ctx;
}

// Keyboard shortcut hook — meta-equivalent across mac/windows
function useKeyboardShortcut(combo, handler, deps = []) {
  useEffect(() => {
    const onKey = (e) => {
      const parts = combo.toLowerCase().split('+').map(p => p.trim());
      const needsMeta = parts.includes('cmd') || parts.includes('meta');
      const needsShift = parts.includes('shift');
      const key = parts[parts.length - 1];
      const metaOK = needsMeta ? (e.metaKey || e.ctrlKey) : !(e.metaKey || e.ctrlKey);
      const shiftOK = needsShift ? e.shiftKey : true;
      const target = e.target;
      const inField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (inField && !needsMeta) return;
      if (e.key.toLowerCase() === key && metaOK && shiftOK) {
        e.preventDefault();
        handler(e);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line
  }, deps);
}

Object.assign(window, { StoreProvider, useStudioStore, useKeyboardShortcut });

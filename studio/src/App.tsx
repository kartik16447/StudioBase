import { useEffect, useState } from 'react';
import { useStudioStore } from './store/useStudioStore';
import { useKeyboardShortcut } from './hooks/useKeyboardShortcut';
import { useIsEmbed } from './hooks/useIsEmbed';
import { AppShell } from './components/layout/AppShell';
import { HomePage } from './pages/HomePage';
import { StudioPage } from './pages/StudioPage';
import { BrandKitPage } from './pages/BrandKitPage';
import { SharePage } from './pages/SharePage';
import { WorkspaceSettingsPage } from './pages/WorkspaceSettingsPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { AdminDiagnosticsPage } from './pages/AdminDiagnosticsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { LoginPage } from './pages/LoginPage';
import { CommandPalette } from './components/CommandPalette';
import { GlobalToastContainer } from './components/GlobalToast';
import { sessionManager } from './lib/auth/sessionManager';

function App() {
  const { isEmbed } = useIsEmbed();

  // If the user already has a valid JWT, show the app immediately (no flash).
  // If they need a token exchange (missing or stale token), show a loading screen
  // until syncRouteFromUrl completes — prevents the login page flashing in then out.
  const [authed, setAuthed] = useState(sessionManager.isAuthenticated());
  const [initializing, setInitializing] = useState(!sessionManager.isAuthenticated() && !isEmbed);
  const route = useStudioStore(state => state.route);
  const navigate = useStudioStore(state => state.navigate);
  const togglePanel = useStudioStore(state => state.togglePanel);
  const setActiveTab = useStudioStore(state => state.setActiveTab);
  const commandOpen = useStudioStore(state => state.commandOpen);
  const setCommandOpen = useStudioStore(state => state.setCommandOpen);

  // Restore last route and sync credentials from URL
  useEffect(() => {
    const syncRouteFromUrl = async () => {
      const params = new URLSearchParams(window.location.search);

      // Exchange Google token from URL if present, or fall back to extension-provided token.
      // The extension stores { token, ts } in sb_ext_token. We skip exchange if the token
      // is older than 55 minutes — Google access tokens expire in 60 min, so exchanging a
      // stale one always returns 401 and creates a reload loop.
      const urlToken = params.get('token');
      let extToken: string | null = null;
      if (!urlToken && !sessionManager.isAuthenticated()) {
        try {
          const raw = localStorage.getItem('sb_ext_token');
          if (raw) {
            const parsed = JSON.parse(raw);
            const AGE_LIMIT_MS = 55 * 60 * 1000;
            if (parsed.ts && Date.now() - parsed.ts < AGE_LIMIT_MS) {
              extToken = parsed.token;
            } else {
              // Token is stale — clear it so the retry loop stops
              localStorage.removeItem('sb_ext_token');
            }
          }
        } catch {
          localStorage.removeItem('sb_ext_token');
        }
      }

      const token = urlToken || extToken;
      if (token) {
        try {
          await sessionManager.loginWithGoogle(token);
          const cleanParams = new URLSearchParams(window.location.search);
          cleanParams.delete('token');
          const searchStr = cleanParams.toString();
          window.history.replaceState({}, '', window.location.pathname + (searchStr ? '?' + searchStr : ''));
          localStorage.removeItem('sb_ext_token');
        } catch (err) {
          console.error('❌ [App] Auth exchange failed:', err);
          // Clear the token on failure so we don't keep retrying a dead token
          localStorage.removeItem('sb_ext_token');
        }
      }

      if (sessionManager.isAuthenticated()) {
        await sessionManager.syncWorkspaces();
      }

      const workspaceId = params.get('workspaceId') || sessionManager.getWorkspaceId();
      if (workspaceId) sessionManager.setWorkspaceId(workspaceId);

      // Deep-link to a specific session
      let sessionId = params.get('session');
      if (!sessionId && window.location.pathname.startsWith('/sessions/')) {
        sessionId = window.location.pathname.split('/sessions/')[1]?.split('/')[0];
      }
      if (sessionId) {
        navigate('studio', { sessionId, workspaceId: sessionManager.getWorkspaceId() });
        return;
      }

      // Restore last visited route instead of always landing on home
      const lastRoute = localStorage.getItem('sb_last_route') as any;
      const validRoutes = ['home', 'brand', 'templates', 'team', 'audit-logs', 'admin', 'analytics'];
      if (lastRoute && validRoutes.includes(lastRoute) && route.name !== lastRoute) {
        navigate(lastRoute);
      }
    };

    // Re-check auth after the async route/token sync completes, then clear the init gate.
    syncRouteFromUrl().then(() => {
      setAuthed(sessionManager.isAuthenticated());
      setInitializing(false);
    });
    window.addEventListener('popstate', syncRouteFromUrl);

    const onLogin = () => setAuthed(sessionManager.isAuthenticated());
    window.addEventListener('sb:login', onLogin);

    // The extension content script fetches a fresh token asynchronously via the
    // service worker. It may arrive after syncRouteFromUrl has already completed
    // (and found no token). Listen for SB_TOKEN_UPDATED and retry the exchange.
    const onExtToken = async (e: Event) => {
      if (sessionManager.isAuthenticated()) return; // already have a JWT, skip
      const freshToken = (e as CustomEvent).detail as string;
      if (!freshToken) return;
      try {
        await sessionManager.loginWithGoogle(freshToken);
        localStorage.removeItem('sb_ext_token');
        await sessionManager.syncWorkspaces();
        setAuthed(true);
        setInitializing(false);
      } catch {
        localStorage.removeItem('sb_ext_token');
        setInitializing(false);
      }
    };
    window.addEventListener('SB_TOKEN_UPDATED', onExtToken);

    return () => {
      window.removeEventListener('popstate', syncRouteFromUrl);
      window.removeEventListener('sb:login', onLogin);
      window.removeEventListener('SB_TOKEN_UPDATED', onExtToken);
    };
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcut('cmd+\\', () => togglePanel(), []);
  useKeyboardShortcut('cmd+k', () => setCommandOpen(!commandOpen), [commandOpen]);
  useKeyboardShortcut('escape', () => setCommandOpen(false), []);

  // Switch tabs by index
  ['1','2','3','4','5','6','7','8'].forEach((k, i) => {
    useKeyboardShortcut(k, () => {
      if (route.name === 'studio') {
        const tabs = ['script', 'brand', 'chapters', 'voice', 'music', 'visuals', 'zooms', 'elements'];
        const t = tabs[i];
        if (t) setActiveTab(t);
      }
    }, [route.name]);
  });


  // Persist route across reloads (skip studio — it needs a sessionId deep-link)
  useEffect(() => {
    if (route.name !== 'studio' && route.name !== 'share') {
      localStorage.setItem('sb_last_route', route.name);
    }
  }, [route.name]);

  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: ErrorEvent) => {
      console.error('[SB Runtime Error]', e);
      setRuntimeError(e.message + (e.error?.stack ? '\n' + e.error.stack : ''));
    };
    const promiseHandler = (e: PromiseRejectionEvent) => {
      console.error('[SB Unhandled Rejection]', e);
      setRuntimeError('Unhandled Promise Rejection: ' + (e.reason?.message || e.reason || 'Unknown error'));
    };
    window.addEventListener('error', handler);
    window.addEventListener('unhandledrejection', promiseHandler);
    return () => {
      window.removeEventListener('error', handler);
      window.removeEventListener('unhandledrejection', promiseHandler);
    };
  }, []);

  if (runtimeError) {
    return (
      <div className="p-10 bg-slate-900 text-white min-h-screen font-mono text-[13px] overflow-auto">
        <div className="max-w-[800px] mx-auto">
          <h1 className="text-red-400 text-2xl font-bold mb-6 border-b border-white/10 pb-4 flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            StudioBase — Critical Error
          </h1>
          <div className="bg-white/5 rounded-lg p-6 border border-white/10">
            <div className="text-white/50 mb-2 uppercase tracking-widest text-[10px] font-bold">Stack Trace</div>
            <pre className="whitespace-pre-wrap leading-relaxed opacity-90">{runtimeError}</pre>
          </div>
          <div className="mt-8 flex gap-4">
            <button 
              onClick={() => window.location.reload()} 
              className="px-6 h-11 bg-white text-black font-bold rounded-pill hover:bg-white/90 transition-all active:scale-95"
            >
              Force Reload
            </button>
            <button 
              onClick={() => {
                sessionStorage.clear();
                window.location.href = window.location.pathname;
              }} 
              className="px-6 h-11 border border-white/20 text-white font-bold rounded-pill hover:bg-white/5 transition-all"
            >
              Clear Cache & Reset
            </button>
          </div>
          <div className="mt-12 text-white/20 border-t border-white/5 pt-6 italic">
            This screen captures errors that would normally cause a white screen. 
            If you are reporting this, please copy the text above.
          </div>
        </div>
      </div>
    );
  }

  const renderRoute = () => {
    try {
      switch (route.name) {
        case 'studio': return <StudioPage />;
        case 'brand': 
        case 'templates': return <BrandKitPage />;
        case 'share': return <SharePage />;
        case 'team': return <WorkspaceSettingsPage />;
        case 'audit-logs' as any: return <AuditLogPage />;
        case 'admin' as any: return <AdminDiagnosticsPage />;
        case 'analytics': return <AnalyticsPage />;
        default: return <HomePage />;
      }
    } catch (e: any) {
      return (
        <div className="p-10 bg-slate-900 text-white min-h-screen flex items-center justify-center text-center">
          <div className="max-w-md">
            <h1 className="text-2xl font-bold mb-4">Component Render Error</h1>
            <pre className="p-4 bg-white/5 border border-white/10 rounded text-left overflow-auto mb-6 text-xs">{e.stack || e.message}</pre>
            <button onClick={() => window.location.reload()} className="px-6 h-11 bg-primary text-white rounded-pill">Retry</button>
          </div>
        </div>
      );
    }
  };

  // While the async token exchange / workspace sync is running, show a neutral loading
  // screen instead of the login page — avoids the flash-of-login-then-app on reload.
  if (initializing && route.name !== 'share' && !isEmbed) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Show login page if not authenticated (except share/embed pages which are public)
  if (!authed && route.name !== 'share' && !isEmbed) {
    return <LoginPage />;
  }

  const isShare = route.name === 'share';

  return (
    <>
      <AppShell hideSidebar={isShare || isEmbed} hideChrome={isEmbed}>
        {renderRoute()}
      </AppShell>

      {!isEmbed && <CommandPalette />}
      <GlobalToastContainer />
    </>
  );
}

export default App;

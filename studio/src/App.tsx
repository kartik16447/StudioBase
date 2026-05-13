import { useEffect, useState } from 'react';
import { useStudioStore } from './store/useStudioStore';
import { useKeyboardShortcut } from './hooks/useKeyboardShortcut';
import { AppShell } from './components/layout/AppShell';
import { HomePage } from './pages/HomePage';
import { StudioPage } from './pages/StudioPage';
import { BrandKitPage } from './pages/BrandKitPage';
import { SharePage } from './pages/SharePage';
import { CommandPalette, KeyboardHintPill } from './components/CommandPalette';

function App() {
  const route = useStudioStore(state => state.route);
  const navigate = useStudioStore(state => state.navigate);
  const togglePanel = useStudioStore(state => state.togglePanel);
  const setActiveTab = useStudioStore(state => state.setActiveTab);
  const commandOpen = useStudioStore(state => state.commandOpen);
  const setCommandOpen = useStudioStore(state => state.setCommandOpen);

  // Only navigate to studio if session param exists
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('session')) {
      navigate('studio');
    }
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

  const isShare = route.name === 'share';

  return (
    <>
      <AppShell hideSidebar={isShare}>
        {renderRoute()}
      </AppShell>

      <CommandPalette />
      <KeyboardHintPill />
    </>
  );
}

export default App;

import { useEffect } from 'react';
import { useStudioStore } from './store/useStudioStore';
import { useKeyboardShortcut } from './hooks/useKeyboardShortcut';
import { AppShell } from './components/layout/AppShell';
import { HomePage } from './pages/HomePage';
import { StudioPage } from './pages/StudioPage';
import { BrandKitPage } from './pages/BrandKitPage';
import { SharePage } from './pages/SharePage';
import { CommandPalette, KeyboardHintPill } from './components/CommandPalette';

function App() {
  const {
    route, navigate,
    togglePanel, toggleToolbar, setActiveTab,
    setActiveTool, commandOpen, setCommandOpen,
  } = useStudioStore();

  // If a session is in the URL go straight to studio, otherwise show the library.
  useEffect(() => {
    const hasSession = new URLSearchParams(window.location.search).has('session');
    navigate(hasSession ? 'studio' : 'home');
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcut('cmd+\\', () => togglePanel(), []);
  useKeyboardShortcut('h', () => toggleToolbar(), []);
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

  // Tool keys
  useKeyboardShortcut('v', () => setActiveTool('cursor'), []);
  useKeyboardShortcut('s', () => setActiveTool('spotlight'), []);
  useKeyboardShortcut('b', () => setActiveTool('highlight'), []);
  useKeyboardShortcut('t', () => setActiveTool('text'), []);
  useKeyboardShortcut('z', () => setActiveTool('zoom'), []);

  const renderRoute = () => {
    switch (route.name) {
      case 'studio': return <StudioPage />;
      case 'brand': 
      case 'templates': return <BrandKitPage />;
      case 'share': return <SharePage />;
      default: return <HomePage />;
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

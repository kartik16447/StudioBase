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
    togglePanel, setActiveTab,
    commandOpen, setCommandOpen,
  } = useStudioStore();

  // Navigate straight to studio on mount; StudioPage handles session/sample loading.
  useEffect(() => {
    navigate('studio');
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

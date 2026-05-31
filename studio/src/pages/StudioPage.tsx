import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStudioStore } from '../store/useStudioStore';
import { I } from '../components/icons';
import { docsApi } from '../features/editor/lib/docsApi';
import { sopToTiptapContent } from '../features/sop/utils/sopToTiptapContent';
import { showToast } from '../components/GlobalToast';
import {
  Button, Kbd
} from '../components/ui';
import {
  StudioHeader, SidebarControls
} from '../components/studio';
import { ShareModal } from '../components/studio/panels/ShareModal';
import { SOPCanvas } from '../components/studio/canvases/SOPCanvas';
import { VideoCanvas } from '../components/studio/canvases/VideoCanvas';
import { DemoCanvas } from '../components/studio/canvases/DemoCanvas';
import { 
  ScriptPanel, BrandPanel, ChaptersPanel, AIVoicePanel, MusicPanel, VisualsPanel, ZoomsPanel, ElementsPanel 
} from '../components/studio/Panels';
import { RenderConstants } from '../modules/render-engine/RenderConstants';
import { handleSOPVideoExport } from '../modules/render-engine/ExportOrchestrator';
import { useSessionManager } from '../hooks/useSessionManager';
import { useIsEmbed } from '../hooks/useIsEmbed';
import { apiClient } from '../lib/apiClient';
import { EmbedSOPView } from '../components/studio/canvases/EmbedSOPView';
import { EmbedVideoView } from '../components/studio/canvases/EmbedVideoView';
import { EmbedDemoView } from '../components/studio/canvases/EmbedDemoView';
import { EmbedSlidesView } from '../components/studio/canvases/EmbedSlidesView';
const STUDIO_TABS = [
  { id: 'script',   label: 'Script',   icon: I.FileText, component: ScriptPanel },
  { id: 'brand',    label: 'Brand',    icon: I.Palette,  component: BrandPanel },
  { id: 'chapters', label: 'Chapters', icon: I.Bookmark, component: ChaptersPanel },
  { id: 'voice',    label: 'AI Voice', icon: I.Mic,      component: AIVoicePanel },
  { id: 'music',    label: 'Music',    icon: I.Music2,   component: MusicPanel },
  { id: 'visuals',  label: 'Visuals',  icon: I.Image,    component: VisualsPanel },
  { id: 'zooms',    label: 'Zooms',    icon: I.ZoomIn,   component: ZoomsPanel },
  { id: 'elements', label: 'Library',  icon: I.Layers,   component: ElementsPanel },
];

export const StudioPage: React.FC = () => {
  const { isEmbed, mode } = useIsEmbed();
  const session = useStudioStore(state => state.session);
  const sessionError = useStudioStore(state => state.sessionError);
  const activeTab = useStudioStore(state => state.activeTab);
  const activeView = useStudioStore(state => state.activeView);
  const isPanelOpen = useStudioStore(state => state.isPanelOpen);
  const navigate = useStudioStore(state => state.navigate);
  const setActiveTab = useStudioStore(state => state.setActiveTab);
  const togglePanel = useStudioStore(state => state.togglePanel);
  const setActiveView = useStudioStore(state => state.setActiveView);
  const renderMode = useStudioStore(state => state.renderMode);
  const setRenderMode = useStudioStore(state => state.setRenderMode);
  const masterAudioUrl = useStudioStore(state => state.masterAudioUrl);
  const setPendingDocId = useStudioStore(state => state.setPendingDocId);
  const [shareOpen, setShareOpen] = useState(false);
  const [isOpeningInDocs, setIsOpeningInDocs] = useState(false);
  const [isSeededSession, setIsSeededSession] = useState(false);

  useSessionManager();

  useEffect(() => {
    if (!session?.sessionId) return;
    apiClient.get<{ seededSessionId: string | null }>('/onboarding/state')
      .then(data => {
        if (data?.seededSessionId && data.seededSessionId === session.sessionId) {
          setIsSeededSession(true);
        }
      })
      .catch(() => {});
  }, [session?.sessionId]);

  // ── Global undo / redo (Ctrl/Cmd+Z and Cmd+Shift+Z) ───────────────────
  // Lives here so it works in every view (SOP, Video, Demo) regardless of
  // which canvas or panel is currently active. Skips input/textarea so text
  // editing keeps browser-native undo.
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          useStudioStore.getState().redo();
        } else {
          useStudioStore.getState().undo();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Embed mode: skip the full studio chrome and render the appropriate embed view
  if (isEmbed) {
    if (mode === 'video') return <EmbedVideoView />;
    if (mode === 'demo') return <EmbedDemoView />;
    if (mode === 'slides') return <EmbedSlidesView />;
    return <EmbedSOPView />;
  }



  if (sessionError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-20 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
          <I.AlertCircle size={32} className="text-red-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Session</h2>
        <p className="text-gray-600 max-w-md">{sessionError}</p>
        <div className="mt-8 flex gap-3">
          <Button variant="ghost" onClick={() => {
            sessionStorage.clear();
            localStorage.clear();
            window.location.href = window.location.pathname; // Reload without query params
          }}>Reset Session & Logout</Button>
          <Button variant="ghost" onClick={() => window.location.reload()}>Try Again</Button>
          <Button variant="primary" onClick={() => navigate('home')}>Go to Library</Button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-20 text-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6" />
        <h2 className="text-xl font-medium text-text">Loading session data...</h2>
      </div>
    );
  }

  const steps = session.steps || [];
  if (steps.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-20 text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-6">
          <I.FileText size={32} className="text-amber-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">No steps captured</h2>
        <p className="text-gray-600 max-w-md">
          This session was recorded but no interactions were captured. Make sure you click, type, or navigate during the recording, then record a new session.
        </p>
        <button
          onClick={() => navigate('home')}
          className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Back to Library
        </button>
      </div>
    );
  }

  const handleOpenInDocs = async () => {
    if (isOpeningInDocs || !session) return;
    setIsOpeningInDocs(true);
    try {
      const sopTitle = (session as any).title || (session as any).metadata?.title || 'Untitled SOP';
      const blocks = sopToTiptapContent(sopTitle, session.steps || [], (session as any).assets || {});
      const doc = await docsApi.create({
        title: sopTitle,
        blocks,
        sourceSopId: session.sessionId,
      });
      setPendingDocId(doc.id);
      setActiveTab('docs');
    } catch (err) {
      console.error('Failed to export SOP to Docs:', err);
      showToast('error', 'Failed to create doc. Please try again.');
    } finally {
      setIsOpeningInDocs(false);
    }
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
      {isSeededSession && (
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/8 border-b border-primary/15 text-[12.5px] text-primary shrink-0">
          <I.Info size={13} strokeWidth={2} />
          <span>This is an example session — explore freely, your changes won't affect anything.</span>
        </div>
      )}
      <StudioHeader
        activeView={activeView}
        setActiveView={setActiveView}
        renderMode={renderMode}
        setRenderMode={setRenderMode}
        onNavigateHome={() => navigate('home')}
        onShareClick={() => setShareOpen(true)}
        onSandboxExport={() => handleSOPVideoExport({ session, theme: useStudioStore.getState().brand, renderMode, masterAudioUrl })}
        onOpenInDocs={handleOpenInDocs}
        isOpeningInDocs={isOpeningInDocs}
        onSaveAsTemplate={async (data) => {
          const sessionId = session?.sessionId ?? (session as any)?.id;
          if (!sessionId) { showToast('No session loaded', 'error'); return; }
          try {
            await apiClient.post('/templates', { sessionId, ...data });
            showToast('Template saved', 'success');
          } catch (err: any) {
            showToast(err.message || 'Failed to save template', 'error');
          }
        }}
      />
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} />
      <div className="flex-1 flex min-h-0">
        
        {/* Left Panel — hidden in Demo mode (DemoCanvas has its own step rail + content panel) */}
        {activeView !== 'demo' && (
          <SidebarControls
            isPanelOpen={isPanelOpen}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            tabs={STUDIO_TABS}
          />
        )}

        {/* Canvas */}
        <motion.section
          layout
          transition={RenderConstants.PANEL_SPRING}
          className="flex-1 min-w-0 flex flex-col relative"
        >
          {/* Panel toggle — not shown in Demo mode */}
          {activeView !== 'demo' && (
            <button
              onClick={togglePanel}
              className="absolute top-3 left-3 z-20 glass rounded-pill h-8 px-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-text-2 hover:text-text"
            >
              {isPanelOpen ? <I.ChevronLeft size={14} /> : <I.ChevronRight size={14} />}
              <span>{isPanelOpen ? 'Collapse' : 'Open panel'}</span>
              <Kbd>⌘\</Kbd>
            </button>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex-1 flex flex-col min-h-0"
            >
              {activeView === 'sop' ? <SOPCanvas /> : activeView === 'video' ? <VideoCanvas /> : <DemoCanvas />}
            </motion.div>
          </AnimatePresence>
        </motion.section>
      </div>
    </div>
  );
};

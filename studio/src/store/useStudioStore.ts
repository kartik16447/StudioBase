import { create } from 'zustand';
import type { SessionEnvelope, Step } from '../../../shared/types/session';
import { apiClient } from '../lib/apiClient';

export type RouteName = 'home' | 'studio' | 'sop' | 'share' | 'brand' | 'library' | 'shared' | 'recent' | 'templates' | 'knowledge' | 'team';

interface Route {
  name: RouteName;
  params: Record<string, any>;
}

interface BrandState {
  primaryColor: string;
  font: string;
  showIntro: boolean;
  showOutro: boolean;
  watermark: string;
  logoUrl: string | null;
}

interface StudioState {
  route: Route;
  session: SessionEnvelope | null;
  activeTab: string;
  isPanelOpen: boolean;
  activeView: 'sop' | 'video' | 'demo';
  activeTool: string;
  isToolbarVisible: boolean;
  focusedStepId: string | null;
  focusedStepIndex: number;
  commandOpen: boolean;

  // Video/Player state
  isPlaying: boolean;
  playbackRate: number;
  currentStepIndex: number;
  currentTime: number;
  scrollTrigger: number;
  sessionError: string | null;
  renderMode: 'hybrid' | 'slideshow';
  isExporting: boolean;
  exportTrigger: number;

  brand: BrandState;
  setBrand: (updates: Partial<BrandState>) => void;

  // Actions
  navigate: (name: RouteName, params?: Record<string, any>) => void;
  setSession: (session: SessionEnvelope | null) => void;
  setActiveTab: (id: string) => void;
  togglePanel: () => void;
  setActiveView: (view: 'sop' | 'video' | 'demo') => void;
  setActiveTool: (tool: string) => void;
  toggleToolbar: () => void;
  setFocusStep: (id: string | null) => void;
  setCommandOpen: (open: boolean) => void;

  // Player actions
  setPlaying: (playing: boolean) => void;
  setStepIndex: (index: number) => void;
  setPlaybackRate: (rate: number) => void;
  setCurrentTime: (time: number) => void;
   updateStep: (stepId: string, updates: Partial<Step>) => void;
  deleteStep: (stepId: string) => void;
  triggerScroll: () => void;
  setRenderMode: (mode: 'hybrid' | 'slideshow') => void;
  setIsExporting: (exporting: boolean) => void;
  triggerExport: () => void;
  fetchSession: (sessionId: string) => Promise<void>;
}

export const useStudioStore = create<StudioState>((set) => ({
  route: { name: 'home', params: {} },
  session: null,
  activeTab: 'script',
  isPanelOpen: true,
  activeView: 'video',
  activeTool: 'cursor',
  isToolbarVisible: true,
  focusedStepId: null,
  focusedStepIndex: 0,
  commandOpen: false,

  isPlaying: false,
  playbackRate: 1,
  currentStepIndex: 0,
  currentTime: 0,
  scrollTrigger: 0,
  sessionError: null,
  renderMode: 'hybrid',
  isExporting: false,
  exportTrigger: 0,

  brand: {
    primaryColor: '#5E5CE6',
    font: 'Inter',
    showIntro: true,
    showOutro: false,
    watermark: 'StudioBase',
    logoUrl: null,
  },

  setBrand: (updates) => set((state) => ({
    brand: { ...state.brand, ...updates },
  })),

  navigate: (name, params = {}) => set((state) => {
    // 1. Sync Browser URL
    const search = new URLSearchParams(window.location.search);
    
    // If we're navigating home, clear session-specific params
    if (name === 'home') {
      search.delete('session');
    } else if (params.sessionId) {
      search.set('session', params.sessionId);
    }

    if (params.workspaceId) {
      search.set('workspaceId', params.workspaceId);
    }
    
    const searchStr = search.toString();
    const newUrl = window.location.pathname + (searchStr ? '?' + searchStr : '');
    
    // Only push if different from current state to avoid loops
    if (state.route.name !== name || state.route.params.sessionId !== params.sessionId) {
      window.history.pushState({ name, params }, '', newUrl);
    }

    return { route: { name, params } };
  }),
  setSession: (session) => {
    set({ session });
    if (session && session.steps.length > 0) {
      set({ focusedStepId: session.steps[0].id, focusedStepIndex: 0 });
    }
  },
  fetchSession: async (sessionId) => {
    try {
      set({ sessionError: null });

      console.log(`[fetchSession] Fetching session ${sessionId} via apiClient...`);
      const data = await apiClient.get<any>(`/sessions/${sessionId}`);
      
      if (!data) throw new Error('Empty response from server');

      // Start with the raw backend data as our sessionData
      let sessionData: SessionEnvelope = {
        ...data,
        sessionId: data.id || data.sessionId,
      };

      if (data.sessionJsonUrl) {
        console.log('[fetchSession] Fetching full JSON from R2:', data.sessionJsonUrl);
        const jsonContent = await apiClient.get<any>(data.sessionJsonUrl);
        if (jsonContent) {
          sessionData = { ...sessionData, ...jsonContent };
        }
      }

      // ─── Normalization ───
      const rawEvents = (sessionData as any).events;
      if (Array.isArray(rawEvents) && (!sessionData.steps || sessionData.steps.length === 0)) {
        const rawTitle = sessionData.aiOutputs?.title || (data as any).title || sessionData.capturedUrl || 'Untitled Session';
        const screenshotByIndex = new Map<number, string>(
          ((sessionData as any).screenshots || []).map((s: any) => [s.stepIndex, s.r2Key])
        );
        let currentContext: 'browser' | 'desktop' = 'browser';
        const steps: Step[] = [];

        for (const evt of rawEvents) {
          if (evt.type === 'context_switch') {
            currentContext = evt.data?.context || 'browser';
            continue;
          }

          const isDesktop = evt.type === 'desktop_anchor' || currentContext === 'desktop';
          const elementText = evt.data?.elementText || null;
          
          steps.push({
            id: evt.id || `step-${steps.length}`,
            sequence: steps.length + 1,
            action: evt.type || 'click',
            timestamp: evt.timestamp,
            selector: evt.selector || null,
            url: isDesktop ? '' : (evt.data?.url || ''),
            pageTitle: isDesktop ? 'Desktop' : (evt.data?.pageTitle || ''),
            elementText,
            elementRole: evt.data?.elementRole || null,
            elementType: evt.data?.elementType || null,
            inputValue: evt.data?.inputValue || null,
            coordinates: evt.data?.coordinates || null,
            screenshotKey: screenshotByIndex.get(rawEvents.indexOf(evt)) ?? evt.data?.screenshotKey ?? "",
            generatedText: evt.data?.generatedText || (evt.type === 'desktop_anchor' ? 'Desktop Activity' : null),
            textOverride: evt.data?.textOverride || null,
            voiceoverKey: evt.data?.voiceoverKey || null,
            voiceoverDurationMs: evt.data?.voiceoverDurationMs || null,
            annotations: [],
            animationTarget: evt.data?.animationTarget || null,
            data: { ...evt.data, context: currentContext },
          } as Step);
        }

        sessionData = {
          ...sessionData,
          sessionId: data.id || sessionData.sessionId,
          capturedTitle: rawTitle,
          sessionType: (sessionData.sessionType as any) || 'steps',
          capturedAt: data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString(),
          steps,
          metadata: {
            stepCount: steps.length,
            durationMs: sessionData.metadata?.durationMs || 0,
            chapterBreaks: sessionData.metadata?.chapterBreaks || [],
          },
          aiOutputs: {
            title: rawTitle,
            summary: sessionData.aiOutputs?.summary || 'Session captured — AI processing pending.',
            tags: sessionData.aiOutputs?.tags || [],
          },
        };
      }

      // Final safety checks
      if (!sessionData.steps) {
        const terminalFailures: Record<string, string> = {
          credit_exhausted: 'Not enough credits to process this session.',
          failed: 'Session processing failed.',
          deleted: 'This session has been deleted.',
        };
        const msg = terminalFailures[data.status]
          ?? `Session is still uploading or processing (status: ${data.status}).`;
        set({ sessionError: msg });
        return;
      }

      if (!sessionData.aiOutputs) {
        sessionData.aiOutputs = { title: (sessionData as any).title || 'Untitled', summary: '', tags: [] };
      }
      if (!sessionData.metadata) {
        sessionData.metadata = { stepCount: sessionData.steps?.length || 0, durationMs: 0, chapterBreaks: [] };
      }
      if (!sessionData.metadata.chapterBreaks) {
        sessionData.metadata.chapterBreaks = [];
      }

      if (!sessionData.videoKey && (sessionData as any).r2VideoKey) {
        sessionData.videoKey = (sessionData as any).r2VideoKey;
      }

      // Build assets map
      if (!sessionData.assets || Object.keys(sessionData.assets).length === 0) {
        const assets: Record<string, string> = {};
        for (const step of sessionData.steps || []) {
          if (step.screenshotKey) {
            assets[step.screenshotKey] = apiClient.getUrl(`/assets/${step.screenshotKey}`);
          }
          if (step.voiceoverKey) {
            assets[step.voiceoverKey] = apiClient.getUrl(`/assets/${step.voiceoverKey}`);
          }
        }
        if (sessionData.videoKey) {
          assets[sessionData.videoKey] = apiClient.getUrl(`/assets/${sessionData.videoKey}`);
        }
        sessionData.assets = assets;
      }

      if (sessionData.brand) {
        set((state) => ({
          brand: {
            ...state.brand,
            primaryColor: sessionData.brand?.primaryColor ?? state.brand.primaryColor,
            logoUrl: sessionData.brand?.logoUrl ?? state.brand.logoUrl,
            watermark: sessionData.brand?.watermarkText ?? state.brand.watermark,
            showIntro: sessionData.brand?.introSlide ?? state.brand.showIntro,
            showOutro: sessionData.brand?.outroSlide ?? state.brand.showOutro,
            font: sessionData.brand?.fontFamily ?? state.brand.font,
          },
        }));
      }

      set({ session: sessionData });
      if (sessionData.steps?.length > 0) {
        set({ focusedStepId: sessionData.steps[0].id, focusedStepIndex: 0 });
      }
    } catch (err: any) {
      console.error('[fetchSession] error:', err.message);
      set({ sessionError: err.message || 'Failed to load session' });
    }
  },

  setActiveTab: (id) => set({ activeTab: id }),
  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),
  setActiveView: (view) => set({ activeView: view }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  toggleToolbar: () => set((state) => ({ isToolbarVisible: !state.isToolbarVisible })),
  setFocusStep: (id) => set((state) => {
    const index = state.session?.steps.findIndex(s => s.id === id) ?? 0;
    return { focusedStepId: id, focusedStepIndex: Math.max(0, index) };
  }),
  setCommandOpen: (open) => set({ commandOpen: open }),

  setPlaying: (playing) => set({ isPlaying: playing }),
  setStepIndex: (index) => set((state) => {
    const stepId = state.session?.steps[index]?.id || null;
    return { currentStepIndex: index, focusedStepId: stepId, focusedStepIndex: index };
  }),
  setPlaybackRate: (rate) => set({ playbackRate: rate }),
  setCurrentTime: (time) => set({ currentTime: time }),
  updateStep: (stepId, updates) => set((state) => {
    if (!state.session) return state;
    const newSteps = state.session.steps.map(s => 
      s.id === stepId ? { ...s, ...updates } : s
    );
    return { session: { ...state.session, steps: newSteps } };
  }),
  deleteStep: (stepId) => set((state) => {
    if (!state.session) return state;
    const newSteps = state.session.steps.filter(s => s.id !== stepId);
    const sequencedSteps = newSteps.map((s, i) => ({ ...s, sequence: i + 1 }));
    return { 
      session: { 
        ...state.session, 
        steps: sequencedSteps,
        metadata: { ...state.session.metadata, stepCount: sequencedSteps.length }
      } 
    };
  }),
  triggerScroll: () => set((state) => ({ scrollTrigger: state.scrollTrigger + 1 })),
  setRenderMode: (mode) => set({ renderMode: mode }),
  setIsExporting: (exporting) => set({ isExporting: exporting }),
  triggerExport: () => set((state) => ({ exportTrigger: state.exportTrigger + 1 })),
}));

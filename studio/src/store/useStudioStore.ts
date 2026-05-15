import { create } from 'zustand';
import type { SessionEnvelope, Step } from '../../../shared/types/session';
import { BACKEND_URL } from '../../../shared/constants';

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

  navigate: (name, params = {}) => set({ route: { name, params } }),
  setSession: (session) => {
    set({ session });
    if (session && session.steps.length > 0) {
      set({ focusedStepId: session.steps[0].id, focusedStepIndex: 0 });
    }
  },
  fetchSession: async (sessionId) => {
    try {
      set({ sessionError: null });

      // Get token from URL or storage (extension syncs to both)
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token');
      const storageToken = localStorage.getItem('sb_token') || sessionStorage.getItem('sb_token');
      
      // Source of truth: Storage (synced by extension) > URL (may be stale)
      let token = storageToken || urlToken;

      if (urlToken && urlToken !== storageToken && !storageToken) {
        console.log('🔑 [fetchSession] No storage token found, using URL token...');
        sessionStorage.setItem('sb_token', urlToken);
        localStorage.setItem('sb_token', urlToken);
        token = urlToken;
      }

      const wid = urlParams.get('workspaceId') || sessionStorage.getItem('sb_workspaceId') || localStorage.getItem('sb_workspaceId');
      if (wid) {
        sessionStorage.setItem('sb_workspaceId', wid);
        localStorage.setItem('sb_workspaceId', wid);
      }

      const displayToken = token ? `${token.substring(0, 10)}...${token.substring(token.length - 5)}` : 'MISSING';
      console.log('[fetchSession] Using token:', displayToken);
      console.log('[fetchSession] Fetching session from backend:', `${BACKEND_URL}/sessions/${sessionId}`);
      const res = await fetch(`${BACKEND_URL}/sessions/${sessionId}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        console.error('[fetchSession] Backend error:', res.status, errBody);
        if (res.status === 401) {
          sessionStorage.removeItem('sb_token');
          localStorage.removeItem('sb_token');
          throw new Error('Session Expired: Please close this tab and re-open the session from your Extension library.');
        }
        if (res.status === 404) throw new Error('Session not found — it may still be uploading. Try again in a moment.');
        throw new Error(`Failed to fetch session (${res.status}): ${errBody}`);
      }

      const data = await res.json();
      console.log('[fetchSession] Initial backend response (data):', data);
      if (!data) throw new Error('Empty response from server');

      // Start with the raw backend data as our sessionData
      let sessionData: SessionEnvelope = {
        ...data,
        sessionId: data.id || data.sessionId,
      };

      if (data.sessionJsonUrl) {
        console.log('[fetchSession] Fetching full JSON from R2:', data.sessionJsonUrl);
        const jsonRes = await fetch(data.sessionJsonUrl);
        if (jsonRes.ok) {
          const jsonContent = await jsonRes.json();
          console.log('[fetchSession] Received R2 JSON content:', jsonContent);
          if (jsonContent) {
            sessionData = { ...sessionData, ...jsonContent };
          }
        } else {
          console.error('[fetchSession] R2 fetch failed:', jsonRes.status);
        }
      }

      // ─── Normalization ───
      // If the session has raw events but NO processed steps, we map them here.
      // If it already has steps, we respect the backend's enriched data.
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
            continue; // Meta-event, skip step creation
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

      // Final safety checks for required SessionEnvelope fields
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

      // Final field normalization (Backend DB uses r2VideoKey, Extension uses videoKey)
      if (!sessionData.videoKey && (sessionData as any).r2VideoKey) {
        sessionData.videoKey = (sessionData as any).r2VideoKey;
      }

      // Build assets map from step screenshot/voiceover keys
      if (!sessionData.assets || Object.keys(sessionData.assets).length === 0) {
        const assets: Record<string, string> = {};
        for (const step of sessionData.steps || []) {
          if (step.screenshotKey) {
            assets[step.screenshotKey] = `${BACKEND_URL}/assets/${step.screenshotKey}`;
          }
          if (step.voiceoverKey) {
            assets[step.voiceoverKey] = `${BACKEND_URL}/assets/${step.voiceoverKey}`;
          }
        }
        if (sessionData.videoKey) {
          assets[sessionData.videoKey] = `${BACKEND_URL}/assets/${sessionData.videoKey}`;
        }
        sessionData.assets = assets;
      }

      if (sessionData.brand) {
        console.log('[fetchSession] Merging brand config:', sessionData.brand);
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

      console.log('[fetchSession] Final normalized sessionData:', sessionData);
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
    // Re-sequence steps after deletion
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

// Listen for token updates from the extension content script
if (typeof window !== 'undefined') {
  window.addEventListener('SB_TOKEN_UPDATED', () => {
    const state = useStudioStore.getState();
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session');
    
    console.log('🔑 [useStudioStore] SB_TOKEN_UPDATED event received');
    
    // If we have an error or no session, try fetching again with the new token
    if (sessionId && (state.sessionError || !state.session)) {
      console.log('🔑 [useStudioStore] Re-fetching session with new token...');
      state.fetchSession(sessionId);
    }
  });
}

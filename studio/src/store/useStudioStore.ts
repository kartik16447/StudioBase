import { create } from 'zustand';
import type { SessionEnvelope, Step } from '../../../shared/types/session';
import { BACKEND_URL } from '../../../shared/constants';

export type RouteName = 'home' | 'studio' | 'sop' | 'share' | 'brand' | 'library' | 'shared' | 'recent' | 'templates' | 'knowledge' | 'team';

interface Route {
  name: RouteName;
  params: Record<string, any>;
}

interface StudioState {
  route: Route;
  session: SessionEnvelope | null;
  activeTab: string;
  isPanelOpen: boolean;
  activeView: 'sop' | 'video';
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

  // Actions
  navigate: (name: RouteName, params?: Record<string, any>) => void;
  setSession: (session: SessionEnvelope | null) => void;
  setActiveTab: (id: string) => void;
  togglePanel: () => void;
  setActiveView: (view: 'sop' | 'video') => void;
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
  triggerScroll: () => void;
  fetchSession: (sessionId: string) => Promise<void>;
}

export const useStudioStore = create<StudioState>((set) => ({
  route: { name: 'home', params: {} },
  session: null,
  activeTab: 'script',
  isPanelOpen: true,
  activeView: 'sop',
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

      // Get token from URL or session storage
      const urlParams = new URLSearchParams(window.location.search);
      let token = urlParams.get('token');
      if (token) {
        sessionStorage.setItem('sb_token', token);
      } else {
        token = sessionStorage.getItem('sb_token');
      }

      const wid = urlParams.get('workspaceId');
      if (wid) sessionStorage.setItem('sb_workspaceId', wid);

      const res = await fetch(`${BACKEND_URL}/sessions/${sessionId}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        if (res.status === 401) throw new Error('Unauthorized: Please sign in through the extension');
        if (res.status === 404) throw new Error('Session not found — it may still be uploading. Try again in a moment.');
        throw new Error(`Failed to fetch session (${res.status}): ${errBody}`);
      }

      const data = await res.json();
      let sessionData = data;

      if (data.sessionJsonUrl) {
        const jsonRes = await fetch(data.sessionJsonUrl);
        if (jsonRes.ok) {
          sessionData = await jsonRes.json();
        } else {
          const r2Err = await jsonRes.text().catch(() => '');
          console.error('[fetchSession] R2 JSON fetch failed:', jsonRes.status, r2Err);
        }
      } else {
        console.warn('[fetchSession] no sessionJsonUrl — status:', data.status, '| r2JsonKey:', data.r2JsonKey);
      }

      // Normalize: extension captures store `events[]`, studio expects `steps[]`
      // Always remap from events (authoritative raw source), augmenting with
      // pipeline-enriched steps (generatedText, voiceoverKey, animationTarget).
      if (Array.isArray(sessionData.events)) {
        const rawTitle = sessionData.aiOutputs?.title || data.title || sessionData.tabUrl || 'Untitled Session';
        const screenshotByIndex = new Map<number, string>(
          (sessionData.screenshots || []).map((s: any) => [s.stepIndex, s.r2Key])
        );
        // Pipeline writes enriched data into steps[] — index-aligned with events[]
        const pipelineSteps: any[] = Array.isArray(sessionData.steps) ? sessionData.steps : [];

        sessionData = {
          sessionId: data.id || sessionData.sessionId,
          id: data.id || sessionData.sessionId,
          title: rawTitle,
          sessionType: 'steps' as const,
          capturedAt: data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString(),
          createdAt: data.createdAt || Date.now(),
          steps: sessionData.events.map((evt: any, idx: number) => {
            const ps = pipelineSteps[idx];
            const elementText = evt.data?.elementText || ps?.elementText || null;
            const fallbackText = elementText || `${evt.type || 'click'} on ${evt.selector || 'element'}`;
            return {
              id: `step-${idx}`,
              sequence: idx + 1,
              index: idx,
              action: evt.type || 'click',
              title: evt.data?.pageTitle || evt.type || `Step ${idx + 1}`,
              description: fallbackText,
              timestamp: evt.timestamp,
              selector: evt.selector || null,
              url: evt.data?.url || null,
              pageTitle: evt.data?.pageTitle || '',
              elementText,
              screenshotKey: screenshotByIndex.get(idx) ?? evt.data?.screenshotKey ?? null,
              generatedText: ps?.generatedText || null,
              textOverride: ps?.textOverride || null,
              voiceoverKey: ps?.voiceoverKey || null,
              annotations: [],
              animationTarget: ps?.animationTarget || null,
              data: evt.data || {},
            };
          }),
          metadata: {
            stepCount: sessionData.events.length,
            durationMs: 0,
            chapterBreaks: [],
          },
          aiOutputs: {
            title: rawTitle,
            summary: sessionData.aiOutputs?.summary || (pipelineSteps.length ? '' : 'Session captured — AI processing pending.'),
            tags: sessionData.aiOutputs?.tags || [],
          },
          brand: null,
        };
      }

      // If events were empty AND backend signals a terminal status, surface the error
      if (sessionData.steps?.length === 0) {
        const terminalFailures: Record<string, string> = {
          credit_exhausted: 'Not enough credits to process this session. Add credits and re-run the pipeline.',
          failed: 'Session processing failed. Please try recapturing.',
          deleted: 'This session has been deleted.',
        };
        if (terminalFailures[data.status]) {
          set({ sessionError: terminalFailures[data.status] });
          return;
        }
      }

      if (!sessionData.steps) {
        const terminalFailures: Record<string, string> = {
          credit_exhausted: 'Not enough credits to process this session. Add credits and re-run the pipeline.',
          failed: 'Session processing failed. Please try recapturing.',
          deleted: 'This session has been deleted.',
        };
        const msg = terminalFailures[data.status]
          ?? `Session is still uploading or processing (status: ${data.status}). Try again in a moment.`;
        set({ sessionError: msg });
        return;
      }

      // Ensure required top-level fields have safe defaults even for enriched sessions
      if (!sessionData.aiOutputs) {
        sessionData.aiOutputs = { title: sessionData.title || 'Untitled', summary: '', tags: [] };
      }
      if (!sessionData.metadata) {
        sessionData.metadata = { stepCount: sessionData.steps?.length || 0, durationMs: 0, chapterBreaks: [] };
      }
      if (!sessionData.metadata.chapterBreaks) {
        sessionData.metadata.chapterBreaks = [];
      }

      // Build assets map from step screenshot/voiceover keys
      if (!sessionData.assets) {
        const assets: Record<string, string> = {};
        for (const step of sessionData.steps || []) {
          if (step.screenshotKey) {
            assets[step.screenshotKey] = `${BACKEND_URL}/assets/${step.screenshotKey}`;
          }
          if (step.voiceoverKey) {
            assets[step.voiceoverKey] = `${BACKEND_URL}/assets/${step.voiceoverKey}`;
          }
        }
        sessionData.assets = assets;
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
  triggerScroll: () => set(state => ({ scrollTrigger: state.scrollTrigger + 1 })),
}));

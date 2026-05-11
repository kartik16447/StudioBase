import { create } from 'zustand';
import type { SessionEnvelope, Step } from '../../../shared/types/session';

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

  navigate: (name, params = {}) => set({ route: { name, params } }),
  setSession: (session) => {
    set({ session });
    if (session && session.steps.length > 0) {
      set({ focusedStepId: session.steps[0].id, focusedStepIndex: 0 });
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
}));

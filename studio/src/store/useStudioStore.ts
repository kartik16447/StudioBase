import { create } from 'zustand';
import type { SessionEnvelope } from '../../../shared/types/session';

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
  commandOpen: boolean;

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
  commandOpen: false,

  navigate: (name, params = {}) => set({ route: { name, params } }),
  setSession: (session) => set({ session }),
  setActiveTab: (id) => set({ activeTab: id }),
  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),
  setActiveView: (view) => set({ activeView: view }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  toggleToolbar: () => set((state) => ({ isToolbarVisible: !state.isToolbarVisible })),
  setFocusStep: (id) => set({ focusedStepId: id }),
  setCommandOpen: (open) => set({ commandOpen: open }),
}));

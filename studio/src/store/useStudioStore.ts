import { create } from 'zustand';
import type { SessionEnvelope, Step } from '../../../shared/types/session';
import { apiClient, type CommentItem, type NotificationItem } from '../lib/apiClient';

export type RouteName = 'home' | 'studio' | 'sop' | 'share' | 'player' | 'brand' | 'library' | 'shared' | 'recent' | 'templates' | 'knowledge' | 'team' | 'analytics';

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
  sessionStatus: string | null;
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
  hybridStepIndex: number;
  slideshowStepIndex: number;
  isExporting: boolean;
  exportTrigger: number;
  exportStatus: 'idle' | 'checking' | 'exporting' | 'finishing' | 'failed' | 'completed';
  exportError: string | null;
  exportProgress: number;

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
  setExportStatus: (status: StudioState['exportStatus']) => void;
  setExportError: (error: string | null) => void;
  setExportProgress: (progress: number) => void;
  triggerExport: () => void;
  fetchSession: (sessionId: string) => Promise<void>;
  
  // Phase 5 SOP Editor additions
  sopStatus: 'draft' | 'review' | 'published' | null;
  setSopStatus: (status: 'draft' | 'review' | 'published' | null) => void;
  saveStep: (stepId: string, updates: { textOverride?: string; annotations?: any[] }) => Promise<void>;
  saveAnimationTarget: (stepId: string, animationTarget: any) => Promise<void>;
  publishSOP: (sopId: string, status: 'review' | 'published') => Promise<void>;
  forkSOP: (sopId: string) => Promise<string>; // returns new sopId
  shareSession: () => Promise<{ shareUrl: string; shareToken: string }>;

  // Phase 6 — Comments
  comments: CommentItem[];
  commentsLoading: boolean;
  commentsPanelOpen: boolean;
  fetchComments: (sopId: string) => Promise<void>;
  addComment: (sopId: string, stepId: string | null, body: string) => Promise<void>;
  resolveComment: (commentId: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  setCommentsPanelOpen: (open: boolean) => void;

  // Phase 6 — Notifications
  notifications: NotificationItem[];
  unreadCount: number;
  fetchNotifications: () => Promise<void>;
  markNotificationRead: (notifId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
}

// const RESTORABLE_ROUTES: RouteName[] = ['home', 'brand', 'templates', 'team', 'analytics'];
const RESTORABLE_ROUTES_STR = ['home', 'brand', 'templates', 'team', 'audit-logs', 'admin', 'analytics'];

function getInitialRoute(): { name: RouteName; params: Record<string, any> } {
  try {
    const saved = localStorage.getItem('sb_last_route');
    if (saved && RESTORABLE_ROUTES_STR.includes(saved)) {
      return { name: saved as RouteName, params: {} };
    }
  } catch {}
  return { name: 'home', params: {} };
}

export const useStudioStore = create<StudioState>((set, get) => ({
  route: getInitialRoute(),
  session: null,
  sessionStatus: null,
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
  hybridStepIndex: 0,
  slideshowStepIndex: 0,
  isExporting: false,
  exportTrigger: 0,
  exportStatus: 'idle',
  exportError: null,
  exportProgress: 0,

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
          sessionData = { ...sessionData, ...jsonContent, sessionId: data.id || data.sessionId };
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

        for (let i = 0; i < rawEvents.length; i++) {
          const evt = rawEvents[i];
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
            screenshotKey: screenshotByIndex.get(i) ?? evt.data?.screenshotKey ?? null,
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
        set({ sessionError: msg, sessionStatus: data.status ?? null });
        return;
      }

      // Light-normalize R2 steps that arrived as raw event objects (no id, have 'type' not 'action')
      if (Array.isArray(sessionData.steps)) {
        sessionData.steps = sessionData.steps.map((s: any, i: number) => ({
          ...s,
          id: s.id || `step-${i}`,
          sequence: s.sequence ?? i + 1,
          action: s.action || s.type || 'click',
          coordinates: s.coordinates || s.data?.coordinates || null,
          generatedText: s.generatedText || s.data?.generatedText || null,
          animationTarget: s.animationTarget || s.data?.animationTarget || null,
          screenshotKey: s.screenshotKey || s.data?.screenshotKey || null,
          annotations: s.annotations || [],
        }));
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

      // (Assets will be built after step flattening below)

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

      // Final safety checks, step ID enforcement, and flattening D1 content
      if (sessionData.steps) {
        // Map screenshots by index if they exist in a separate array (common in legacy R2 JSON)
        const screenshotByIndex = new Map<number, string>(
          ((sessionData as any).screenshots || []).map((s: any) => [s.stepIndex, s.r2Key])
        );

        // ─── TIMING NORMALIZATION ───
        // We prioritize startedAt (recording start) over capturedAt (db creation)
        // to eliminate the 1-3s initialization lag.
        const sessionStartTime = (sessionData as any).startedAt 
          ? new Date((sessionData as any).startedAt).getTime() 
          : sessionData.capturedAt 
            ? new Date(sessionData.capturedAt).getTime() 
            : (sessionData.steps[0]?.timestamp || 0);

        sessionData.steps = sessionData.steps.map((s: any, i) => {
          const content = s.content || {};
          const rawTimestamp = s.timestamp || content.timestamp || 0;
          
          // Absolute epoch timestamps for years 2020–2035 are in [1.58T, 2.05T] ms range.
          // Use 1_000_000_000_000 (year 2001) as the floor — anything above this is epoch ms.
          const EPOCH_FLOOR = 1_000_000_000_000;
          const normalizedTimestamp = rawTimestamp > EPOCH_FLOOR 
            ? Math.max(0, rawTimestamp - sessionStartTime) 
            : rawTimestamp;

          return {
            ...s,
            ...content, // Flatten the nested JSON blob to root level properties
            timestamp: normalizedTimestamp,
            screenshotKey: s.screenshotKey || content?.screenshotKey || screenshotByIndex.get(i) || null,
            // Promote animationTarget: manual override from stepOverrides wins, then root, then legacy locations
            animationTarget: ((sessionData.metadata as any)?.stepOverrides?.[s.id || `step-${i}`]?.animationTarget)
              || s.animationTarget || content?.animationTarget || s.data?.animationTarget || null,
            id: s.id || `step-${i}`,
            sequence: s.sequence || i + 1,
          };
        });
      }

      // ─── Asset Mapping ───
      // We must build the assets map AFTER flattening so that screenshotKey is available at the root
      const assets: Record<string, string> = { ...(sessionData.assets || {}) };
      
      if (sessionData.videoKey && !assets[sessionData.videoKey]) {
        assets[sessionData.videoKey] = apiClient.getUrl(`/assets/${sessionData.videoKey}`);
      }

      for (const step of sessionData.steps || []) {
        if (step.screenshotKey && !assets[step.screenshotKey]) {
          assets[step.screenshotKey] = apiClient.getUrl(`/assets/${step.screenshotKey}`);
        }
        if (step.voiceoverKey && !assets[step.voiceoverKey]) {
          assets[step.voiceoverKey] = apiClient.getUrl(`/assets/${step.voiceoverKey}`);
        }
      }
      sessionData.assets = assets;

      set({ session: sessionData, sessionStatus: (data as any).status ?? null });
      if (sessionData.steps?.length > 0) {
        set({ focusedStepId: sessionData.steps[0].id, focusedStepIndex: 0 });
      }
      // Initialise sopStatus from the backend response (sopStatus lives on the SOP row, not R2 envelope)
      if (data.sopStatus) {
        set({ sopStatus: data.sopStatus as 'draft' | 'review' | 'published' });
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
  setRenderMode: (mode) => set((state) => {
    const savedKey = state.renderMode === 'hybrid'
      ? { hybridStepIndex: state.currentStepIndex }
      : { slideshowStepIndex: state.currentStepIndex };
    const restoreStep = mode === 'hybrid' ? state.hybridStepIndex : state.slideshowStepIndex;
    const stepId = state.session?.steps[restoreStep]?.id ?? null;
    return {
      ...savedKey,
      renderMode: mode,
      currentStepIndex: restoreStep,
      focusedStepId: stepId,
      focusedStepIndex: restoreStep,
      isPlaying: false,
    };
  }),
  setIsExporting: (exporting) => set({ isExporting: exporting }),
  setExportStatus: (status) => set({ exportStatus: status }),
  setExportError: (error) => set({ exportError: error }),
  setExportProgress: (progress) => set({ exportProgress: progress }),
  triggerExport: () => set((state) => ({ exportTrigger: state.exportTrigger + 1 })),

  // Phase 5 SOP Editor body
  sopStatus: null,
  setSopStatus: (status) => set({ sopStatus: status }),

  // Phase 6 — Comments
  comments: [],
  commentsLoading: false,
  commentsPanelOpen: false,

  fetchComments: async (sopId) => {
    set({ commentsLoading: true });
    try {
      const res = await apiClient.comments.list(sopId);
      set({ comments: res.comments });
    } catch (e) {
      console.error('[fetchComments]', e);
    } finally {
      set({ commentsLoading: false });
    }
  },

  addComment: async (sopId, stepId, body) => {
    const comment = await apiClient.comments.create(sopId, body, stepId);
    set((state) => ({ comments: [...state.comments, comment] }));
  },

  resolveComment: async (commentId) => {
    const updated = await apiClient.comments.resolve(commentId);
    set((state) => ({
      comments: state.comments.map((c) => (c.id === commentId ? updated : c)),
    }));
  },

  deleteComment: async (commentId) => {
    await apiClient.comments.remove(commentId);
    set((state) => ({ comments: state.comments.filter((c) => c.id !== commentId) }));
  },

  setCommentsPanelOpen: (open) => set({ commentsPanelOpen: open }),

  // Phase 6 — Notifications
  notifications: [],
  unreadCount: 0,

  fetchNotifications: async () => {
    try {
      const res = await apiClient.notifications.list();
      set({ notifications: res.notifications, unreadCount: res.unreadCount });
    } catch (e) {
      console.error('[fetchNotifications]', e);
    }
  },

  markNotificationRead: async (notifId) => {
    await apiClient.notifications.markRead(notifId);
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === notifId ? { ...n, readAt: Date.now() } : n,
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
  },

  markAllNotificationsRead: async () => {
    await apiClient.notifications.markAllRead();
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, readAt: n.readAt ?? Date.now() })),
      unreadCount: 0,
    }));
  },

  saveStep: async (stepId, updates) => {
    const { session, updateStep } = get();
    if (!session) return;
    const sopId = (session as any).sopId;
    const workspaceId = (session as any).workspaceId;
    if (!sopId || !workspaceId) return;

    await apiClient.request(`/workspaces/${workspaceId}/sops/${sopId}/steps/${stepId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    // Optimistic update in local store
    updateStep(stepId, updates);
  },

  saveAnimationTarget: async (stepId, animationTarget) => {
    const { session, updateStep } = get();
    if (!session) return;
    const sessionId = (session as any).id || (session as any).sessionId;
    const workspaceId = (session as any).workspaceId;
    if (!sessionId || !workspaceId) return;

    // Merge into session metadata.stepOverrides so it survives page refresh
    const existing = (session as any).metadata || {};
    const stepOverrides = { ...(existing.stepOverrides || {}), [stepId]: { animationTarget } };

    await apiClient.request(`/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-workspace-id': workspaceId },
      body: JSON.stringify({ metadata: { ...existing, stepOverrides } }),
    }).catch(err => console.warn('[saveAnimationTarget] PATCH failed:', err));

    // Always apply optimistically so preview reflects the change immediately
    updateStep(stepId, { animationTarget });
  },

  publishSOP: async (sopId, status) => {
    const { session } = get();
    const workspaceId = session?.workspaceId ?? (session as any)?.workspaceId;
    if (!workspaceId) throw new Error('No workspaceId');

    await apiClient.request(`/workspaces/${workspaceId}/sops/${sopId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    set({ sopStatus: status });
  },

  forkSOP: async (sopId) => {
    const { session } = get();
    const workspaceId = (session as any)?.workspaceId;
    if (!workspaceId) throw new Error('No workspaceId');

    const result = await apiClient.request<{ id: string }>(
      `/workspaces/${workspaceId}/sops/${sopId}/fork`,
      { method: 'POST' }
    );
    return result.id;
  },

  shareSession: async () => {
    const { session } = get();
    const sessionId = (session as any)?.sessionId;
    if (!sessionId) throw new Error('No sessionId');

    const result = await apiClient.request<{ shareToken: string; shareUrl: string; isPublic: boolean }>(
      `/sessions/${sessionId}/share`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: true }),
      }
    );
    return { shareUrl: result.shareUrl, shareToken: result.shareToken };
  },
}));

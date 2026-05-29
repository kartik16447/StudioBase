import { create } from 'zustand';
import type { SessionEnvelope, Step } from '../../../shared/types/session';
import { apiClient, type CommentItem, type NotificationItem } from '../lib/apiClient';
import { showToast } from '../components/GlobalToast';

let pipelinePollInterval: ReturnType<typeof setInterval> | null = null;
let audioPollInterval: ReturnType<typeof setInterval> | null = null;
// Per-step debounce timers for annotation backend writes
const annoSaveTimers: Record<string, ReturnType<typeof setTimeout>> = {};

export type RouteName = 'home' | 'studio' | 'sop' | 'share' | 'player' | 'brand' | 'library' | 'shared' | 'recent' | 'templates' | 'knowledge' | 'team' | 'analytics' | 'docs' | 'shared-doc';

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

  // Master compiled audio tracks
  masterAudioUrl: string | null;
  isCompilingAudio: boolean;

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
  setMasterAudioUrl: (url: string | null) => void;
  setCompilingAudio: (compiling: boolean) => void;
  
  // Phase 5 SOP Editor additions
  sopStatus: 'draft' | 'review' | 'published' | null;
  setSopStatus: (status: 'draft' | 'review' | 'published' | null) => void;
  saveStep: (stepId: string, updates: { textOverride?: string; annotations?: any[] }) => Promise<void>;
  saveAnnotations: (stepId: string, annotations: any[]) => void;
  saveAnimationTarget: (stepId: string, animationTarget: any) => Promise<void>;
  saveChapterBreaks: (chapterBreaks: { afterStepId: string; chapterTitle: string }[]) => Promise<void>;
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

  // Phase 7 — Audio (per-step single-step actions)
  audioPollingStepId: string | null;
  generateAudio: (sessionId: string, stepId: string, text: string, language?: string) => Promise<void>;
  revertAudio: (sessionId: string, stepId: string) => Promise<void>;
  pollAudioStatus: (sessionId: string, stepId: string) => Promise<void>;
  patchAudioDuration: (sessionId: string, stepId: string, durationMs: number) => Promise<void>;

  // Phase 7 — Audio (global/centralized bulk narration)
  isAudioGenerating: boolean;
  audioPollingStepIds: string[];
  fetchNarrationStatus: (sessionId: string) => Promise<void>;
  startAudioPolling: (sessionId: string) => void;
  stopAudioPolling: () => void;
  generateAllAudio: (sessionId: string, voiceId: string) => Promise<{ queued: string[]; totalCost: number }>;

  isAiProcessing: boolean;
  triggerPipeline: () => Promise<void>;
  startPipelinePolling: (sessionId: string) => void;
  stopPipelinePolling: () => void;

  // Docs bridge
  pendingDocId: string | null;
  setPendingDocId: (id: string | null) => void;
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
  masterAudioUrl: null,
  isCompilingAudio: false,

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
        // Append a cache-buster so CDN/R2 always returns the latest JSON after
        // pipeline processing writes a new version to the same key.
        const cacheBust = `?t=${Date.now()}`;
        const freshUrl = data.sessionJsonUrl.includes('?')
          ? `${data.sessionJsonUrl}&_cb=${Date.now()}`
          : `${data.sessionJsonUrl}${cacheBust}`;
        console.log('[fetchSession] Fetching full JSON from R2 (cache-busted):', freshUrl);
        const jsonContent = await apiClient.get<any>(freshUrl, { cache: 'no-store' });
        if (jsonContent) {
          // ── Preserve D1 stepOverrides before R2 spread ───────────────────
          // D1 metadata arrives as a JSON string here — parse it first so we
          // can rescue the user's saved stepOverrides before the R2 snapshot
          // (which may carry its own stale `metadata` key) overwrites them.
          let d1StepOverrides: Record<string, any> | undefined;
          try {
            const raw = sessionData.metadata;
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (parsed?.stepOverrides && typeof parsed.stepOverrides === 'object') {
              d1StepOverrides = parsed.stepOverrides;
            }
          } catch {}

          sessionData = { ...sessionData, ...jsonContent, sessionId: data.id || data.sessionId };

          // Restore D1 stepOverrides — they are authoritative for user edits
          if (d1StepOverrides) {
            if (typeof sessionData.metadata === 'string') {
              try { (sessionData as any).metadata = JSON.parse(sessionData.metadata as any); } catch {}
            }
            if (!sessionData.metadata || typeof sessionData.metadata !== 'object') {
              (sessionData as any).metadata = {};
            }
            (sessionData.metadata as any).stepOverrides = d1StepOverrides;
          }
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
      // D1 stores metadata as a JSON string — parse it before touching properties
      if (typeof sessionData.metadata === 'string') {
        try { sessionData.metadata = JSON.parse(sessionData.metadata as any); } catch { sessionData.metadata = null as any; }
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

          // Promote animationTarget: D1 stepOverride wins, then R2 root, then legacy locations
          const rawTarget =
            ((sessionData.metadata as any)?.stepOverrides?.[s.id || `step-${i}`]?.animationTarget)
            || s.animationTarget || content?.animationTarget || s.data?.animationTarget || null;

          // Always clamp zoomScale to [1.0, 1.40] — old pipeline/R2 values can be 2.5
          const ZOOM_MAX = 1.40;
          const ZOOM_MIN = 1.00;
          const animationTarget = rawTarget
            ? { ...rawTarget, zoomScale: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, rawTarget.zoomScale ?? ZOOM_MIN)) }
            : null;

          return {
            ...s,
            ...content, // Flatten the nested JSON blob to root level properties
            timestamp: normalizedTimestamp,
            screenshotKey: s.screenshotKey || content?.screenshotKey || screenshotByIndex.get(i) || null,
            animationTarget,
            id: s.id || `step-${i}`,
            sequence: s.sequence || i + 1,
          };
        });
      }

      // ─── Audio hydration from D1 step_audio ───
      // D1 is authoritative for audio state — merge after step normalization so
      // voiceoverKey is correct before the asset map is built below.
      const stepAudioMap = (data as any).stepAudioMap as Record<string, any> | undefined;
      if (stepAudioMap && sessionData.steps) {
        sessionData.steps = sessionData.steps.map((s: any) => {
          const audio = stepAudioMap[s.id];
          if (!audio) return s;
          return {
            ...s,
            voiceoverKey:          audio.voiceoverKey          ?? s.voiceoverKey,
            originalVoiceoverKey:  audio.originalVoiceoverKey  ?? null,
            syntheticVoiceoverKey: audio.syntheticVoiceoverKey ?? null,
            voiceoverSource:       audio.voiceoverSource       ?? null,
            voiceoverDurationMs:   audio.voiceoverDurationMs   ?? s.voiceoverDurationMs,
            swapVoiceId:           audio.swapVoiceId           ?? null,
            updatedAt:             audio.updatedAt             ?? null,
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
        if (step.voiceoverKey) {
          const t = (step as any).updatedAt || Date.now();
          assets[step.voiceoverKey] = apiClient.getUrl(`/assets/${step.voiceoverKey}?t=${t}`);
        }
        if ((step as any).originalVoiceoverKey) {
          const t = (step as any).updatedAt || Date.now();
          assets[(step as any).originalVoiceoverKey] = apiClient.getUrl(`/assets/${(step as any).originalVoiceoverKey}?t=${t}`);
        }
        if ((step as any).syntheticVoiceoverKey) {
          const t = (step as any).updatedAt || Date.now();
          assets[(step as any).syntheticVoiceoverKey] = apiClient.getUrl(`/assets/${(step as any).syntheticVoiceoverKey}?t=${t}`);
        }
      }
      sessionData.assets = assets;

      const status = (data as any).status ?? null;
      set({ session: sessionData, sessionStatus: status });
      if (sessionData.steps?.length > 0) {
        set({ focusedStepId: sessionData.steps[0].id, focusedStepIndex: 0 });
      }
      // Initialise sopStatus from the backend response (sopStatus lives on the SOP row, not R2 envelope)
      if (data.sopStatus) {
        set({ sopStatus: data.sopStatus as 'draft' | 'review' | 'published' });
      }



      if (status === 'processing') {
        set({ isAiProcessing: true });
        if (!pipelinePollInterval) {
          get().startPipelinePolling(sessionId);
        }
      } else {
        if (status === 'ready' || status === 'failed' || status === 'credit_exhausted') {
          const wasPolling = !!pipelinePollInterval;
          if (wasPolling) {
            get().stopPipelinePolling();
          } else {
            set({ isAiProcessing: false });
          }
          if (wasPolling && status === 'failed') {
            showToast('error', 'AI generation failed — please try again');
          } else if (wasPolling && status === 'credit_exhausted') {
            showToast('error', 'Not enough credits to generate AI content');
          }
        }
      }

      // Auto-resume audio polling if any step is still generating voiceover
      const hasGeneratingAudio = sessionData.steps?.some(
        (s: any) => s.voiceoverSource === 'generating'
      );
      if (hasGeneratingAudio && !audioPollInterval) {
        console.log('[fetchSession] Detected in-progress voiceover generation — resuming audio polling.');
        get().startAudioPolling(sessionId);
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
  setMasterAudioUrl: (url) => set({ masterAudioUrl: url }),
  setCompilingAudio: (compiling) => set({ isCompilingAudio: compiling }),

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

  saveAnnotations: (stepId, annotations) => {
    // Immediate local update
    get().updateStep(stepId, { annotations });

    // Debounced backend write — 500ms after last stroke
    clearTimeout(annoSaveTimers[stepId]);
    annoSaveTimers[stepId] = setTimeout(async () => {
      const { session } = get();
      if (!session) return;
      const sopId = (session as any).sopId;
      const workspaceId = (session as any).workspaceId;
      if (!sopId || !workspaceId) return; // no SOP yet — skip, ephemeral until pipeline runs
      try {
        await apiClient.request(`/workspaces/${workspaceId}/sops/${sopId}/steps/${stepId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ annotations }),
        });
      } catch (err) {
        console.warn('[saveAnnotations] backend write failed:', err);
      }
    }, 500);
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

  saveChapterBreaks: async (chapterBreaks) => {
    const { session } = get();
    if (!session) return;
    const sessionId = (session as any).id || (session as any).sessionId;
    const workspaceId = (session as any).workspaceId;
    if (!sessionId || !workspaceId) return;

    const existing = (session as any).metadata || {};
    const updatedMetadata = { ...existing, chapterBreaks };

    // Update in local store optimistically
    const updatedSession = {
      ...session,
      metadata: updatedMetadata
    };
    set({ session: updatedSession });

    await apiClient.request(`/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-workspace-id': workspaceId },
      body: JSON.stringify({ metadata: updatedMetadata }),
    }).catch(err => console.warn('[saveChapterBreaks] PATCH failed:', err));
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

  // Phase 7 — Audio (per-step)
  audioPollingStepId: null,

  // Phase 7 — Audio (global/centralized)
  isAudioGenerating: false,
  audioPollingStepIds: [],

  generateAudio: async (sessionId, stepId, text, language) => {
    const { updateStep } = get();
    await apiClient.post(`/sessions/${sessionId}/steps/${stepId}/generate-audio`, { text, language });
    updateStep(stepId, {
      voiceoverSource: 'generating',
      voiceoverKey: null,
      voiceoverDurationMs: null,
    } as any);
    set({ audioPollingStepId: stepId });
  },

  revertAudio: async (sessionId, stepId) => {
    const { updateStep } = get();
    const result = await apiClient.post<{ voiceoverKey: string | null; voiceoverSource: string | null }>(
      `/sessions/${sessionId}/steps/${stepId}/revert-audio`,
      {}
    );
    updateStep(stepId, { voiceoverKey: result.voiceoverKey, voiceoverSource: result.voiceoverSource } as any);
  },

  pollAudioStatus: async (sessionId, stepId) => {
    const { updateStep } = get();
    const result = await apiClient.get<{
      voiceoverSource: string | null;
      voiceoverKey: string | null;
      voiceoverDurationMs: number | null;
      updatedAt: number | null;
    }>(`/sessions/${sessionId}/steps/${stepId}/audio-status`);

    if (result.voiceoverSource !== 'generating') {
      console.log(`[useStudioStore][pollAudioStatus] Step ${stepId} completed generating. Source: ${result.voiceoverSource}`);
      set({ audioPollingStepId: null });
      if (result.voiceoverKey) {
        const t = result.updatedAt || Date.now();
        const url = apiClient.getUrl(`/assets/${result.voiceoverKey}?t=${t}`);
        console.log(`[useStudioStore][pollAudioStatus] Resolved asset URL for ${result.voiceoverKey} with cache buster: ${url}`);
        const sess = get().session;
        if (sess) {
          set({ session: { ...sess, assets: { ...sess.assets, [result.voiceoverKey]: url } } });
        }
      }
      updateStep(stepId, {
        voiceoverKey: result.voiceoverKey,
        voiceoverSource: result.voiceoverSource,
        voiceoverDurationMs: result.voiceoverDurationMs,
        updatedAt: result.updatedAt,
      } as any);
    }
  },

  patchAudioDuration: async (sessionId, stepId, durationMs) => {
    await apiClient.patch(`/sessions/${sessionId}/steps/${stepId}/audio-duration`, { durationMs });
    get().updateStep(stepId, { voiceoverDurationMs: durationMs } as any);
  },

  fetchNarrationStatus: async (sessionId) => {
    try {
      const data = await apiClient.get<{ steps: Array<{
        stepId: string;
        voiceoverSource: string | null;
        voiceoverKey: string | null;
        voiceoverDurationMs: number | null;
        originalVoiceoverKey: string | null;
        syntheticVoiceoverKey: string | null;
        swapVoiceId: string | null;
        updatedAt: number | null;
      }> }>(`/sessions/${sessionId}/narration-status`);

      const remoteSteps = data.steps ?? [];

      // Merge into global session store
      const currentSession = get().session;
      if (currentSession?.steps) {
        let changed = false;
        const updatedSteps = currentSession.steps.map((step: any) => {
          const remote = remoteSteps.find(r => r.stepId === step.id);
          if (!remote) return step;
          const differs =
            remote.voiceoverKey !== step.voiceoverKey ||
            remote.voiceoverSource !== step.voiceoverSource ||
            remote.voiceoverDurationMs !== step.voiceoverDurationMs ||
            remote.originalVoiceoverKey !== step.originalVoiceoverKey ||
            remote.updatedAt !== step.updatedAt;
          if (!differs) return step;
          changed = true;
          return {
            ...step,
            voiceoverKey: remote.voiceoverKey,
            voiceoverSource: remote.voiceoverSource,
            voiceoverDurationMs: remote.voiceoverDurationMs,
            originalVoiceoverKey: remote.originalVoiceoverKey,
            syntheticVoiceoverKey: remote.syntheticVoiceoverKey,
            swapVoiceId: remote.swapVoiceId,
            updatedAt: remote.updatedAt,
          };
        });

        if (changed) {
          const updatedAssets = { ...(currentSession.assets ?? {}) };
          for (const step of updatedSteps as any[]) {
            if (step.voiceoverKey) {
              const t = step.updatedAt || Date.now();
              updatedAssets[step.voiceoverKey] = apiClient.getUrl(`/assets/${step.voiceoverKey}?t=${t}`);
            }
            if (step.originalVoiceoverKey) {
              const t = step.updatedAt || Date.now();
              updatedAssets[step.originalVoiceoverKey] = apiClient.getUrl(`/assets/${step.originalVoiceoverKey}?t=${t}`);
            }
            if (step.syntheticVoiceoverKey) {
              const t = step.updatedAt || Date.now();
              updatedAssets[step.syntheticVoiceoverKey] = apiClient.getUrl(`/assets/${step.syntheticVoiceoverKey}?t=${t}`);
            }
          }
          set({
            session: { ...currentSession, steps: updatedSteps, assets: updatedAssets },
          });
        }
      }

      // Update the global polling step IDs
      const stillGenerating = remoteSteps
        .filter(s => s.voiceoverSource === 'generating')
        .map(s => s.stepId);
      set({ audioPollingStepIds: stillGenerating });

      if (stillGenerating.length === 0) {
        console.log('[useStudioStore][fetchNarrationStatus] All steps done generating — stopping audio polling.');
        get().stopAudioPolling();
      } else if (!audioPollInterval) {
        get().startAudioPolling(sessionId);
      }
    } catch (err) {
      console.error('[useStudioStore][fetchNarrationStatus] error:', err);
    }
  },

  startAudioPolling: (sessionId: string) => {
    if (audioPollInterval) {
      clearInterval(audioPollInterval);
      audioPollInterval = null;
    }
    console.log('[useStudioStore][startAudioPolling] Starting background audio polling for', sessionId);
    set({ isAudioGenerating: true });
    audioPollInterval = setInterval(() => {
      get().fetchNarrationStatus(sessionId);
    }, 2500);
  },

  stopAudioPolling: () => {
    if (audioPollInterval) {
      clearInterval(audioPollInterval);
      audioPollInterval = null;
    }
    set({ isAudioGenerating: false, audioPollingStepIds: [] });
  },

  generateAllAudio: async (sessionId, voiceId) => {
    const result = await apiClient.post<{ queued: string[]; totalCost: number }>(
      `/sessions/${sessionId}/generate-narration`,
      { voiceId }
    );
    // Optimistically mark all queued steps as generating in the global store
    const store = get();
    for (const id of result.queued) {
      store.updateStep(id, {
        voiceoverSource: 'generating',
        voiceoverKey: null,
        voiceoverDurationMs: null,
      } as any);
    }
    set({ audioPollingStepIds: result.queued, isAudioGenerating: true });
    get().startAudioPolling(sessionId);
    return result;
  },

  isAiProcessing: false,

  triggerPipeline: async () => {
    const { session, startPipelinePolling } = get();
    if (!session) return;
    const sessionId = session.sessionId;
    // Reset status to 'processing' immediately so the poll loop doesn't see
    // the previous 'ready' status and stop on the very first tick.
    set({ isAiProcessing: true, sessionStatus: 'processing' });
    try {
      const payload = {
        sessionId,
        requestedOutputs: { sop: true },
      };
      console.log('[useStudioStore][triggerPipeline] Sending POST to /pipeline/trigger with payload:', payload);
      await apiClient.post('/pipeline/trigger', payload);
      console.log('[useStudioStore][triggerPipeline] Pipeline triggered successfully. Starting polling...');
      startPipelinePolling(sessionId);
    } catch (err) {
      console.error('[useStudioStore][triggerPipeline] Pipeline trigger failed:', err);
      set({ isAiProcessing: false, sessionStatus: null });
      throw err;
    }
  },

  startPipelinePolling: (sessionId: string) => {
    const { stopPipelinePolling, fetchSession } = get();
    stopPipelinePolling();
    
    console.log('[useStudioStore][startPipelinePolling] Starting background polling for sessionId:', sessionId);
    
    pipelinePollInterval = setInterval(async () => {
      try {
        await fetchSession(sessionId);
        const status = get().sessionStatus;
        console.log('[useStudioStore][polling] sessionStatus:', status);
        if (status === 'ready' || status === 'failed' || status === 'credit_exhausted') {
          console.log('[useStudioStore][polling] Terminal status reached:', status);
          get().stopPipelinePolling();
        }
      } catch (err) {
        console.error('[useStudioStore][polling] Fetch error:', err);
      }
    }, 3000);
  },

  stopPipelinePolling: () => {
    if (pipelinePollInterval) {
      console.log('[useStudioStore][stopPipelinePolling] Stopping background polling...');
      clearInterval(pipelinePollInterval);
      pipelinePollInterval = null;
    }
    set({ isAiProcessing: false });
  },

  // Docs bridge
  pendingDocId: null,
  setPendingDocId: (id) => set({ pendingDocId: id }),
}));

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useStudioStore } from '../store/useStudioStore';
import { I } from '../components/icons';
import { 
  cn, Button, DotGrid, FieldShell, Kbd, SessionCardSkeleton, Card 
} from '../components/ui';
import { SessionCard } from '../components/studio';
import { apiClient } from '../lib/apiClient';
import { showToast } from '../components/GlobalToast';
import { sessionManager } from '../lib/auth/sessionManager';
import type { SessionEnvelope } from '../../../shared/types/session';

interface BackendSession {
  id: string;
  shareToken: string;
  title: string | null;
  status: string;
  errorReason: string | null;
  r2ExportKey: string | null;
  sessionType: 'steps' | 'video';
  createdAt: number;
  capturedUrl: string | null;
  stepCount: number;
  durationMs: number;
  lastEditedBy?: string | null;
  lastEditedAt?: string | null;
}

const EXTENSION_INSTALL_URL = 'YOUR_EXTENSION_URL';

interface OnboardingState {
  onboardingType: 'creator' | 'member';
  completedFirstRecording: number;
  skippedOnboarding: number;
  seededSessionId: string | null;
}

interface Template {
  id: string;
  workspaceId: string | null;
  createdBy: string | null;
  title: string;
  description: string | null;
  category: string;
  isGlobal: number;
  isFeatured: number;
  usageCount: number;
  thumbnailUrl: string | null;
  sessionJsonKey: string;
  createdAt: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  'feature-walkthrough': 'Feature Walkthrough',
  'client-onboarding': 'Client Onboarding',
  'design-handoff': 'Design Handoff',
  'process-runbook': 'Process Runbook',
  'product-demo': 'Product Demo',
  'quick-howto': 'Quick How-To',
};

const CATEGORY_COLORS: Record<string, string> = {
  'feature-walkthrough': 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  'client-onboarding': 'bg-green-500/15 text-green-300 border-green-500/30',
  'design-handoff': 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  'process-runbook': 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  'product-demo': 'bg-pink-500/15 text-pink-300 border-pink-500/30',
  'quick-howto': 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
};

export const HomePage: React.FC = () => {
  const navigate = useStudioStore(state => state.navigate);
  const setSession = useStudioStore(state => state.setSession);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [filter, setFilter] = useState<'all' | 'sop' | 'video'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionEnvelope[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [totalViews, setTotalViews] = useState<number | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const creditsBalance = useStudioStore(s => s.creditsBalance);
  const monthlyAllocation = useStudioStore(s => s.monthlyAllocation);
  const openCreditsModal = useStudioStore(s => s.setCreditsModalOpen);

  const [onboardingTemplates, setOnboardingTemplates] = useState<Template[]>([]);
  const [usingOnboardingTemplate, setUsingOnboardingTemplate] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'sessions' | 'templates'>('sessions');
  const [featuredTemplates, setFeaturedTemplates] = useState<Template[]>([]);
  const [communityTemplates, setCommunityTemplates] = useState<Template[]>([]);
  const [workspaceTemplates, setWorkspaceTemplates] = useState<Template[]>([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateCategory, setTemplateCategory] = useState<string | null>(null);
  const [workspaceRole, setWorkspaceRole] = useState<string | null>(null);
  const [usingTemplate, setUsingTemplate] = useState<string | null>(null);

  const skipOnboarding = async () => {
    await apiClient.patch('/onboarding/state', { skippedOnboarding: true }).catch(() => {});
    setOnboarding(prev => prev ? { ...prev, skippedOnboarding: 1 } : prev);
  };

  useEffect(() => {
    // 1. Initial Session Resolution
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    
    if (urlToken) {
      console.log('🔑 [HomePage] Detected Google token in URL, exchanging for internal JWT...');
      sessionManager.loginWithGoogle(urlToken).then(() => {
        // Remove token from URL to keep it clean
        window.history.replaceState({}, '', window.location.pathname);
        fetchSessions();
      }).catch(() => {
        setError("Failed to authenticate. Please try again.");
        setLoading(false);
      });
    } else {
      fetchSessions();
    }

    async function fetchSessions() {
      if (!sessionManager.isAuthenticated()) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // 1. Ensure we have a valid workspace context
        const workspaces = await sessionManager.syncWorkspaces();
        const workspaceId = sessionManager.getWorkspaceId();

        if (!workspaceId || !workspaces || workspaces.length === 0) {
          setError("No workspaces found. Please create or join a workspace to continue.");
          setLoading(false);
          return;
        }
        
        const [data, analyticsData, onboardingData] = await Promise.all([
          apiClient.get<any>('/sessions'),
          apiClient.get<{ totalViews: number }>('/analytics/workspace').catch(() => null),
          apiClient.get<OnboardingState>('/onboarding/state').catch(() => null),
        ]);
        if (analyticsData?.totalViews !== undefined) setTotalViews(analyticsData.totalViews);
        if (onboardingData) setOnboarding(onboardingData);
        const rawList: BackendSession[] = data.sessions || [];

        // Map backend records to UI SessionEnvelope format
        const mapped: SessionEnvelope[] = rawList.map((s: BackendSession) => ({
          sessionId: s.id,
          schemaVersion: '1.0',
          sessionType: s.sessionType,
          capturedAt: new Date(s.createdAt).toISOString(),
          capturedUrl: s.capturedUrl || '',
          capturedTitle: s.title || 'Untitled Session',
          userAgent: '',
          pipelinePath: 'cloud',
          steps: s.capturedUrl ? [{ url: s.capturedUrl } as any] : [],
          assets: {},
          aiOutputs: {
            title: s.title || 'Untitled Session',
            summary: s.status === 'ready' ? 'Walkthrough ready to view.' : 'Processing...',
            tags: []
          },
          metadata: {
            durationMs: s.durationMs,
            stepCount: s.stepCount,
            // Carry pipeline state for UI wire-up
            pipelineStatus: s.status,
            errorReason: s.errorReason,
            r2ExportKey: s.r2ExportKey,
          },
          lastEditedBy: s.lastEditedBy,
          lastEditedAt: s.lastEditedAt,
        }));
        
        setSessions(mapped);

        // Detect first real recording completion
        if (onboardingData && onboardingData.completedFirstRecording === 0 && onboardingData.skippedOnboarding === 0) {
          const hasRealReady = rawList.some(s => s.status === 'ready' && s.id !== onboardingData.seededSessionId);
          if (hasRealReady) {
            await apiClient.patch('/onboarding/state', { completedFirstRecording: true }).catch(() => {});
            setOnboarding(prev => prev ? { ...prev, completedFirstRecording: 1 } : prev);
          }
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    const handleSync = () => {
      console.log('🔑 [HomePage] SB_TOKEN_UPDATED event received, re-fetching...');
      fetchSessions();
    };

    window.addEventListener('SB_TOKEN_UPDATED', handleSync);
    return () => window.removeEventListener('SB_TOKEN_UPDATED', handleSync);
  }, []);

  useEffect(() => {
    if (activeTab === 'templates') fetchTemplates(templateCategory);
  }, [activeTab, templateCategory]);

  useEffect(() => {
    if (
      !loading &&
      onboarding &&
      onboarding.onboardingType === 'creator' &&
      onboarding.completedFirstRecording === 0 &&
      onboarding.skippedOnboarding === 0 &&
      onboardingTemplates.length === 0
    ) {
      apiClient.get<Template[]>('/templates/featured')
        .then(data => setOnboardingTemplates(Array.isArray(data) ? data.slice(0, 3) : []))
        .catch(() => {});
    }
  }, [loading, onboarding]);

  const filtered = useMemo(() => {
    return sessions.filter(s => {
      if (filter === 'sop' && s.sessionType !== 'steps') return false;
      if (filter === 'video' && s.sessionType !== 'video') return false;
      if (search && !s.aiOutputs.title?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [filter, search, sessions]);

  const fetchTemplates = async (category?: string | null) => {
    setTemplateLoading(true);
    try {
      const [featured, community, workspace, membersData] = await Promise.all([
        apiClient.get<Template[]>('/templates/featured').catch(() => []),
        apiClient.get<Template[]>(`/templates${category ? `?category=${category}` : ''}`).catch(() => []),
        apiClient.get<Template[]>('/templates/workspace').catch(() => []),
        apiClient.get<Array<{ userId: string; role: string }>>('/workspaces/members').catch(() => null),
      ]);
      setFeaturedTemplates(Array.isArray(featured) ? featured : []);
      setCommunityTemplates(Array.isArray(community) ? community : []);
      setWorkspaceTemplates(Array.isArray(workspace) ? workspace : []);
      if (Array.isArray(membersData)) {
        const me = sessionManager.getUser();
        const myMembership = membersData.find((m: any) => m.userId === me?.id);
        if (myMembership) setWorkspaceRole(myMembership.role);
      }
    } finally {
      setTemplateLoading(false);
    }
  };

  const useTemplate = async (templateId: string) => {
    setUsingTemplate(templateId);
    try {
      const result = await apiClient.post<{ sessionId: string }>(`/templates/${templateId}/use`, {});
      setSession(null);
      navigate('studio', { sessionId: result.sessionId });
    } catch (err: any) {
      showToast(err.message || 'Failed to create session from template', 'error');
    } finally {
      setUsingTemplate(null);
    }
  };

  const publishTemplate = async (templateId: string) => {
    try {
      await apiClient.post(`/templates/${templateId}/publish`, {});
      setWorkspaceTemplates(prev => prev.map(t => t.id === templateId ? { ...t, isGlobal: 1 } : t));
      showToast('info', 'Template published to community');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to publish template');
    }
  };

  const openSession = (s: SessionEnvelope) => {
    // Clear any stale session so StudioPage shows "Loading..." while fetchSession runs.
    // Pre-populating with the library card stub (steps: []) triggers the "No steps captured"
    // guard before the real data arrives.
    setSession(null);
    navigate('studio', { sessionId: s.sessionId });
  };

  // Creator onboarding: show welcome card instead of library
  if (
    !loading &&
    onboarding &&
    onboarding.onboardingType === 'creator' &&
    onboarding.completedFirstRecording === 0 &&
    onboarding.skippedOnboarding === 0
  ) {
    return (
      <div className="flex-1 min-h-0 scroll-y bg-bg relative">
        <DotGrid className="!fixed" />
        <div className="max-w-[720px] mx-auto px-6 py-20 relative z-10">
          <div className="rounded-2xl border border-white/10 bg-surface shadow-xl overflow-hidden">
            {/* Placeholder video area */}
            <div className="w-full bg-surface-2 flex items-center justify-center" style={{ aspectRatio: '16/9' }}>
              <div className="text-center px-8">
                <div className="w-16 h-16 rounded-full bg-primary-light flex items-center justify-center mx-auto mb-4">
                  <I.Play size={28} className="text-primary" />
                </div>
                <p className="text-[13px] text-text-2">See IsomerFlow in action — video coming soon</p>
              </div>
            </div>
            <div className="p-10 text-center">
              <h1 className="text-[28px] font-semibold text-text leading-tight tracking-tight mb-3">
                Record once. Get a guide, a video, and an interactive demo — automatically.
              </h1>
              <p className="text-[15px] text-text-2 mb-8 max-w-[500px] mx-auto">
                Install the StudioBase extension, go through any process, and IsomerFlow turns it into a polished walkthrough in minutes.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <a
                  href={EXTENSION_INSTALL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 h-11 rounded-lg bg-primary text-white text-[14px] font-semibold hover:bg-primary/90 transition-colors"
                >
                  <I.Plus size={16} strokeWidth={2.5} /> Install the extension and start recording
                </a>
                {onboarding.seededSessionId && (
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={() => {
                      setSession(null);
                      navigate('studio', { sessionId: onboarding.seededSessionId! });
                    }}
                  >
                    Explore an example first
                  </Button>
                )}
              </div>
              <button
                onClick={skipOnboarding}
                className="mt-6 text-[12.5px] text-text-3 hover:text-text-2 underline underline-offset-2 transition-colors"
              >
                Skip for now
              </button>

              {onboardingTemplates.length > 0 && (
                <div className="mt-10 pt-8 border-t border-border/50 text-left">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-text-3 mb-4 text-center">Or start from a template</p>
                  <div className="grid grid-cols-3 gap-3">
                    {onboardingTemplates.map(t => {
                      const catColor = CATEGORY_COLORS[t.category] ?? 'bg-white/10 text-text-3 border-white/10';
                      const catLabel = CATEGORY_LABELS[t.category] ?? t.category;
                      return (
                        <button
                          key={t.id}
                          disabled={!!usingOnboardingTemplate}
                          onClick={async () => {
                            setUsingOnboardingTemplate(t.id);
                            try {
                              const result = await apiClient.post<{ sessionId: string }>(`/templates/${t.id}/use`, {});
                              setSession(null);
                              navigate('studio', { sessionId: result.sessionId });
                            } catch (err: any) {
                              showToast(err.message || 'Failed to open template', 'error');
                              setUsingOnboardingTemplate(null);
                            }
                          }}
                          className="rounded-xl border border-border bg-surface-2 p-3 text-left hover:border-primary/40 hover:bg-surface transition-colors disabled:opacity-60 disabled:cursor-wait flex flex-col gap-2"
                        >
                          <span className={cn('inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border', catColor)}>
                            {catLabel}
                          </span>
                          <span className="text-[12.5px] font-semibold text-text leading-snug">{t.title}</span>
                          {usingOnboardingTemplate === t.id
                            ? <span className="text-[11px] text-primary">Opening…</span>
                            : <span className="text-[11px] text-primary font-semibold">Use this →</span>
                          }
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Member onboarding: three-step card
  if (
    !loading &&
    onboarding &&
    onboarding.onboardingType === 'member' &&
    onboarding.completedFirstRecording === 0 &&
    onboarding.skippedOnboarding === 0
  ) {
    return (
      <div className="flex-1 min-h-0 scroll-y bg-bg relative">
        <DotGrid className="!fixed" />
        <div className="max-w-[620px] mx-auto px-6 py-20 relative z-10">
          <div className="rounded-2xl border border-white/10 bg-surface shadow-xl p-10 text-center">
            <h1 className="text-[26px] font-semibold text-text leading-tight tracking-tight mb-2">
              Welcome to the workspace
            </h1>
            <p className="text-[14px] text-text-2 mb-10">You're three steps away from your first SOP.</p>
            <div className="flex flex-col gap-5 text-left mb-10">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-primary-light flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-primary text-[12px] font-bold">1</span>
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-text">Install the StudioBase extension</p>
                  <p className="text-[12.5px] text-text-2 mt-0.5">Available in the Chrome Web Store — takes 30 seconds.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-text-2 text-[12px] font-bold">2</span>
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-text">Record any process</p>
                  <p className="text-[12.5px] text-text-2 mt-0.5">Click the extension, go through the steps, click stop.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-text-2 text-[12px] font-bold">3</span>
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-text">Your SOP is ready in minutes</p>
                  <p className="text-[12.5px] text-text-2 mt-0.5">AI writes the narration, you review and publish.</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-3">
              <a
                href={EXTENSION_INSTALL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 h-11 rounded-lg bg-primary text-white text-[14px] font-semibold hover:bg-primary/90 transition-colors"
              >
                <I.Globe size={16} /> Install the extension
              </a>
              <button
                onClick={skipOnboarding}
                className="text-[12.5px] text-text-3 hover:text-text-2 underline underline-offset-2 transition-colors"
              >
                Skip — take me to the workspace
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!sessionManager.isAuthenticated() && !loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-20 text-center">
        <div className="w-16 h-16 rounded-full bg-surface-2 flex items-center justify-center text-text-3 mb-4">
          <I.User size={32} />
        </div>
        <h2 className="text-[22px] font-semibold text-text">Welcome to StudioBase</h2>
        <p className="text-[14px] text-text-2 mt-2 max-w-[320px]">
          Please sign in via the browser extension to view and manage your capture sessions.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 scroll-y bg-bg relative">
      <DotGrid className="!fixed" />
      
      <div className="max-w-[1320px] mx-auto px-10 pt-10 pb-6 relative z-10">
        <div className="flex items-end justify-between mb-1">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary mb-2">
              Welcome back
            </div>
            <h1 className="text-[34px] font-semibold text-text leading-tight tracking-tight">Your library</h1>
            <p className="text-[15px] text-text-2 mt-1.5">
              {loading ? 'Loading your workspace...' : `${sessions.length} sessions · Workspace`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="md" icon={I.Sparkles} onClick={() => setActiveTab('templates')}>Templates</Button>
            <Button variant="primary" size="md" icon={I.Plus} onClick={() => window.open(EXTENSION_INSTALL_URL, '_blank')}>Capture session</Button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-8">
          <StatCard label="Sessions captured" value={sessions.length.toString()} delta="+0 this week" tone="primary" icon={I.FileText} />
          <StatCard label="Total runtime" value="--" delta="across SOPs & videos" icon={I.Clock} />
          <StatCard label="Views this month" value={totalViews !== null ? totalViews.toString() : '--'} delta="↑ 0% vs last" tone="success" icon={I.Eye} />
          <StatCard label="Credits remaining" value={creditsBalance.toString()} delta={`of ${monthlyAllocation} monthly`} icon={I.Zap} onClick={() => openCreditsModal(true)} />
        </div>
      </div>

      {/* Tab bar */}
      <div className="max-w-[1320px] mx-auto px-10 mb-4 relative z-10">
        <div className="flex items-center gap-1 border-b border-border">
          {(['sessions', 'templates'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2.5 text-[13px] font-semibold border-b-2 -mb-px transition-colors',
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-2 hover:text-text'
              )}
            >
              {tab === 'sessions' ? 'Sessions' : 'Templates'}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-[1320px] mx-auto px-10 mb-6 flex items-center gap-3 sticky top-0 z-20 bg-bg/85 backdrop-blur-md py-3 -my-3" style={{ display: activeTab === 'templates' ? 'none' : undefined }}>
        <FieldShell icon={I.Search} className="!h-10 max-w-md flex-1">
          <input
            placeholder="Search sessions, tags, URLs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm"
          />
          <Kbd>⌘K</Kbd>
        </FieldShell>
        <div className="flex items-center bg-surface-2 rounded-pill p-0.5 relative">
          {[
            { id: 'all',   label: 'All' },
            { id: 'sop',   label: 'SOPs' },
            { id: 'video', label: 'Videos' },
          ].map(t => {
            const active = filter === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setFilter(t.id as any)}
                className={cn('relative px-3.5 h-8 rounded-pill text-[12.5px] font-semibold transition-colors', active ? 'text-text' : 'text-text-2')}
              >
                {active && <motion.span layoutId="filter-bg" className="absolute inset-0 bg-white rounded-pill shadow-sm" />}
                <span className="relative">{t.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center bg-surface-2 rounded-pill p-0.5">
          <button onClick={() => setView('grid')} className={cn('w-8 h-8 rounded-pill inline-flex items-center justify-center', view==='grid' ? 'bg-white shadow-sm text-text' : 'text-text-2')}><I.Grid size={14} /></button>
          <button onClick={() => setView('list')} className={cn('w-8 h-8 rounded-pill inline-flex items-center justify-center', view==='list' ? 'bg-white shadow-sm text-text' : 'text-text-2')}><I.List size={14} /></button>
        </div>
        <Button variant="ghost" size="md" icon={I.Filter}>Filter</Button>
      </div>

      {/* ── Templates Gallery ── */}
      {activeTab === 'templates' && (
        <div className="max-w-[1320px] mx-auto px-10 pb-16 relative z-10">
          {templateLoading ? (
            <div className="grid grid-cols-3 gap-6 mt-4">
              {[0,1,2,3,4,5].map(i => <SessionCardSkeleton key={i} />)}
            </div>
          ) : (
            <>
              {/* Featured */}
              <div className="mb-10">
                <div className="flex items-center gap-2 mb-4">
                  <I.Sparkles size={15} className="text-primary" />
                  <h2 className="text-[15px] font-semibold text-text">Featured templates</h2>
                </div>
                <div className="grid grid-cols-3 gap-5">
                  {featuredTemplates.map(t => (
                    <TemplateCard
                      key={t.id}
                      template={t}
                      onUse={() => useTemplate(t.id)}
                      loading={usingTemplate === t.id}
                    />
                  ))}
                </div>
              </div>

              {/* Workspace templates */}
              {workspaceTemplates.length > 0 && (
                <div className="mb-10">
                  <div className="flex items-center gap-2 mb-4">
                    <I.FolderOpen size={15} className="text-text-2" />
                    <h2 className="text-[15px] font-semibold text-text">Your workspace templates</h2>
                  </div>
                  <div className="grid grid-cols-3 gap-5">
                    {workspaceTemplates.map(t => (
                      <TemplateCard
                        key={t.id}
                        template={t}
                        onUse={() => useTemplate(t.id)}
                        loading={usingTemplate === t.id}
                        onPublish={
                          (workspaceRole === 'Admin' || workspaceRole === 'Owner') && !t.isGlobal
                            ? () => publishTemplate(t.id)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Community */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <I.Globe size={15} className="text-text-2" />
                    <h2 className="text-[15px] font-semibold text-text">Community templates</h2>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setTemplateCategory(null)}
                      className={cn('px-3 h-7 rounded-full text-[11.5px] font-semibold border transition-colors',
                        templateCategory === null
                          ? 'bg-primary text-white border-primary'
                          : 'border-border text-text-2 hover:text-text'
                      )}
                    >All</button>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <button
                        key={k}
                        onClick={() => setTemplateCategory(k)}
                        className={cn('px-3 h-7 rounded-full text-[11.5px] font-semibold border transition-colors',
                          templateCategory === k
                            ? 'bg-primary text-white border-primary'
                            : 'border-border text-text-2 hover:text-text'
                        )}
                      >{v}</button>
                    ))}
                  </div>
                </div>
                {communityTemplates.length === 0 ? (
                  <div className="text-center py-16 text-text-3 text-[13px]">No templates in this category yet.</div>
                ) : (
                  <div className="grid grid-cols-3 gap-5">
                    {communityTemplates.map(t => (
                      <TemplateCard
                        key={t.id}
                        template={t}
                        onUse={() => useTemplate(t.id)}
                        loading={usingTemplate === t.id}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Session Library ── */}
      {activeTab === 'sessions' && <div className="max-w-[1320px] mx-auto px-10 pb-16 relative z-10">
        {error && (
          <div className="mb-6 p-4 rounded-sm bg-danger/10 border border-danger/20 text-danger text-sm flex items-center gap-2">
            <I.X size={16} /> {error}
          </div>
        )}

        {creditsBalance < monthlyAllocation * 0.2 && (
          <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-lg bg-yellow-500/8 border border-yellow-500/20 text-[13px]">
            <I.Zap size={15} className="text-yellow-600 shrink-0" />
            <span className="text-yellow-800">
              You have <strong>{creditsBalance}</strong> credit{creditsBalance !== 1 ? 's' : ''} remaining.{' '}
              <button
                onClick={() => openCreditsModal(true)}
                className="underline underline-offset-2 font-semibold hover:text-yellow-900 transition-colors"
              >
                Add more to keep generating.
              </button>
            </span>
          </div>
        )}

        <div className={cn('grid gap-6', view === 'grid' ? 'grid-cols-3' : 'grid-cols-1')}>
          {loading ? (
            <>
              {[0,1,2,3,4,5].map(i => <SessionCardSkeleton key={i} />)}
            </>
          ) : (
              <>
                <NewSessionCard onClick={() => window.open(EXTENSION_INSTALL_URL, '_blank')} />
                {filtered.map(s => {
                  const meta = s.metadata as any;
                  const status: string = meta?.pipelineStatus || 'draft';
                  const errorReason: string | null = meta?.errorReason || null;
                  const r2ExportKey: string | null = meta?.r2ExportKey || null;
                  return (
                    <div key={s.sessionId} className="flex flex-col gap-1">
                      <SessionCard
                        session={s}
                        onClick={() => openSession(s)}
                        onDelete={async () => {
                          try {
                            await apiClient.delete(`/sessions/${s.sessionId}`);
                            setSessions(prev => prev.filter(x => x.sessionId !== s.sessionId));
                          } catch (err) {
                            console.error('[onDelete] failed:', err);
                          }
                        }}
                        onRename={async (newTitle) => {
                          try {
                            await apiClient.patch(`/sessions/${s.sessionId}`, { title: newTitle });
                            setSessions(prev => prev.map(x =>
                              x.sessionId === s.sessionId
                                ? { ...x, aiOutputs: { ...x.aiOutputs, title: newTitle }, capturedTitle: newTitle }
                                : x
                            ));
                          } catch (err) {
                            console.error('[onRename] failed:', err);
                          }
                        }}
                      />
                      {/* Pipeline Status Strip */}
                      <div className="flex items-center justify-between px-3 py-1.5 rounded-b-sm bg-surface border border-white/5 border-t-0 -mt-1">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                            status === 'ready' ? 'bg-green-500/15 text-green-300 border-green-500/30' :
                            status === 'processing' ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' :
                            status === 'queued' ? 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' :
                            status === 'failed' ? 'bg-red-500/15 text-red-300 border-red-500/30' :
                            'bg-white/10 text-text-3 border-white/10'
                          )}>
                            {status.toUpperCase()}
                          </span>
                          {status === 'failed' && errorReason && (
                            <span className="text-[11px] text-red-300 truncate max-w-[180px]" title={errorReason}>
                              {errorReason}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {r2ExportKey && (
                            <a
                              href={apiClient.getUrl(`/assets/${encodeURIComponent(r2ExportKey)}`)}
                              className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <I.Download size={12} /> Download
                            </a>
                          )}
                          {status === 'failed' && (
                            <button
                              className="flex items-center gap-1 text-[11px] font-semibold text-yellow-300 hover:text-yellow-200 transition-colors"
                              onClick={async () => {
                                try {
                                  await apiClient.post(`/pipeline/trigger`, { sessionId: s.sessionId });
                                  setSessions(prev => prev.map(x =>
                                    x.sessionId === s.sessionId
                                      ? { ...x, metadata: { ...x.metadata, pipelineStatus: 'queued', errorReason: null } }
                                      : x
                                  ));
                                } catch (err) {
                                  console.error('[Retry] failed:', err);
                                }
                              }}
                            >
                              <I.RefreshCw size={12} /> Retry
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
          )}
        </div>

        {!loading && filtered.length === 0 && !error && (
          <div className="text-center py-24">
            <div className="w-16 h-16 rounded-full bg-surface-2 flex items-center justify-center text-text-3 mx-auto mb-6">
              <I.Library size={32} />
            </div>
            <h2 className="text-[20px] font-semibold text-text">No sessions found</h2>
            <p className="text-[14px] text-text-2 mt-2 max-w-[320px] mx-auto">
              {search || filter !== 'all' 
                ? "No sessions match your current filters. Try clearing your search or filter."
                : "Your library is empty. Start a capture session via the extension or load some samples to explore."}
            </p>
            <div className="flex items-center justify-center gap-3 mt-8">
              {search || filter !== 'all' ? (
                <Button variant="ghost" size="md" onClick={() => { setSearch(''); setFilter('all'); }}>Clear filters</Button>
              ) : (
                <>
                  <a
                    href={EXTENSION_INSTALL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 h-9 rounded-lg bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 transition-colors"
                  >
                    <I.Plus size={15} strokeWidth={2.4} /> Capture first session
                  </a>
                  <Button
                    variant="ghost"
                    size="md"
                    icon={I.Sparkles}
                    onClick={() => {
                      import('../data/sample').then(m => setSessions(m.SAMPLE_SESSIONS as any));
                    }}
                  >
                    Load samples
                  </Button>
                  <p className="text-[11.5px] text-text-3 mt-1">
                    Opens Chrome Web Store — install the extension to start capturing.
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>}
    </div>
  );
};

interface TemplatCardProps {
  template: Template;
  onUse: () => void;
  loading?: boolean;
  onPublish?: () => void;
}

const TemplateCard: React.FC<TemplatCardProps> = ({ template, onUse, loading, onPublish }) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const catColor = CATEGORY_COLORS[template.category] ?? 'bg-white/10 text-text-3 border-white/10';
  const catLabel = CATEGORY_LABELS[template.category] ?? template.category;
  return (
    <div className="rounded-xl border border-border bg-surface flex flex-col overflow-hidden hover:border-border/80 transition-colors">
      {/* Thumbnail placeholder */}
      <div className="w-full bg-surface-2 flex items-center justify-center" style={{ aspectRatio: '16/9' }}>
        {template.thumbnailUrl
          ? <img src={template.thumbnailUrl} alt="" className="w-full h-full object-cover" />
          : <I.FileText size={28} className="text-text-3" />
        }
      </div>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <span className={cn('inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border mb-1.5', catColor)}>
              {catLabel}
            </span>
            <div className="text-[13px] font-semibold text-text leading-snug">{template.title}</div>
          </div>
          {onPublish && (
            <div className="relative shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(m => !m); }}
                className="w-7 h-7 rounded-md flex items-center justify-center text-text-3 hover:bg-surface-2 hover:text-text transition-colors"
              >
                <I.MoreHorizontal size={15} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-8 z-40 w-44 bg-surface border border-border rounded-lg shadow-xl py-1">
                    <button
                      className="w-full text-left px-3 py-2 text-[12.5px] text-text hover:bg-surface-2 transition-colors flex items-center gap-2"
                      onClick={() => { setMenuOpen(false); onPublish(); }}
                    >
                      <I.Globe size={13} /> Publish to community
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {template.description && (
          <p className="text-[12px] text-text-2 leading-relaxed line-clamp-2">{template.description}</p>
        )}
        <div className="flex items-center justify-between mt-auto pt-2">
          <span className="text-[11px] text-text-3 flex items-center gap-1">
            <I.Users size={11} /> {template.usageCount.toLocaleString()} uses
          </span>
          <button
            onClick={onUse}
            disabled={!!loading}
            className="h-7 px-3 rounded-lg bg-primary text-white text-[12px] font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            {loading ? 'Opening…' : 'Use this template'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface StatCardProps {
  label: string;
  value: string;
  delta: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  tone?: 'primary' | 'success' | 'neutral';
  onClick?: () => void;
}

const StatCard: React.FC<StatCardProps> = ({
  label, value, delta, icon: Icon, tone = 'neutral', onClick
}) => {
  const accent = {
    primary: 'text-primary bg-primary-light',
    success: 'text-[#1B7F3B] bg-[#E5F8EC]',
    neutral: 'text-text-2 bg-surface-2',
  }[tone];
  return (
    <Card className={cn('p-5', onClick && 'cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all')} onClick={onClick}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11.5px] font-semibold uppercase tracking-wider text-text-2">{label}</span>
        <span className={cn('w-7 h-7 rounded-full inline-flex items-center justify-center', accent)}>
          <Icon size={13} strokeWidth={2} />
        </span>
      </div>
      <div className="text-[28px] font-semibold text-text leading-none tracking-tight tabular-nums">{value}</div>
      <div className="mt-1.5 text-[12px] text-text-2">{delta}{onClick && <span className="ml-2 text-primary font-semibold">Get more →</span>}</div>
    </Card>
  );
};

const NewSessionCard: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="grad-border min-h-[280px] cursor-pointer flex items-center justify-center hover:-translate-y-1 transition-transform group text-left w-full"
    >
      <div className="flex flex-col items-center text-center p-8">
        <div className="w-14 h-14 rounded-full bg-primary-light flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
          <I.Plus size={22} className="text-primary" strokeWidth={2.4} />
        </div>
        <h3 className="text-[15px] font-semibold text-text mb-1">New session</h3>
        <p className="text-[12.5px] text-text-2 leading-snug max-w-[200px]">
          Start the recorder in your browser to capture a new walkthrough.
        </p>
      </div>
    </button>
  );
};

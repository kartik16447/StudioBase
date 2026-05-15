import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useStudioStore } from '../store/useStudioStore';
import { I } from '../components/icons';
import { 
  cn, Button, DotGrid, FieldShell, Kbd, SessionCardSkeleton, Card 
} from '../components/ui';
import { SessionCard } from '../components/studio';
import { apiClient } from '../lib/apiClient';
import { sessionManager } from '../lib/auth/sessionManager';
import type { SessionEnvelope } from '../../../shared/types/session';

interface BackendSession {
  id: string;
  shareToken: string;
  title: string | null;
  status: string;
  sessionType: 'steps' | 'video';
  createdAt: number;
  capturedUrl: string | null;
  stepCount: number;
  durationMs: number;
}

export const HomePage: React.FC = () => {
  const navigate = useStudioStore(state => state.navigate);
  const setSession = useStudioStore(state => state.setSession);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [filter, setFilter] = useState<'all' | 'sop' | 'video'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionEnvelope[]>([]);
  const [error, setError] = useState<string | null>(null);

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
        
        const data = await apiClient.get<any>('/sessions');

        // Map backend records to UI SessionEnvelope format
        const mapped: SessionEnvelope[] = data.sessions.map((s: BackendSession) => ({
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
            stepCount: s.stepCount
          }
        }));
        
        setSessions(mapped);
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

  const filtered = useMemo(() => {
    return sessions.filter(s => {
      if (filter === 'sop' && s.sessionType !== 'steps') return false;
      if (filter === 'video' && s.sessionType !== 'video') return false;
      if (search && !s.aiOutputs.title?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [filter, search, sessions]);

  const openSession = (s: SessionEnvelope) => {
    setSession(s);
    navigate('studio', { sessionId: s.sessionId });
  };

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
            <Button variant="ghost" size="md" icon={I.Sparkles}>New from template</Button>
            <Button variant="primary" size="md" icon={I.Plus} onClick={() => alert('Start capture from the StudioBase extension.')}>Capture session</Button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-8">
          <StatCard label="Sessions captured" value={sessions.length.toString()} delta="+0 this week" tone="primary" icon={I.FileText} />
          <StatCard label="Total runtime" value="--" delta="across SOPs & videos" icon={I.Clock} />
          <StatCard label="Views this month" value="0" delta="↑ 0% vs last" tone="success" icon={I.Eye} />
          <StatCard label="Credits remaining" value="--" delta="of 500 monthly" icon={I.Zap} />
        </div>
      </div>

      <div className="max-w-[1320px] mx-auto px-10 mb-6 flex items-center gap-3 sticky top-0 z-20 bg-bg/85 backdrop-blur-md py-3 -my-3">
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

      <div className="max-w-[1320px] mx-auto px-10 pb-16 relative z-10">
        {error && (
          <div className="mb-6 p-4 rounded-sm bg-danger/10 border border-danger/20 text-danger text-sm flex items-center gap-2">
            <I.X size={16} /> {error}
          </div>
        )}

        <div className={cn('grid gap-6', view === 'grid' ? 'grid-cols-3' : 'grid-cols-1')}>
          {loading ? (
            <>
              {[0,1,2,3,4,5].map(i => <SessionCardSkeleton key={i} />)}
            </>
          ) : (
            <>
              <NewSessionCard onClick={() => alert('Open browser extension to start a capture session.')} />
              {filtered.map(s => (
                <SessionCard 
                  key={s.sessionId} 
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
              ))}
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
                  <Button variant="primary" size="md" icon={I.Plus} onClick={() => alert('Start capture from the StudioBase extension.')}>Capture first session</Button>
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
                </>
              )}
            </div>
          </div>
        )}
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
}

const StatCard: React.FC<StatCardProps> = ({ 
  label, value, delta, icon: Icon, tone = 'neutral' 
}) => {
  const accent = {
    primary: 'text-primary bg-primary-light',
    success: 'text-[#1B7F3B] bg-[#E5F8EC]',
    neutral: 'text-text-2 bg-surface-2',
  }[tone];
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11.5px] font-semibold uppercase tracking-wider text-text-2">{label}</span>
        <span className={cn('w-7 h-7 rounded-full inline-flex items-center justify-center', accent)}>
          <Icon size={13} strokeWidth={2} />
        </span>
      </div>
      <div className="text-[28px] font-semibold text-text leading-none tracking-tight tabular-nums">{value}</div>
      <div className="mt-1.5 text-[12px] text-text-2">{delta}</div>
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

import React, { useEffect, useState, useCallback } from 'react';
import { apiClient } from '../lib/apiClient';
import { useStudioStore } from '../store/useStudioStore';
import { I } from '../components/icons';
import { cn } from '../components/ui';

interface SOPEntry {
  sessionId: string;
  title: string | null;
  capturedTitle: string | null;
  capturedUrl: string | null;
  shareToken: string | null;
  isPublic: number;
  sopId: string;
  status: string;
  updatedAt: number;
  stepCount: number;
}

export const KnowledgeBasePage: React.FC = () => {
  const navigate = useStudioStore(s => s.navigate);
  const [sops, setSops] = useState<SOPEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);

  const load = useCallback(async (query: string) => {
    setSearching(true);
    try {
      const params = query ? `?q=${encodeURIComponent(query)}` : '';
      const data = await apiClient.get<{ sops: SOPEntry[] }>(`/knowledge${params}`);
      setSops(data.sops);
    } catch {
      setSops([]);
    } finally {
      setLoading(false);
      setSearching(false);
    }
  }, []);

  useEffect(() => { load(''); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q, load]);

  const displayTitle = (s: SOPEntry) => s.title || s.capturedTitle || 'Untitled SOP';

  const domain = (url: string | null) => {
    if (!url) return null;
    try { return new URL(url).hostname.replace('www.', ''); } catch { return null; }
  };

  return (
    <div className="min-h-screen bg-background px-6 py-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text mb-1">Knowledge Base</h1>
        <p className="text-text-3 text-sm">Published SOPs your team can reference and share.</p>
      </div>

      {/* Search */}
      <div className="relative mb-8">
        <I.Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3" />
        <input
          type="text"
          placeholder="Search by title, URL, or step content…"
          value={q}
          onChange={e => setQ(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-surface border border-border text-sm text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {searching && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 rounded-xl bg-surface animate-pulse" />
          ))}
        </div>
      ) : sops.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <I.Bookmark size={32} className="text-text-3" />
          <p className="text-text-2 font-medium">{q ? 'No SOPs match your search' : 'No published SOPs yet'}</p>
          <p className="text-text-3 text-sm max-w-xs">
            {q ? 'Try a different keyword.' : 'Publish a SOP from the studio to see it here.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sops.map(s => (
            <button
              key={s.sopId}
              onClick={() => navigate('studio', { sessionId: s.sessionId })}
              className={cn(
                'group text-left rounded-xl border border-border bg-surface p-5',
                'hover:border-primary/40 hover:bg-surface-2 transition-all duration-150',
                'flex flex-col gap-3'
              )}
            >
              {/* Icon + title */}
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <I.FileText size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-text truncate group-hover:text-primary transition-colors">
                    {displayTitle(s)}
                  </div>
                  {domain(s.capturedUrl) && (
                    <div className="text-[11px] text-text-3 truncate mt-0.5">{domain(s.capturedUrl)}</div>
                  )}
                </div>
              </div>

              {/* Meta */}
              <div className="flex items-center gap-3 text-[11px] text-text-3">
                <span className="flex items-center gap-1">
                  <I.Layers size={11} /> {s.stepCount} steps
                </span>
                <span>·</span>
                <span>{new Date(s.updatedAt).toLocaleDateString()}</span>
                {s.shareToken && s.isPublic ? (
                  <>
                    <span>·</span>
                    <span className="text-green-400 flex items-center gap-1"><I.Share2 size={11} /> Shared</span>
                  </>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

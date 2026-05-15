import React, { useEffect, useState, useCallback } from 'react';
import { apiClient } from '../lib/apiClient';
import { I } from '../components/icons';
import { cn } from '../components/ui';

interface AuditEntry {
  id: string;
  timestamp: number;
  actorId: string;
  action: string;
  targetId: string;
  metadata: string;
  workspaceId: string;
}

const PAGE_LIMIT = 20;

export const AuditLogPage: React.FC = () => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [actorId, setActorId] = useState('');
  const [hasMore, setHasMore] = useState(false);

  const fetchLogs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(PAGE_LIMIT + 1), offset: String(offset) });
    if (startDate) params.set('startDate', String(new Date(startDate).getTime()));
    if (endDate) params.set('endDate', String(new Date(endDate).getTime()));
    if (actorId.trim()) params.set('actorId', actorId.trim());

    apiClient.get<{ data: AuditEntry[] }>(`/audit-logs?${params}`)
      .then(res => {
        const rows = res.data || [];
        setHasMore(rows.length > PAGE_LIMIT);
        setEntries(rows.slice(0, PAGE_LIMIT));
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [offset, startDate, endDate, actorId]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const fmtDate = (ts: number) => new Date(ts).toLocaleString();

  return (
    <div className="flex-1 scroll-y px-10 py-10 max-w-[1200px] mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <I.Shield size={18} className="text-primary" />
          <h1 className="text-[26px] font-semibold text-text tracking-tight">Audit Logs</h1>
        </div>
        <p className="text-[14px] text-text-2">Workspace activity log. Only visible to workspace admins.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-6 bg-surface border border-white/5 rounded-lg p-4">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase text-text-3 tracking-wider">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={e => { setStartDate(e.target.value); setOffset(0); }}
            className="bg-surface-2 border border-white/10 rounded-sm px-3 h-9 text-sm text-text outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase text-text-3 tracking-wider">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={e => { setEndDate(e.target.value); setOffset(0); }}
            className="bg-surface-2 border border-white/10 rounded-sm px-3 h-9 text-sm text-text outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase text-text-3 tracking-wider">Actor ID</label>
          <input
            placeholder="Filter by user ID"
            value={actorId}
            onChange={e => { setActorId(e.target.value); setOffset(0); }}
            className="bg-surface-2 border border-white/10 rounded-sm px-3 h-9 text-sm text-text outline-none w-48"
          />
        </div>
        <button
          onClick={() => { setStartDate(''); setEndDate(''); setActorId(''); setOffset(0); }}
          className="h-9 px-4 text-sm text-text-3 hover:text-text border border-white/10 rounded-sm transition-colors"
        >
          Reset
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 text-red-300 rounded-lg text-sm flex items-center gap-2">
          <I.AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-surface border border-white/5 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-3">Timestamp</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-3">Actor</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-3">Action</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-3">Target</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-3">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-text-3">
                <I.Loader size={16} className="animate-spin inline mr-2" />Loading...
              </td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-text-3">No audit entries found.</td></tr>
            ) : entries.map(e => (
              <tr key={e.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3 text-text-3 text-[12px] whitespace-nowrap">{fmtDate(e.timestamp)}</td>
                <td className="px-4 py-3 text-text font-mono text-[12px] max-w-[140px] truncate">{e.actorId}</td>
                <td className="px-4 py-3">
                  <span className={cn(
                    'text-[11px] font-semibold px-2 py-0.5 rounded-full',
                    e.action.includes('fail') || e.action.includes('denied') 
                      ? 'bg-red-500/15 text-red-300' 
                      : e.action.includes('admin') || e.action.includes('delete')
                        ? 'bg-yellow-500/15 text-yellow-300'
                        : 'bg-primary/15 text-primary'
                  )}>
                    {e.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-2 font-mono text-[12px] max-w-[160px] truncate">{e.targetId || '—'}</td>
                <td className="px-4 py-3 text-text-3 text-[12px] max-w-[200px] truncate">
                  {e.metadata ? JSON.stringify(e.metadata) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <span className="text-[12px] text-text-3">
          Showing {offset + 1}–{offset + entries.length}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - PAGE_LIMIT))}
            disabled={offset === 0}
            className="h-8 px-4 text-sm border border-white/10 rounded-sm disabled:opacity-30 text-text-2 hover:text-text transition-colors"
          >
            Previous
          </button>
          <button
            onClick={() => setOffset(offset + PAGE_LIMIT)}
            disabled={!hasMore}
            className="h-8 px-4 text-sm border border-white/10 rounded-sm disabled:opacity-30 text-text-2 hover:text-text transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

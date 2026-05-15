import React, { useEffect, useState } from 'react';
import { apiClient } from '../lib/apiClient';
import { I } from '../components/icons';
import { cn } from '../components/ui';

interface SessionRow {
  id: string;
  title: string | null;
  status: string;
  errorReason: string | null;
  r2ExportKey: string | null;
  createdAt: number;
}

interface AuditEntry {
  id: string;
  timestamp: number;
  actorId: string;
  action: string;
}

interface UsageData {
  totalSessions: number;
  totalAssets: number;
  storageBytes: number;
}

const STATUS_BADGE: Record<string, string> = {
  ready: 'bg-green-500/20 text-green-300 border-green-500/30',
  processing: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  queued: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  failed: 'bg-red-500/20 text-red-300 border-red-500/30',
  draft: 'bg-white/10 text-text-3 border-white/10',
};

export const AdminDiagnosticsPage: React.FC = () => {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      apiClient.get<{ sessions: SessionRow[] }>('/sessions?limit=20'),
      apiClient.get<{ data: AuditEntry[] }>('/audit-logs?limit=10'),
      apiClient.get<UsageData>('/usage/metrics'),
    ]).then(([sessionsRes, auditRes, usageRes]) => {
      if (sessionsRes.status === 'fulfilled') setSessions(sessionsRes.value.sessions || []);
      if (auditRes.status === 'fulfilled') setAuditLogs(auditRes.value.data || []);
      if (usageRes.status === 'fulfilled') setUsage(usageRes.value);
    }).finally(() => setLoading(false));
  }, []);

  const isDev = import.meta.env.VITE_DEV_MODE === 'true';
  if (!isDev) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-3">
        <I.Lock size={20} className="mr-2" /> Diagnostics only available in dev mode.
      </div>
    );
  }

  return (
    <div className="flex-1 scroll-y px-10 py-10 max-w-[1200px] mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <span className="px-2 py-0.5 text-[10px] font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 rounded-full uppercase tracking-wider">Dev Only</span>
          <h1 className="text-[26px] font-semibold text-text tracking-tight">Internal Diagnostics</h1>
        </div>
        <p className="text-[14px] text-text-2">Live QA dashboard for verifying all backend phases.</p>
      </div>

      {loading && <div className="text-text-3 flex items-center gap-2"><I.Loader size={16} className="animate-spin" /> Loading diagnostics...</div>}

      {/* Usage Stats */}
      {usage && (
        <section className="mb-8 grid grid-cols-3 gap-4">
          {[
            { label: 'Total Sessions', value: usage.totalSessions ?? '—', icon: I.FileText },
            { label: 'Total Assets', value: usage.totalAssets ?? '—', icon: I.Database },
            { label: 'Storage', value: usage.storageBytes ? `${(usage.storageBytes / 1024 / 1024).toFixed(1)} MB` : '—', icon: I.HardDrive },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-surface border border-white/5 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2 text-text-3">
                <Icon size={14} />
                <span className="text-[11px] uppercase tracking-wider font-semibold">{label}</span>
              </div>
              <div className="text-[28px] font-bold text-text tabular-nums">{String(value)}</div>
            </div>
          ))}
        </section>
      )}

      {/* Session Pipeline Statuses */}
      <section className="mb-8">
        <h2 className="text-[14px] font-semibold text-text mb-3 flex items-center gap-2">
          <I.Activity size={14} className="text-primary" /> Recent Session Pipeline Statuses
        </h2>
        <div className="bg-surface border border-white/5 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-3">Session ID</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-3">Title</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-3">Status</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-3">R2 Export</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {sessions.slice(0, 10).map(s => (
                <tr key={s.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 text-text-3 font-mono text-[11px] max-w-[100px] truncate">{s.id}</td>
                  <td className="px-4 py-2.5 text-text-2 text-[12px] max-w-[180px] truncate">{s.title || 'Untitled'}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border', STATUS_BADGE[s.status] || STATUS_BADGE.draft)}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-text-3">{s.r2ExportKey ? '✅' : '—'}</td>
                  <td className="px-4 py-2.5 text-red-300 text-[11px] max-w-[200px] truncate">{s.errorReason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent Audit Logs */}
      <section>
        <h2 className="text-[14px] font-semibold text-text mb-3 flex items-center gap-2">
          <I.ClipboardList size={14} className="text-primary" /> Recent Audit Entries (last 10)
        </h2>
        <div className="bg-surface border border-white/5 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-3">Timestamp</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-3">Actor</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-text-3 text-[12px]">No audit logs (admin permission required)</td></tr>
              ) : auditLogs.map(e => (
                <tr key={e.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 text-text-3 text-[12px]">{new Date(e.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-text font-mono text-[11px] max-w-[160px] truncate">{e.actorId}</td>
                  <td className="px-4 py-2.5 text-[11px] text-primary">{e.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

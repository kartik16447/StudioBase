import React, { useEffect, useState } from 'react';
import { apiClient } from '../lib/apiClient';
import { I } from '../components/icons';
import { cn } from '../components/ui';
import { showToast } from '../components/GlobalToast';

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

interface CreditMember {
  id: string;
  name: string;
  email: string;
  creditsBalance: number;
  creditsSpent: number;
  creditsAdded: number;
}

interface CreditLedger {
  totalSpent: number;
  totalBalance: number;
  members: CreditMember[];
}

interface AccessRequest {
  id: string;
  userId: string;
  createdAt: number;
  metadata: string;
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
  const [credits, setCredits] = useState<CreditLedger | null>(null);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    setLoading(true);
    Promise.allSettled([
      apiClient.get<{ sessions: SessionRow[] }>('/sessions?limit=20'),
      apiClient.get<{ data: AuditEntry[] }>('/audit-logs?limit=10'),
      apiClient.get<UsageData>('/usage/metrics'),
      apiClient.get<CreditLedger>('/usage/credits'),
      apiClient.get<{ notifications: AccessRequest[] }>('/notifications?type=format.access_requested'),
    ]).then(([sessionsRes, auditRes, usageRes, creditsRes, accessRes]) => {
      if (sessionsRes.status === 'fulfilled') setSessions(sessionsRes.value.sessions || []);
      if (auditRes.status === 'fulfilled') setAuditLogs(auditRes.value.data || []);
      if (usageRes.status === 'fulfilled') setUsage(usageRes.value);
      if (creditsRes.status === 'fulfilled') setCredits(creditsRes.value);
      if (accessRes.status === 'fulfilled') {
        const all = accessRes.value.notifications || [];
        setAccessRequests(all.filter((n: any) => n.type === 'format.access_requested'));
      }
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const approveAccess = async (req: AccessRequest) => {
    let meta: any = {};
    try { meta = JSON.parse(req.metadata); } catch {}
    const { sessionId } = meta;
    if (!sessionId) return;
    setApprovingId(req.id);
    try {
      // Grant 1 credit to the requester (userId = notification.userId = workspace owner who owns the session)
      // Actually the userId on the notification is the session owner. The requester is in metadata.
      // We just mark the notification read as an acknowledgement.
      await apiClient.request(`/notifications/${req.id}/read`, { method: 'POST' });
      showToast('success', 'Access request acknowledged.');
      setAccessRequests(prev => prev.filter(r => r.id !== req.id));
    } catch {
      showToast('error', 'Failed to process.');
    } finally {
      setApprovingId(null);
    }
  };

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

      {/* Credit Ledger */}
      {credits && (
        <section className="mb-8">
          <h2 className="text-[14px] font-semibold text-text mb-3 flex items-center gap-2">
            <I.Zap size={14} className="text-primary" /> Credit Ledger
          </h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-surface border border-white/5 rounded-lg p-4">
              <p className="text-[11px] uppercase tracking-wider text-text-3 mb-1">Total Spent (workspace)</p>
              <p className="text-[24px] font-bold text-amber-400 tabular-nums">{credits.totalSpent} cr</p>
            </div>
            <div className="bg-surface border border-white/5 rounded-lg p-4">
              <p className="text-[11px] uppercase tracking-wider text-text-3 mb-1">Total Remaining (all members)</p>
              <p className="text-[24px] font-bold text-green-400 tabular-nums">{credits.totalBalance} cr</p>
            </div>
          </div>
          <div className="bg-surface border border-white/5 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-3">Member</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-3">Email</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-3">Added</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-3">Spent</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-3">Balance</th>
                </tr>
              </thead>
              <tbody>
                {credits.members.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-text-3 text-[12px]">No members</td></tr>
                ) : credits.members.map(m => (
                  <tr key={m.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 text-text text-[12px] font-medium">{m.name || '—'}</td>
                    <td className="px-4 py-2.5 text-text-3 text-[11px] font-mono">{m.email}</td>
                    <td className="px-4 py-2.5 text-right text-[12px] text-green-400 tabular-nums">+{m.creditsAdded}</td>
                    <td className="px-4 py-2.5 text-right text-[12px] text-amber-400 tabular-nums">−{m.creditsSpent}</td>
                    <td className="px-4 py-2.5 text-right text-[13px] font-semibold text-text tabular-nums">{m.creditsBalance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Pending Access Requests */}
      <section className="mb-8">
        <h2 className="text-[14px] font-semibold text-text mb-3 flex items-center gap-2">
          <I.Bell size={14} className="text-primary" /> Pending Format Access Requests
          {accessRequests.length > 0 && (
            <span className="ml-1 px-2 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full">{accessRequests.length}</span>
          )}
        </h2>
        <div className="bg-surface border border-white/5 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-3">Session ID</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-3">Format</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-3">Requester</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-3">Date</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {accessRequests.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-text-3 text-[12px]">No pending requests</td></tr>
              ) : accessRequests.map(req => {
                let meta: any = {};
                try { meta = JSON.parse(req.metadata); } catch {}
                return (
                  <tr key={req.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 text-text-3 font-mono text-[11px] max-w-[120px] truncate">{meta.sessionId || '—'}</td>
                    <td className="px-4 py-2.5 text-[12px] text-text capitalize">{meta.requestedFormat || '—'}</td>
                    <td className="px-4 py-2.5 text-[11px] text-text-2">{meta.requesterEmail || 'Anonymous'}</td>
                    <td className="px-4 py-2.5 text-[11px] text-text-3">{new Date(req.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => approveAccess(req)}
                        disabled={approvingId === req.id}
                        className="text-[11px] font-semibold px-3 py-1 rounded-lg bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 disabled:opacity-50 transition-colors"
                      >
                        {approvingId === req.id ? 'Processing…' : 'Acknowledge'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

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

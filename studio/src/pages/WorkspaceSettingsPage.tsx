import React, { useEffect, useState } from 'react';
import { apiClient, type PendingInvite } from '../lib/apiClient';
import { sessionManager } from '../lib/auth/sessionManager';
import { I } from '../components/icons';
import { cn } from '../components/ui';

interface WorkspaceSettings {
  workspaceId: string;
  ssoEnabled: number;
  ssoProvider: string | null;
  allowedDomains: string | null;
  dataRegion: string;
  retentionDays: number;
}

interface Member {
  userId: string;
  email: string;
  name?: string;
  role: string;
  invitedBy?: string;
  joinedAt?: number;
}

const ReadOnlyField: React.FC<{ label: string; value: string | number | null | undefined }> = ({ label, value }) => (
  <div className="flex flex-col gap-1">
    <div className="text-[11px] font-semibold uppercase tracking-wider text-text-3">{label}</div>
    <div className="text-[14px] text-text bg-surface-2 px-3 py-2 rounded-sm border border-white/5">
      {value != null && value !== '' ? String(value) : <span className="text-text-3 italic">Not configured</span>}
    </div>
  </div>
);

const ROLE_BADGES: Record<string, string> = {
  Owner: 'bg-primary/20 text-primary border-primary/30',
  Admin: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  Member: 'bg-white/10 text-text-2 border-white/10',
  Viewer: 'bg-white/5 text-text-3 border-white/5',
};

export const WorkspaceSettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite form state
  const [inviteRole, setInviteRole] = useState<'Member' | 'Admin' | 'Viewer'>('Member');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ token: string; url: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  const workspaceId = sessionManager.getWorkspaceId();

  const loadData = () => {
    if (!workspaceId) return;
    setLoading(true);
    Promise.all([
      apiClient.get<{ settings: WorkspaceSettings }>('/workspaces/settings'),
      apiClient.get<{ members: Member[] }>('/workspaces/members'),
      apiClient.invites.list().catch(() => ({ invites: [] })),
    ]).then(([settingsRes, membersRes, invitesRes]) => {
      setSettings(settingsRes.settings);
      setMembers(membersRes.members || []);
      setPendingInvites(invitesRes.invites || []);
    }).catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [workspaceId]);

  const handleCreateInvite = async () => {
    setInviteLoading(true);
    setInviteResult(null);
    try {
      const res = await apiClient.invites.create(inviteRole);
      const token = res.invite.token;
      const url = `${window.location.origin}${window.location.pathname}?join=${token}`;
      setInviteResult({ token, url });
      setPendingInvites((prev) => [res.invite, ...prev]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRevoke = async (inviteId: string) => {
    try {
      await apiClient.invites.revoke(inviteId);
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const copyInviteLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-text-3">
      <I.Loader size={20} className="animate-spin mr-2" /> Loading settings...
    </div>
  );

  if (error) return (
    <div className="flex-1 flex items-center justify-center text-red-400 gap-2">
      <I.AlertCircle size={16} /> {error}
    </div>
  );

  return (
    <div className="flex-1 scroll-y px-10 py-10 max-w-[860px] mx-auto">
      <div className="mb-8">
        <h1 className="text-[26px] font-semibold text-text tracking-tight">Workspace Settings</h1>
        <p className="text-[14px] text-text-2 mt-1">Governance, SSO, and data configuration for your workspace.</p>
      </div>

      {/* SSO & Security */}
      <section className="mb-8 bg-surface border border-white/5 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-5">
          <I.Shield size={16} className="text-primary" />
          <h2 className="text-[15px] font-semibold text-text">SSO & Identity</h2>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <ReadOnlyField label="SSO Enabled" value={settings?.ssoEnabled ? 'Yes' : 'No'} />
          <ReadOnlyField label="SSO Provider" value={settings?.ssoProvider} />
          <ReadOnlyField label="Allowed Domains" value={settings?.allowedDomains} />
          <ReadOnlyField label="Data Region" value={settings?.dataRegion} />
          <ReadOnlyField label="Retention (days)" value={settings?.retentionDays} />
        </div>
        <p className="mt-4 text-[12px] text-text-3">
          SSO configuration is managed by your workspace admin. Contact support to enable SAML or OIDC federation.
        </p>
      </section>

      {/* Invite New Member */}
      <section className="mb-6 bg-surface border border-white/5 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-5">
          <I.UserPlus size={16} className="text-primary" />
          <h2 className="text-[15px] font-semibold text-text">Invite Member</h2>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as any)}
            className="bg-surface-2 border border-white/10 rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary/40"
          >
            <option value="Member">Member</option>
            <option value="Admin">Admin</option>
            <option value="Viewer">Viewer</option>
          </select>
          <button
            onClick={handleCreateInvite}
            disabled={inviteLoading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-[13px] font-semibold transition-colors disabled:opacity-50"
          >
            {inviteLoading ? <I.Loader size={14} className="animate-spin" /> : <I.Link size={14} />}
            Generate Invite Link
          </button>
        </div>

        {inviteResult && (
          <div className="mt-4 p-3 bg-white/[0.04] rounded-lg border border-white/[0.08] space-y-2">
            <p className="text-[11px] font-semibold text-text-3 uppercase tracking-wider">Invite link (expires in 7 days)</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 font-mono text-[11px] text-text-2 truncate bg-white/[0.04] px-3 py-2 rounded border border-white/[0.06]">
                {inviteResult.url}
              </div>
              <button
                onClick={() => copyInviteLink(inviteResult.url)}
                className="flex-shrink-0 px-3 py-2 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary text-[12px] font-semibold transition-colors flex items-center gap-1.5"
              >
                {copiedToken ? <I.Check size={13} /> : <I.Copy size={13} />}
                {copiedToken ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <section className="mb-6 bg-surface border border-white/5 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <I.Clock size={16} className="text-text-3" />
            <h2 className="text-[15px] font-semibold text-text">Pending Invites ({pendingInvites.length})</h2>
          </div>
          <div className="divide-y divide-white/5">
            {pendingInvites.map((inv) => {
              const url = `${window.location.origin}${window.location.pathname}?join=${inv.token}`;
              return (
                <div key={inv.id} className="flex items-center justify-between py-3 gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'text-[11px] font-semibold px-2 py-0.5 rounded-full border',
                        ROLE_BADGES[inv.role] || ROLE_BADGES.Member
                      )}>{inv.role}</span>
                      <span className="text-[11px] text-text-3 font-mono truncate">{url}</span>
                    </div>
                    {inv.expiresAt && (
                      <div className="text-[10px] text-text-3 mt-0.5">
                        Expires {new Date(inv.expiresAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => copyInviteLink(url)}
                      className="text-[11px] text-text-3 hover:text-text transition-colors px-2 py-1 rounded flex items-center gap-1"
                    >
                      <I.Copy size={11} /> Copy
                    </button>
                    <button
                      onClick={() => handleRevoke(inv.id)}
                      className="text-[11px] text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded flex items-center gap-1"
                    >
                      <I.X size={11} /> Revoke
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Members */}
      <section className="bg-surface border border-white/5 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-5">
          <I.Users size={16} className="text-primary" />
          <h2 className="text-[15px] font-semibold text-text">Members ({members.length})</h2>
        </div>
        {members.length === 0 ? (
          <p className="text-text-3 text-sm">No members found.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {members.map((m) => (
              <div key={m.userId} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-[13.5px] font-medium text-text">{m.name || m.email || m.userId}</div>
                  {m.email && m.name && <div className="text-[12px] text-text-3">{m.email}</div>}
                  {m.invitedBy && (
                    <div className="text-[11px] text-text-3 mt-0.5">Invited by {m.invitedBy}</div>
                  )}
                </div>
                <span className={cn(
                  'text-[11px] font-semibold px-2.5 py-0.5 rounded-full border',
                  ROLE_BADGES[m.role] || ROLE_BADGES.Member
                )}>
                  {m.role}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

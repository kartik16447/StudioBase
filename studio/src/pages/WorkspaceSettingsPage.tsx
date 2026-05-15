import React, { useEffect, useState } from 'react';
import { apiClient } from '../lib/apiClient';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const workspaceId = sessionManager.getWorkspaceId();

  useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);
    Promise.all([
      apiClient.get<{ settings: WorkspaceSettings }>('/workspaces/settings'),
      apiClient.get<{ members: Member[] }>('/workspaces/members'),
    ]).then(([settingsRes, membersRes]) => {
      setSettings(settingsRes.settings);
      setMembers(membersRes.members || []);
    }).catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [workspaceId]);

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

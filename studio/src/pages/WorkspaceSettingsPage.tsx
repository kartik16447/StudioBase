import React, { useEffect, useState } from 'react';
import { apiClient, type PendingInvite } from '../lib/apiClient';
import { sessionManager } from '../lib/auth/sessionManager';
import { usePlan, PLAN_FEATURES } from '../hooks/usePlan';

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Inline Icons ─────────────────────────────────────────────────────────────

const Ic = {
  gear:    (sz=16, c='currentColor') => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M3 12h2.5M18.5 12H21M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/></svg>,
  users:   (sz=16, c='currentColor') => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="9" r="3"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="8" r="2.5"/><path d="M15.5 14c3 .3 5.5 2.2 5.5 5"/></svg>,
  shield:  (sz=16, c='currentColor') => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 4 7v5c0 5 8 9 8 9s8-4 8-9V7Z"/></svg>,
  link:    (sz=16, c='currentColor') => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  copy:    (sz=16, c='currentColor') => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>,
  check:   (sz=16, c='currentColor') => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-12"/></svg>,
  plus:    (sz=16, c='currentColor') => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>,
  mail:    (sz=16, c='currentColor') => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>,
  chev:    (sz=16, c='currentColor') => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>,
  x:       (sz=16, c='currentColor') => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>,
  info:    (sz=16, c='currentColor') => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>,
  sparkle: (sz=16, c='currentColor') => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>,
  loader:  (sz=16, c='currentColor') => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>,
};

// ─── Role badge ───────────────────────────────────────────────────────────────

function roleBadge(role: string) {
  const map: Record<string, { bg: string; dot: string; color: string }> = {
    Owner:   { bg: 'rgba(94,92,230,0.1)', dot: '#5E5CE6', color: '#4338CA' },
    Admin:   { bg: 'rgba(139,92,246,0.1)', dot: '#8B5CF6', color: '#7C3AED' },
    Member:  { bg: 'rgba(16,185,129,0.08)', dot: '#10B981', color: '#059669' },
    Viewer:  { bg: 'rgba(180,180,190,0.12)', dot: '#B8B8C2', color: '#6B7280' },
    Pending: { bg: 'rgba(245,158,11,0.1)', dot: '#F59E0B', color: '#D97706' },
  };
  const s = map[role] ?? map.Member;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: s.bg, color: s.color, borderRadius: 999,
      fontSize: 11.5, fontWeight: 600, padding: '3px 9px',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {role}
    </span>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function memberAvatar(name: string | undefined, email: string | undefined, role: string) {
  const initial = (name || email || '?')[0].toUpperCase();
  const COLORS: Record<string, string> = {
    Owner: 'linear-gradient(135deg,#5E5CE6,#8B5CF6)',
    Admin: 'linear-gradient(135deg,#8B5CF6,#EC4899)',
  };
  const bg = COLORS[role] ?? `linear-gradient(135deg,#4A4A55,#8A8A95)`;
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 14, fontWeight: 700, color: '#FFFFFF', flexShrink: 0,
    }}>{initial}</div>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

const Toggle: React.FC<{ on: boolean; onChange: () => void }> = ({ on, onChange }) => (
  <button
    onClick={onChange}
    style={{
      width: 44, height: 26, borderRadius: 999, padding: 3, flexShrink: 0,
      background: on ? '#5E5CE6' : '#DEDEE3', border: 'none', cursor: 'pointer',
      transition: 'background 0.2s', display: 'flex', alignItems: 'center',
      justifyContent: on ? 'flex-end' : 'flex-start',
    }}
  >
    <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.18)', display: 'block' }} />
  </button>
);

// ─── Section card wrapper ─────────────────────────────────────────────────────

const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{
    background: '#FFFFFF', borderRadius: 16, border: '1px solid #ECECEF',
    boxShadow: '0 1px 3px rgba(16,18,27,0.04),0 6px 24px -8px rgba(16,18,27,0.06)',
    overflow: 'hidden', ...style,
  }}>
    {children}
  </div>
);

// ─── Main Page ─────────────────────────────────────────────────────────────────

export const WorkspaceSettingsPage: React.FC = () => {
  const plan = usePlan();
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'members' | 'security'>('members');

  // Invite form
  const [inviteRole, setInviteRole] = useState<'Member' | 'Admin' | 'Viewer'>('Member');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ token: string; url: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  // Role dropdowns
  const [openRoleFor, setOpenRoleFor] = useState<string | null>(null);

  // Security toggles (UI-only; reflect API state)
  const [reauth, setReauth] = useState(true);
  const [reauthDays, setReauthDays] = useState(30);
  const [enforceMfa, setEnforceMfa] = useState(false);

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
      if (settingsRes.settings?.retentionDays) setReauthDays(settingsRes.settings.retentionDays);
      if (settingsRes.settings?.ssoEnabled) setReauth(!!settingsRes.settings.ssoEnabled);
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
      setPendingInvites(prev => [res.invite, ...prev]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRevoke = async (inviteId: string) => {
    try {
      await apiClient.invites.revoke(inviteId);
      setPendingInvites(prev => prev.filter(i => i.id !== inviteId));
      if (inviteResult?.token === pendingInvites.find(i => i.id === inviteId)?.token) {
        setInviteResult(null);
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const font = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, sans-serif';

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A8A95', fontFamily: font }}>
      <span style={{ animation: 'spin 1s linear infinite', display: 'inline-flex', marginRight: 8 }}>{Ic.loader(18)}</span>
      Loading settings…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error && !members.length) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444', fontFamily: font, gap: 8 }}>
      {Ic.info(16, '#EF4444')} {error}
    </div>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: '#F5F5F7', fontFamily: font }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .ws-tab-btn { background: none; border: none; cursor: pointer; transition: color 0.15s; }
        .ws-tab-btn:hover { color: #0B0B0F !important; }
        .ws-row:hover { background: #F9F9FC !important; }
        .ws-role-trigger:hover { background: rgba(94,92,230,0.08) !important; }
        .ws-btn-danger:hover { background: rgba(239,68,68,0.1) !important; }
        .ws-btn-soft:hover { background: #ECECEF !important; }
        .ws-btn-pri:hover { background: #4F4DD4 !important; }
        .ws-btn-ghost:hover { background: rgba(0,0,0,0.05) !important; }
        .ws-revoke:hover { color: #EF4444 !important; }
      `}</style>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 40px 64px' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#8A8A95', marginBottom: 20 }}>
          <span>Workspace</span>
          <span>/</span>
          <span>Settings</span>
          <span>/</span>
          <span style={{ color: '#0B0B0F', fontWeight: 500 }}>{activeTab === 'members' ? 'Members' : 'Security & SSO'}</span>
        </div>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', color: '#0B0B0F' }}>
              {activeTab === 'members' ? 'Members' : 'Security & SSO'}
            </h1>
            <div style={{ marginTop: 5, fontSize: 14, color: '#8A8A95', maxWidth: 540 }}>
              {activeTab === 'members'
                ? 'Manage who has access to this workspace and their permission level.'
                : 'Configure single sign-on, session lifetimes, and account-level controls.'}
            </div>
          </div>
          {activeTab === 'members' && (
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button className="ws-btn-ghost" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: '#FFFFFF', border: '1px solid #DEDEE3', borderRadius: 10,
                padding: '8px 14px', fontSize: 13, fontWeight: 500, color: '#4A4A55',
                cursor: 'pointer', boxShadow: '0 1px 2px rgba(16,18,27,0.04)',
              }}>
                {Ic.mail(14)} Bulk invite
              </button>
              <button className="ws-btn-pri" onClick={handleCreateInvite} disabled={inviteLoading} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: '#5E5CE6', border: 'none', borderRadius: 10,
                padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#FFFFFF',
                cursor: 'pointer', boxShadow: '0 1px 3px rgba(94,92,230,0.3)',
                opacity: inviteLoading ? 0.7 : 1,
              }}>
                {inviteLoading
                  ? <span style={{ animation: 'spin 1s linear infinite', display: 'inline-flex' }}>{Ic.loader(14, '#FFFFFF')}</span>
                  : Ic.plus(14, '#FFFFFF')}
                Invite member
              </button>
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: '#ECECEF', borderRadius: 12, padding: 4, width: 'fit-content' }}>
          {(['members', 'security'] as const).map(tab => (
            <button
              key={tab}
              className="ws-tab-btn"
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '7px 18px', borderRadius: 9, fontSize: 13.5, fontWeight: 500,
                color: activeTab === tab ? '#0B0B0F' : '#8A8A95',
                background: activeTab === tab ? '#FFFFFF' : 'transparent',
                boxShadow: activeTab === tab ? '0 1px 3px rgba(16,18,27,0.08)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {tab === 'members' ? 'Members' : 'Security & SSO'}
              {tab === 'members' && members.length > 0 && (
                <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, background: '#5E5CE6', color: '#FFFFFF', borderRadius: 999, padding: '1px 6px' }}>
                  {members.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── MEMBERS TAB ─────────────────────────────────────────────────────── */}
        {activeTab === 'members' && (
          <>
            {/* Invite link banner */}
            {(inviteResult || pendingInvites.length > 0) && (() => {
              const activeInvite = pendingInvites[0];
              const displayUrl = inviteResult?.url
                ?? `${window.location.origin}${window.location.pathname}?join=${activeInvite?.token}`;
              return (
                <div style={{
                  background: 'rgba(94,92,230,0.05)', border: '1px solid rgba(94,92,230,0.2)',
                  borderRadius: 14, padding: 20, marginBottom: 20, display: 'flex', gap: 16, alignItems: 'flex-start',
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, background: 'rgba(94,92,230,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {Ic.link(18, '#5E5CE6')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#0B0B0F' }}>Invite link active</span>
                      <span style={{ fontSize: 11.5, fontWeight: 600, background: 'rgba(16,185,129,0.1)', color: '#059669', padding: '2px 8px', borderRadius: 999 }}>
                        {activeInvite?.expiresAt ? `Expires ${new Date(activeInvite.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Expires in 7 days'}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: '#8A8A95', marginBottom: 12 }}>
                      Anyone with this link can join as a {inviteRole}. Re-generate to revoke previous links.
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        readOnly
                        value={displayUrl}
                        style={{
                          flex: 1, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: 12,
                          background: '#FFFFFF', border: '1px solid #DEDEE3', borderRadius: 8,
                          padding: '8px 12px', color: '#4A4A55', outline: 'none', minWidth: 0,
                        }}
                      />
                      <button
                        className="ws-btn-soft"
                        onClick={() => copyLink(displayUrl)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                          background: '#FFFFFF', border: '1px solid #DEDEE3', borderRadius: 8,
                          padding: '8px 14px', fontSize: 13, fontWeight: 600,
                          color: copiedToken ? '#059669' : '#4A4A55', cursor: 'pointer',
                        }}
                      >
                        {copiedToken ? Ic.check(13, '#059669') : Ic.copy(13)}
                        {copiedToken ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                  {activeInvite && (
                    <button
                      className="ws-revoke"
                      onClick={() => handleRevoke(activeInvite.id)}
                      style={{ fontSize: 12, fontWeight: 600, color: '#8A8A95', cursor: 'pointer', background: 'none', border: 'none', flexShrink: 0, padding: '4px 0' }}
                    >
                      Revoke link
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Invite role selector (shown when no banner yet) */}
            {!inviteResult && pendingInvites.length === 0 && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#4A4A55', fontWeight: 500 }}>Invite as:</span>
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value as any)}
                  style={{
                    background: '#FFFFFF', border: '1px solid #DEDEE3', borderRadius: 8,
                    padding: '8px 12px', fontSize: 13, color: '#0B0B0F', outline: 'none',
                    cursor: 'pointer', fontFamily: font,
                  }}
                >
                  <option value="Member">Member</option>
                  <option value="Admin">Admin</option>
                  <option value="Viewer">Viewer</option>
                </select>
              </div>
            )}

            {/* Members table */}
            <Card>
              {/* Table header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 140px 140px 180px',
                padding: '10px 24px', borderBottom: '1px solid #ECECEF',
                fontSize: 11, fontWeight: 700, color: '#8A8A95', textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                <div>Member</div>
                <div>Role</div>
                <div>Joined</div>
                <div style={{ textAlign: 'right' }}>Actions</div>
              </div>

              {/* Member rows */}
              {members.map((m, idx) => {
                const isLast = idx === members.length - 1 && pendingInvites.length === 0;
                const dropdownOpen = openRoleFor === m.userId;
                return (
                  <div
                    key={m.userId}
                    className="ws-row"
                    style={{
                      display: 'grid', gridTemplateColumns: '1fr 140px 140px 180px',
                      padding: '14px 24px', borderBottom: isLast ? 'none' : '1px solid #ECECEF',
                      alignItems: 'center', position: 'relative',
                    }}
                  >
                    {/* Member info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      {memberAvatar(m.name, m.email, m.role)}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0B0B0F' }}>
                          {m.name || m.email || m.userId}
                        </div>
                        {m.name && m.email && (
                          <div style={{ fontSize: 12, color: '#8A8A95', marginTop: 1 }}>{m.email}</div>
                        )}
                        {m.invitedBy && (
                          <div style={{ fontSize: 11.5, color: '#B8B8C2', marginTop: 1 }}>Invited by {m.invitedBy}</div>
                        )}
                      </div>
                    </div>

                    {/* Role badge */}
                    <div>{roleBadge(m.role)}</div>

                    {/* Joined */}
                    <div style={{ fontSize: 12.5, color: '#4A4A55' }}>
                      {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', position: 'relative' }}>
                      {m.role !== 'Owner' && (
                        <>
                          <button
                            className="ws-role-trigger"
                            onClick={() => setOpenRoleFor(dropdownOpen ? null : m.userId)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              background: dropdownOpen ? 'rgba(94,92,230,0.1)' : 'transparent',
                              border: '1px solid ' + (dropdownOpen ? 'rgba(94,92,230,0.3)' : '#DEDEE3'),
                              borderRadius: 8, padding: '5px 10px', fontSize: 12.5, fontWeight: 500,
                              color: dropdownOpen ? '#5E5CE6' : '#4A4A55', cursor: 'pointer',
                            }}
                          >
                            Change role {Ic.chev(12, dropdownOpen ? '#5E5CE6' : '#8A8A95')}
                          </button>
                          <button
                            className="ws-btn-danger"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              background: 'transparent', border: '1px solid transparent',
                              borderRadius: 8, padding: '5px 10px', fontSize: 12.5, fontWeight: 500,
                              color: '#EF4444', cursor: 'pointer',
                            }}
                            onClick={async () => {
                              if (!workspaceId) return;
                              const name = m.name || m.email || m.userId;
                              if (!window.confirm(`Remove ${name} from this workspace? This cannot be undone.`)) return;
                              try {
                                await apiClient.workspaces.removeMember(workspaceId, m.userId);
                                setMembers(prev => prev.filter(x => x.userId !== m.userId));
                              } catch (e: any) {
                                setError(e.message || 'Failed to remove member');
                              }
                            }}
                          >
                            Remove
                          </button>

                          {/* Role dropdown */}
                          {dropdownOpen && (
                            <div style={{
                              position: 'absolute', top: '100%', right: 0, zIndex: 50, marginTop: 4,
                              background: '#FFFFFF', border: '1px solid #ECECEF', borderRadius: 14,
                              boxShadow: '0 8px 32px rgba(16,18,27,0.12)', padding: 8, minWidth: 280,
                            }} onClick={e => e.stopPropagation()}>
                              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#8A8A95', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 12px 8px' }}>
                                Workspace role
                              </div>
                              {(['Admin', 'Member', 'Viewer'] as const).map(r => (
                                <div
                                  key={r}
                                  onClick={() => setOpenRoleFor(null)}
                                  style={{
                                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                                    borderRadius: 10, cursor: 'pointer', background: m.role === r ? 'rgba(94,92,230,0.06)' : 'transparent',
                                  }}
                                >
                                  <div style={{
                                    width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                                    border: '2px solid ' + (m.role === r ? '#5E5CE6' : '#DEDEE3'),
                                    background: m.role === r ? '#5E5CE6' : 'transparent',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}>
                                    {m.role === r && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FFFFFF', display: 'block' }} />}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0B0B0F' }}>{r}</div>
                                    <div style={{ fontSize: 12, color: '#8A8A95', marginTop: 2 }}>
                                      {r === 'Admin' && 'Can invite & remove members, manage billing, configure brand kit and SSO.'}
                                      {r === 'Member' && 'Can create, edit and export projects. Cannot manage workspace settings.'}
                                      {r === 'Viewer' && 'Read-only access. Can comment on projects but not edit them.'}
                                    </div>
                                  </div>
                                  {m.role === r && <span style={{ fontSize: 11, fontWeight: 700, color: '#5E5CE6', flexShrink: 0, marginTop: 2 }}>Current</span>}
                                </div>
                              ))}
                              <div style={{ height: 1, background: '#ECECEF', margin: '8px 0' }} />
                              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 12px 4px', fontSize: 12, color: '#8A8A95' }}>
                                {Ic.info(13, '#B8B8C2')}
                                <span><strong style={{ color: '#4A4A55' }}>Owner</strong> can only be transferred — not assigned. <span style={{ color: '#5E5CE6', fontWeight: 600, cursor: 'pointer' }}>Transfer ownership →</span></span>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      {m.role === 'Owner' && <span style={{ fontSize: 12, color: '#B8B8C2' }}>—</span>}
                    </div>
                  </div>
                );
              })}

              {/* Pending invites as table rows */}
              {pendingInvites.map((inv, idx) => {
                const url = `${window.location.origin}${window.location.pathname}?join=${inv.token}`;
                const isLast = idx === pendingInvites.length - 1;
                return (
                  <div
                    key={inv.id}
                    className="ws-row"
                    style={{
                      display: 'grid', gridTemplateColumns: '1fr 140px 140px 180px',
                      padding: '14px 24px', borderBottom: isLast ? 'none' : '1px solid #ECECEF',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', background: 'rgba(245,158,11,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        {Ic.mail(15, '#D97706')}
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#0B0B0F', fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>
                          {url.length > 50 ? url.slice(0, 50) + '…' : url}
                        </div>
                        <div style={{ fontSize: 12, color: '#D97706', marginTop: 1 }}>Pending invite · sent via link</div>
                      </div>
                    </div>
                    <div>{roleBadge('Pending')}</div>
                    <div style={{ fontSize: 12, color: '#8A8A95' }}>
                      {inv.expiresAt ? `Expires ${new Date(inv.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Pending'}
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        className="ws-btn-soft"
                        onClick={() => copyLink(url)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          background: 'transparent', border: '1px solid #DEDEE3', borderRadius: 8,
                          padding: '5px 10px', fontSize: 12.5, fontWeight: 500, color: '#4A4A55', cursor: 'pointer',
                        }}
                      >
                        {Ic.copy(12)} Copy
                      </button>
                      <button
                        className="ws-btn-danger"
                        onClick={() => handleRevoke(inv.id)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          background: 'transparent', border: '1px solid transparent', borderRadius: 8,
                          padding: '5px 10px', fontSize: 12.5, fontWeight: 500, color: '#EF4444', cursor: 'pointer',
                        }}
                      >
                        {Ic.x(12)} Revoke
                      </button>
                    </div>
                  </div>
                );
              })}

              {members.length === 0 && pendingInvites.length === 0 && (
                <div style={{ textAlign: 'center', padding: '48px 0', color: '#8A8A95', fontSize: 13.5 }}>No members found.</div>
              )}
            </Card>

            {/* Seat usage footer */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 24px', marginTop: 12,
              background: '#FFFFFF', borderRadius: 14, border: '1px solid #ECECEF',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 28, fontWeight: 700, color: '#0B0B0F' }}>{members.length}</span>
                <span style={{ fontSize: 13.5, color: '#4A4A55' }}>
                  of <strong>unlimited</strong> seats used
                  {pendingInvites.length > 0 && ` · ${pendingInvites.length} pending`}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#8A8A95' }}>
                <span style={{ fontSize: 18, fontWeight: 300 }}>∞</span>
                Seats are always free. You're only charged for exports.
              </div>
            </div>
          </>
        )}

        {/* ── SECURITY TAB ────────────────────────────────────────────────────── */}
        {activeTab === 'security' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* SAML SSO card */}
            <Card>
              <div style={{ padding: '24px 28px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      {Ic.shield(16, '#5E5CE6')}
                      <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 600, letterSpacing: '-0.01em' }}>SAML Single Sign-On</h3>
                      {PLAN_FEATURES.sso(plan)
                        ? <span style={{ fontSize: 11.5, fontWeight: 600, background: settings?.ssoEnabled ? 'rgba(16,185,129,0.1)' : 'rgba(180,180,190,0.15)', color: settings?.ssoEnabled ? '#059669' : '#8A8A95', padding: '2px 8px', borderRadius: 999 }}>
                            {settings?.ssoEnabled ? `● ${settings.ssoProvider ?? 'Enabled'}` : '● Not configured'}
                          </span>
                        : <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(180,180,190,0.15)', color: '#8A8A95', padding: '2px 8px', borderRadius: 999 }}>Enterprise</span>}
                    </div>
                    <div style={{ fontSize: 13.5, color: '#8A8A95', maxWidth: 500 }}>
                      Require everyone in your workspace to sign in through your identity provider. Available on Team and Enterprise plans.
                    </div>
                  </div>
                  <button
                    disabled={!PLAN_FEATURES.sso(plan)}
                    className="ws-btn-pri"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
                      background: PLAN_FEATURES.sso(plan) ? '#5E5CE6' : '#ECECEF',
                      border: 'none', borderRadius: 10, padding: '9px 16px',
                      fontSize: 13, fontWeight: 600, color: PLAN_FEATURES.sso(plan) ? '#FFFFFF' : '#B8B8C2',
                      cursor: PLAN_FEATURES.sso(plan) ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {Ic.sparkle(14, PLAN_FEATURES.sso(plan) ? '#FFFFFF' : '#B8B8C2')} Configure SAML
                  </button>
                </div>

                {/* SAML fields */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                  {[
                    { label: 'Entity ID', value: settings?.workspaceId ? `https://auth.studiobase.so/saml/${settings.workspaceId}` : 'Not configured' },
                    { label: 'ACS URL (Reply URL)', value: settings?.workspaceId ? `https://auth.studiobase.so/saml/${settings.workspaceId}/acs` : 'Not configured' },
                    { label: 'Allowed Domains', value: settings?.allowedDomains || 'Not configured' },
                    { label: 'Data Region', value: settings?.dataRegion || 'us-east' },
                  ].map(f => (
                    <div key={f.label}>
                      <label style={{ fontSize: 11.5, fontWeight: 600, color: '#8A8A95', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>{f.label}</label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          readOnly
                          value={f.value}
                          style={{
                            flex: 1, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: 11.5,
                            background: '#F5F5F7', border: '1px solid #ECECEF', borderRadius: 8,
                            padding: '8px 12px', color: '#4A4A55', outline: 'none', minWidth: 0,
                          }}
                        />
                        <button
                          onClick={() => navigator.clipboard.writeText(f.value)}
                          className="ws-btn-soft"
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 36, height: 36, background: '#F5F5F7', border: '1px solid #ECECEF',
                            borderRadius: 8, cursor: 'pointer', flexShrink: 0,
                          }}
                          title="Copy"
                        >
                          {Ic.copy(13, '#8A8A95')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* IdP logos */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#B8B8C2', fontWeight: 500 }}>Works with</span>
                  {[
                    { label: 'Okta', color: '#0062C4', bg: '#EBF4FF' },
                    { label: 'Azure AD', color: '#0078D4', bg: '#E8F3FB' },
                    { label: 'Google Workspace', color: '#4285F4', bg: '#EEF4FF' },
                    { label: 'Any SAML 2.0 IdP', color: '#6E6E73', bg: '#F2F2F5' },
                  ].map(idp => (
                    <span key={idp.label} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      background: idp.bg, color: idp.color, borderRadius: 999,
                      fontSize: 12, fontWeight: 600, padding: '4px 10px',
                    }}>
                      {idp.label}
                    </span>
                  ))}
                </div>
              </div>
            </Card>

            {/* Session management card */}
            <Card>
              <div style={{ padding: '24px 28px' }}>
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 4 }}>Session management</h3>
                  <div style={{ fontSize: 13.5, color: '#8A8A95' }}>
                    Control how long members stay signed in and force re-authentication when something changes.
                  </div>
                </div>

                {/* Re-auth row */}
                <div style={{
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24,
                  padding: '18px 0', borderBottom: '1px solid #F0F0F3',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0B0B0F', marginBottom: 4 }}>Require re-authentication</div>
                    <div style={{ fontSize: 13, color: '#8A8A95', lineHeight: 1.5 }}>
                      Members will be asked to sign in again after a set period of inactivity. Recommended for shared devices.
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: '#F5F5F7', border: '1px solid #ECECEF', borderRadius: 8, padding: '6px 10px',
                    }}>
                      <button onClick={() => setReauthDays(d => Math.max(1, d - 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4A4A55', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>−</button>
                      <input
                        type="number"
                        value={reauthDays}
                        onChange={e => setReauthDays(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{ width: 40, textAlign: 'center', border: 'none', background: 'transparent', fontSize: 13.5, fontWeight: 600, color: '#0B0B0F', outline: 'none', fontVariantNumeric: 'tabular-nums' }}
                      />
                      <span style={{ fontSize: 12.5, color: '#8A8A95' }}>days</span>
                      <button onClick={() => setReauthDays(d => d + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4A4A55', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>+</button>
                    </div>
                    <Toggle on={reauth} onChange={() => setReauth(v => !v)} />
                  </div>
                </div>

                {/* MFA row */}
                <div style={{
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24,
                  padding: '18px 0', borderBottom: '1px solid #F0F0F3',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0B0B0F', marginBottom: 4 }}>Enforce two-factor authentication</div>
                    <div style={{ fontSize: 13, color: '#8A8A95', lineHeight: 1.5 }}>
                      Every member must set up 2FA before accessing the workspace. Admins can grant temporary bypass.
                    </div>
                  </div>
                  <Toggle on={enforceMfa} onChange={() => setEnforceMfa(v => !v)} />
                </div>

                {/* Danger: revoke all sessions */}
                <div style={{
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24,
                  background: 'rgba(239,68,68,0.03)', margin: '0 -28px', padding: '18px 28px',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0B0B0F', marginBottom: 4 }}>Revoke all active sessions</div>
                    <div style={{ fontSize: 13, color: '#8A8A95', lineHeight: 1.5 }}>
                      Sign every member (including yourself) out of all browsers and devices. They'll need to sign in again.
                    </div>
                  </div>
                  <button style={{
                    flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'transparent', border: '1px solid #EF4444',
                    borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 600,
                    color: '#EF4444', cursor: 'pointer',
                  }}>
                    Revoke all sessions
                  </button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

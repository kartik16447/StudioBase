import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { getUser } from '../auth';
import { safeFetch } from '../api';
import { API_BASE, VIEWER_BASE } from '../config';
import { BackendVideo, WorkspaceMember, WorkspaceVideo } from '../types';

const getDeterministicColor = (email: string) => {
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

export function LibraryPage() {
  const [files, setFiles] = useState<WorkspaceVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [nextCursor, setNextCursor] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [invites, setInvites] = useState<any[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const isFetching = useRef(false);
  const observerTarget = useRef<HTMLDivElement>(null);
  const user = getUser();

  const fetchData = useCallback(async (cursor?: any) => {
    const isInitial = !cursor;
    if (isFetching.current && !isInitial) return;
    isFetching.current = true;

    if (isInitial) { setLoading(true); setFiles([]); setNextCursor(null); setHasMore(false); }
    else setLoadingMore(true);
    setError(null);

    if (!user?.workspaceId) {
      setLoading(false);
      isFetching.current = false;
      return;
    }

    try {
      let url = `${API_BASE}/videos?workspaceId=${user.workspaceId}&limit=12`;
      if (cursor) url += `&cursor=${cursor}`;
      const res = await safeFetch(url);
      const { videos, nextCursor: newCursor, hasMore: moreAvailable } = await res.json();

      setNextCursor(newCursor);
      setHasMore(moreAvailable);

      const mapped: WorkspaceVideo[] = (videos || []).map((v: BackendVideo) => ({
        id: v.id,
        backendId: v.id,
        fileId: v.fileId,
        title: v.title || 'Recording',
        name: (v.title || 'Recording') + '.webm',
        createdTime: new Date(v.createdAt || Date.now()).toISOString(),
        createdAt: v.createdAt,
        thumbnailLink: v.thumbnailUrl || null,
        previewUrl: v.previewUrl,
        playerUrl: v.playerUrl,
        accountEmail: v.accountEmail || v.account_email || 'External',
        status: v.status || 'ready',
        ownerId: v.ownerId,
        workspaceId: v.workspaceId,
      }));

      if (isInitial) setFiles(mapped);
      else setFiles(prev => [...prev, ...mapped]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      isFetching.current = false;
    }
  }, [user?.workspaceId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!hasMore || loadingMore || loading) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) fetchData(nextCursor);
    }, { threshold: 0.1 });
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, nextCursor, fetchData]);

  const fetchMembers = useCallback(async () => {
    if (!user?.workspaceId) return;
    setLoadingMembers(true);
    try {
      const res = await safeFetch(`${API_BASE}/workspace/members?workspaceId=${user.workspaceId}`);
      setMembers(await res.json());
    } catch { } finally { setLoadingMembers(false); }
  }, [user?.workspaceId]);

  const fetchInvites = useCallback(async () => {
    if (!user?.workspaceId) return;
    setLoadingInvites(true);
    try {
      const res = await safeFetch(`${API_BASE}/workspace/invites?workspaceId=${user.workspaceId}`);
      setInvites(await res.json());
    } catch { } finally { setLoadingInvites(false); }
  }, [user?.workspaceId]);

  useEffect(() => {
    if (showMembersModal) { fetchMembers(); fetchInvites(); }
  }, [showMembersModal, fetchMembers, fetchInvites]);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        document.getElementById('search-input')?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const filteredFiles = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return q ? files.filter(f => (f.title || '').toLowerCase().includes(q)) : files;
  }, [files, debouncedQuery]);

  const openVideo = (video: WorkspaceVideo) => {
    if (video.playerUrl) { window.open(video.playerUrl, '_blank'); return; }
    if (video.fileId) {
      window.open(`${VIEWER_BASE}/?id=${video.fileId}&title=${encodeURIComponent(video.title)}`, '_blank');
    }
  };

  const copyLink = async (e: React.MouseEvent, video: WorkspaceVideo) => {
    e.stopPropagation();
    if (!video.playerUrl) return;
    await navigator.clipboard.writeText(video.playerUrl);
    setCopiedId(video.id);
    setTimeout(() => setCopiedId(null), 1000);
  };

  const handleRename = async (file: WorkspaceVideo) => {
    const newTitle = editingTitle.trim();
    if (!newTitle || newTitle === file.title) { setEditingId(null); return; }
    setFiles(prev => prev.map(f => f.id === file.id ? { ...f, title: newTitle } : f));
    setEditingId(null);
    try {
      await safeFetch(`${API_BASE}/videos/${file.backendId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
    } catch { }
  };

  const handleDelete = async (file: WorkspaceVideo) => {
    if (deletingId === file.id) return;
    if (!confirm(`Delete "${file.title}"? This cannot be undone.`)) return;
    setFiles(prev => prev.filter(f => f.id !== file.id));
    setDeletingId(file.id);
    try {
      await safeFetch(`${API_BASE}/videos/${file.backendId}`, { method: 'DELETE' });
    } catch { } finally { setDeletingId(null); }
  };

  const handleInvite = async () => {
    if (inviting || !user?.workspaceId) return;
    setInviting(true);
    try {
      const res = await safeFetch(`${API_BASE}/workspace/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: user.workspaceId }),
      });
      const data = await res.json();
      const fullUrl = data.joinUrl || `https://screenvault-web-7r9.pages.dev/invite/${data.token}`;
      setInviteUrl(fullUrl);
      await navigator.clipboard.writeText(fullUrl);
      fetchInvites();
      setTimeout(() => setInviteUrl(null), 1000);
    } catch (err: any) {
      alert(`Invite failed: ${err.message}`);
    } finally { setInviting(false); }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!confirm('Revoke this invite?')) return;
    try {
      await safeFetch(`${API_BASE}/workspace/invite/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId }),
      });
      fetchInvites();
    } catch (err: any) { alert(`Failed: ${err.message}`); }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Remove this member?')) return;
    try {
      await safeFetch(`${API_BASE}/workspace/member/${userId}?workspaceId=${user?.workspaceId}`, { method: 'DELETE' });
      fetchMembers();
    } catch (err: any) { alert(`Failed: ${err.message}`); }
  };

  const handleLeaveWorkspace = async () => {
    if (leaving || !user?.workspaceId) return;
    setLeaving(true);
    try {
      await safeFetch(`${API_BASE}/workspace/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: user.workspaceId }),
      });
      window.location.reload();
    } catch (err: any) { alert(`Failed: ${err.message}`); } finally { setLeaving(false); }
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${safe})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase()
        ? <mark key={i} style={{ backgroundColor: '#fde68a', color: '#000', borderRadius: '2px', padding: '0 2px' }}>{part}</mark>
        : part
    );
  };

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#A1A1AA', gap: '1.5rem' }}>
      <div style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ fontWeight: 500 }}>Loading workspace library...</p>
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#fff', textAlign: 'center', padding: '2rem' }}>
      <div style={{ background: 'rgba(239,68,68,0.1)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid rgba(239,68,68,0.2)', marginBottom: '1.5rem' }}>
        <p style={{ color: '#ef4444', fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.5rem' }}>Connection Error</p>
        <p style={{ color: '#A1A1AA', fontSize: '0.9rem', maxWidth: '300px' }}>{error}</p>
      </div>
      <button onClick={() => fetchData()} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '9999px', fontWeight: 600, cursor: 'pointer' }}>
        Try Again
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <style>{`
        @keyframes shimmer { 0% { background-position: -800px 0; } 100% { background-position: 800px 0; } }
        .skeleton { background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%); background-size: 800px 100%; animation: shimmer 1.4s infinite linear; border-radius: 8px; }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '3rem' }}>
        <div>
          <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 600, color: '#A1A1AA', marginBottom: '0.5rem' }}>Library</p>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>Team Workspace Library</h1>
          <p style={{ color: '#A1A1AA', fontSize: '0.9rem', marginTop: '0.25rem' }}>All recordings in this workspace are shared with your team.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button onClick={() => { setShowMembersModal(true); fetchMembers(); }} style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '0.6rem 1.2rem', borderRadius: '9999px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Members
          </button>
          <button onClick={handleInvite} disabled={inviting} style={{ background: inviteUrl ? '#10B981' : 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '0.6rem 1.2rem', borderRadius: '9999px', fontWeight: 600, fontSize: '0.85rem', cursor: inviting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: inviting ? 0.6 : 1 }}>
            {inviteUrl ? '✓ Copied Invite Link!' : (inviting ? 'Generating...' : '+ Invite Team Member')}
          </button>
          {user?.workspaceRole === 'member' && (
            <button onClick={() => setShowLeaveConfirm(true)} style={{ background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', padding: '0.6rem 1.2rem', borderRadius: '9999px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
              Leave Workspace
            </button>
          )}
        </div>
      </div>

      {/* Members Modal */}
      {showMembersModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
          <div style={{ background: '#18181b', padding: '2rem', borderRadius: '1.5rem', maxWidth: '500px', width: '90%', border: '1px solid rgba(255,255,255,0.1)', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
            <button onClick={() => setShowMembersModal(false)} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'none', border: 'none', color: '#71717A', cursor: 'pointer' }}>✕</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
              <div>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff' }}>Workspace Settings</h3>
                <p style={{ color: '#71717A', fontSize: '0.9rem', marginTop: '4px' }}>Manage your team and invites</p>
              </div>
              <button onClick={handleInvite} disabled={inviting} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '9999px', fontWeight: 600, cursor: inviting ? 'not-allowed' : 'pointer' }}>
                {inviting ? 'Generating...' : 'Generate Invite'}
              </button>
            </div>
            {loadingMembers ? <div style={{ padding: '2rem', textAlign: 'center', color: '#A1A1AA' }}>Loading members...</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '40vh', overflowY: 'auto' }}>
                {members.map(member => (
                  <div key={member.userId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.05)', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 700, color: '#3b82f6', flexShrink: 0 }}>
                        {(member.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: '#fff', fontWeight: 500, fontSize: '0.875rem', wordBreak: 'break-all' }}>{member.email}</div>
                        <div style={{ display: 'flex', gap: '4px', marginTop: '3px' }}>
                          {member.userId === user?.userId && <span style={{ fontSize: '0.65rem', color: '#3b82f6', background: 'rgba(59,130,246,0.1)', padding: '1px 6px', borderRadius: '4px' }}>You</span>}
                          {member.role === 'owner' && <span style={{ fontSize: '0.65rem', color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '1px 6px', borderRadius: '4px' }}>Owner</span>}
                        </div>
                      </div>
                    </div>
                    {user?.workspaceRole === 'owner' && member.userId !== user?.userId && (
                      <button onClick={() => handleRemoveMember(member.userId)} style={{ color: '#ef4444', background: 'none', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>Remove</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* Active Invites */}
            <div style={{ marginTop: '2rem' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#A1A1AA', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Invites</h4>
              {loadingInvites ? <div style={{ color: '#71717A', fontSize: '0.85rem' }}>Loading...</div> : invites.length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '1rem', color: '#71717A', fontSize: '0.85rem', border: '1px dashed rgba(255,255,255,0.1)' }}>No active invites</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {invites.map(inv => {
                    const isExpired = inv.expiresAt && inv.expiresAt < Date.now();
                    const isRevoked = !!inv.revokedAt;
                    const isActive = !isExpired && !isRevoked;
                    return (
                      <div key={inv.id} style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: isActive ? 1 : 0.6 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', color: '#3b82f6' }}>{inv.token.slice(0, 8)}...</code>
                            <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: isRevoked ? 'rgba(239,68,68,0.1)' : isExpired ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)', color: isRevoked ? '#ef4444' : isExpired ? '#f59e0b' : '#10b981' }}>
                              {isRevoked ? 'Revoked' : isExpired ? 'Expired' : 'Active'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#71717A', marginTop: '4px' }}>Expires {new Date(inv.expiresAt).toLocaleDateString()}</div>
                        </div>
                        {isActive && (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {user?.workspaceRole === 'owner' && (
                              <button onClick={() => handleRevokeInvite(inv.id)} style={{ background: 'none', border: 'none', color: '#71717A', cursor: 'pointer', fontSize: '0.8rem' }}>Revoke</button>
                            )}
                            <button onClick={async () => { await navigator.clipboard.writeText(`${VIEWER_BASE}/#/invite/${inv.token}`); alert('Copied!'); }} style={{ background: 'rgba(59,130,246,0.1)', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.8rem', padding: '4px 10px', borderRadius: '6px' }}>Copy</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowMembersModal(false)} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '9999px', fontWeight: 600, cursor: 'pointer' }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Confirm */}
      {showLeaveConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#18181b', padding: '2rem', borderRadius: '12px', maxWidth: '400px', width: '90%', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 style={{ color: '#fff', fontSize: '1.25rem', marginBottom: '1rem' }}>Leave this workspace?</h3>
            <ul style={{ color: '#A1A1AA', marginBottom: '2rem', paddingLeft: '1.2rem', lineHeight: 1.6 }}>
              <li>You will lose access to shared videos.</li>
              <li>You will need a new invite to rejoin.</li>
            </ul>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowLeaveConfirm(false)} style={{ padding: '0.5rem 1rem', background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleLeaveWorkspace} disabled={leaving} style={{ padding: '0.5rem 1rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: leaving ? 'not-allowed' : 'pointer' }}>{leaving ? 'Leaving...' : 'Leave'}</button>
            </div>
          </div>
        </div>
      )}

      {!files.length ? (
        <div style={{ color: '#A1A1AA', textAlign: 'center', padding: '4rem 0' }}>
          <p style={{ marginBottom: '1rem' }}>No recordings yet in this workspace.</p>
          <p style={{ fontSize: '0.9rem' }}>Use the Chrome extension to record and they'll appear here.</p>
        </div>
      ) : (
        <>
          <div style={{ position: 'relative', marginBottom: '2rem' }}>
            <input
              id="search-input"
              autoFocus
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setSearchQuery(''); }}
              placeholder="Search recordings... (Press /)"
              style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1rem', padding: '0.8rem 1.2rem 0.8rem 2.8rem', color: '#fff', fontSize: '1rem', outline: 'none' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
            />
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }}>
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            {searchQuery && <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>}
          </div>

          {!filteredFiles.length ? (
            <div style={{ textAlign: 'center', padding: '4rem 0', color: '#A1A1AA' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#fff', marginBottom: '0.5rem' }}>No results found</div>
              <div>We couldn't find any recordings matching "{searchQuery}"</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
              {filteredFiles.map(file => (
                <div
                  key={file.id}
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}
                  onMouseLeave={() => setMenuOpenId(null)}
                >
                  {/* Actions Menu */}
                  <div style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 10 }}>
                    <button
                      onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === file.id ? null : file.id); }}
                      style={{ background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', backdropFilter: 'blur(4px)' }}
                    >⋯</button>
                    {menuOpenId === file.id && (
                      <div style={{ position: 'absolute', top: '40px', right: '0', background: '#18181B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)', padding: '6px', minWidth: '140px', zIndex: 100 }}>
                        {[
                          { label: copiedId === file.id ? 'Copied!' : 'Copy Link', onClick: (e: React.MouseEvent) => { copyLink(e, file); setMenuOpenId(null); } },
                          { label: 'Rename', onClick: (e: React.MouseEvent) => { e.stopPropagation(); setEditingId(file.id); setEditingTitle(file.title); setMenuOpenId(null); } },
                        ].map(item => (
                          <button key={item.label} onClick={item.onClick} style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: '#fff', fontSize: '0.875rem', cursor: 'pointer', borderRadius: '8px', textAlign: 'left' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >{item.label}</button>
                        ))}
                        <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '4px 0' }} />
                        <button onClick={e => { e.stopPropagation(); handleDelete(file); setMenuOpenId(null); }} style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: '#EF4444', fontSize: '0.875rem', cursor: 'pointer', borderRadius: '8px', textAlign: 'left' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >Delete</button>
                      </div>
                    )}
                  </div>

                  {/* Thumbnail */}
                  <div
                    style={{ position: 'relative', cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredId(file.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => openVideo(file)}
                  >
                    <div style={{ aspectRatio: '16/9', background: '#050505', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                      {file.thumbnailLink ? (
                        <img src={file.thumbnailLink} alt={file.title} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: hoveredId === file.id ? 0.8 : 1, transition: 'opacity 0.2s' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(45deg, #18181B, #09090B)' }}>
                          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1">
                            <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>
                          </svg>
                        </div>
                      )}
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hoveredId === file.id ? 'rgba(0,0,0,0.2)' : 'transparent', transition: 'background 0.2s' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: hoveredId === file.id ? 1 : 0, transform: hoveredId === file.id ? 'scale(1)' : 'scale(0.8)', transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {editingId === file.id ? (
                      <input
                        autoFocus
                        value={editingTitle}
                        onChange={e => setEditingTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRename(file); if (e.key === 'Escape') setEditingId(null); }}
                        onClick={e => e.stopPropagation()}
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '4px 8px', color: '#fff', width: '100%', fontSize: '0.9rem', outline: 'none' }}
                      />
                    ) : (
                      <div style={{ fontWeight: 600, fontSize: '1rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {highlightMatch(file.title || '', debouncedQuery)}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: getDeterministicColor(file.accountEmail || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold', color: '#fff', flexShrink: 0 }}>
                        {(file.accountEmail || 'S').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#A1A1AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.accountEmail === user?.email ? 'You' : file.accountEmail}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: '#52525B' }}>
                      {new Date(file.createdTime || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {loadingMore && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem', marginTop: '1.5rem' }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', overflow: 'hidden' }}>
                  <div className="skeleton" style={{ height: '160px', borderRadius: 0 }} />
                  <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <div className="skeleton" style={{ height: '14px', width: '70%' }} />
                    <div className="skeleton" style={{ height: '12px', width: '45%' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {hasMore && <div ref={observerTarget} style={{ height: '40px', marginTop: '1rem' }} />}
        </>
      )}
    </div>
  );
}

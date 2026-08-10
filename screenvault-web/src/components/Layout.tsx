import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import { getUser, clearUser } from '../auth';
import { safeFetch } from '../api';
import { API_BASE } from '../config';
import { Folder } from '../types';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export function Layout() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspacesLoaded, setWorkspacesLoaded] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinLink, setJoinLink] = useState('');
  const [folders, setFolders] = useState<Folder[]>([]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeFolderId = searchParams.get('folder');
  const user = getUser();

  useEffect(() => {
    if (!user) return;
    setActiveWorkspaceId(user.workspaceId);

    safeFetch(`${API_BASE}/workspaces`)
      .then(r => r.json())
      .then(data => { setWorkspaces(data.workspaces || []); setWorkspacesLoaded(true); })
      .catch(() => setWorkspacesLoaded(true));
  }, []);

  const fetchFolders = React.useCallback(async (workspaceId: string) => {
    try {
      const res = await safeFetch(`${API_BASE}/folders?workspaceId=${workspaceId}`);
      const data = await res.json();
      setFolders(data.folders || []);
    } catch {
      // folder tree just stays empty
    }
  }, []);

  useEffect(() => {
    if (activeWorkspaceId) fetchFolders(activeWorkspaceId);
  }, [activeWorkspaceId, fetchFolders]);

  const handleNewFolder = async () => {
    if (!activeWorkspaceId) return;
    const name = prompt('Folder name:');
    if (!name?.trim()) return;
    try {
      await safeFetch(`${API_BASE}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: activeWorkspaceId, name: name.trim() }),
      });
      fetchFolders(activeWorkspaceId);
    } catch (err: any) {
      alert(`Failed to create folder: ${err.message}`);
    }
  };

  const handleRenameFolder = async (e: React.MouseEvent, folder: Folder) => {
    e.stopPropagation();
    e.preventDefault();
    const name = prompt('Rename folder:', folder.name);
    if (!name?.trim() || name.trim() === folder.name) return;
    try {
      await safeFetch(`${API_BASE}/folders/${folder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (activeWorkspaceId) fetchFolders(activeWorkspaceId);
    } catch (err: any) {
      alert(`Failed to rename folder: ${err.message}`);
    }
  };

  const handleDeleteFolder = async (e: React.MouseEvent, folder: Folder) => {
    e.stopPropagation();
    e.preventDefault();
    if (!confirm(`Delete folder "${folder.name}"? Recordings inside it won't be deleted — they'll just be unfiled.`)) return;
    try {
      await safeFetch(`${API_BASE}/folders/${folder.id}`, { method: 'DELETE' });
      if (activeFolderId === folder.id) navigate('/library');
      if (activeWorkspaceId) fetchFolders(activeWorkspaceId);
    } catch (err: any) {
      alert(`Failed to delete folder: ${err.message}`);
    }
  };

  const switchWorkspace = async (workspaceId: string) => {
    const current = getUser();
    if (!current) return;
    const ws = workspaces.find(w => w.id === workspaceId);
    const updated = {
      ...current,
      workspaceId,
      workspaceSlug: ws?.slug || current.workspaceSlug,
      workspaceRole: ws?.role || 'member',
    };
    localStorage.setItem('sv_user', JSON.stringify(updated));
    setActiveWorkspaceId(workspaceId);
    window.location.reload();
  };

  const signOut = () => {
    clearUser();
    navigate('/login');
  };

  const handleJoinSubmit = () => {
    const raw = joinLink.trim();
    if (!raw) return;
    // extract UUID token from any invite URL format
    const match = raw.match(/invite\/([a-f0-9-]{36})/i);
    const token = match ? match[1] : raw;
    setShowJoinModal(false);
    setJoinLink('');
    navigate(`/invite/${token}`);
  };

  const navStyle = ({ isActive }: { isActive: boolean }) => ({
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    padding: '0.75rem 1rem', borderRadius: '12px', textDecoration: 'none',
    fontSize: '0.875rem', fontWeight: 500,
    color: isActive ? '#fff' : '#A1A1AA',
    background: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
    transition: 'all 0.2s ease',
  });

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <style>{`
        @keyframes sv-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes sv-panel-in { from { opacity: 0; transform: scale(0.96) translateY(4px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes sv-menu-in { from { opacity: 0; transform: scale(0.96) translateY(-4px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes sv-row-in { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: translateY(0); } }
        .sv-modal-backdrop { animation: sv-backdrop-in 0.15s cubic-bezier(0.4,0,0.2,1); }
        .sv-modal-panel { animation: sv-panel-in 0.22s cubic-bezier(0.16,1,0.3,1); }
        .sv-menu-panel { animation: sv-menu-in 0.16s cubic-bezier(0.16,1,0.3,1); transform-origin: top right; }
        .sv-row-in { animation: sv-row-in 0.18s cubic-bezier(0.16,1,0.3,1) backwards; }
        .sv-folder-row { transition: background 0.15s cubic-bezier(0.4,0,0.2,1), color 0.15s cubic-bezier(0.4,0,0.2,1); }
        .sv-folder-actions { opacity: 0; transition: opacity 0.15s cubic-bezier(0.4,0,0.2,1); }
        .sv-folder-row:hover .sv-folder-actions { opacity: 1; }
        .sv-icon-btn { transition: background 0.15s cubic-bezier(0.4,0,0.2,1), color 0.15s cubic-bezier(0.4,0,0.2,1), transform 0.1s cubic-bezier(0.4,0,0.2,1); }
        .sv-icon-btn:hover { background: rgba(255,255,255,0.08); color: #fff; }
        .sv-icon-btn:active { transform: scale(0.92); }
        .sv-btn-ghost { transition: background 0.15s cubic-bezier(0.4,0,0.2,1), color 0.15s cubic-bezier(0.4,0,0.2,1), border-color 0.15s cubic-bezier(0.4,0,0.2,1), transform 0.1s cubic-bezier(0.4,0,0.2,1); }
        .sv-btn-ghost:hover { background: rgba(255,255,255,0.06); color: #fff; }
        .sv-btn-ghost:active { transform: scale(0.98); }
        .sv-btn-press { transition: transform 0.1s cubic-bezier(0.4,0,0.2,1), background 0.15s cubic-bezier(0.4,0,0.2,1), filter 0.15s cubic-bezier(0.4,0,0.2,1); }
        .sv-btn-press:hover { filter: brightness(1.08); }
        .sv-btn-press:active { transform: scale(0.97); }
        .sv-card { transition: transform 0.2s cubic-bezier(0.16,1,0.3,1), border-color 0.2s cubic-bezier(0.16,1,0.3,1), box-shadow 0.2s cubic-bezier(0.16,1,0.3,1); }
        .sv-card:hover { transform: translateY(-3px); border-color: rgba(255,255,255,0.16); box-shadow: 0 12px 24px -8px rgba(0,0,0,0.5); }
      `}</style>
      {/* Join workspace modal */}
      {showJoinModal && (
        <div
          className="sv-modal-backdrop"
          onClick={() => setShowJoinModal(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '1rem',
          }}
        >
          <div
            className="sv-modal-panel"
            onClick={e => e.stopPropagation()}
            style={{
              background: '#09090B', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '1.25rem', padding: '2rem', width: '100%', maxWidth: '420px',
            }}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginBottom: '0.5rem' }}>
              Join a workspace
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#71717A', marginBottom: '1.25rem' }}>
              Paste an invite link you received (any format works).
            </p>
            <input
              autoFocus
              value={joinLink}
              onChange={e => setJoinLink(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleJoinSubmit()}
              placeholder="https://screenvault-web-7r9.pages.dev/invite/..."
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', padding: '0.75rem 1rem', borderRadius: '10px',
                fontSize: '0.875rem', outline: 'none', marginBottom: '1rem',
              }}
            />
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => { setShowJoinModal(false); setJoinLink(''); }}
                style={{
                  flex: 1, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#A1A1AA', padding: '0.75rem', borderRadius: '9999px',
                  fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleJoinSubmit}
                disabled={!joinLink.trim()}
                style={{
                  flex: 1, background: joinLink.trim() ? '#3b82f6' : 'rgba(59,130,246,0.3)',
                  border: 'none', color: '#fff', padding: '0.75rem', borderRadius: '9999px',
                  fontWeight: 600, cursor: joinLink.trim() ? 'pointer' : 'default', fontSize: '0.875rem',
                }}
              >
                Continue →
              </button>
            </div>
          </div>
        </div>
      )}
      <aside style={{
        width: '260px', flexShrink: 0,
        background: '#050505',
        borderRight: '1px solid rgba(255,255,255,0.04)',
        padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem',
        height: '100vh', overflowY: 'auto',
      }}>
        <a
          href="/"
          style={{ fontWeight: 700, fontSize: '1.25rem', color: '#fff', marginBottom: '2rem', paddingLeft: '0.5rem', letterSpacing: '-0.025em', textDecoration: 'none', display: 'block' }}
        >
          ScreenVault
        </a>

        <div style={{ marginBottom: '2rem' }}>
          <p style={{ fontSize: '0.65rem', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, paddingLeft: '0.5rem', marginBottom: '0.75rem' }}>Workspace</p>
          {workspacesLoaded && workspaces.length === 0 ? (
            <div style={{ padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)', fontSize: '0.75rem', color: '#ef4444', lineHeight: 1.5 }}>
              Session expired.{' '}
              <button onClick={signOut} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: 0, fontSize: '0.75rem', fontWeight: 600 }}>
                Sign in again
              </button>
            </div>
          ) : (
            <select
              value={activeWorkspaceId || ''}
              onChange={e => switchWorkspace(e.target.value)}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', padding: '0.75rem 1rem', borderRadius: '12px', fontSize: '0.875rem', outline: 'none', cursor: 'pointer',
              }}
            >
              {workspaces.map(w => (
                <option key={w.id} value={w.id} style={{ background: '#050505' }}>
                  {w.name} {w.role === 'owner' ? '(Personal)' : ''}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setShowJoinModal(true)}
            style={{
              marginTop: '0.5rem', width: '100%', background: 'transparent',
              border: '1px dashed rgba(255,255,255,0.1)', color: '#52525B',
              padding: '0.5rem 1rem', borderRadius: '10px', fontSize: '0.75rem',
              cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; e.currentTarget.style.color = '#A1A1AA'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#52525B'; }}
          >
            + Join a workspace
          </button>
        </div>

        <NavLink to="/library" end style={({ isActive }) => navStyle({ isActive: isActive && !activeFolderId })}>
          <span>▶</span> My Library
        </NavLink>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', marginLeft: '1.75rem', marginBottom: '0.5rem' }}>
          {folders.map((f, i) => {
            const isActive = f.id === activeFolderId;
            return (
              <div
                key={f.id}
                className="sv-folder-row sv-row-in"
                onClick={() => navigate(`/library?folder=${f.id}`)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
                  padding: '0.5rem 0.6rem', borderRadius: '9px', cursor: 'pointer',
                  fontSize: '0.8rem', fontWeight: 500,
                  color: isActive ? '#fff' : '#A1A1AA',
                  background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                  animationDelay: `${i * 20}ms`,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden', minWidth: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.8 }}>
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                  </svg>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                </span>
                <span className="sv-folder-actions" style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                  <button
                    className="sv-icon-btn"
                    onClick={e => handleRenameFolder(e, f)}
                    title="Rename folder"
                    style={{ background: 'none', border: 'none', color: '#A1A1AA', cursor: 'pointer', padding: '5px', borderRadius: '6px', display: 'flex' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </button>
                  <button
                    className="sv-icon-btn"
                    onClick={e => handleDeleteFolder(e, f)}
                    title="Delete folder"
                    style={{ background: 'none', border: 'none', color: '#A1A1AA', cursor: 'pointer', padding: '5px', borderRadius: '6px', display: 'flex' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                </span>
              </div>
            );
          })}
          <button
            className="sv-btn-ghost"
            onClick={handleNewFolder}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.6rem',
              background: 'none', border: 'none', color: '#71717A', cursor: 'pointer',
              fontSize: '0.8rem', fontWeight: 500, textAlign: 'left', borderRadius: '9px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Folder
          </button>
        </div>

        <NavLink to="/account" style={navStyle}>
          <span>⚙</span> Account
        </NavLink>

        {['karthik.upadhyay98@gmail.com', 'kartik.upadhyay@foyr.com'].includes(user?.email ?? '') && (
          <NavLink to="/admin" style={({ isActive }) => ({
            ...navStyle({ isActive }),
            marginTop: '0.5rem',
            borderTop: '1px solid rgba(255,255,255,0.04)',
            paddingTop: '1rem',
          })}>
            <span>🛡</span> Admin
          </NavLink>
        )}

        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ paddingLeft: '0.5rem', marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.8rem', color: '#fff', fontWeight: 500 }}>{user?.email}</div>
            <div style={{ fontSize: '0.7rem', color: '#52525B', marginTop: '2px', textTransform: 'capitalize' }}>{user?.workspaceRole}</div>
          </div>
          <button
            onClick={signOut}
            style={{
              width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
              color: '#71717A', padding: '0.6rem 1rem', borderRadius: '10px', fontSize: '0.8rem',
              cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#71717A'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, padding: '3rem', overflowY: 'auto', background: '#000' }}>
        <Outlet />
      </main>
    </div>
  );
}

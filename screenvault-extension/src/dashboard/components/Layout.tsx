import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import { safeFetch } from '../../utils/api';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: string;
  ownerId: string;
}

interface Folder {
  id: string;
  workspaceId: string;
  name: string;
}

export function Layout({ session }: { session: any }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeFolderId = searchParams.get('folder');

  const fetchFolders = React.useCallback(async (workspaceId: string) => {
    try {
      const res = await safeFetch(`https://screenvault-backend.tushar-abf.workers.dev/folders?workspaceId=${workspaceId}`);
      if (!res.ok) return;
      const data = await res.json();
      setFolders(data.folders || []);
    } catch {
      // silently ignore — folder tree just stays empty
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
      await safeFetch('https://screenvault-backend.tushar-abf.workers.dev/folders', {
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
      await safeFetch(`https://screenvault-backend.tushar-abf.workers.dev/folders/${folder.id}`, {
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
    if (!confirm(`Delete folder "${folder.name}"? Recordings inside it will not be deleted — they'll just be unfiled.`)) return;
    try {
      await safeFetch(`https://screenvault-backend.tushar-abf.workers.dev/folders/${folder.id}`, {
        method: 'DELETE',
      });
      if (activeFolderId === folder.id) navigate('/library');
      if (activeWorkspaceId) fetchFolders(activeWorkspaceId);
    } catch (err: any) {
      alert(`Failed to delete folder: ${err.message}`);
    }
  };

  useEffect(() => {
    async function init() {
      const storage = await chrome.storage.local.get(['sv_user']);
      if (!storage.sv_user?.accessToken) return;

      setActiveWorkspaceId(storage.sv_user.workspaceId);

      try {
        const res = await safeFetch('https://screenvault-backend.tushar-abf.workers.dev/workspaces');
        if (!res.ok) return;
        const data = await res.json();
        setWorkspaces(data.workspaces || []);
      } catch {
        // silently ignore — user will see workspace once token is refreshed
      }
    }
    init();
    
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === 'local' && changes.sv_user) {
        const newUser = changes.sv_user.newValue;
        if (newUser?.workspaceId) {
          setActiveWorkspaceId(newUser.workspaceId);
        }
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const switchWorkspace = async (workspaceId: string) => {
    const storage = await chrome.storage.local.get(['sv_user']);
    if (storage.sv_user) {
      const newWorkspace = workspaces.find(w => w.id === workspaceId);
      await chrome.storage.local.set({
        sv_user: { 
          ...storage.sv_user, 
          workspaceId,
          workspaceSlug: newWorkspace?.slug || storage.sv_user.workspaceSlug,
          workspaceRole: newWorkspace?.role || 'member'
        }
      });
      setActiveWorkspaceId(workspaceId);
      // Reload the library to show the new workspace's videos
      window.location.reload();
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{ 
        width: '260px', flexShrink: 0, 
        background: '#050505', 
        borderRight: '1px solid rgba(255,255,255,0.04)', 
        padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' 
      }}>
        <a href="https://screenvault.tushar-abf.workers.dev" target="_blank" rel="noreferrer" style={{ fontWeight: 700, fontSize: '1.25rem', color: '#fff', marginBottom: '2rem', paddingLeft: '0.5rem', letterSpacing: '-0.025em', textDecoration: 'none', display: 'block' }}>
          ScreenVault
        </a>

        <div style={{ marginBottom: '2rem' }}>
          <p style={{ fontSize: '0.65rem', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, paddingLeft: '0.5rem', marginBottom: '0.75rem' }}>Workspace</p>
          <select 
            value={activeWorkspaceId || ''} 
            onChange={(e) => switchWorkspace(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff',
              padding: '0.75rem 1rem',
              borderRadius: '12px',
              fontSize: '0.875rem',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            {workspaces.map(w => (
              <option key={w.id} value={w.id} style={{ background: '#050505' }}>
                {w.name} {w.role === 'owner' ? '(Personal)' : ''}
              </option>
            ))}
          </select>
        </div>

        <NavLink to="/library" end style={({ isActive }) => ({
          display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '12px', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500,
          color: isActive && !activeFolderId ? '#fff' : '#A1A1AA',
          background: isActive && !activeFolderId ? 'rgba(255,255,255,0.05)' : 'transparent',
          transition: 'all 0.2s ease'
        })}>
          <span>▶</span> My Library
        </NavLink>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginLeft: '1.75rem', marginBottom: '0.5rem' }}>
          {folders.map((f) => {
            const isActive = f.id === activeFolderId;
            return (
              <div
                key={f.id}
                onClick={() => navigate(`/library?folder=${f.id}`)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
                  padding: '0.5rem 0.75rem', borderRadius: '10px', cursor: 'pointer',
                  fontSize: '0.8rem', fontWeight: 500,
                  color: isActive ? '#fff' : '#A1A1AA',
                  background: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📁 {f.name}</span>
                <span style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  <button
                    onClick={(e) => handleRenameFolder(e, f)}
                    title="Rename folder"
                    style={{ background: 'none', border: 'none', color: '#71717A', cursor: 'pointer', fontSize: '0.75rem', padding: '2px' }}
                  >
                    ✎
                  </button>
                  <button
                    onClick={(e) => handleDeleteFolder(e, f)}
                    title="Delete folder"
                    style={{ background: 'none', border: 'none', color: '#71717A', cursor: 'pointer', fontSize: '0.75rem', padding: '2px' }}
                  >
                    🗑
                  </button>
                </span>
              </div>
            );
          })}
          <button
            onClick={handleNewFolder}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem',
              background: 'none', border: 'none', color: '#71717A', cursor: 'pointer',
              fontSize: '0.8rem', fontWeight: 500, textAlign: 'left', borderRadius: '10px',
            }}
          >
            + New Folder
          </button>
        </div>

        <NavLink to="/account" style={({ isActive }) => ({ 
          display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '12px', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500,
          color: isActive ? '#fff' : '#A1A1AA', 
          background: isActive ? 'rgba(255,255,255,0.05)' : 'transparent', 
          transition: 'all 0.2s ease' 
        })}>
          <span>⚙</span> Account & Plan
        </NavLink>
      </aside>
      <main style={{ flex: 1, padding: '3rem', overflowY: 'auto', background: '#000' }}>
        <Outlet />
      </main>
    </div>
  );
}

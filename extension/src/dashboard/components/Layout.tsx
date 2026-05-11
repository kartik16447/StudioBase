import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { safeFetch } from '../../utils/api';
import { BackendUser } from '../../types';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: string;
  ownerId: string;
}

export function Layout({ session }: { session: any }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function init() {
      const storage = (await chrome.storage.local.get(['sv_user'])) as { sv_user?: BackendUser };
      if (storage.sv_user) {
        setActiveWorkspaceId(storage.sv_user.workspaceId);
      }

      try {
        const res = await safeFetch('https://screenvault-backend.karthik-upadhyay98.workers.dev/workspaces');
        const data = await res.json();
        setWorkspaces(data.workspaces || []);
      } catch (err) {
        console.warn('Failed to fetch workspaces:', err);
      }
    }
    init();
    
      const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
        if (areaName === 'local' && changes.sv_user) {
          const newUser = changes.sv_user.newValue as BackendUser | undefined;
          if (newUser?.workspaceId) {
            setActiveWorkspaceId(newUser.workspaceId);
          }
        }
      };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const switchWorkspace = async (workspaceId: string) => {
    const storage = (await chrome.storage.local.get(['sv_user'])) as { sv_user?: BackendUser };
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
        <div style={{ fontWeight: 700, fontSize: '1.25rem', color: '#fff', marginBottom: '2rem', paddingLeft: '0.5rem', letterSpacing: '-0.025em' }}>
          ScreenVault
        </div>

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

        <NavLink to="/library" style={({ isActive }) => ({ 
          display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '12px', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500,
          color: isActive ? '#fff' : '#A1A1AA', 
          background: isActive ? 'rgba(255,255,255,0.05)' : 'transparent', 
          transition: 'all 0.2s ease' 
        })}>
          <span>▶</span> My Library
        </NavLink>
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

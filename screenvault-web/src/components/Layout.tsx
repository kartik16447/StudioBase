import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { getUser, clearUser } from '../auth';
import { safeFetch } from '../api';
import { API_BASE } from '../config';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export function Layout() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const navigate = useNavigate();
  const user = getUser();

  useEffect(() => {
    if (!user) return;
    setActiveWorkspaceId(user.workspaceId);

    safeFetch(`${API_BASE}/workspaces`)
      .then(r => r.json())
      .then(data => setWorkspaces(data.workspaces || []))
      .catch(() => {});
  }, []);

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

  const navStyle = ({ isActive }: { isActive: boolean }) => ({
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    padding: '0.75rem 1rem', borderRadius: '12px', textDecoration: 'none',
    fontSize: '0.875rem', fontWeight: 500,
    color: isActive ? '#fff' : '#A1A1AA',
    background: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
    transition: 'all 0.2s ease',
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: '260px', flexShrink: 0,
        background: '#050505',
        borderRight: '1px solid rgba(255,255,255,0.04)',
        padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem',
      }}>
        <a
          href="/"
          style={{ fontWeight: 700, fontSize: '1.25rem', color: '#fff', marginBottom: '2rem', paddingLeft: '0.5rem', letterSpacing: '-0.025em', textDecoration: 'none', display: 'block' }}
        >
          ScreenVault
        </a>

        <div style={{ marginBottom: '2rem' }}>
          <p style={{ fontSize: '0.65rem', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, paddingLeft: '0.5rem', marginBottom: '0.75rem' }}>Workspace</p>
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
        </div>

        <NavLink to="/library" style={navStyle}>
          <span>▶</span> My Library
        </NavLink>
        <NavLink to="/account" style={navStyle}>
          <span>⚙</span> Account
        </NavLink>

        {user?.email === 'karthik.upadhyay98@gmail.com' && (
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

import React from 'react';
import { getUser, clearUser } from '../auth';
import { useNavigate } from 'react-router-dom';

export function AccountPage() {
  const user = getUser();
  const navigate = useNavigate();

  const signOut = () => {
    clearUser();
    navigate('/login');
  };

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      <div style={{ marginBottom: '3rem' }}>
        <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 600, color: '#71717A', marginBottom: '0.5rem' }}>Account</p>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>Your Profile</h1>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ background: '#09090B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '1.25rem', padding: '1.5rem' }}>
          <p style={{ fontSize: '0.7rem', color: '#52525B', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: '1rem' }}>Profile</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#18181B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 700, color: '#fff', border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
              {(user?.email || 'U').charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 600 }}>{user?.email}</div>
              <div style={{ color: '#52525B', fontSize: '0.8rem', marginTop: '2px', textTransform: 'capitalize' }}>
                {user?.workspaceRole} · Workspace: {user?.workspaceSlug}
              </div>
            </div>
          </div>
        </div>

        <div style={{ background: '#09090B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '1.25rem', padding: '1.5rem' }}>
          <p style={{ fontSize: '0.7rem', color: '#52525B', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: '1rem' }}>Storage</p>
          <p style={{ color: '#A1A1AA', fontSize: '0.875rem', lineHeight: 1.6 }}>
            Recordings are saved to your team's shared storage automatically — there's no account to connect or switch.
          </p>
        </div>

        <div style={{ background: '#09090B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '1.25rem', padding: '1.5rem' }}>
          <p style={{ fontSize: '0.7rem', color: '#52525B', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: '1rem' }}>Session</p>
          <button
            onClick={signOut}
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', padding: '0.75rem 1.5rem', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem', transition: 'all 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

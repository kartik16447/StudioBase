import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { getUser, setUser } from '../auth';
import { API_BASE } from '../config';

export function JoinPage() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<'confirm' | 'joining' | 'success' | 'error' | 'no-token'>('confirm');
  const [errorMsg, setErrorMsg] = useState('');

  const key = token || searchParams.get('key') || extractTokenFromUrl(searchParams.get('link') || '');
  const user = getUser();

  function extractTokenFromUrl(raw: string): string {
    // support old player URL: .../#/invite/<token>  and new: .../invite/<token>
    const match = raw.match(/invite\/([a-f0-9-]{36})/i);
    return match ? match[1] : raw.trim();
  }

  useEffect(() => {
    if (!key) {
      setPhase('no-token');
      return;
    }
    if (!user) {
      sessionStorage.setItem('pendingInvite', key);
      navigate('/login');
    }
  }, [key, user, navigate]);

  const handleAccept = async () => {
    if (!user || !key) return;
    setPhase('joining');
    try {
      const res = await fetch(`${API_BASE}/workspace/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.accessToken}`,
        },
        body: JSON.stringify({ token: key }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setUser({ ...user, workspaceId: data.workspaceId });
      setPhase('success');
      setTimeout(() => navigate('/library'), 1800);
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong. The invite may have expired.');
      setPhase('error');
    }
  };

  if (phase === 'no-token') {
    return (
      <div style={centered}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔗</div>
        <h2 style={heading}>Invalid invite link</h2>
        <p style={sub}>This link doesn't contain a valid invite token.</p>
        <button style={btnPrimary} onClick={() => navigate('/library')}>Go to Library</button>
      </div>
    );
  }

  if (phase === 'joining') {
    return (
      <div style={centered}>
        <div style={spinner} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <h2 style={{ ...heading, marginTop: '1.5rem' }}>Joining workspace...</h2>
      </div>
    );
  }

  if (phase === 'success') {
    return (
      <div style={centered}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
        <h2 style={heading}>You're in!</h2>
        <p style={sub}>Workspace joined. Taking you to the library...</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div style={centered}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</div>
        <h2 style={{ ...heading, color: '#ef4444' }}>Couldn't join</h2>
        <p style={sub}>{errorMsg}</p>
        <button style={btnPrimary} onClick={() => navigate('/library')}>Go to Library</button>
      </div>
    );
  }

  // confirm phase
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: '#000' }}>
      <div style={{
        background: '#09090B',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '1.5rem',
        padding: '2.5rem',
        width: '100%',
        maxWidth: '420px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1.25rem' }}>📨</div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff', marginBottom: '0.75rem' }}>
          You've been invited!
        </h2>
        <p style={{ color: '#71717A', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '0.75rem' }}>
          You'll join this workspace and can access all its shared recordings.
        </p>
        {user && (
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '10px',
            padding: '0.6rem 1rem',
            fontSize: '0.8rem',
            color: '#A1A1AA',
            marginBottom: '2rem',
          }}>
            Joining as <strong style={{ color: '#fff' }}>{user.email}</strong>
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            style={{ ...btnSecondary, flex: 1 }}
            onClick={() => navigate('/library')}
          >
            Decline
          </button>
          <button
            style={{ ...btnPrimary, flex: 1, margin: 0 }}
            onClick={handleAccept}
          >
            Accept &amp; Join
          </button>
        </div>
      </div>
    </div>
  );
}

// ── styles ──────────────────────────────────────────────
const centered: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2rem',
  textAlign: 'center',
  background: '#000',
};

const heading: React.CSSProperties = {
  fontSize: '1.5rem',
  fontWeight: 700,
  color: '#fff',
  marginBottom: '0.75rem',
};

const sub: React.CSSProperties = {
  color: '#71717A',
  fontSize: '0.9rem',
  marginBottom: '2rem',
  lineHeight: 1.6,
  maxWidth: '320px',
};

const btnPrimary: React.CSSProperties = {
  background: '#3b82f6',
  color: '#fff',
  border: 'none',
  padding: '0.875rem 1.5rem',
  borderRadius: '9999px',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: '0.9rem',
  marginTop: '1rem',
};

const btnSecondary: React.CSSProperties = {
  background: 'transparent',
  color: '#A1A1AA',
  border: '1px solid rgba(255,255,255,0.1)',
  padding: '0.875rem 1.5rem',
  borderRadius: '9999px',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: '0.9rem',
};

const spinner: React.CSSProperties = {
  width: '40px',
  height: '40px',
  border: '3px solid rgba(255,255,255,0.1)',
  borderTopColor: '#3b82f6',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
};

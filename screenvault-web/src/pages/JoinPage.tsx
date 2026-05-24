import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { getUser, setUser } from '../auth';
import { API_BASE } from '../config';

export function JoinPage() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Joining workspace...');
  const [error, setError] = useState<string | null>(null);

  const key = token || searchParams.get('key');

  useEffect(() => {
    if (!key) {
      navigate('/library');
      return;
    }

    const user = getUser();
    if (!user) {
      // Save invite token and redirect to login
      sessionStorage.setItem('pendingInvite', key);
      navigate('/login');
      return;
    }

    async function processJoin() {
      try {
        const res = await fetch(`${API_BASE}/workspace/join`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user!.accessToken}`,
          },
          body: JSON.stringify({ token: key }),
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setUser({ ...user!, workspaceId: data.workspaceId });
        setStatus('Joined! Taking you to the library...');
        setTimeout(() => navigate('/library'), 1500);
      } catch (err: any) {
        setError(err.message);
      }
    }

    processJoin();
  }, [key, navigate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#fff', padding: '2rem', textAlign: 'center' }}>
      {error ? (
        <>
          <h2 style={{ color: '#ef4444', marginBottom: '1.5rem' }}>Oops!</h2>
          <p style={{ color: '#A1A1AA', marginBottom: '2rem', maxWidth: '400px' }}>{error}</p>
          <button
            onClick={() => navigate('/library')}
            style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '9999px', fontWeight: 600, cursor: 'pointer' }}
          >
            Go to Library
          </button>
        </>
      ) : (
        <>
          <div style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '2rem' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>{status}</h2>
        </>
      )}
    </div>
  );
}

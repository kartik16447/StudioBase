import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setUser, getUser } from '../auth';
import { API_BASE, GOOGLE_CLIENT_ID } from '../config';

declare global {
  interface Window {
    google?: any;
  }
}

export function LoginPage() {
  const navigate = useNavigate();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getUser()) {
      navigate('/library', { replace: true });
      return;
    }

    const init = () => {
      if (!window.google || !GOOGLE_CLIENT_ID) return;

      window.google.accounts.oauth2
        .initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: 'email profile https://www.googleapis.com/auth/drive',
          callback: async (resp: any) => {
            if (resp.error) {
              setError('Google sign-in was cancelled or failed.');
              setLoading(false);
              return;
            }
            await handleToken(resp.access_token);
          },
        })
        .__tokenClient = true;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: () => {},
      });

      if (buttonRef.current) {
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'filled_black',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          width: 280,
        });
      }
    };

    if (window.google) {
      init();
    } else {
      const interval = setInterval(() => {
        if (window.google) {
          clearInterval(interval);
          init();
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [navigate]);

  const handleToken = async (accessToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setUser({ accessToken, ...data });
      navigate('/library', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Sign-in failed. Please try again.');
      setLoading(false);
    }
  };

  const handleGoogleClick = () => {
    if (!GOOGLE_CLIENT_ID) {
      setError('Google Client ID not configured. Add VITE_GOOGLE_CLIENT_ID to your .env file.');
      return;
    }
    setLoading(true);
    setError(null);
    if (window.google) {
      window.google.accounts.oauth2
        .initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: 'email profile https://www.googleapis.com/auth/drive',
          callback: async (resp: any) => {
            if (resp.error) {
              setError('Google sign-in was cancelled or failed.');
              setLoading(false);
              return;
            }
            await handleToken(resp.access_token);
          },
        })
        .requestAccessToken();
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#000',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
    }}>
      <div style={{ marginBottom: '3rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>
          ScreenVault
        </div>
        <div style={{ fontSize: '0.9rem', color: '#71717A' }}>
          Your team's screen recording library
        </div>
      </div>

      <div style={{
        background: '#09090B',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '1.5rem',
        padding: '2.5rem',
        width: '100%',
        maxWidth: '380px',
        textAlign: 'center',
      }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff', marginBottom: '0.5rem' }}>
          Sign in
        </h1>
        <p style={{ color: '#71717A', fontSize: '0.875rem', marginBottom: '2rem' }}>
          Use the same Google account linked to your extension
        </p>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: '0.75rem',
            padding: '0.75rem 1rem',
            color: '#ef4444',
            fontSize: '0.8rem',
            marginBottom: '1.5rem',
            textAlign: 'left',
          }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', color: '#A1A1AA', padding: '0.75rem 0' }}>
            <div style={{
              width: '18px', height: '18px',
              border: '2px solid rgba(255,255,255,0.1)',
              borderTopColor: '#3b82f6',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            Signing you in...
          </div>
        ) : (
          <button
            onClick={handleGoogleClick}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              background: '#fff',
              color: '#000',
              border: 'none',
              borderRadius: '9999px',
              padding: '0.875rem 1.5rem',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#e5e7eb'}
            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>
        )}
      </div>

      <p style={{ marginTop: '2rem', color: '#52525B', fontSize: '0.75rem', textAlign: 'center', maxWidth: '320px', lineHeight: 1.6 }}>
        Sign in with the Google account you connected in the Chrome extension to access your workspace.
      </p>
    </div>
  );
}

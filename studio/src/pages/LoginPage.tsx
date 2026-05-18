import React, { useEffect, useRef, useState } from 'react';
import { sessionManager } from '../lib/auth/sessionManager';

const GOOGLE_CLIENT_ID = '813435932187-oktc8br8kq98luccqgmsdnhju3h80lht.apps.googleusercontent.com';

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Component ─────────────────────────────────────────────────────────────────

export const LoginPage: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const verifierRef = useRef<string>('');

  // Send the auth code + PKCE verifier to our backend — it holds the client secret
  const exchangeCode = async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      const redirectUri = window.location.origin + '/';
      await sessionManager.loginWithGoogleCode(code, verifierRef.current, redirectUri);
      window.dispatchEvent(new CustomEvent('sb:login'));
    } catch (e: any) {
      const msg = e?.data?.error || e?.data?.message || e.message || 'Login failed';
      console.error('❌ [Login] Auth failed:', e);
      setError(`${msg} (status: ${e.status ?? 'network error'})`);
      setLoading(false);
    }
  };

  async function handleSignIn() {
    // Use origin + '/' — Google Cloud Console redirect URIs must match exactly.
    // Some clients require the trailing slash; add both variants in Google Cloud Console.
    const redirectUri = window.location.origin + '/';
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    verifierRef.current = verifier;

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });

    const popup = window.open(
      `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      'google_oauth',
      'width=500,height=620,left=200,top=100,resizable=yes,scrollbars=yes'
    );

    if (!popup) {
      setError('Popup was blocked — please allow popups for localhost and try again.');
      return;
    }

    // Poll until Google redirects the popup back to our origin with ?code=...
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      try {
        if (popup.closed) { clearInterval(pollRef.current!); return; }
        if (popup.location.origin !== window.location.origin) return; // still on Google

        const search = popup.location.search;
        const code = new URLSearchParams(search).get('code');
        console.log('[OAuth] Popup returned to our origin, search:', search);
        clearInterval(pollRef.current!);
        popup.close();

        if (code) {
          console.log('[OAuth] Got code, exchanging via backend...');
          exchangeCode(code);
        } else {
          console.warn('[OAuth] No code in redirect:', search);
          setError('Sign-in cancelled — no authorisation code returned.');
        }
      } catch {
        // cross-origin while popup is on accounts.google.com — expected, keep polling
      }
    }, 200);
  }

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 rounded-[18px] bg-primary text-white flex items-center justify-center font-bold text-2xl shadow-xl shadow-primary/25 mb-4">
            S
          </div>
          <h1 className="text-2xl font-bold text-[#1D1D1F] tracking-tight">StudioBase</h1>
          <p className="text-text-3 text-sm mt-1">Sign in to your workspace</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-border p-8 flex flex-col items-center gap-5">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-text-3">Signing in…</p>
            </div>
          ) : (
            <>
              <p className="text-[13px] text-text-2 text-center">
                Use your Google account to sign in.
              </p>

              <button
                onClick={handleSignIn}
                disabled={loading}
                className="flex items-center gap-3 px-6 py-2.5 rounded-lg border border-border bg-white hover:bg-gray-50 transition-colors text-[14px] font-medium text-[#1D1D1F] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed w-[280px] justify-center"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" fillRule="evenodd">
                    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                    <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                    <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
                    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
                  </g>
                </svg>
                Sign in with Google
              </button>

              {error && (
                <p className="text-red-500 text-xs text-center mt-2">{error}</p>
              )}
            </>
          )}
        </div>

        <p className="text-center text-[11px] text-text-3 mt-6">
          By signing in you agree to our Terms of Service.
        </p>
      </div>
    </div>
  );
};

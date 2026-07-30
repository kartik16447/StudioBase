import React, { useEffect, useState } from 'react';
import { StorageAccount } from '../../types';

export function AccountPage({ session }: { session: any }) {
  const [accounts, setAccounts] = useState<StorageAccount[]>([]);
  const [isConnectingAccount, setIsConnectingAccount] = useState(false);

  const loadAccounts = async () => {
    const storage = await chrome.storage.local.get(['sv_accounts']);
    setAccounts((storage.sv_accounts || []) as StorageAccount[]);
  };

  useEffect(() => {
    loadAccounts();

    const listener = (changes: any) => {
      if (changes.sv_accounts) {
        setAccounts(changes.sv_accounts.newValue || []);
        setIsConnectingAccount(false);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const signIn = () => {
    setIsConnectingAccount(true);
    chrome.runtime.sendMessage({ type: "CONNECT_ACCOUNT" });

    // Failsafe: Reset skeleton after 1 minute if user cancels/fails
    setTimeout(() => setIsConnectingAccount(false), 60000);
  };

  const account = accounts[0];

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', position: 'relative' }}>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .skeleton {
          background: linear-gradient(90deg, #1f2937 25%, #374151 50%, #1f2937 75%);
          background-size: 200% 100%;
          animation: shimmer 1.2s infinite;
        }
        .skeleton-avatar { width: 40px; height: 40px; border-radius: 50%; }
        .skeleton-line { width: 140px; height: 14px; border-radius: 4px; margin-bottom: 8px; }
        .skeleton-line.short { width: 80px; height: 10px; }
      `}</style>

      <div style={{ marginBottom: '3rem' }}>
        <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 600, color: '#71717A', marginBottom: '0.5rem' }}>Account</p>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>Signed in</h1>
        <p style={{ color: '#71717A', marginTop: '0.75rem', maxWidth: '520px' }}>
          Recordings are saved to your team's shared storage — there's nothing to configure here beyond who you're signed in as.
        </p>
      </div>

      <div style={{ display: 'grid', gap: '1rem' }}>
        {account && (
          <div style={{
            background: '#09090B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '1.25rem', padding: '1.25rem 1.5rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#18181B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 600, color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
                {account.displayName.charAt(0)}
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: '1rem' }}>{account.email}</div>
              </div>
            </div>
            <button
              onClick={signIn}
              style={{
                background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)',
                padding: '0.5rem 1rem', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem'
              }}
            >
              Switch account
            </button>
          </div>
        )}

        {!account && !isConnectingAccount && (
          <button
            onClick={signIn}
            style={{
              background: '#fff', color: '#000', border: 'none',
              padding: '0.75rem 1.5rem', borderRadius: '12px', fontWeight: 600, cursor: 'pointer', width: 'fit-content'
            }}
          >
            Sign in with Google
          </button>
        )}

        {isConnectingAccount && (
          <div style={{
            background: '#09090B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '1.25rem', padding: '1.25rem 1.5rem',
            display: 'flex', alignItems: 'center', gap: '1.25rem', opacity: 0.8
          }}>
            <div className="skeleton skeleton-avatar" />
            <div>
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line short" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

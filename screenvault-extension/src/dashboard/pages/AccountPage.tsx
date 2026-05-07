import React, { useEffect, useState } from 'react';
import { StorageAccount } from '../../types';

export function AccountPage({ session }: { session: any }) {
  const [accounts, setAccounts] = useState<StorageAccount[]>([]);
  const [pendingAccountEmail, setPendingAccountEmail] = useState<string | null>(null);
  const [isConnectingAccount, setIsConnectingAccount] = useState(false);

  const loadAccounts = async () => {
    // If a transition is in progress, do not reload to prevent flickering
    if (pendingAccountEmail) return;

    const storage = await chrome.storage.local.get(['sv_accounts']);
    let accs = (storage.sv_accounts || []) as StorageAccount[];
    
    // Safety Rule: Ensure exactly 1 active account. Fallback to Primary.
    if (accs.length > 0) {
      const hasActive = accs.some(a => a.isActive);
      if (!hasActive) {
        accs = accs.map(a => ({
          ...a,
          isActive: a.isPrimary
        }));
        await chrome.storage.local.set({ sv_accounts: accs });
      }
    }
    
    setAccounts(accs);
  };

  useEffect(() => {
    loadAccounts();
    
    // Storage Sync Listener
    const listener = (changes: any) => {
      // PART 6: Prevent flicker/stale state
      if (changes.sv_accounts && !pendingAccountEmail) {
        setAccounts(changes.sv_accounts.newValue || []);
        setIsConnectingAccount(false); // Clear skeleton on update
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [pendingAccountEmail]);

  const useForSaving = async (email: string) => {
    // PART 4 & 5: Optimistic Update & Feedback Transition
    setPendingAccountEmail(email);

    const updated = accounts.map(a => ({
      ...a,
      isActive: a.email === email
    }));
    setAccounts(updated);
    
    await chrome.storage.local.set({ sv_accounts: updated });
    chrome.runtime.sendMessage({ type: "SWITCH_UPLOAD_ACCOUNT", email });

    setTimeout(() => {
      setPendingAccountEmail(null);
    }, 400);
  };

  const connectNew = () => {
    setIsConnectingAccount(true);
    chrome.runtime.sendMessage({ type: "CONNECT_ACCOUNT" });
    
    // Failsafe: Reset skeleton after 1 minute if user cancels/fails
    setTimeout(() => setIsConnectingAccount(false), 60000);
  };

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
        .skeleton-badge { width: 64px; height: 24px; border-radius: 6px; }
      `}</style>

      <div style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 600, color: '#71717A', marginBottom: '0.5rem' }}>Storage Settings</p>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>Where are videos saved?</h1>
        </div>
        <button 
          onClick={connectNew}
          style={{ 
            background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', 
            padding: '0.75rem 1.5rem', borderRadius: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
        >
          + Add Account
        </button>
      </div>

      <div style={{ display: 'grid', gap: '1rem' }}>
        {accounts.map(acc => {
          const freeBytes = Math.max(0, acc.quotaTotal - acc.quotaUsed);
          const freeGB = (freeBytes / (1024 * 1024 * 1024)).toFixed(1);
          
          return (
            <div key={acc.email} style={{ 
              background: '#09090B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '1.25rem', padding: '1.25rem 1.5rem',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#18181B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 600, color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {acc.displayName.charAt(0)}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.1rem' }}>
                    <span style={{ fontWeight: 600, color: '#fff', fontSize: '1rem' }}>{acc.email}</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#52525B' }}>
                    {freeGB} GB available
                  </div>
                </div>
              </div>

              {/* PART 3: UI RENDER LOGIC */}
              <div style={{ minWidth: '140px', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', alignItems: 'center' }}>
                {acc.isPrimary && acc.isActive && !pendingAccountEmail ? (
                  <>
                    <span style={{ background: 'rgba(255, 255, 255, 0.05)', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Main</span>
                    <span style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#4ade80', fontSize: '0.65rem', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Saving</span>
                  </>
                ) : acc.isPrimary && !acc.isActive && acc.email !== pendingAccountEmail ? (
                  <>
                    <span style={{ background: 'rgba(255, 255, 255, 0.05)', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Main</span>
                    <button 
                      onClick={() => useForSaving(acc.email)}
                      style={{ background: '#fff', border: 'none', color: '#000', padding: '0.4rem 1rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                    >Use</button>
                  </>
                ) : acc.email === pendingAccountEmail ? (
                  <span style={{ color: '#4ade80', fontWeight: 600, fontSize: '0.875rem' }}>✓</span>
                ) : acc.isActive ? (
                  <span style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#4ade80', fontSize: '0.65rem', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Saving</span>
                ) : (
                  <button 
                    onClick={() => useForSaving(acc.email)}
                    style={{ background: '#fff', border: 'none', color: '#000', padding: '0.4rem 1rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#e5e7eb'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  >
                    Use
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {isConnectingAccount && (
          <div style={{ 
            background: '#09090B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '1.25rem', padding: '1.25rem 1.5rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.8
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              <div className="skeleton skeleton-avatar" />
              <div>
                <div className="skeleton skeleton-line" />
                <div className="skeleton skeleton-line short" />
              </div>
            </div>
            <div className="skeleton skeleton-badge" />
          </div>
        )}
      </div>
    </div>
  );
}

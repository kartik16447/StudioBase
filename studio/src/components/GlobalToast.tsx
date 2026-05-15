import React, { useEffect, useState } from 'react';
import { cn } from './ui';
import { I } from './icons';

interface Toast {
  id: number;
  type: 'error' | 'warning' | 'info';
  message: string;
}

let toastCount = 0;
const listeners: Set<(t: Toast) => void> = new Set();

export function showToast(type: Toast['type'], message: string) {
  const t: Toast = { id: ++toastCount, type, message };
  listeners.forEach(fn => fn(t));
}

export const GlobalToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const add = (t: Toast) => {
      setToasts(prev => [...prev, t]);
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 5000);
    };
    listeners.add(add);

    // Wire up global API events
    const onAuthExpired = () => {
      add({ id: ++toastCount, type: 'error', message: 'Session expired. Please sign in again.' });
      setTimeout(() => window.location.reload(), 2000);
    };
    const onPermDenied = (e: Event) => {
      const path = (e as CustomEvent).detail?.path || '';
      add({ id: ++toastCount, type: 'error', message: `You do not have permission to perform this action.${path ? ` (${path})` : ''}` });
    };
    const onServerError = (e: Event) => {
      const { path, message } = (e as CustomEvent).detail || {};
      add({ id: ++toastCount, type: 'warning', message: `Server error${path ? ` on ${path}` : ''}: ${message || 'Unknown error'}` });
    };

    window.addEventListener('SB_AUTH_EXPIRED', onAuthExpired);
    window.addEventListener('SB_PERMISSION_DENIED', onPermDenied);
    window.addEventListener('SB_SERVER_ERROR', onServerError);

    return () => {
      listeners.delete(add);
      window.removeEventListener('SB_AUTH_EXPIRED', onAuthExpired);
      window.removeEventListener('SB_PERMISSION_DENIED', onPermDenied);
      window.removeEventListener('SB_SERVER_ERROR', onServerError);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 max-w-sm">
      {toasts.map(t => (
        <div
          key={t.id}
          className={cn(
            'flex items-start gap-3 px-4 py-3 rounded-lg shadow-xl border text-sm font-medium',
            t.type === 'error' && 'bg-[#1a0a0a] border-red-500/30 text-red-300',
            t.type === 'warning' && 'bg-[#1a1200] border-yellow-500/30 text-yellow-300',
            t.type === 'info' && 'bg-surface-2 border-white/10 text-text-2',
          )}
        >
          {t.type === 'error' && <I.AlertCircle size={16} className="shrink-0 mt-0.5 text-red-400" />}
          {t.type === 'warning' && <I.AlertTriangle size={16} className="shrink-0 mt-0.5 text-yellow-400" />}
          {t.type === 'info' && <I.Info size={16} className="shrink-0 mt-0.5 text-blue-400" />}
          <span className="leading-snug">{t.message}</span>
        </div>
      ))}
    </div>
  );
};

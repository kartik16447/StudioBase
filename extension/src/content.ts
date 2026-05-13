import { startCapture, stopCapture } from './capture/dom-observer';
import { injectToolbar, removeToolbar } from './capture/toolbar';

// ─── Token Injection for Studio ─────────────────────────────
const isStudio = window.location.host.includes('localhost:5173') || window.location.host.includes('studiobase.app');
if (isStudio) {
  function syncToken(sb_user: any) {
    if (sb_user?.accessToken) {
      sessionStorage.setItem('sb_token', sb_user.accessToken);
      localStorage.setItem('sb_token', sb_user.accessToken);
      if (sb_user.workspaceId) {
        sessionStorage.setItem('sb_workspaceId', sb_user.workspaceId);
        localStorage.setItem('sb_workspaceId', sb_user.workspaceId);
      }
      // Dispatch event so the app can react if needed
      window.dispatchEvent(new CustomEvent('SB_TOKEN_UPDATED', { detail: sb_user.accessToken }));
    }
  }

  // Initial sync
  chrome.storage.local.get(['sb_user']).then((stored) => {
    syncToken(stored.sb_user);
  }).catch(() => {});

  // Real-time sync
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.sb_user) {
      syncToken(changes.sb_user.newValue);
    }
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'START_CAPTURE') {
    startCapture();
    injectToolbar();
  }
  if (msg.type === 'STOP_CAPTURE') {
    stopCapture();
    removeToolbar();
  }
});

import { startCapture, stopCapture } from './capture/dom-observer';
import { injectToolbar, removeToolbar } from './capture/toolbar';

// ─── Token Injection for Studio ─────────────────────────────
const isStudio = window.location.host.includes('localhost:5173') || window.location.host.includes('studiobase.app');
if (isStudio) {
  function writeExtToken(token: string, workspaceId?: string) {
    // Always write with a fresh timestamp so App.tsx knows the token is live.
    // The token comes from chrome.identity (via service worker) which handles
    // OAuth refresh internally — it is always valid, never the stale stored one.
    localStorage.setItem('sb_ext_token', JSON.stringify({ token, ts: Date.now() }));
    if (workspaceId) {
      sessionStorage.setItem('sb_workspaceId', workspaceId);
      localStorage.setItem('sb_workspaceId', workspaceId);
    }
    window.dispatchEvent(new CustomEvent('SB_TOKEN_UPDATED', { detail: token }));
  }

  // Ask the service worker for a guaranteed-fresh Google token.
  // The SW uses chrome.identity.getAuthToken which auto-refreshes the token —
  // this always succeeds as long as the user is signed into Chrome, regardless
  // of when they last signed into the extension.
  chrome.storage.local.get(['sb_user']).then((stored) => {
    const workspaceId = stored.sb_user?.workspaceId;
    chrome.runtime.sendMessage({ type: 'GET_FRESH_TOKEN' }, (response) => {
      if (chrome.runtime.lastError || !response?.token) return;
      writeExtToken(response.token, workspaceId);
    });
  }).catch(() => {});

  // When the extension user changes (e.g. signs out and back in), refresh again.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.sb_user) {
      const workspaceId = changes.sb_user.newValue?.workspaceId;
      chrome.runtime.sendMessage({ type: 'GET_FRESH_TOKEN' }, (response) => {
        if (chrome.runtime.lastError || !response?.token) return;
        writeExtToken(response.token, workspaceId);
      });
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

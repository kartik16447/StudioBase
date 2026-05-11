// Content script entry point — injected into every page by Chrome.
// Watches chrome.storage.local for state changes instead of relying on
// message passing, which is unreliable in MV3 (service worker restarts,
// timing races, tab ID resolution failures).
import { startCapture, stopCapture } from './capture/dom-observer';

function syncCaptureState(status: string | undefined) {
  if (status === 'recording') {
    startCapture();
  } else {
    stopCapture();
  }
}

// Activate immediately if already recording when the script loads
chrome.storage.local.get(['sb_state'], (result) => {
  syncCaptureState(result.sb_state?.status);
});

// React to state changes in real-time
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.sb_state) return;
  syncCaptureState(changes.sb_state.newValue?.status);
});

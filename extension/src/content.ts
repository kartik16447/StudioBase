import { startCapture, stopCapture } from './capture/dom-observer';

function syncCaptureState(status: string | undefined) {
  if (status === 'recording') startCapture();
  else stopCapture();
}

// Start immediately if SW was already recording when this page loaded
chrome.storage.local.get(['sb_state'], (result) => {
  syncCaptureState(result.sb_state?.status);
});

// React to recording state changes in real-time
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.sb_state) {
    syncCaptureState(changes.sb_state.newValue?.status);
  }
});

import { startCapture, stopCapture } from './capture/dom-observer';
import { injectToolbar, removeToolbar } from './capture/toolbar';

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

// Content script entry point — injected into every page by Chrome.
// Listens for messages from the service worker to start/stop capture.
import { startCapture, stopCapture } from './capture/dom-observer';

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'START_CAPTURE') startCapture();
  if (msg.type === 'STOP_CAPTURE') stopCapture();
});

// ============================================================
// KEEPALIVE
// Maintains a persistent port connection from content script to SW.
// Chrome will not terminate a SW while a port is open.
// Also manages chrome.alarms as a secondary keepalive mechanism.
// ============================================================

const ALARM_NAME = 'studiobase-keepalive';
const PING_INTERVAL_MINUTES = 0.4; // every ~24 seconds

let activePort: chrome.runtime.Port | null = null;

export function initKeepalive() {
  // Primary: alarm-based keepalive (works even without an active tab)
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: PING_INTERVAL_MINUTES });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      // Simply being invoked keeps the SW alive
      console.log('[KEEPALIVE] SW alive');
    }
  });

  // Secondary: port connection from content script
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'studiobase-session') {
      activePort = port;
      port.onDisconnect.addListener(() => {
        activePort = null;
      });
    }
  });
}

export function stopKeepalive() {
  chrome.alarms.clear(ALARM_NAME);
  if (activePort) {
    activePort.disconnect();
    activePort = null;
  }
}

export function isPortConnected(): boolean {
  return activePort !== null;
}

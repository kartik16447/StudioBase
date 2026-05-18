import { BACKEND_URL } from '../../shared/constants';

export async function sbLog(tag: string, data: any) {
  const logMessage = {
    tag,
    data,
    timestamp: new Date().toISOString(),
    source: 'extension'
  };

  // 1. Local Console
  console.log(`[${tag}]`, data);

  // If we are in a context that can send messages (like offscreen or popup),
  // and we are NOT the service worker, we should also notify the service worker
  // so it can handle the persistent logging and backend sync reliably.
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    const isServiceWorker = typeof window === 'undefined';
    
    if (!isServiceWorker) {
      chrome.runtime.sendMessage({ type: 'LOG', logMessage }).catch(() => {});
    }
  }

  // 2. Persistent Storage (optional, for dashboard view)
  try {
    const res = (await chrome.storage.local.get("sb_logs")) as { sb_logs?: any[] };
    const logs = res.sb_logs || [];
    logs.push(logMessage);
    if (logs.length > 100) logs.shift();
    await chrome.storage.local.set({ sb_logs: logs });
  } catch (e) {}

  // 3. Send to Backend for terminal visibility
  try {
    const { token, sessionId } = await chrome.storage.local.get(["token", "sessionId"]);

    if (token) {
      await fetch(`${BACKEND_URL}/v1/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...logMessage,
          sessionId
        })
      }).catch(() => {});
    }
  } catch (e) {}
}

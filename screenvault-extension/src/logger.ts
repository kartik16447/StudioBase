
export async function svLog(tag: string, data: any) {
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
    // Check if we are the service worker - in MV3 SW, chrome.action is usually present, 
    // but a better check is to see if we have access to 'window'
    const isServiceWorker = typeof window === 'undefined';
    
    if (!isServiceWorker) {
      chrome.runtime.sendMessage({ type: 'LOG', logMessage }).catch(() => {});
      // We still continue to try local storage and fetch here as a secondary path
    }
  }

  // 2. Persistent Storage (optional, for dashboard view)
  try {
    const res = await chrome.storage.local.get("sv_logs");
    const logs = res.sv_logs || [];
    logs.push(logMessage);
    if (logs.length > 100) logs.shift();
    await chrome.storage.local.set({ sv_logs: logs });
  } catch (e) {}

  // 3. Send to Backend for terminal visibility (wrangler tail)
  try {
    const { sv_user, sv_state, sv_accounts } = await chrome.storage.local.get(["sv_user", "sv_state", "sv_accounts"]);
    const sessionId = sv_state?.sessionId;

    // Prefer a non-expired account token over sv_user (which may be stale if
    // the primary account is idle while a secondary is actively recording)
    const now = Date.now();
    const accounts: any[] = sv_accounts || [];
    const freshAccount = accounts.find(a => !a.invalid && a.expiresAt > now + 60_000);
    const activeToken = freshAccount?.accessToken ?? sv_user?.accessToken;

    if (activeToken) {
      await fetch('https://screenvault-backend.karthik-upadhyay98.workers.dev/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({
          ...logMessage,
          sessionId
        })
      }).catch(() => {});
    }
  } catch (e) {}
}

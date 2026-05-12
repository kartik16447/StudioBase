export interface CaptureEvent {
  type: string;
  timestamp: number;
  selector: string;
  data: Record<string, any>;
}

export interface Session {
  sessionId: string;
  tabUrl: string;
  startedAt: string;
  endedAt?: string;
  status: 'recording' | 'paused' | 'stopped';
  events: CaptureEvent[];
  videoKey?: string | null;
}

// ─── IndexedDB Helpers ───────────────────────────────────────

const DB_NAME = 'studiobase';
const STORE_NAME = 'screenshots';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveScreenshot(sessionId: string, stepIndex: number, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(blob, `${sessionId}_${stepIndex}`);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getScreenshots(sessionId: string): Promise<{ stepIndex: number, blob: Blob }[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    // Use bound range to find all keys starting with {sessionId}_
    const range = IDBKeyRange.bound(`${sessionId}_`, `${sessionId}_\uffff`);
    const request = store.openCursor(range);
    const results: { stepIndex: number, blob: Blob }[] = [];

    request.onsuccess = (event: any) => {
      const cursor = event.target.result;
      if (cursor) {
        const key = cursor.key as string;
        const indexStr = key.substring(key.lastIndexOf('_') + 1);
        results.push({ stepIndex: parseInt(indexStr, 10), blob: cursor.value });
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// ─── Session Lifecycle ───────────────────────────────────────

/**
 * Generates a new session and stores it in session storage.
 */
export async function startSession(tabUrl: string): Promise<string> {
  const sessionId = crypto.randomUUID();
  const session: Session = {
    sessionId,
    tabUrl,
    startedAt: new Date().toISOString(),
    status: 'recording',
    events: []
  };
  
  await chrome.storage.session.set({ sb_sessions: session });
  return sessionId;
}

/**
 * Sets session status to 'paused'.
 */
export async function pauseSession(sessionId: string): Promise<void> {
  const { sb_sessions } = await chrome.storage.session.get('sb_sessions') as { sb_sessions?: Session };
  if (sb_sessions && sb_sessions.sessionId === sessionId) {
    sb_sessions.status = 'paused';
    await chrome.storage.session.set({ sb_sessions });
  }
}

/**
 * Sets session status to 'recording'.
 */
export async function resumeSession(sessionId: string): Promise<void> {
  const { sb_sessions } = await chrome.storage.session.get('sb_sessions') as { sb_sessions?: Session };
  if (sb_sessions && sb_sessions.sessionId === sessionId) {
    sb_sessions.status = 'recording';
    await chrome.storage.session.set({ sb_sessions });
  }
}

/**
 * Marks the session as stopped and records completion time.
 */
export async function stopSession(sessionId: string): Promise<void> {
  const { sb_sessions } = await chrome.storage.session.get('sb_sessions') as { sb_sessions?: Session };
  if (sb_sessions && sb_sessions.sessionId === sessionId) {
    sb_sessions.status = 'stopped';
    sb_sessions.endedAt = new Date().toISOString();
    await chrome.storage.session.set({ sb_sessions });
  }
}

/**
 * Retrieves the current session.
 */
export async function getSession(sessionId: string): Promise<Session | null> {
  const { sb_sessions } = await chrome.storage.session.get('sb_sessions') as { sb_sessions?: Session };
  if (sb_sessions && sb_sessions.sessionId === sessionId) {
    return sb_sessions as Session;
  }
  return null;
}

/**
 * Appends a capture event to the current session.
 */
export async function appendEvent(sessionId: string, event: CaptureEvent): Promise<void> {
  const { sb_sessions } = await chrome.storage.session.get('sb_sessions') as { sb_sessions?: Session };
  if (sb_sessions && sb_sessions.sessionId === sessionId) {
    sb_sessions.events.push(event);
    await chrome.storage.session.set({ sb_sessions });
  }
}

/**
 * SW restart recovery: retrieves any active session from session storage.
 */
export async function recoverSession(): Promise<Session | null> {
  const { sb_sessions } = await chrome.storage.session.get('sb_sessions') as { sb_sessions?: Session };
  if (sb_sessions && (sb_sessions.status === 'recording' || sb_sessions.status === 'paused')) {
    return sb_sessions as Session;
  }
  return null;
}

/**
 * Aborts and removes the current session from session storage.
 */
export async function abortSession(sessionId: string): Promise<void> {
  const { sb_sessions } = await chrome.storage.session.get('sb_sessions') as { sb_sessions?: Session };
  if (sb_sessions && sb_sessions.sessionId === sessionId) {
    await chrome.storage.session.remove('sb_sessions');
  }
}

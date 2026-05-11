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
  events: CaptureEvent[];
}

/**
 * Manages the lifecycle of a capture session.
 */
export async function startSession(tabUrl: string): Promise<string> {
  const sessionId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  
  const session: Session = {
    sessionId,
    tabUrl,
    startedAt,
    events: []
  };

  const { sb_sessions = {} } = await chrome.storage.local.get("sb_sessions");
  sb_sessions[sessionId] = session;
  await chrome.storage.local.set({ sb_sessions });

  return sessionId;
}

/**
 * Marks the session as ended.
 */
export async function stopSession(sessionId: string): Promise<void> {
  const { sb_sessions = {} } = await chrome.storage.local.get("sb_sessions");
  if (sb_sessions[sessionId]) {
    sb_sessions[sessionId].endedAt = new Date().toISOString();
    await chrome.storage.local.set({ sb_sessions });
  }
}

/**
 * Retrieves a session from storage.
 */
export async function getSession(sessionId: string): Promise<Session | null> {
  const { sb_sessions = {} } = await chrome.storage.local.get("sb_sessions");
  return sb_sessions[sessionId] || null;
}

/**
 * Appends a capture event to a specific session.
 */
export async function appendEvent(sessionId: string, event: CaptureEvent): Promise<void> {
  const { sb_sessions = {} } = await chrome.storage.local.get("sb_sessions");
  if (sb_sessions[sessionId]) {
    sb_sessions[sessionId].events.push(event);
    await chrome.storage.local.set({ sb_sessions });
  }
}

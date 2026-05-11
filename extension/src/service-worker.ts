import {
  AppState,
  PopupMessage,
  WorkerMessage,
  BackendUser,
} from "./types";
import { svLog } from "./logger";

// ─── State ───────────────────────────────────────────────────

let state: AppState = {
  status: "idle",
  sessionId: null,
  startedAt: null,
  target: null,
  uploadProgress: 0,
  uploadUrl: null,
  preAllocatedFileId: null,
  uploadAccount: null,
  errorMessage: null,
  backendVideoId: null,
};

let lastStateStr: string | null = null;

// ─── Initialization ──────────────────────────────────────────

async function loadState() {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return;
  try {
    const stored = await chrome.storage.local.get(["sb_state"]);
    if (stored.sb_state) state = stored.sb_state as AppState;
    
    svLog("STATE_REHYDRATED", { status: state.status });
  } catch (err) {
    console.warn("Extension initialization warning:", err);
  }
}

loadState();

// ─── State Management ────────────────────────────────────────

async function updateState(partial: Partial<AppState>) {
  const newState = { ...state, ...partial };
  const newStateStr = JSON.stringify(newState);

  if (newStateStr === lastStateStr) {
    return;
  }

  state = newState;
  lastStateStr = newStateStr;

  await chrome.storage.local.set({ sb_state: state });
  chrome.runtime
    .sendMessage({ type: "STATE_UPDATE", state } as WorkerMessage)
    .catch(() => {});
}

async function getCurrentUser(): Promise<BackendUser> {
  const { sb_user } = (await chrome.storage.local.get("sb_user")) as {
    sb_user: BackendUser;
  };
  if (!sb_user) {
    throw new Error("No authenticated user found. Please sign in.");
  }
  return sb_user;
}

// ─── Session Metadata Helpers ────────────────────────────────

async function saveSessionMetadata(
  sessionId: string,
  metadata: any,
) {
  try {
    const res = await chrome.storage.local.get("sb_sessions");
    const sb_sessions = (res.sb_sessions || {}) as Record<string, any>;
    sb_sessions[sessionId] = {
      ...(sb_sessions[sessionId] || {}),
      ...metadata,
      sessionId,
    };
    await chrome.storage.local.set({ sb_sessions });
  } catch (err) {
    console.error("Metadata save failed:", err);
  }
}

async function getSessionMetadata(sessionId: string): Promise<any | null> {
  const res = await chrome.storage.local.get("sb_sessions");
  const sb_sessions = (res.sb_sessions || {}) as Record<string, any>;
  return sb_sessions[sessionId] || null;
}

async function removeSessionMetadata(sessionId: string) {
  try {
    const res = await chrome.storage.local.get("sb_sessions");
    const sb_sessions = (res.sb_sessions || {}) as Record<string, any>;
    delete sb_sessions[sessionId];
    await chrome.storage.local.set({ sb_sessions });
  } catch (err) {
    console.error("Metadata remove failed:", err);
  }
}

// ─── Message Listener ────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (msg: any, sender, sendResponse) => {
    if (msg.type === "GET_STATE") {
      chrome.storage.local.get(["sb_state"]).then((res) => {
        sendResponse(res.sb_state || state);
      });
      return true;
    } else if (msg.type === "GET_USER") {
      chrome.storage.local.get("sb_user").then((res) => sendResponse(res.sb_user));
      return true;
    } 

    // Phase 1 Capture Flow placeholders
    else if (msg.type === "START_CAPTURE") {
      // Signal content scripts to start observing
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: "START_CAPTURE" });
          updateState({ status: "recording", startedAt: Date.now(), sessionId: crypto.randomUUID() });
        }
      });
    } else if (msg.type === "STOP_CAPTURE") {
      // Signal content scripts to stop observing
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: "STOP_CAPTURE" });
          updateState({ status: "idle" });
        }
      });
    }

    // Logging from content scripts
    else if (msg.type === "LOG" && msg.logMessage) {
      const { tag, data } = msg.logMessage;
      svLog(tag, data);
    }
  }
);

// ─── Lifecycle Hooks ─────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  console.log("[StudioBase] Extension installed.");
  await chrome.storage.local.set({ sb_state: state });
});

chrome.runtime.onStartup.addListener(() => {
  console.log("[StudioBase] Browser started.");
});


import { AppState, CaptureTarget, WorkerMessage, BackendUser } from "./types";
import { sbLog } from "./logger";
import { BACKEND_URL } from "../../shared/constants";
import {
  startSession,
  stopSession,
  getSession,
  appendEvent,
  abortSession,
  saveScreenshot,
} from "./background/session-manager";
import { uploadSession } from "./background/r2-uploader";

// ─── State ───────────────────────────────────────────────────

let state: AppState = { status: "idle" };

let isOffscreenReady = false;
const ENABLE_OFFSCREEN_CAPTURE = true;

// ─── Initialization ──────────────────────────────────────────

async function init() {
  try {
    const stored = await chrome.storage.local.get(["sb_state"]);
    if (stored.sb_state) state = stored.sb_state as AppState;

    sbLog("STATE_REHYDRATED", { status: state.status });
  } catch (err) {
    console.warn("Extension initialization warning:", err);
  }
}

void init();

// ─── Focus Sensor ────────────────────────────────────────────

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (state.status !== "recording") return;
  
  // If windowId is -1, it means focus is completely outside of Chrome
  const isChromeFocused = windowId !== chrome.windows.WINDOW_ID_NONE;
  
  console.log(`🧭 [ServiceWorker] Focus changed. Chrome focused: ${isChromeFocused}`);
  
  chrome.runtime.sendMessage({ 
    type: 'WINDOW_FOCUS_CHANGED', 
    isChromeFocused 
  }).catch(() => {});
});

// ─── Message Handling ────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (msg: any, _sender, sendResponse) => {
    // GET_STATE is the only synchronous response — handle it and return false
    if (msg.type === "GET_STATE") {
      sendResponse(state);
      return false;
    }

    if (msg.type === 'OFFSCREEN_READY') {
      console.log("🚀 [ServiceWorker] Offscreen is ready for frame capture.");
      isOffscreenReady = true;
      return false;
    }

    if (msg.type === 'SAVE_DESKTOP_EVENT') {
      if (state.status === 'recording' && state.sessionId) {
        const { eventType, payload, blob } = msg;
        console.log(`💾 [ServiceWorker] Saving desktop event: ${eventType}`);
        
        // 1. Handle Screenshot if present
        const handleCapture = async () => {
          if (blob && state.sessionId) {
            const session = await getSession(state.sessionId);
            const stepIndex = (session?.events?.length ?? 0);
            await saveScreenshot(state.sessionId, stepIndex, blob);
            return `screenshots/${state.sessionId}/${stepIndex}.jpg`;
          }
          return null;
        };

        handleCapture().then(async (screenshotKey) => {
          if (!state.sessionId) return;
          await appendEvent(state.sessionId, {
            type: eventType,
            timestamp: payload.timestamp || Date.now(),
            selector: "",
            data: { 
              ...payload, 
              screenshotKey: screenshotKey || payload.screenshotKey,
              context: payload.context || 'desktop'
            },
          });
        });
      }
      return false;
    }

    // All other messages are fire-and-forget — dispatch async work but
    // close the channel immediately (return false) to avoid the
    // "message channel closed before response received" error.
    switch (msg.type) {
      case "SET_STATUS":
        updateState({ status: msg.status });
        break;
      case "START_RECORDING":
        startRecording(msg.target);
        break;
      case "STOP_RECORDING":
        stopRecording();
        break;
      case "ABORT_RECORDING":
        abortRecording();
        break;
      case "RETRY_UPLOAD":
        retryUpload();
        break;
      case "CAPTURE_STEP":
        if (state.status === "recording" && state.sessionId) {
          const p = msg.payload;
          const sessionId = state.sessionId;
          appendEvent(sessionId, {
            type: p.action,
            timestamp: p.timestamp,
            selector: p.selector || "",
            data: { ...p, cursorMode: p.cursorMode || "default" },
          })
            .then(async () => {
              try {
                const session = await getSession(sessionId);
                const stepIndex = (session?.events?.length ?? 1) - 1;
                await captureCurrentStep(sessionId, stepIndex);
              } catch (err) {
                console.warn("[StudioBase] Screenshot capture failed:", err);
              }
            })
            .catch((err) =>
              console.warn("[StudioBase] appendEvent failed:", err),
            );
        }
        break;
      case "LOG": {
        const { tag, data } = msg.logMessage;
        sbLog(tag, data);
        break;
      }
      case "UPLOAD_HEARTBEAT":
        // This keeps the service worker alive during long offscreen uploads
        chrome.storage.local.get(['sb_state']).catch(() => {});
        break;
    }
    return false; // channel closed — no async response needed
  },
);

// ... rest of the functions ...

async function captureCurrentStep(sessionId: string, stepIndex: number) {
  let blob: Blob | null = null;
  let captureSource = 'unknown';

  if (ENABLE_OFFSCREEN_CAPTURE && isOffscreenReady) {
    try {
      console.log(`📸 [ServiceWorker] Requesting frame from offscreen for step ${stepIndex}`);
      // Timeout the message just in case offscreen is frozen
      const responsePromise = chrome.runtime.sendMessage({ type: 'GET_FRAME' });
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject('timeout'), 2000));
      
      const response = await Promise.race([responsePromise, timeoutPromise]) as any;
      
      if (response && response.blob) {
        blob = response.blob;
        captureSource = 'offscreen';
      } else {
        console.warn("📸 [ServiceWorker] Offscreen capture returned no blob, falling back...");
      }
    } catch (err) {
      console.error("📸 [ServiceWorker] Offscreen capture failed:", err);
    }
  }

  // Fallback to captureVisibleTab if offscreen fails or is disabled
  if (!blob) {
    try {
      console.log(`⚠️ [ServiceWorker] Using fallback captureVisibleTab for step ${stepIndex}`);
      const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 80 });
      const res = await fetch(dataUrl);
      blob = await res.blob();
      captureSource = 'browser-tab';
    } catch (err) {
      console.error("📸 [ServiceWorker] All capture methods failed:", err);
      return;
    }
  }

  console.log(`✅ [ServiceWorker] Step ${stepIndex} captured via ${captureSource} (${blob?.size} bytes)`);

  if (blob) {
    await saveScreenshot(sessionId, stepIndex, blob);
  }
}
 
// ─── External Message Handling (for Studio Website) ──────────
 
chrome.runtime.onMessageExternal.addListener(
  (msg: any, _sender, sendResponse) => {
    if (msg.type === "GET_AUTH_TOKEN") {
      chrome.storage.local.get(["sb_user"]).then((stored) => {
        sendResponse({ 
          token: stored.sb_user?.accessToken || null,
          workspaceId: stored.sb_user?.workspaceId || null,
          userId: stored.sb_user?.userId || null
        });
      }).catch(() => sendResponse({ token: null }));
      return true; // Keep channel open for async response
    }
    return false;
  }
);

// ─── State Updates ───────────────────────────────────────────

async function updateState(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  await chrome.storage.local.set({ sb_state: state });
  chrome.runtime.sendMessage({ type: "STATE_UPDATE", state }).catch(() => {});
}

// ─── Recording Logic ─────────────────────────────────────────

async function startRecording(target: CaptureTarget) {
  try {
    const tabUrl = target.tabTitle || target.tabUrl || "";
    const sessionId = await startSession(tabUrl);
    await updateState({
      status: "recording",
      sessionId,
      localSessionId: sessionId,
      startedAt: Date.now(),
      target, // tabId is in here
      includeMic: target.includeMic ?? false,
      includeVideo: target.includeVideo ?? false,
    });

    if (target.tabId) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: target.tabId },
          files: ['content.js'],
        });
      } catch (_) {
        // Already injected or restricted page — safe to ignore
      }
      chrome.tabs.sendMessage(target.tabId, { type: 'START_CAPTURE' }).catch(() => {});
    }

    if (target.includeVideo) {
      const hasDoc = await chrome.offscreen.hasDocument().catch(() => false);
      if (!hasDoc) {
        await chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: [chrome.offscreen.Reason.USER_MEDIA],
          justification: 'Screen recording for StudioBase session'
        });
      }
      chrome.runtime.sendMessage({ type: 'START_VIDEO_RECORDING' }).catch(() => {});
    }

    sbLog("RECORDING_STARTED", { sessionId, target });
  } catch (err: any) {
    updateState({ status: "error", errorMessage: err.message });
  }
}

async function abortRecording() {
  const sessionId = state.localSessionId || state.sessionId;
  if (sessionId) {
    await abortSession(sessionId);
  }
  await updateState({
    status: "idle",
    sessionId: null,
    localSessionId: null,
    startedAt: null,
    target: null,
  });
  sbLog("RECORDING_ABORTED", { sessionId });
}

async function stopRecording() {
  if (state.status !== "recording") return;

  const sessionId = state.sessionId!;

  if (state.target?.tabId) {
    chrome.tabs
      .sendMessage(state.target.tabId, { type: "STOP_CAPTURE" })
      .catch(() => {});
  }

  await updateState({ status: "uploading", uploadProgress: 0 });

  try {
    // Bug 3 fix: mark endedAt BEFORE reading session for upload
    await stopSession(sessionId);

    const session = await getSession(sessionId);
    if (!session) {
      throw new Error(
        `[StudioBase] Local session data not found for ${sessionId}`,
      );
    }

    if (state.includeVideo) {
      try {
        await chrome.runtime.sendMessage({ type: 'STOP_VIDEO_RECORDING' });
      } catch (err) {
        console.warn("[StudioBase] Failed to stop offscreen recording:", err);
      }
    }

    const backendSessionId = await uploadSession(session, (pct) => {
      updateState({ uploadProgress: pct });
    }, state.includeVideo);

    await updateState({
      status: "ready",
      sessionId: backendSessionId,
      uploadProgress: 100,
    });

    sbLog("RECORDING_FINISHED", { sessionId: backendSessionId });
  } catch (err: any) {
    console.error("Upload failed:", err);
    updateState({ status: "failed_enrichment", errorMessage: err.message });
  }
}

async function retryUpload() {
  if (state.status !== "failed_enrichment") return;
  const localSessionId = state.localSessionId || state.sessionId;
  if (!localSessionId) return;

  await updateState({ status: "uploading", uploadProgress: 0 });
  try {
    const session = await getSession(localSessionId);
    if (!session) throw new Error("Local session not found");

    const backendSessionId = await uploadSession(session, (pct) => {
      updateState({ uploadProgress: pct });
    });

    await updateState({
      status: "ready",
      sessionId: backendSessionId,
      uploadProgress: 100,
    });
  } catch (err: any) {
    console.error("Retry upload failed:", err);
    updateState({ status: "failed_enrichment", errorMessage: err.message });
  }
}

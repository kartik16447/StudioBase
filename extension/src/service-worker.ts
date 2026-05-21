import { AppState, CaptureTarget, WorkerMessage, BackendUser, StorageSchema } from "./types";
import { sbLog } from "./logger";
import { BACKEND_URL } from "../../shared/constants";
import {
  startSession,
  stopSession,
  getSession,
  appendEvent,
  abortSession,
  saveScreenshot,
  saveChunk,
  getChunks,
} from "./background/session-manager";
import { initSession, uploadSessionAssets, uploadSession } from "./background/r2-uploader";
import { initKeepalive } from "./background/keepalive";

// ─── State ───────────────────────────────────────────────────

let state: AppState = { status: "idle" };
// Resolved once init() has rehydrated state from storage. Gate all handlers
// that check state.status behind this promise so a restarted SW never drops
// the first CAPTURE_STEP that arrives before the async read completes.
let initResolve!: () => void;
const initPromise = new Promise<void>((res) => { initResolve = res; });

let isOffscreenReady = false;
const ENABLE_OFFSCREEN_CAPTURE = true;

// ─── Event Queue & Deduplication ─────────────────────────────
let eventQueue: Promise<any> = Promise.resolve();
let lastEventLog: Record<string, number> = {};

function queueEvent(task: () => Promise<void>, dedupeKey?: string) {
  if (dedupeKey) {
    const now = Date.now();
    if (lastEventLog[dedupeKey] && now - lastEventLog[dedupeKey] < 500) {
      console.log(`🚫 [ServiceWorker] Deduplicated rapid-fire event: ${dedupeKey}`);
      return eventQueue;
    }
    lastEventLog[dedupeKey] = now;
  }

  eventQueue = eventQueue.then(task).catch(err => {
    console.error("❌ [ServiceWorker] Event Queue Error:", err);
  });
  return eventQueue;
}

// ─── Initialization ──────────────────────────────────────────

async function init() {
  try {
    initKeepalive();
    const result = await chrome.storage.local.get(["sb_state"]);
    const stored = result as StorageSchema;
    if (stored.sb_state) state = stored.sb_state;

    if (state.status === 'recording') {
      startRecordingTimer();
    }

    sbLog("STATE_REHYDRATED", { status: state.status });
  } catch (err) {
    console.warn("Extension initialization warning:", err);
  } finally {
    initResolve();
  }
}

void init();

let timerInterval: any = null;

function updateBadgeTimer() {
  if (state.status === 'recording' && state.startedAt) {
    const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    chrome.action.setBadgeText({ text: `${m}:${s.toString().padStart(2, '0')}` });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

function startRecordingTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(updateBadgeTimer, 1000);
  updateBadgeTimer();
}

function stopRecordingTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  chrome.action.setBadgeText({ text: '' });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (state.status === "recording" && state.target?.tabId === tabId) {
    if (changeInfo.status === "complete") {
      chrome.tabs.sendMessage(tabId, { type: 'START_CAPTURE' }).catch(() => {});
    }
  }
});

// ─── Focus Sensor ────────────────────────────────────────────

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (state.status !== "recording") return;
  
  // If windowId is -1, it means focus is completely outside of Chrome
  const isChromeFocused = windowId !== chrome.windows.WINDOW_ID_NONE;
  
  console.log(`🧭 [ServiceWorker] Focus changed. Chrome focused: ${isChromeFocused}`);
  
  if (!isChromeFocused) {
    // Snap-on-Exit: Grab the frame immediately and save an explicit anchor
    queueEvent(async () => {
      if (state.status !== "recording" || !state.sessionId) return;
      
      console.log("🧭 [ServiceWorker] Focus lost. Triggering explicit Desktop Anchor...");
      // Trigger the offscreen buffer
      await chrome.runtime.sendMessage({ type: 'CAPTURE_CURRENT_FRAME_NOW' }).catch(() => {});
      
      // Give offscreen a small window to complete the buffer
      await new Promise(res => setTimeout(res, 400));

      const response = await chrome.runtime.sendMessage({ type: 'GET_FRAME' }).catch(() => null);
      if (response && response.base64data) {
        const res = await fetch(response.base64data);
        const blob = await res.blob();
        
        const session = await getSession(state.sessionId);
        const stepIndex = session?.events?.length ?? 0;
        
        await saveScreenshot(state.sessionId, stepIndex, blob);
        await appendEvent(state.sessionId, {
          type: 'desktop_anchor',
          timestamp: Date.now(),
          selector: "",
          data: { 
            screenshotKey: `screenshots/${state.sessionId}/${stepIndex}.jpg`,
            context: 'desktop'
          },
        });
        console.log("✅ [ServiceWorker] Explicitly saved Desktop Anchor:", stepIndex);
      }
    }, 'focus_lost');
  }
  
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

    // GET_FRESH_TOKEN — used by the studio content script to get a guaranteed-live
    // Google access token. chrome.identity.getAuthToken handles the OAuth refresh
    // automatically so the returned token is always valid (never expired).
    if (msg.type === "GET_FRESH_TOKEN") {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError || !token) {
          sendResponse({ token: null });
          return;
        }
        const t = typeof token === "string" ? token : (token as any).token;
        sendResponse({ token: t || null });
      });
      return true; // keep channel open for async response
    }

    if (msg.type === 'OFFSCREEN_READY') {
      console.log("🚀 [ServiceWorker] Offscreen is ready for frame capture.");
      isOffscreenReady = true;
      return false;
    }

    if (msg.type === 'SAVE_DESKTOP_EVENT') {
      initPromise.then(() => {
        if (state.status !== 'recording' || !state.sessionId) return;
        const { eventType, payload, blob } = msg;

        // Suppress redundant desktop_focus_lost in favor of explicit anchors
        if (eventType === 'desktop_focus_lost') return;

        queueEvent(async () => {
          if (!state.sessionId) return;
          console.log("📥 [SW Audit] Received Desktop Event from Offscreen:", {
            eventType,
            hasBlob: !!blob,
            blobSize: blob?.size
          });

          const handleCapture = async () => {
            if (blob && state.sessionId) {
              const session = await getSession(state.sessionId);
              const stepIndex = (session?.events?.length ?? 0);
              await saveScreenshot(state.sessionId, stepIndex, blob);
              return `screenshots/${state.sessionId}/${stepIndex}.jpg`;
            }
            return null;
          };

          const screenshotKey = await handleCapture();
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
        }, eventType);
      });
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
        // Await init() before checking state — a restarted SW may not have
        // rehydrated state yet when the first click message arrives.
        initPromise.then(() => {
          if (state.status !== "recording" || !state.sessionId) return;
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
        });
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
      case 'SAVE_CHUNK':
        if (msg.sessionId && msg.base64data) {
          fetch(msg.base64data).then(res => res.blob()).then(blob => {
            console.log(`💾 [ServiceWorker] Chunk received: ${blob.size} bytes`);
            saveChunk(msg.sessionId, msg.index, blob).catch(err => {
              console.error("💾 [ServiceWorker] Failed to save video chunk:", err);
            });
          });
        }
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
      
      if (response && response.base64data) {
        const res = await fetch(response.base64data);
        blob = await res.blob();
        captureSource = 'offscreen';
      } else {
        console.log("📸 [ServiceWorker] Offscreen capture returned no base64data, falling back...");
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
      chrome.storage.local.get(["sb_user"]).then((result) => {
        const stored = result as StorageSchema;
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
      chrome.runtime.sendMessage({ type: 'START_VIDEO_RECORDING', sessionId }).catch(() => {});
    }

    startRecordingTimer();
    sbLog("RECORDING_STARTED", { sessionId, target });

    chrome.storage.local.get(["sb_user", "workspaceId"]).then((stored: any) => {
      const token = stored.sb_user?.accessToken;
      const wsId = stored.workspaceId || stored.sb_user?.workspaceId;
      if (token && wsId) {
        fetch(`${BACKEND_URL}/v1/audit-logs`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "x-workspace-id": wsId,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            action: 'session.capture_started',
            workspaceId: wsId,
            targetId: sessionId,
            metadata: { source: 'extension' }
          })
        }).catch(console.warn);
      }
    });

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
  stopRecordingTimer();
  sbLog("RECORDING_ABORTED", { sessionId });
}

async function stopRecording() {
  if (state.status !== "recording") return;

  const sessionId = state.sessionId!;
  const includeVideo = state.includeVideo;

  if (state.target?.tabId) {
    chrome.tabs.sendMessage(state.target.tabId, { type: "STOP_CAPTURE" }).catch(() => {});
  }

  await updateState({ status: "uploading", uploadProgress: 0 });

  try {
    await stopSession(sessionId);

    const session = await getSession(sessionId);
    if (!session) throw new Error(`[StudioBase] Local session data not found for ${sessionId}`);

    // Signal offscreen to stop — don't await, give it 600ms to flush the final chunk
    if (includeVideo) {
      chrome.runtime.sendMessage({ type: 'STOP_VIDEO_RECORDING' }).catch(() => {});
      await new Promise(res => setTimeout(res, 600));
    }

    // ── Init session on backend — this is the only blocking call ──
    // As soon as we have the ID we show the link to the user.
    const { activeSessionId, ...auth } = await initSession(session);

    await updateState({ status: "ready", sessionId: activeSessionId, uploadProgress: 100 });
    stopRecordingTimer();
    sbLog("RECORDING_FINISHED", { sessionId: activeSessionId });

    // ── Upload everything in the background ───────────────────────
    uploadSessionAssets(session, activeSessionId, auth, undefined, includeVideo)
      .then(() => {
        chrome.storage.local.get(["sb_user", "workspaceId"]).then((stored: any) => {
          const token = stored.sb_user?.accessToken;
          const wsId = stored.workspaceId || stored.sb_user?.workspaceId;
          if (token && wsId) {
            fetch(`${BACKEND_URL}/v1/audit-logs`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "x-workspace-id": wsId, "Content-Type": "application/json" },
              body: JSON.stringify({
                action: 'session.capture_completed',
                workspaceId: wsId,
                targetId: activeSessionId,
                metadata: { source: 'extension', hasVideo: !!includeVideo }
              })
            }).catch(console.warn);
          }
        });
      })
      .catch(err => console.error("[StudioBase] Background upload failed:", err));

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

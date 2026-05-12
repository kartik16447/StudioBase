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

// ─── Message Handling ────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (msg: WorkerMessage, _sender, sendResponse) => {
    // GET_STATE is the only synchronous response — handle it and return false
    if (msg.type === "GET_STATE") {
      sendResponse(state);
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
                const dataUrl = await chrome.tabs.captureVisibleTab({
                  format: "jpeg",
                  quality: 70,
                });
                const blob = await fetch(dataUrl).then((r) => r.blob());
                await saveScreenshot(sessionId, stepIndex, blob);
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
    }
    return false; // channel closed — no async response needed
  },
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
    });

    if (target.tabId) {
      chrome.tabs
        .sendMessage(target.tabId, { type: "START_CAPTURE" })
        .catch(() => {});
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

    const backendSessionId = await uploadSession(session, (pct) => {
      updateState({ uploadProgress: pct });
    });

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

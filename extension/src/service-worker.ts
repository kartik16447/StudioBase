import {
  AppState,
  CaptureTarget,
  WorkerMessage,
} from "./types";
import { sbLog } from "./logger";
import {
  startSession,
  stopSession,
  getSession,
  appendEvent,
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

chrome.runtime.onMessage.addListener((msg: WorkerMessage, _sender, sendResponse) => {
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
    case "CAPTURE_STEP":
      if (state.status === "recording" && state.sessionId) {
        const p = msg.payload;
        appendEvent(state.sessionId, {
          type: p.action,
          timestamp: p.timestamp,
          selector: p.selector || "",
          data: p,
        }).catch((err) =>
          console.warn("[StudioBase] appendEvent failed:", err)
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
});

// ─── State Updates ───────────────────────────────────────────

async function updateState(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  await chrome.storage.local.set({ sb_state: state });
  chrome.runtime.sendMessage({ type: "STATE_UPDATE", state }).catch(() => {});
}

// ─── Recording Logic ─────────────────────────────────────────

async function startRecording(target: CaptureTarget) {
  try {
    const streamId = target.streamId;
    if (!streamId) {
      throw new Error("No streamId provided for recording");
    }

    // Bug 1 fix: startSession() generates the UUID AND saves to session storage
    const tabUrl = target.tabTitle || "";
    const sessionId = await startSession(tabUrl);

    await updateState({
      status: "recording",
      sessionId,
      startedAt: Date.now(),
      target: { ...target, streamId },
    });

    sbLog("RECORDING_STARTED", { sessionId, target });
  } catch (err: any) {
    updateState({ status: "error", errorMessage: err.message });
  }
}

async function stopRecording() {
  if (state.status !== "recording") return;

  const sessionId = state.sessionId!;
  await updateState({ status: "uploading", uploadProgress: 0 });

  try {
    // Bug 3 fix: mark endedAt BEFORE reading session for upload
    await stopSession(sessionId);

    const session = await getSession(sessionId);
    if (!session) {
      throw new Error(`[StudioBase] Local session data not found for ${sessionId}`);
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
    updateState({ status: "error", errorMessage: err.message });
  }
}

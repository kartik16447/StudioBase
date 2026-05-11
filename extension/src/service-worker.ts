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
let initDone = false;
let messageQueue: WorkerMessage[] = [];

// ─── Initialization ──────────────────────────────────────────

async function init() {
  try {
    const stored = await chrome.storage.local.get(["sb_state"]);
    if (stored.sb_state) state = stored.sb_state as AppState;
    sbLog("STATE_REHYDRATED", { status: state.status });
  } catch (err) {
    console.warn("Extension initialization warning:", err);
  }
  initDone = true;
  // Drain any messages that arrived before init completed
  for (const msg of messageQueue) handleMessage(msg);
  messageQueue = [];
}

void init();

// ─── Message Handling ────────────────────────────────────────

function handleMessage(msg: WorkerMessage) {
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
        }).catch((err) => console.warn("[StudioBase] appendEvent failed:", err));
      }
      break;
    case "LOG": {
      const { tag, data } = msg.logMessage;
      sbLog(tag, data);
      break;
    }
  }
}

chrome.runtime.onMessage.addListener((msg: WorkerMessage, _sender, sendResponse) => {
  if (msg.type === "GET_STATE") {
    sendResponse(state);
    return false;
  }
  // Queue messages that arrive before init completes (SW restart race)
  if (!initDone) {
    messageQueue.push(msg);
    return false;
  }
  handleMessage(msg);
  return false;
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
    if (!streamId) throw new Error("No streamId provided for recording");

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
    await stopSession(sessionId);

    const session = await getSession(sessionId);
    if (!session) throw new Error(`[StudioBase] Local session data not found for ${sessionId}`);

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

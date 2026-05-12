import { AppState, BackendUser } from "./types";
import { sbLog } from "./logger";
import { BACKEND_URL, STUDIO_URL } from "../../shared/constants";

let state: AppState;
let localTimerInterval: ReturnType<typeof setInterval> | null = null;
let lastAutoCopiedUrl: string | null = null;

// Elements
const screenAuth = document.getElementById("screen-auth")!;
const screenIdle = document.getElementById("screen-idle")!;
const screenRecording = document.getElementById("screen-recording")!;
const screenUploading = document.getElementById("screen-uploading")!;
const screenSuccess = document.getElementById("screen-success")!;
const screenError = document.getElementById("screen-error")!;

const allScreens = [
  screenAuth,
  screenIdle,
  screenRecording,
  screenUploading,
  screenSuccess,
  screenError,
];

const headerUserInfo = document.getElementById("header-user-info")!;
const userEmailEl = document.getElementById("user-email")!;
const userAvatarEl = document.getElementById("user-avatar")!;

const btnSignin = document.getElementById("btn-signin")!;
const btnNewRecording = document.getElementById("btn-new-recording")!;
const recTitleInput = document.getElementById("rec-title-input") as HTMLInputElement;

const btnStop = document.getElementById("btn-stop")!;
const btnCopyLink = document.getElementById("btn-copy-link")!;
const btnOpenStudio = document.getElementById("btn-open-studio")!;
const btnRecordAgain = document.getElementById("btn-record-again")!;
const btnTryAgain = document.getElementById("btn-try-again")!;
const btnToggleMic = document.getElementById("btn-toggle-mic") as HTMLButtonElement;
const btnSkipCountdown = document.getElementById("btn-skip-countdown") as HTMLButtonElement;

const recTimer = document.getElementById("rec-timer")!;
const recTargetLabel = document.getElementById("rec-target-label")!;
const progressFill = document.getElementById("progress-fill")!;
const progressPct = document.getElementById("progress-pct")!;
const uploadStatusLabel = document.getElementById("upload-status-label")!;
const errorMessage = document.getElementById("error-message")!;
const countdownOverlay = document.getElementById("countdown-overlay") as HTMLElement;
const countdownNumber = document.getElementById("countdown-number") as HTMLElement;
const toast = document.getElementById("toast") as HTMLElement;

let countdownInterval: ReturnType<typeof setInterval> | null = null;
let pendingCountdownTarget: AppState["target"] | null = null;
let hasMicPermission = false;
let isMicEnabled = false;

// 1. Initial State Load
chrome.storage.local.get(["sb_user", "sb_state", "email", "picture"], (stored: any) => {
  if (stored.sb_user?.accessToken) {
    updateUserInfo(stored.email, stored.picture);
    if (stored.sb_state) {
      renderState(stored.sb_state as AppState);
    } else {
      chrome.runtime.sendMessage({ type: "GET_STATE" }, (res: AppState) => {
        if (res) renderState(res);
        else renderState({ status: "idle" } as AppState);
      });
    }
  } else {
    showScreen(screenAuth);
  }
});

void detectMicPermissionState();

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "STATE_UPDATE") {
    renderState(msg.state);
  }
});

function showScreen(screenEl: HTMLElement) {
  allScreens.forEach((el) => (el.style.display = "none"));
  screenEl.style.display = "block";
  if (screenEl !== screenRecording) {
    stopLocalTimer();
  }
  // Only show header user info if we are not on auth screen
  headerUserInfo.style.display = screenEl === screenAuth ? "none" : "flex";
}

function updateUserInfo(email?: string, picture?: string) {
  if (email) {
    userEmailEl.textContent = email;
    userAvatarEl.textContent = email.charAt(0).toUpperCase();
    if (picture) {
      userAvatarEl.style.backgroundImage = `url(${picture})`;
      userAvatarEl.style.backgroundSize = "cover";
      userAvatarEl.textContent = "";
    }
  }
}

function renderMicToggleState() {
  btnToggleMic.classList.remove("active", "permission-missing");
  if (!hasMicPermission) {
    btnToggleMic.classList.add("permission-missing");
    btnToggleMic.title = "Microphone permission required";
    return;
  }
  btnToggleMic.title = isMicEnabled ? "Disable Microphone" : "Enable Microphone";
  if (isMicEnabled) btnToggleMic.classList.add("active");
}

async function detectMicPermissionState() {
  try {
    if (navigator.permissions?.query) {
      const result = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });
      hasMicPermission = result.state === "granted";
      result.onchange = () => {
        hasMicPermission = result.state === "granted";
        if (!hasMicPermission) isMicEnabled = false;
        renderMicToggleState();
      };
    } else {
      hasMicPermission = false;
    }
  } catch {
    hasMicPermission = false;
  }
  renderMicToggleState();
}

async function handleSignIn() {
  try {
    const token = await new Promise<string>((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (res) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else {
          const t = typeof res === 'string' ? res : res?.token;
          if (t) resolve(t);
          else reject(new Error("No token returned"));
        }
      });
    });

    const res = await fetch(`${BACKEND_URL}/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: token }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: res.statusText })) as any;
      throw new Error(`Backend auth failed (${res.status}): ${errBody?.error || errBody?.message || 'unknown'}`);
    }

    const data = await res.json();
    const { userId, workspaceId, email, picture } = data;

    const sb_user: BackendUser = {
      accessToken: token,
      userId,
      workspaceId,
      email,
      picture
    };

    await chrome.storage.local.set({
      sb_user,
      workspaceId,
      email,
      picture
    });

    updateUserInfo(email, picture);
    showScreen(screenIdle);
  } catch (err: any) {
    console.error("Sign in failed:", err);
    alert("Sign in failed. Please try again.");
  }
}

async function sendStartRecording(target: AppState["target"]) {
  try {
    if (!target?.tabId) throw new Error("No target tab");
    
    const payloadTarget = {
      ...target,
      includeMic: hasMicPermission && isMicEnabled,
      userTitle: recTitleInput?.value?.trim() || '',
      streamId: null,
    };

    chrome.runtime.sendMessage({ type: "START_RECORDING", target: payloadTarget });
  } catch (err: any) {
    console.error("Failed to start recording:", err);
    chrome.runtime.sendMessage({ type: "ABORT_RECORDING" });
  }
}

function startCountdown(target: AppState["target"]) {
  pendingCountdownTarget = target;
  let seconds = 3;
  countdownNumber.textContent = String(seconds);
  countdownOverlay.style.display = "flex";

  countdownInterval = setInterval(() => {
    seconds -= 1;
    if (seconds <= 0) {
      clearInterval(countdownInterval!);
      countdownOverlay.style.display = "none";
      const finalTarget = pendingCountdownTarget;
      pendingCountdownTarget = null;
      if (finalTarget) sendStartRecording(finalTarget);
      return;
    }
    countdownNumber.textContent = String(seconds);
  }, 1000);
}

function renderState(newState: AppState) {
  state = newState;

  sbLog("POPUP_STATE_UPDATE", {
    status: state.status,
    sessionId: state.sessionId,
  });

  switch (state.status) {
    case "idle":
      showScreen(screenIdle);
      break;
    case "recording":
      showScreen(screenRecording);
      recTargetLabel.textContent = state.target?.tabTitle || "Entire Screen";
      if (state.startedAt) startLocalTimer(state.startedAt);
      break;
    case "uploading":
    case "finalizing":
      showScreen(screenUploading);
      uploadStatusLabel.textContent = state.status === "finalizing" ? "Finalizing capture..." : "Uploading capture...";
      const realProgress = Math.floor(state.uploadProgress || 0);
      progressFill.style.width = `${realProgress}%`;
      progressPct.textContent = `${realProgress}%`;
      break;
    case "ready":
      showScreen(screenSuccess);
      (document.querySelector(".success-title") as HTMLElement).textContent = "Capture Ready!";
      (document.querySelector(".success-meta") as HTMLElement).textContent = "Your interactive session is ready.";
      (document.querySelector(".success-check") as HTMLElement).textContent = "✓";
      (document.querySelector(".success-actions") as HTMLElement).style.display = "flex";
      btnOpenStudio.textContent = "Open in Studio";
      break;
    case "enriching":
      showScreen(screenSuccess);
      (document.querySelector(".success-title") as HTMLElement).textContent = "Processing...";
      (document.querySelector(".success-meta") as HTMLElement).textContent = "Generating steps and descriptions...";
      (document.querySelector(".success-check") as HTMLElement).textContent = "⌛";
      (document.querySelector(".success-actions") as HTMLElement).style.display = "none";
      break;
    case "failed_enrichment":
      showScreen(screenSuccess);
      (document.querySelector(".success-title") as HTMLElement).textContent = "Processing Failed";
      (document.querySelector(".success-meta") as HTMLElement).textContent = "We couldn't enrich your capture, but it's saved.";
      (document.querySelector(".success-check") as HTMLElement).textContent = "⚠️";
      (document.querySelector(".success-actions") as HTMLElement).style.display = "flex";
      btnOpenStudio.textContent = "Retry Enrichment";
      break;
    case "error":
      showScreen(screenError);
      errorMessage.textContent = state.errorMessage || "An unknown error occurred.";
      break;
  }
}

function startLocalTimer(startedAt: number) {
  stopLocalTimer();
  const update = () => {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const h = String(Math.floor(elapsed / 3600)).padStart(2, "0");
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
    const s = String(elapsed % 60).padStart(2, "0");
    recTimer.textContent = `${h}:${m}:${s}`;
  };
  update();
  localTimerInterval = setInterval(update, 1000);
}

function stopLocalTimer() {
  if (localTimerInterval) clearInterval(localTimerInterval);
}

// Button Wiring
btnSignin.addEventListener("click", handleSignIn);

btnNewRecording.addEventListener("click", () => {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    const tab = tabs[0];
    startCountdown({ tabId: tab?.id, tabTitle: tab?.title || tab?.url || '' });
  });
});

btnToggleMic.addEventListener("click", async () => {
  if (!hasMicPermission) {
    chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
    return;
  }
  isMicEnabled = !isMicEnabled;
  renderMicToggleState();
});

btnSkipCountdown.addEventListener("click", () => {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownOverlay.style.display = "none";
  const target = pendingCountdownTarget;
  pendingCountdownTarget = null;
  if (target) sendStartRecording(target);
});

btnStop.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "STOP_RECORDING" });
  showScreen(screenUploading);
});

btnCopyLink.addEventListener("click", async () => {
  const { sb_user } = (await chrome.storage.local.get("sb_user")) as { sb_user?: BackendUser };
  const token = sb_user?.accessToken;
  const url = `${STUDIO_URL}/studio?session=${state.sessionId}${token ? `&token=${token}` : ""}${sb_user?.workspaceId ? `&workspaceId=${sb_user.workspaceId}` : ""}`;
  navigator.clipboard.writeText(url).then(() => {
    toast.classList.add("visible");
    setTimeout(() => toast.classList.remove("visible"), 2000);
  });
});

btnOpenStudio.addEventListener("click", async () => {
  if (state.status === "failed_enrichment") {
    chrome.runtime.sendMessage({ type: "RETRY_UPLOAD" });
    return;
  }
  const { sb_user } = (await chrome.storage.local.get("sb_user")) as { sb_user?: BackendUser };
  const token = sb_user?.accessToken;
  const url = `${STUDIO_URL}/studio?session=${state.sessionId}${token ? `&token=${token}` : ""}${sb_user?.workspaceId ? `&workspaceId=${sb_user.workspaceId}` : ""}`;
  chrome.tabs.create({ url });
});

btnRecordAgain.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "SET_STATUS", status: "idle" });
});

btnTryAgain.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "SET_STATUS", status: "idle" });
});

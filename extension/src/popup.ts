import { AppState, BackendUser } from "./types";
import { sbLog } from "./logger";
import { BACKEND_URL, STUDIO_URL } from "../../shared/constants";

// Studio domains to probe for auto-login
const STUDIO_DOMAINS = [
  "studiobase-umber.vercel.app",
  "studio.studiobase.app",
  "localhost",
];

let state: AppState;
let localTimerInterval: ReturnType<typeof setInterval> | null = null;
let lastAutoCopiedUrl: string | null = null;
let isPolling = false;
let pollInterval: ReturnType<typeof setInterval> | null = null;

async function pollSessionStatus(sessionId: string) {
  if (isPolling) return;
  isPolling = true;

  const { sb_user } = (await chrome.storage.local.get("sb_user")) as { sb_user?: BackendUser };
  const token = sb_user?.accessToken;
  const workspaceId = sb_user?.workspaceId;

  if (!token) { isPolling = false; return; }

  let attempts = 0;
  pollInterval = setInterval(async () => {
    attempts++;
    if (attempts > 20) {
      if (pollInterval) clearInterval(pollInterval);
      isPolling = false;
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/v1/sessions/${sessionId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-workspace-id": workspaceId || "",
        },
      });
      if (!res.ok) return;
      const data = await res.json();
      const backendStatus = data.status || data.session?.status;
      const errorReason = data.errorReason || data.session?.errorReason;

      const titleEl = document.querySelector(".success-title") as HTMLElement;
      const metaEl = document.querySelector(".success-meta") as HTMLElement;
      const checkEl = document.querySelector(".success-check") as HTMLElement;

      if (backendStatus === "queued" || backendStatus === "processing") {
        titleEl.textContent = "Processing Pipeline…";
        metaEl.textContent = "Generating your session — link is ready to share.";
        checkEl.textContent = "⌛";
      } else if (backendStatus === "failed") {
        titleEl.textContent = "Pipeline Failed";
        metaEl.textContent = errorReason || "An error occurred during processing.";
        checkEl.textContent = "⚠️";
        if (pollInterval) clearInterval(pollInterval);
        isPolling = false;
      } else if (backendStatus === "ready") {
        titleEl.textContent = "Capture Ready!";
        metaEl.textContent = "Your interactive session is ready to view.";
        checkEl.textContent = "✓";
        if (pollInterval) clearInterval(pollInterval);
        isPolling = false;
      }
    } catch (err) {
      console.warn("Poll failed", err);
    }
  }, 3000);
}

// ── Element refs ──────────────────────────────────────────────────────────

const headerEl         = document.getElementById("header")!;
const screenAuth       = document.getElementById("screen-auth")!;
const screenIdle       = document.getElementById("screen-idle")!;
const screenRecording  = document.getElementById("screen-recording")!;
const screenUploading  = document.getElementById("screen-uploading")!;
const screenSuccess    = document.getElementById("screen-success")!;
const screenError      = document.getElementById("screen-error")!;

const allScreens = [screenAuth, screenIdle, screenRecording, screenUploading, screenSuccess, screenError];

const headerUserInfo    = document.getElementById("header-user-info")!;
const userAvatarEl      = document.getElementById("user-avatar")!;
const btnSignin         = document.getElementById("btn-signin")!;
const btnAutoLogin      = document.getElementById("btn-auto-login")!;
const autoLoginStatus   = document.getElementById("auto-login-status")!;
const autoLoginHint     = document.getElementById("auto-login-hint")!;

const btnNewRecording   = document.getElementById("btn-new-recording")!;
const recTitleInput     = document.getElementById("rec-title-input") as HTMLInputElement;
const btnStop           = document.getElementById("btn-stop")!;
const btnCopyLink       = document.getElementById("btn-copy-link")!;
const btnOpenStudio     = document.getElementById("btn-open-studio")!;
const btnRecordAgain    = document.getElementById("btn-record-again")!;
const btnTryAgain       = document.getElementById("btn-try-again")!;
const btnToggleMic      = document.getElementById("btn-toggle-mic") as HTMLButtonElement;
const btnToggleVideo    = document.getElementById("btn-toggle-video") as HTMLButtonElement;
const btnSkipCountdown  = document.getElementById("btn-skip-countdown") as HTMLButtonElement;
const recTimer          = document.getElementById("rec-timer")!;
const recTargetLabel    = document.getElementById("rec-target-label")!;
const progressFill      = document.getElementById("progress-fill")!;
const progressPct       = document.getElementById("progress-pct")!;
const uploadStatusLabel = document.getElementById("upload-status-label")!;
const errorMessage      = document.getElementById("error-message")!;
const countdownOverlay  = document.getElementById("countdown-overlay") as HTMLElement;
const countdownNumber   = document.getElementById("countdown-number") as HTMLElement;
const toast             = document.getElementById("toast") as HTMLElement;

let countdownInterval: ReturnType<typeof setInterval> | null = null;
let pendingCountdownTarget: AppState["target"] | null = null;
let hasMicPermission = false;
let isMicEnabled = false;
let isVideoEnabled = true;

// ── Auto-login: probe open Studio tabs ───────────────────────────────────

/**
 * Look for any open tab on a StudioBase domain and attempt to extract
 * the stored JWT + user data via chrome.scripting.executeScript.
 * Returns the extracted credentials or null.
 */
async function tryAutoLoginFromStudioTab(): Promise<{ token: string; userData: any } | null> {
  try {
    const tabs = await chrome.tabs.query({});
    const studioTab = tabs.find((t) =>
      t.url && STUDIO_DOMAINS.some((d) => t.url!.includes(d))
    );
    if (!studioTab?.id) return null;

    const results = await chrome.scripting.executeScript({
      target: { tabId: studioTab.id },
      func: () => {
        try {
          const token = localStorage.getItem("sb_token");
          const userRaw = localStorage.getItem("sb_user");
          const workspaceId = localStorage.getItem("sb_active_workspace");
          if (!token) return null;
          const user = userRaw ? JSON.parse(userRaw) : {};
          return { token, user, workspaceId };
        } catch {
          return null;
        }
      },
    });

    const result = results?.[0]?.result as any;
    if (!result?.token) return null;
    return { token: result.token, userData: { ...result.user, workspaceId: result.workspaceId } };
  } catch (err) {
    console.warn("[SB] Auto-login probe failed:", err);
    return null;
  }
}

/**
 * Persist extracted Studio credentials into extension storage, matching
 * the BackendUser shape the rest of the extension expects.
 */
async function applyAutoLoginCredentials(token: string, userData: any) {
  const sb_user: BackendUser = {
    accessToken: token,
    userId: userData.id || userData.userId || "",
    workspaceId: userData.workspaceId || userData.activeWorkspaceId || "",
    email: userData.email || "",
    picture: userData.picture || userData.avatar || "",
  };

  await chrome.storage.local.set({
    sb_user,
    workspaceId: sb_user.workspaceId,
    email: sb_user.email,
    picture: sb_user.picture,
  });

  updateUserInfo(sb_user.email, sb_user.picture);
  showScreen(screenIdle);
}

// ── Startup: load state ───────────────────────────────────────────────────

chrome.storage.local.get(["sb_user", "sb_state", "email", "picture"], async (stored: any) => {
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
    // Not authenticated — show auth screen and silently probe for Studio tab
    showScreen(screenAuth);
    const creds = await tryAutoLoginFromStudioTab();
    if (creds) {
      // Found credentials — show hint that we can auto-connect
      autoLoginHint.style.display = "block";
    }
  }
});

void detectMicPermissionState();

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "STATE_UPDATE") renderState(msg.state);
});

// ── Helpers ───────────────────────────────────────────────────────────────

function showScreen(screenEl: HTMLElement) {
  allScreens.forEach((el) => (el.style.display = "none"));
  screenEl.style.display = "block";
  if (screenEl !== screenRecording) stopLocalTimer();

  const isAuth = screenEl === screenAuth;
  headerEl.style.display = isAuth ? "none" : "flex";
  headerUserInfo.style.display = isAuth ? "none" : "flex";
}

function updateUserInfo(email?: string, picture?: string) {
  if (!email) return;
  // Set avatar initial
  userAvatarEl.textContent = email.charAt(0).toUpperCase();
  if (picture) {
    userAvatarEl.style.backgroundImage = `url(${picture})`;
    userAvatarEl.style.backgroundSize = "cover";
    userAvatarEl.textContent = "";
  }
}

function renderMicToggleState() {
  btnToggleMic.classList.remove("active", "permission-missing");
  const micIcon = btnToggleMic.querySelector(".mic-icon") as HTMLElement;
  const micOffIcon = btnToggleMic.querySelector(".mic-off-icon") as HTMLElement;

  if (!hasMicPermission) {
    btnToggleMic.classList.add("permission-missing");
    btnToggleMic.title = "Microphone permission required — click to enable";
    if (micIcon) micIcon.style.display = "";
    if (micOffIcon) micOffIcon.style.display = "none";
    return;
  }

  if (isMicEnabled) {
    btnToggleMic.classList.add("active");
    btnToggleMic.title = "Disable Microphone";
    if (micIcon) micIcon.style.display = "";
    if (micOffIcon) micOffIcon.style.display = "none";
  } else {
    btnToggleMic.title = "Enable Microphone";
    if (micIcon) micIcon.style.display = "none";
    if (micOffIcon) micOffIcon.style.display = "";
  }
}

function renderVideoToggleState() {
  const videoIcon = btnToggleVideo.querySelector(".video-icon") as HTMLElement;
  const videoOffIcon = btnToggleVideo.querySelector(".video-off-icon") as HTMLElement;

  if (isVideoEnabled) {
    btnToggleVideo.classList.add("active");
    btnToggleVideo.title = "Disable Screen Video";
    if (videoIcon) videoIcon.style.display = "";
    if (videoOffIcon) videoOffIcon.style.display = "none";
  } else {
    btnToggleVideo.classList.remove("active");
    btnToggleVideo.title = "Enable Screen Video";
    if (videoIcon) videoIcon.style.display = "none";
    if (videoOffIcon) videoOffIcon.style.display = "";
  }
}

async function detectMicPermissionState() {
  try {
    if (navigator.permissions?.query) {
      const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
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
  renderVideoToggleState();
}

// ── Sign-in handlers ──────────────────────────────────────────────────────

async function handleSignIn() {
  try {
    const token = await new Promise<string>((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (res) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else {
          const t = typeof res === "string" ? res : (res as any)?.token;
          if (t) resolve(t);
          else reject(new Error("No token returned"));
        }
      });
    });

    const res = await fetch(`${BACKEND_URL}/v1/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: token }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: res.statusText })) as any;
      throw new Error(`Auth failed (${res.status}): ${errBody?.error || "unknown"}`);
    }

    const data = await res.json();
    const { userId, workspaceId, email, picture } = data;

    const sb_user: BackendUser = { accessToken: token, userId, workspaceId, email, picture };
    await chrome.storage.local.set({ sb_user, workspaceId, email, picture });

    updateUserInfo(email, picture);
    showScreen(screenIdle);
  } catch (err: any) {
    console.error("Sign in failed:", err);
    alert("Sign in failed. Please try again.\n\n" + err.message);
  }
}

async function handleAutoLogin() {
  autoLoginStatus.style.display = "flex";
  autoLoginHint.style.display = "none";
  btnSignin.style.display = "none";

  try {
    const creds = await tryAutoLoginFromStudioTab();
    if (!creds) {
      autoLoginStatus.style.display = "none";
      btnSignin.style.display = "flex";
      autoLoginHint.style.display = "block";
      autoLoginHint.innerHTML = `
        <span style="color: #FF453A">Couldn't connect — make sure StudioBase is open in a tab.</span>
        <button id="btn-auto-login" class="link-btn" style="display:block;margin-top:4px">Try again</button>
      `;
      // Re-wire button
      document.getElementById("btn-auto-login")?.addEventListener("click", handleAutoLogin);
      return;
    }

    await applyAutoLoginCredentials(creds.token, creds.userData);
  } catch (err) {
    console.error("Auto-login failed:", err);
    autoLoginStatus.style.display = "none";
    btnSignin.style.display = "flex";
    autoLoginHint.style.display = "block";
  }
}

// ── Recording flow ────────────────────────────────────────────────────────

async function sendStartRecording(target: AppState["target"]) {
  try {
    if (!target?.tabId) throw new Error("No target tab");
    const payloadTarget = {
      ...target,
      includeMic: hasMicPermission && isMicEnabled,
      includeVideo: isVideoEnabled,
      userTitle: recTitleInput?.value?.trim() || "",
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
  sbLog("POPUP_STATE_UPDATE", { status: state.status, sessionId: state.sessionId });

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
      uploadStatusLabel.textContent = state.status === "finalizing" ? "Finalizing capture…" : "Uploading capture…";
      progressFill.style.width = `${Math.floor(state.uploadProgress || 0)}%`;
      progressPct.textContent = `${Math.floor(state.uploadProgress || 0)}%`;
      break;
    case "ready":
      showScreen(screenSuccess);
      (document.querySelector(".success-title") as HTMLElement).textContent = "Session Captured!";
      (document.querySelector(".success-meta") as HTMLElement).textContent = "Your link is ready — processing in background.";
      (document.querySelector(".success-check") as HTMLElement).textContent = "✓";
      (document.getElementById("success-actions") as HTMLElement).style.display = "flex";
      if (state.sessionId) pollSessionStatus(state.sessionId);
      break;
    case "enriching":
      showScreen(screenSuccess);
      (document.querySelector(".success-title") as HTMLElement).textContent = "Processing…";
      (document.querySelector(".success-meta") as HTMLElement).textContent = "Generating steps and descriptions…";
      (document.querySelector(".success-check") as HTMLElement).textContent = "⌛";
      (document.getElementById("success-actions") as HTMLElement).style.display = "none";
      break;
    case "failed_enrichment":
      showScreen(screenSuccess);
      (document.querySelector(".success-title") as HTMLElement).textContent = "Processing Failed";
      (document.querySelector(".success-meta") as HTMLElement).textContent = "We couldn't enrich your capture, but it's saved.";
      (document.querySelector(".success-check") as HTMLElement).textContent = "⚠️";
      (document.getElementById("success-actions") as HTMLElement).style.display = "flex";
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

// ── Button wiring ─────────────────────────────────────────────────────────

btnSignin.addEventListener("click", handleSignIn);
btnAutoLogin.addEventListener("click", handleAutoLogin);

btnNewRecording.addEventListener("click", () => {
  chrome.windows.getLastFocused({ windowTypes: ["normal"] }, (win) => {
    if (chrome.runtime.lastError || !win?.id) {
      startCountdown({});
      return;
    }
    chrome.tabs.query({ active: true, windowId: win.id }, (tabs) => {
      const tab = tabs[0];
      sbLog("RECORD_TAB", { tabId: tab?.id, tabTitle: tab?.title, tabUrl: tab?.url });
      startCountdown({ tabId: tab?.id, tabTitle: tab?.title || "", tabUrl: tab?.url || "" });
    });
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

btnToggleVideo.addEventListener("click", () => {
  isVideoEnabled = !isVideoEnabled;
  renderVideoToggleState();
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
  const url = `${STUDIO_URL}/sessions/${state.sessionId}`;
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
  const url = `${STUDIO_URL}/sessions/${state.sessionId}`;
  chrome.tabs.create({ url });
});

btnRecordAgain.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "SET_STATUS", status: "idle" });
});

btnTryAgain.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "SET_STATUS", status: "idle" });
});

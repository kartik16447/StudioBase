import { AppState, StorageAccount } from "./types";
import { svLog } from "./logger";

let state: AppState;
let accounts: StorageAccount[] = [];
let localTimerInterval: ReturnType<typeof setInterval> | null = null;
let lastAutoCopiedUrl: string | null = null;

// Elements
const screenIdle = document.getElementById("screen-idle")!;

const screenRecording = document.getElementById("screen-recording")!;
const screenUploading = document.getElementById("screen-uploading")!;
const screenSuccess = document.getElementById("screen-success")!;
const screenError = document.getElementById("screen-error")!;

const allScreens = [
  screenIdle,
  screenRecording,
  screenUploading,
  screenSuccess,
  screenError,
];

const btnConnect = document.getElementById("btn-connect")!;
const btnNewRecording = document.getElementById("btn-new-recording")!;
const recTitleInput = document.getElementById("rec-title-input") as HTMLInputElement;

const btnStop = document.getElementById("btn-stop")!;
const btnCopyLink = document.getElementById("btn-copy-link")!;
const btnOpenLink = document.getElementById("btn-open-link")!;
const btnRecordAgain = document.getElementById("btn-record-again")!;
const btnSaveDisk = document.getElementById("btn-save-disk")!;
const btnTryAgain = document.getElementById("btn-try-again")!;
const btnToggleMic = document.getElementById(
  "btn-toggle-mic",
) as HTMLButtonElement;

const accountsList = document.getElementById("accounts-list")!;
const noAccounts = document.getElementById("no-accounts")!;
const recordUi = document.getElementById("record-ui")!;

const recTimer = document.getElementById("rec-timer")!;
const recTargetLabel = document.getElementById("rec-target-label")!;
const progressFill = document.getElementById("progress-fill")!;
const progressPct = document.getElementById("progress-pct")!;
const uploadAccountLabel = document.getElementById("upload-account-label")!;
const successMeta = document.getElementById("success-meta")!;
const errorTitle = document.getElementById("error-title")!;
const errorMessage = document.getElementById("error-message")!;
let errorNeedsReconnect = false;
const toast = document.getElementById("toast") as HTMLElement;

let hasMicPermission = false;
let isMicEnabled = false;
let isConnectingAccount = false;

// 1. Immediate cache check
chrome.storage.local.get(["sv_state", "sv_accounts"], (stored) => {
  if (stored.sv_state) {
    renderState(stored.sv_state as AppState);
  }
  
  if (stored.sv_accounts && (stored.sv_accounts as StorageAccount[]).length > 0) {
    renderAccounts(stored.sv_accounts as StorageAccount[]);
  } else {
    // Show onboarding, NOT skeleton on initial load
    noAccounts.style.display = "block";
    recordUi.style.display = "none";
  }

  // 2. Background silent refresh
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (res: AppState) => {
    if (res) renderState(res);
  });

  chrome.runtime.sendMessage({ type: "GET_ACCOUNTS" }, (res: StorageAccount[]) => {
    if (res && res.length > 0) renderAccounts(res);
  });
});

void detectMicPermissionState();

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "STATE_UPDATE") {
    renderState(msg.state);
  } else if (msg.type === "ACCOUNTS_UPDATE") {
    isConnectingAccount = false;
    renderAccounts(msg.accounts);
  } else if (msg.type === "INSTANT_LINK") {
    handleInstantLink(msg.url);
  }
});

function showScreen(screenEl: HTMLElement) {
  allScreens.forEach((el) => (el.style.display = "none"));
  screenEl.style.display = "block";
  if (screenEl !== screenRecording) {
    stopLocalTimer();
  }
}

function renderMicToggleState() {
  btnToggleMic.classList.remove("active", "permission-missing");
  if (!hasMicPermission) {
    btnToggleMic.classList.add("permission-missing");
    btnToggleMic.title = "Microphone permission required";
    return;
  }
  btnToggleMic.title = isMicEnabled
    ? "Disable Microphone"
    : "Enable Microphone";
  if (isMicEnabled) {
    btnToggleMic.classList.add("active");
  }
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

function sendStartRecording(target: AppState["target"]) {
  const payloadTarget = target
    ? { 
        ...target, 
        includeMic: hasMicPermission && isMicEnabled,
        userTitle: recTitleInput?.value?.trim() || "" 
      }
    : target;
  chrome.runtime.sendMessage({
    type: "START_RECORDING",
    target: payloadTarget,
  });
}

async function startRecordingNow(target: AppState["target"]) {
  if (!target) return;

  // Pre-allocate in parallel while the picker is open
  chrome.runtime.sendMessage({ type: "PRE_ALLOCATE_AND_COPY" });

  // Name the recording after the tab it was started from (activeTab grants
  // title access on popup click). Only the title is taken — not tabId — so
  // closing that tab doesn't stop a screen/window recording.
  let tabTitle = target.tabTitle;
  if (!tabTitle) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabTitle = tab?.title?.trim() || undefined;
    } catch {}
  }

  // Screen picker appears right after
  sendStartRecording({ ...target, tabTitle });
}

function handleInstantLink(url: string) {
  // Fallback: if the parallel response didn't catch it for some reason
  navigator.clipboard.writeText(url).catch(() => {});
}

function showToast(message?: string) {
  if (message) {
    toast.textContent = message;
  } else {
    toast.textContent = "Recording Started! Link copied to clipboard.";
  }
  toast.classList.add("visible");
  setTimeout(() => {
    toast.classList.remove("visible");
  }, 1000);
}

function renderState(newState: AppState) {
  const prevStatus = state?.status;
  state = newState;

  svLog("POPUP_STATE_UPDATE", {
    status: state.status,
    sessionId: state.sessionId,
    fileId: state.preAllocatedFileId,
    timestamp: Date.now()
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
      if (state.status === "finalizing") {
        uploadAccountLabel.textContent = "Finalizing video...";
        progressFill.style.width = "100%";
        progressPct.textContent = "100%";
      } else {
        uploadAccountLabel.textContent = `Uploading...`;
        const realProgress = Math.floor(state.uploadProgress || 0);
        progressFill.style.width = `${realProgress}%`;
        progressPct.textContent = `${realProgress}%`;
      }
      break;
    case "ready":
    case "enriching":
    case "failed_enrichment":
      showScreen(screenSuccess);
      if (state.status === "enriching") {
        successMeta.textContent = `Uploaded! Polishing thumbnail & preview...`;
        successMeta.style.color = "var(--blue)";
      } else {
        successMeta.textContent = `Uploaded to ${state.uploadAccount}`;
        successMeta.style.color = "var(--text-2)";
      }

      // Auto-copy only on transition to success or if URL improves
      const isActuallyReady = state.status === "ready" || state.status === "enriching" || state.status === "failed_enrichment";
      const isNewReadyState = prevStatus !== "ready" && prevStatus !== "enriching" && prevStatus !== "failed_enrichment";
      if (isActuallyReady && state.uploadUrl && (isNewReadyState || state.uploadUrl !== lastAutoCopiedUrl)) {
        svLog("POPUP_LINK_AUTO_COPY", {
          url: state.uploadUrl,
          prevStatus,
          timestamp: Date.now()
        });
        lastAutoCopiedUrl = state.uploadUrl;
        navigator.clipboard.writeText(state.uploadUrl).catch(() => {});
        showToast("Link copied to clipboard!");
      }
      break;
    case "error": {
      showScreen(screenError);
      const rawMessage = state.errorMessage || "An unknown error occurred.";
      errorNeedsReconnect = /reconnect/i.test(rawMessage);
      if (errorNeedsReconnect) {
        errorTitle.textContent = "Sign-in expired";
        errorMessage.textContent =
          "Your Google sign-in expired, so this recording couldn't be uploaded. Click \"Reconnect Google Account\" below, sign in again, then start a new recording.";
        btnTryAgain.textContent = "Reconnect Google Account";
      } else {
        errorTitle.textContent = "Something went wrong";
        errorMessage.textContent = rawMessage;
        btnTryAgain.textContent = "Try again";
      }
      break;
    }
  }
}

async function renderAccounts(accs: StorageAccount[]) {
  accounts = accs;

  if (accounts.length === 0 && !isConnectingAccount) {
    noAccounts.style.display = "block";
    recordUi.style.display = "none";
    Array.from(accountsList.children).forEach((child) => {
      if (!child.classList.contains("section-label") && !child.classList.contains("accounts-header")) child.remove();
    });
  } else {
    noAccounts.style.display = "none";
    recordUi.style.display = "block";

    // Clear list (keep section-label)
    Array.from(accountsList.children).forEach((child) => {
      if (!child.classList.contains("section-label")) child.remove();
    });

    // Single-account model: just show who's signed in.
    const acc = accounts[0];
    if (acc) {
      const row = document.createElement("div");
      row.className = "account-card";
      row.innerHTML = `
        <div class="account-row-1">
          <div class="account-avatar">${acc.displayName.charAt(0)}</div>
          <div class="account-email" title="${acc.email}">${acc.email}</div>
        </div>
      `;
      accountsList.appendChild(row);
    }

    if (isConnectingAccount) {
      renderAccountSkeletons(1);
    }
  }
}

function renderAccountSkeletons(count = 2) {
  // Clear list (keep section-label) if it's the only thing being shown
  if (accounts.length === 0) {
    Array.from(accountsList.children).forEach((child) => {
      if (!child.classList.contains("section-label")) child.remove();
    });
  }

  // Render skeletons
  for (let i = 0; i < count; i++) {
    const row = document.createElement("div");
    row.className = "skeleton-row";
    row.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <div class="skeleton skeleton-avatar"></div>
        <div class="skeleton skeleton-line"></div>
      </div>
      <div class="skeleton skeleton-line short" style="margin-left: 32px;"></div>
    `;
    accountsList.appendChild(row);
  }
}

function startLocalTimer(startedAt: number) {
  stopLocalTimer();
  const initialElapsed = Math.floor((Date.now() - startedAt) / 1000);
  const initialH = String(Math.floor(initialElapsed / 3600)).padStart(2, "0");
  const initialM = String(Math.floor((initialElapsed % 3600) / 60)).padStart(
    2,
    "0",
  );
  const initialS = String(initialElapsed % 60).padStart(2, "0");
  recTimer.textContent = `${initialH}:${initialM}:${initialS}`;

  localTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const h = String(Math.floor(elapsed / 3600)).padStart(2, "0");
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
    const s = String(elapsed % 60).padStart(2, "0");
    recTimer.textContent = `${h}:${m}:${s}`;
  }, 1000);
}

function stopLocalTimer() {
  if (localTimerInterval) clearInterval(localTimerInterval);
}

// Button Wiring
const connectHandler = () => {
  isConnectingAccount = true;
  renderAccounts(accounts);
  chrome.runtime.sendMessage({ type: "CONNECT_ACCOUNT" });
};
btnConnect.addEventListener("click", connectHandler);
document.getElementById("btn-connect-onboarding")?.addEventListener("click", connectHandler);

btnNewRecording.addEventListener("click", () => {
  if (accounts.length > 0) {
    startRecordingNow({});
  } else {
    alert("Please sign in with Google first.");
  }
});

btnToggleMic.addEventListener("click", async () => {
  if (!hasMicPermission) {
    chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
    return;
  }
  isMicEnabled = !isMicEnabled;
  renderMicToggleState();
});

btnStop.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "STOP_RECORDING" });
  
  // Task: Instant feedback loader
  showScreen(screenUploading);
  uploadAccountLabel.textContent = "Processing recording...";
  progressFill.style.width = "0%";
  progressPct.textContent = "0%";
});

btnCopyLink.addEventListener("click", () => {
  if (state.uploadUrl) {
    svLog("POPUP_LINK_MANUAL_COPY", {
      url: state.uploadUrl,
      timestamp: Date.now()
    });
    navigator.clipboard.writeText(state.uploadUrl).then(() => {
      const orig = btnCopyLink.textContent;
      btnCopyLink.textContent = "Copied!";
      setTimeout(() => (btnCopyLink.textContent = orig), 1000);
    });
  }
});

btnOpenLink.addEventListener("click", () => {
  if (state.uploadUrl) chrome.tabs.create({ url: state.uploadUrl });
});

btnRecordAgain.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "GET_STATE" });
  chrome.runtime.sendMessage({ type: "SET_STATUS", status: "idle" });
});

btnSaveDisk.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "SAVE_TO_DISK" });
});

btnTryAgain.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "SET_STATUS", status: "idle" });
  if (errorNeedsReconnect) {
    connectHandler();
  }
});

document.getElementById("dashboardBtn")?.addEventListener("click", () => {
  chrome.tabs.create({
    url: "https://recorder.foyr.com/library",
  });
});

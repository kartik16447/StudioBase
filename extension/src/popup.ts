import { AppState, StorageAccount, BackendUser } from "./types";
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
const btnSkipCountdown = document.getElementById(
  "btn-skip-countdown",
) as HTMLButtonElement;

const accountsList = document.getElementById("accounts-list")!;
const noAccounts = document.getElementById("no-accounts")!;

const recTimer = document.getElementById("rec-timer")!;
const recTargetLabel = document.getElementById("rec-target-label")!;
const progressFill = document.getElementById("progress-fill")!;
const progressPct = document.getElementById("progress-pct")!;
const uploadAccountLabel = document.getElementById("upload-account-label")!;
const successMeta = document.getElementById("success-meta")!;
const errorMessage = document.getElementById("error-message")!;
const countdownOverlay = document.getElementById(
  "countdown-overlay",
) as HTMLElement;
const countdownNumber = document.getElementById(
  "countdown-number",
) as HTMLElement;
const toast = document.getElementById("toast") as HTMLElement;

let countdownInterval: ReturnType<typeof setInterval> | null = null;
let pendingCountdownTarget: AppState["target"] | null = null;
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
    // Show empty state, NOT skeleton on initial load
    noAccounts.style.display = "block";
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

function clearCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  pendingCountdownTarget = null;
  countdownOverlay.style.display = "none";
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

function startCountdown(target: AppState["target"]) {
  if (!target) return;
  clearCountdown();

  // Parallel Path: Start pre-allocation immediately while the user sees the countdown
  chrome.runtime.sendMessage({ type: "PRE_ALLOCATE_AND_COPY" });

  pendingCountdownTarget = target;
  let seconds = 3;
  countdownNumber.textContent = String(seconds);
  countdownOverlay.style.display = "flex";

  countdownInterval = setInterval(() => {
    seconds -= 1;
    if (seconds <= 0) {
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
      countdownOverlay.style.display = "none";
      const finalTarget = pendingCountdownTarget;
      pendingCountdownTarget = null;
      if (finalTarget) sendStartRecording(finalTarget);
      return;
    }
    countdownNumber.textContent = String(seconds);
  }, 1000);
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
        uploadAccountLabel.textContent = `Uploading to ${state.uploadAccount || "Drive"}...`;
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
        successMeta.style.color = "var(--text-secondary)";
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
    case "error":
      showScreen(screenError);
      errorMessage.textContent =
        state.errorMessage || "An unknown error occurred.";
      break;
  }
}

async function renderAccounts(accs: StorageAccount[]) {
  accounts = accs;
  
  const { sv_user } = (await chrome.storage.local.get("sv_user")) as {
    sv_user?: BackendUser;
  };
  const primaryEmail = sv_user?.email;

  if (accounts.length === 0 && !isConnectingAccount) {
    noAccounts.style.display = "block";
    // Remove existing rows except section label
    Array.from(accountsList.children).forEach((child) => {
      if (!child.classList.contains("section-label")) child.remove();
    });
  } else {
    noAccounts.style.display = "none";

    // Clear list (keep section-label)
    Array.from(accountsList.children).forEach((child) => {
      if (!child.classList.contains("section-label")) child.remove();
    });

    accounts.forEach((acc) => {
      const freeBytes = Math.max(0, acc.quotaTotal - acc.quotaUsed);
      const freeGB = (freeBytes / (1024 * 1024 * 1024)).toFixed(1);

      const row = document.createElement("div");
      row.className = "account-card";
      
      const isPrimary = acc.isPrimary;
      const isActive = acc.isActive;

      row.innerHTML = `
        <div class="account-row-1">
          <div class="account-avatar">${acc.displayName.charAt(0)}</div>
          <div class="account-email" title="${acc.email}">${acc.email}</div>
        </div>
        <div class="account-row-2">
          <div class="account-space">${freeGB} GB available</div>
          <div class="account-actions" style="display: flex; gap: 4px; align-items: center;">
            ${isPrimary ? '<span class="badge badge-primary">Main</span>' : ''}
            ${isActive ? '<span class="badge badge-active">Saving</span>' : '<button class="set-active-btn" data-email="' + acc.email + '">Use</button>'}
          </div>
        </div>
      `;
      
      const useBtn = row.querySelector('.set-active-btn');
      useBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const email = (e.currentTarget as HTMLElement).dataset.email;
        if (!email) return;

        // Instant Feedback Loop: Use -> ✓ -> Saving
        const container = (e.currentTarget as HTMLElement).parentElement;
        if (container) {
          container.innerHTML = '<span style="color: var(--green); font-weight: 600; margin-right: 8px;">✓</span>';
        }

        chrome.runtime.sendMessage({ type: "SWITCH_UPLOAD_ACCOUNT", email });
      });

      accountsList.appendChild(row);
    });

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
btnConnect.addEventListener("click", () => {
  isConnectingAccount = true;
  renderAccounts(accounts);
  chrome.runtime.sendMessage({ type: "CONNECT_ACCOUNT" });
});

btnNewRecording.addEventListener("click", () => {
  if (accounts.length > 0) {
    startCountdown({});
  } else {
    alert("Please connect a Google Drive account first.");
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

btnSkipCountdown.addEventListener("click", () => {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  countdownOverlay.style.display = "none";
  const target = pendingCountdownTarget;
  pendingCountdownTarget = null;
  if (target) sendStartRecording(target);
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
});

document.getElementById("dashboardBtn")?.addEventListener("click", () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("dashboard.html"),
  });
});

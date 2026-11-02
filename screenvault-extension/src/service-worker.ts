import {
  AppState,
  PopupMessage,
  StorageAccount,
  WorkerMessage,
  OffscreenMessage,
  SessionMetadata,
  PreAllocationResult,
  BackendUser,
} from "./types";
import { initUpload } from "./r2-upload";
import { getPendingSessions, recoverSession, deleteSession } from "./db";
import { svLog } from "./logger";

const BACKEND_URL = "https://screenvault-backend.tushar-abf.workers.dev";
const PLAYER_BASE_URL = "https://recorder.foyr.com/watch";

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

let accounts: StorageAccount[] = [];
let badgeInterval: ReturnType<typeof setInterval> | null = null;
let lastBlobUrl: string | null = null;
let isStarting = false;
const CAPTURE_START_TIMEOUT_MS = 2 * 60 * 1000;
const processingSessions = new Set<string>();
const preAllocationMap = new Map<string, Promise<PreAllocationResult>>();

let lastPreAllocateTime = 0;

async function validateToken(account: StorageAccount): Promise<string> {
  try {
    const res = await fetch(
      "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=" +
        account.accessToken,
    );
    if (res.status === 200) return account.accessToken;

    console.warn("Token expired for account:", account.email);
  } catch (err) {
    console.warn("Token validation network error:", err);
  }

  const stored = await chrome.storage.local.get("sv_accounts");
  const existing = (stored.sv_accounts || []) as StorageAccount[];
  const updatedAccounts = existing.map((a) =>
    a.id === account.id ? { ...a, invalid: true, invalidReason: "expired" } : a,
  );

  await chrome.storage.local.set({ sv_accounts: updatedAccounts });
  accounts = updatedAccounts;

  chrome.runtime
    .sendMessage({
      type: "ACCOUNTS_UPDATE",
      accounts: updatedAccounts,
    })
    .catch(() => {});

  throw new Error("Account needs reconnection");
}

const inFlightRefreshes = new Map<string, Promise<StorageAccount>>();

async function trySilentRefresh(account: StorageAccount): Promise<StorageAccount> {
  const accountId = account.id || account.email;
  if (inFlightRefreshes.has(accountId)) {
    svLog("TOKEN_REFRESH_DEDUPED", { accountEmail: account.email });
    return inFlightRefreshes.get(accountId)!;
  }

  const refreshPromise = (async () => {
    try {
      svLog("TOKEN_REFRESH_STARTED", { accountEmail: account.email });
      const manifest = chrome.runtime.getManifest();
      const clientId = manifest.oauth2?.client_id;
      const scopes = manifest.oauth2?.scopes?.join(" ");
      const redirectUri = chrome.identity.getRedirectURL();

      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}&` +
        `response_type=token&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(scopes!)}&` +
        `login_hint=${encodeURIComponent(account.email)}`;

      const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: false,
      });

      if (!responseUrl) throw new Error("Silent refresh failed: No response URL");

      const params = new URLSearchParams(responseUrl.split("#")[1]);
      const token = params.get("access_token");

      if (!token) throw new Error("Silent refresh failed: No access token");

      svLog("TOKEN_REFRESH_SUCCESS", { accountEmail: account.email });

      const updatedAccount = {
        ...account,
        accessToken: token,
        expiresAt: Date.now() + 3500 * 1000,
        invalid: false,
        invalidReason: undefined
      };

      accounts = accounts.map(a => a.id === account.id ? updatedAccount : a);
      await chrome.storage.local.set({ sv_accounts: accounts });

      // Keep sv_user.accessToken in sync so backend calls don't use a stale token
      if (updatedAccount.isPrimary) {
        const stored = await chrome.storage.local.get("sv_user");
        if (stored.sv_user) {
          await chrome.storage.local.set({ sv_user: { ...stored.sv_user, accessToken: token } });
        }
      }

      chrome.runtime.sendMessage({
        type: "ACCOUNTS_UPDATE",
        accounts,
      }).catch(() => {});

      return updatedAccount;
    } catch (err: any) {
      svLog("TOKEN_REFRESH_FAILED", { accountEmail: account.email, error: err.message });
      throw err;
    } finally {
      inFlightRefreshes.delete(accountId);
    }
  })();

  inFlightRefreshes.set(accountId, refreshPromise);
  return refreshPromise;
}

// Single-account model: there's exactly one signed-in identity, used for
// every recording. This just makes sure its token is fresh before use.
async function selectBestAccount(): Promise<StorageAccount | null> {
  if (accounts.length === 0) return null;
  let candidate = accounts[0];
  const now = Date.now();

  if (candidate.invalid || candidate.expiresAt < now + 60000) {
    try {
      candidate = await trySilentRefresh(candidate);
    } catch (e) {
      svLog("SELECTED_ACCOUNT_REFRESH_FAILED", { accountEmail: candidate.email, error: String(e) });
      candidate.invalid = true;
      candidate.invalidReason = "refresh_failed";
      throw new Error(`Account ${candidate.email} needs reconnection.`);
    }
  }
  return candidate;
}

chrome.runtime.onInstalled.addListener(async () => {
  const data_init = { sv_state: state, sv_accounts: accounts };
  await chrome.storage.local.set(data_init);
});

async function loadState() {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return;
  try {
    const stored = await chrome.storage.local.get(["sv_state", "sv_accounts"]);
    if (stored.sv_state) state = stored.sv_state as AppState;
    if (stored.sv_accounts) {
      accounts = stored.sv_accounts as StorageAccount[];
      svLog("SESSION_REHYDRATED", { accountCount: accounts.length });
    }

    const { sv_sessions = {} } = await chrome.storage.local.get("sv_sessions");
    for (const [sid, meta] of Object.entries(
      sv_sessions as Record<string, SessionMetadata>,
    )) {
      // Task 2 & 5: Auto-recover interrupted uploads
      if (meta.status === "uploading") {
        recoverSessionHelper(sid);
      }
    }

    if (state.status === "recording" && state.startedAt) {
      startBadgeTimer(state.startedAt);

      // Safety check for offscreen API availability
      if (
        chrome.offscreen &&
        typeof chrome.offscreen.hasDocument === "function"
      ) {
        const hasDoc = await chrome.offscreen.hasDocument();
        if (!hasDoc) {
          updateState({
            status: "error",
            errorMessage: "Recording was interrupted.",
          });
          stopBadgeTimer();
        }
      }
    }

    // Scan DB for sessions on startup
    const pending = await getPendingSessions();
    if (pending.length > 0) {
      // Pending sessions found
    }

    // Cleanup old sessions (48h TTL)
    await cleanupOldSessions();
  } catch (err) {
    console.warn("Extension initialization warning:", err);
  }
}

async function cleanupOldSessions() {
  metadataQueue = metadataQueue.then(async () => {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    // Task 3: Startup cleanup (>24h OR unfinished)
    const THRESHOLD = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const result = await chrome.storage.local.get("sv_sessions");

    const sv_sessions = (result.sv_sessions ?? {}) as Record<string, any>;
    let changed = false;

    const sessionIds = Object.keys(sv_sessions);
    for (const sessionId of sessionIds) {
      const session = sv_sessions[sessionId];
      const TWO_HOURS = 2 * 60 * 60 * 1000;
      const isStale = session.startedAt && now - session.startedAt > TWO_HOURS;
      const isDeletable =
        session.startedAt && now - session.startedAt > THRESHOLD;
      const isUnfinished = session.status === "failed"; // Sessions that explicitly failed

      if (
        isStale &&
        (session.status === "recording" || session.status === "uploading")
      ) {
        try {
          const user = await getCurrentUser();
          if (session.backendVideoId) {
            await fetch(
              `${BACKEND_URL}/videos/${session.backendVideoId}`,
              {
                method: "PATCH",
                headers: {
                  Authorization: `Bearer ${user.accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  status: "failed",
                  error: "Upload abandoned (timeout)",
                }),
              },
            );
          }
        } catch (err) {
          console.warn("Failed to notify backend of abandoned session", err);
        }
        session.status = "failed";
        changed = true;
      }

      // Task 4 & 5: Guards - Do NOT delete active recording or uploading sessions
      if (session.status === "recording" || session.status === "uploading")
        continue;

      if (isDeletable || isUnfinished) {
        svLog("CLEANUP_SESSION", { sessionId, status: session.status });
        await deleteSession(sessionId); // Chunks
        delete sv_sessions[sessionId]; // Metadata
        changed = true;
      }
    }

    if (changed) {
      const data_cleanup = { sv_sessions };
      await chrome.storage.local.set(data_cleanup);
    }
  });
  return metadataQueue;
}

loadState();

async function updateState(partial: Partial<AppState>) {
  const newState = { ...state, ...partial };
  const newStateStr = JSON.stringify(newState);

  if (newStateStr === lastStateStr) {
    return; // skip redundant write
  }

  state = newState;
  lastStateStr = newStateStr;

  const data_state = { sv_state: state };
  await chrome.storage.local.set(data_state);
  chrome.runtime
    .sendMessage({ type: "STATE_UPDATE", state } as WorkerMessage)
    .catch(() => {});
}

async function getCurrentUser(): Promise<BackendUser> {
  const { sv_user } = (await chrome.storage.local.get("sv_user")) as {
    sv_user: BackendUser;
  };
  if (!sv_user) {
    throw new Error("No authenticated user found. Please sign in.");
  }
  return sv_user;
}

let metadataQueue = Promise.resolve();

async function saveSessionMetadata(
  sessionId: string,
  metadata: Partial<SessionMetadata>,
) {
  metadataQueue = metadataQueue
    .then(async () => {
      const res = await chrome.storage.local.get("sv_sessions");
      const sv_sessions = (res.sv_sessions || {}) as Record<string, any>;
      const existing = sv_sessions[sessionId] || {};

      svLog("SESSION_METADATA_BEFORE", {
        sessionId,
        existing,
        incoming: metadata,
        timestamp: Date.now()
      });

      // Ensure processingStartedAt is immutable once set
      if (metadata.processingStartedAt && existing.processingStartedAt) {
        delete metadata.processingStartedAt;
      }

      sv_sessions[sessionId] = {
        ...existing,
        ...metadata,
        backendVideoId: metadata.backendVideoId || existing.backendVideoId, // EXPLICIT PRESERVATION
        playerUrl: metadata.playerUrl || existing.playerUrl,
        encryptedFileId: metadata.encryptedFileId || existing.encryptedFileId,
        accountId: metadata.accountId || existing.accountId,
        accountEmail: metadata.accountEmail || existing.accountEmail,
        sessionId,
      };

      svLog("SESSION_METADATA_AFTER", {
        sessionId,
        merged: sv_sessions[sessionId],
        timestamp: Date.now()
      });

      const data_meta = { sv_sessions };
      await chrome.storage.local.set(data_meta);
    })
    .catch((err) => console.error("Metadata save failed:", err));
  return metadataQueue;
}

async function getSessionMetadata(
  sessionId: string,
): Promise<SessionMetadata | null> {
  const res = await chrome.storage.local.get("sv_sessions");
  const sv_sessions = (res.sv_sessions || {}) as Record<string, any>;
  return sv_sessions[sessionId] || null;
}

async function removeSessionMetadata(sessionId: string) {
  metadataQueue = metadataQueue
    .then(async () => {
      const res = await chrome.storage.local.get("sv_sessions");
      const sv_sessions = (res.sv_sessions || {}) as Record<string, any>;
      delete sv_sessions[sessionId];
      const data_remove = { sv_sessions };
      await chrome.storage.local.set(data_remove);
    })
    .catch((err) => console.error("Metadata remove failed:", err));
  return metadataQueue;
}

let _offscreenCreatePromise: Promise<void> | null = null;

async function startOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) return;
  if (_offscreenCreatePromise) return _offscreenCreatePromise;
  _offscreenCreatePromise = chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Recording screen and microphone",
  }).catch(err => {
    // Another call may have already created it — swallow the duplicate error
    if (!String(err).includes("single offscreen document")) throw err;
  }).finally(() => { _offscreenCreatePromise = null; });
  return _offscreenCreatePromise;
}

function startBadgeTimer(startedAt: number) {
  stopBadgeTimer();
  chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
  badgeInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const s = String(elapsed % 60).padStart(2, "0");
    chrome.action.setBadgeText({ text: `${m}:${s}` });
  }, 1000);
}

function stopBadgeTimer() {
  if (badgeInterval) clearInterval(badgeInterval);
  chrome.action.setBadgeText({ text: "" });
}

// Fallback name when there's no tab title or user-typed title.
function friendlyRecordingTitle(now = new Date()): string {
  return `Recording — ${now.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

// Reserves an R2 upload session and registers the video row immediately so
// there's a real, working share link before recording even starts. Unlike
// the old Drive flow, no folder resolution is needed — every recording
// lands in the same shared bucket.
async function preAllocateUpload(account: StorageAccount, title?: string): Promise<PreAllocationResult> {
  const user = await getCurrentUser();
  if (!user.workspaceId) throw new Error("No workspace found for this account.");

  const { key, uploadId } = await initUpload(account.accessToken, user.workspaceId);

  const now = new Date();
  const fileName = `screenvault-${now.toISOString().slice(0, 10)}.webm`;
  const finalTitle = title || friendlyRecordingTitle(now);

  let url = `${PLAYER_BASE_URL}/?title=${encodeURIComponent(finalTitle)}`;
  let videoId: string | undefined;
  let encryptedFileId: string | undefined;
  try {
    const videoRes = await fetch(`${BACKEND_URL}/videos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${account.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fileId: key,
        workspaceId: user.workspaceId,
        title: finalTitle,
        accountEmail: account.email,
      }),
    });
    if (videoRes.ok) {
      const data = await videoRes.json();
      url = data.playerUrl;
      videoId = data.id;
      encryptedFileId = data.encryptedFileId;
    }
  } catch (err) {
    console.warn("Pre-allocation video registration failed, will retry during syncBackend:", err);
  }

  return { id: key, uploadId, url, fileName, account, videoId, encryptedFileId };
}

chrome.runtime.onMessage.addListener(
  (msg: PopupMessage | any, sender, sendResponse) => {
    if (msg.type === "GET_STATE") {
      // Await the real state from storage instead of using the volatile memory variable
      chrome.storage.local.get(["sv_state"]).then((res) => {
        sendResponse(res.sv_state || state);
      });
      return true; // CRITICAL: Keeps the message channel open for the async response
    } else if (msg.type === "GET_ACCOUNTS") {
      sendResponse(accounts);
    } else if (msg.type === "CONNECT_ACCOUNT") {
      connectAccount().then(sendResponse);
      return true; // async
    } else if (msg.type === "GET_TOKEN") {
      const account = accounts.find((a) => a.id === msg.accountId);
      if (account) {
        if (account.invalid) {
          console.warn("Using invalid account prevented:", account.id);
          return sendResponse({ error: "Account needs reconnection" });
        }
        // Proactively refresh if the token is within 60 s of expiry
        if (account.expiresAt < Date.now() + 60_000) {
          trySilentRefresh(account)
            .then(refreshed => sendResponse(refreshed.accessToken))
            .catch(() => sendResponse(account.accessToken));
        } else {
          sendResponse(account.accessToken);
        }
      } else {
        sendResponse({ error: "Account not found" });
      }
      return true;
    } else if (msg.type === "START_RECORDING") {
      startRecording(msg.target);
    } else if (msg.type === "STOP_RECORDING") {
      stopRecording();
    } else if (msg.type === "SAVE_TO_DISK") {
      if (lastBlobUrl) {
        chrome.downloads.download({
          url: lastBlobUrl,
          filename: "screenvault-recording.webm",
        });
      }
    } else if (msg.type === "RECORDING_FINISHED") {
      lastBlobUrl = msg.blobUrl;
      stopBadgeTimer();
      updateState({ status: "uploading", uploadProgress: 0 });
    } else if (msg.type === "CAPTURE_STARTED") {
      const startedAt = Date.now();
      updateState({ startedAt, status: "recording" });
      if (state.sessionId)
        saveSessionMetadata(state.sessionId, {
          startedAt,
          status: "recording",
        });
      startBadgeTimer(startedAt);
    } else if (msg.type === "UPLOAD_PROGRESS") {
      updateState({ uploadProgress: msg.progress });
    } else if (msg.type === "UPLOAD_COMPLETE") {
      svLog("UPLOAD_COMPLETE_RECEIVED", {
        sessionId: state.sessionId,
        backendVideoId: state.backendVideoId,
        fileId: state.preAllocatedFileId,
        accountEmail: msg.account,
        url: msg.url,
        timestamp: Date.now()
      });
      // Increment success count
      const accountIdx = accounts.findIndex((a) => a.email === msg.account);
      if (accountIdx !== -1) {
        accounts[accountIdx].uploadSuccessCount =
          (accounts[accountIdx].uploadSuccessCount || 0) + 1;
        chrome.storage.local.set({ sv_accounts: accounts });
      }

      updateState({
        status: "ready",
        uploadUrl: msg.url,
        uploadAccount: msg.account,
      });

      if (state.sessionId) {
        saveSessionMetadata(state.sessionId, {
          status: "ready",
          playerUrl: msg.url,
          accountEmail: msg.account,
        });
      }
      stopBadgeTimer();

      if (msg.url) {
        chrome.tabs.create({ url: msg.url });
      }
    } else if (msg.type === "RECORDING_ERROR") {
      stopBadgeTimer();
      if (
        typeof msg.message === "string" &&
        msg.message.includes("Mic access failed")
      ) {
        updateState({ errorMessage: msg.message });
      } else {
        updateState({ status: "error", errorMessage: msg.message });
      }
    } else if (msg.type === "LOG" && msg.logMessage) {
      // Re-log locally in SW console and send to backend
      const { tag, data } = msg.logMessage;
      svLog(tag, data);
    } else if (msg.type === "DELETE_SESSION" && msg.sessionId) {
      removeSessionMetadata(msg.sessionId);
    } else if (msg.type === "SET_STATUS") {
      // Allow popup to switch UI state
      updateState({ status: msg.status });
    } else if (msg.type === "MIC_PERMISSION_REQUIRED") {
      // Preserve active recording sessions; only reset if session never initialized.
      if (!(state?.sessionId && state?.startedAt)) {
        updateState({
          status: "idle",
          target: null,
          sessionId: null,
          startedAt: null,
        });
      }
      stopBadgeTimer();
      chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
    } else if (msg.type === "PRE_ALLOCATE_AND_COPY") {
      const now = Date.now();
      if (now - lastPreAllocateTime < 5000) {
        sendResponse({
          error: "Please wait a moment before preparing a new recording link.",
        });
        return;
      }
      lastPreAllocateTime = now;

      // PRE-WARM: Start offscreen document during the countdown to save ~500ms later
      startOffscreenDocument().catch(() => {});

      selectBestAccount()
        .then(async (bestAccount) => {
          if (bestAccount) {
            let prom = preAllocateUpload(bestAccount).catch(async (err) => {
              if (err.message.includes("401") || err.message.includes("Token expired")) {
                svLog("PREALLOCATION_RETRY", { accountEmail: bestAccount.email });
                updateState({ errorMessage: "Restoring your account..." });
                try {
                  const refreshed = await trySilentRefresh(bestAccount);
                  updateState({ errorMessage: null });
                  return await preAllocateUpload(refreshed);
                } catch (refreshErr) {
                  await validateToken(bestAccount).catch(() => {});
                  throw err;
                }
              }
              throw err;
            });

            preAllocationMap.set("latest", prom);
            prom
              .then((data) => {
                sendResponse({ url: data.url });
              })
              .catch(async (err) => {
                sendResponse({ error: err.message });
                preAllocationMap.delete("latest");
              });
          } else {
            sendResponse({ error: "No connected accounts" });
          }
        })
        .catch((err) => sendResponse({ error: err.message }));
      return true; // async
    } else if (msg.type === "GET_PENDING_SESSIONS") {
      getPendingSessions().then(sendResponse);
      return true;
    } else if (msg.type === "RECOVER_SESSION") {
      if (processingSessions.has(msg.sessionId)) {
        sendResponse({ error: "Session is already being processed." });
        return;
      }
      recoverSessionHelper(msg.sessionId)
        .then(sendResponse)
        .catch((e) => sendResponse({ error: e.message }));
      return true;
    } else if (msg.type === "DELETE_SESSION") {
      removeSessionMetadata(msg.sessionId);
      deleteSession(msg.sessionId).then(() => sendResponse({ success: true }));
      return true;
    } else if (msg.type === "SET_SESSION_STATUS") {
      const metaUpdate: Partial<SessionMetadata> = { status: msg.status };
      saveSessionMetadata(msg.sessionId, metaUpdate);

      // Keep in processing set during all active processing states
      const activeStates = ["uploading", "finalizing", "enriching"];
      if (activeStates.includes(msg.status)) {
        processingSessions.add(msg.sessionId);
      } else {
        processingSessions.delete(msg.sessionId);
      }

      // Update global app state if this is the active session
      if (state.sessionId === msg.sessionId) {
        updateState({ status: msg.status as AppState["status"] });
      }
    } else if (msg.type === "SAVE_SESSION_METADATA") {
      saveSessionMetadata(msg.sessionId, msg.metadata);
    } else if (msg.type === "REMOVE_SESSION_METADATA") {
      removeSessionMetadata(msg.sessionId);
    } else if (msg.type === "GET_SESSION_METADATA") {
      getSessionMetadata(msg.sessionId).then(async (meta) => {
        // Check for long processing delay
        if (meta && meta.status === "uploading") {
          const now = Date.now();
          const startedAt = meta.processingStartedAt || 0;
          if (startedAt > 0 && now - startedAt > 30000) {
            (meta as any).isDelayed = true;
          }
        }

        sendResponse(meta);
      });
      return true;
    } else if (msg.type === "GET_ACCOUNTS") {
      sendResponse(accounts);
      return true;
    } else if (msg.type === "RETRY_UPLOAD") {
      recoverSessionHelper(msg.sessionId);
    } else if (msg.type === "GET_USER") {
      chrome.storage.local
        .get("sv_user")
        .then((res) => sendResponse(res.sv_user));
      return true;
    } else if (msg.type === "SYNC_ACCOUNTS") {
      accounts = msg.accounts;
      chrome.storage.local.set({ sv_accounts: accounts });
    }
  },
);

async function recoverSessionHelper(sessionId: string) {
  // Task 6: Prevent duplicate processing
  if (processingSessions.has(sessionId)) return;
  processingSessions.add(sessionId);

  try {
    const meta = await getSessionMetadata(sessionId);
    if (!meta) throw new Error("Session not found");

    const account = accounts.find((a) => a.id === meta.accountId) || accounts[0];
    if (!account) {
      svLog("RECOVERY_ACCOUNT_MISSING", { sessionId, accountId: meta.accountId });
      await saveSessionMetadata(sessionId, { status: "failed" });
      throw new Error(`No connected account available. Please sign in again to recover.`);
    }

    // No pre-allocation step needed here: if meta.fileId/uploadId are
    // missing (very old session), offscreen.ts's uploadWholeBlob will
    // start a fresh R2 upload session on its own before uploading.

    let offscreenReadyTriggered = false;
    const readyListener = (msg: any) => {
      if (msg.type === "OFFSCREEN_READY") {
        offscreenReadyTriggered = true;
        chrome.runtime.onMessage.removeListener(readyListener);
        sendRecoverMessage();
      }
    };
    chrome.runtime.onMessage.addListener(readyListener);

    await startOffscreenDocument();

    const sendRecoverMessage = async () => {
      const storage = await chrome.storage.local.get(["sv_user", "sv_accounts"]);
      chrome.runtime.sendMessage({
        type: "RECOVER_AND_UPLOAD",
        sessionId,
        fileId: meta.fileId,
        uploadId: meta.uploadId,
        playerUrl: meta.playerUrl,
        videoId: meta.backendVideoId,
        encryptedFileId: meta.encryptedFileId,
        account,
        sv_user: storage.sv_user,
        sv_accounts: storage.sv_accounts,
      } as OffscreenMessage);
    };

    if (await chrome.offscreen.hasDocument()) {
      if (!offscreenReadyTriggered) {
        chrome.runtime.onMessage.removeListener(readyListener);
        sendRecoverMessage();
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function connectAccount() {
  try {
    const manifest = chrome.runtime.getManifest();
    const clientId = manifest.oauth2?.client_id;
    const scopes = manifest.oauth2?.scopes?.join(" ");

    if (!clientId || !scopes) {
      throw new Error("OAuth2 client_id or scopes missing in manifest.json");
    }

    const redirectUri = chrome.identity.getRedirectURL();

    // prompt=select_account is the critical parameter that forces the account chooser popup
    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&` +
      `response_type=token&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `prompt=select_account`;

    // This opens the standard web popup instead of using the silent profile token
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true,
    });

    if (!responseUrl) throw new Error("Authorization failed or was cancelled.");

    // Extract the token from the returned URL hash (using split for robustness)
    const params = new URLSearchParams(responseUrl.split("#")[1]);
    const token = params.get("access_token");

    if (!token) throw new Error("No access token found in the response.");

    // Fetch user details
    const userReq = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const user = await userReq.json();

    if (!user.id || !user.email) {
      throw new Error("Failed to retrieve user identity from Google.");
    }

    const account: StorageAccount = {
      id: user.id,
      email: user.email,
      displayName: user.name,
      accessToken: token,
      expiresAt: Date.now() + 3500 * 1000,
      uploadSuccessCount: 0,
      uploadFailureCount: 0,
      isPrimary: true,
      isActive: true,
    };

    // Sync identity with backend (creates/links the user + workspace)
    await syncPrimaryAccount(token, true);

    // Single-account model: signing in replaces any previous account.
    accounts = [account];
    await chrome.storage.local.set({ sv_accounts: accounts });

    // Broadcast the update to the UI
    chrome.runtime
      .sendMessage({ type: "ACCOUNTS_UPDATE", accounts } as WorkerMessage)
      .catch(() => {});
    return { success: true };
  } catch (err: any) {
    console.error("Account connection error:", err);
    return { success: false, error: err.message };
  }
}

async function syncPrimaryAccount(token: string, forceUpdate = false) {
  const currentSession = (await chrome.storage.local.get("sv_user")) as {
    sv_user?: BackendUser;
  };
  const authHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (currentSession.sv_user?.accessToken) {
    authHeaders["Authorization"] = `Bearer ${currentSession.sv_user.accessToken}`;
  }

  try {
    const authRes = await fetch(
      `${BACKEND_URL}/auth/google`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ accessToken: token }),
      },
    );

    if (authRes.ok) {
      const backendData = await authRes.json();
      // ALWAYS update if forceUpdate is true OR if we don't have a valid session yet
      if (!currentSession.sv_user?.accessToken || forceUpdate) {
        const { userId, email, workspaceId, workspaceSlug, workspaceRole } = backendData;
        await chrome.storage.local.set({
          sv_user: {
            accessToken: token,
            userId,
            email,
            workspaceId,
            workspaceSlug,
            workspaceRole,
          },
        });
        chrome.runtime.sendMessage({ type: "STATE_UPDATE", state }).catch(() => {});
      }
    }
  } catch (err) {
    console.error("Backend identity sync failed:", err);
  }
}


async function startRecording(target: AppState["target"]) {
  if (isStarting) {
    console.warn("Recording start already in progress, ignoring duplicate.");
    return;
  }
  if (!target) return;
  isStarting = true;

  // 1. Ensure we have a signed-in account
  if (accounts.length === 0) {
    updateState({
      status: "error",
      errorMessage: "Not signed in. Please sign in with Google.",
    });
    isStarting = false;
    return;
  }

  const sessionId = crypto.randomUUID();
  const offscreenProm = startOffscreenDocument(); // Start offscreen immediately in parallel

  try {
    // 2. Await the pre-allocation (either pending from popup or started now)
    let allocationProm = preAllocationMap.get("latest");
    if (allocationProm) {
      preAllocationMap.delete("latest");
    }

    if (!allocationProm) {
      console.warn("No pre-allocation found, starting fresh allocation");
      let activeAccount = await selectBestAccount();

      if (!activeAccount) {
        throw new Error("No valid account available for recording.");
      }

      const title = (target as any).userTitle || target.tabTitle || "";

      allocationProm = preAllocateUpload(activeAccount, title).catch(async (err) => {
        if (err.message.includes('Token expired') || err.message.includes('401')) {
          svLog("PREALLOCATION_RETRY", { accountEmail: activeAccount!.email });
          updateState({ errorMessage: "Restoring your account..." });
          try {
            activeAccount = await trySilentRefresh(activeAccount!);
            updateState({ errorMessage: null });
            return await preAllocateUpload(activeAccount!, title);
          } catch (refreshErr) {
            await validateToken(activeAccount!).catch(() => {});
            throw err;
          }
        }
        throw err;
      });
    }

    preAllocationMap.set(sessionId, allocationProm);
    const allocation = await allocationProm;

    if (!allocation || !allocation.account || !allocation.account.id) {
      throw new Error("Allocation missing account identity");
    }

    // 3. BACKGROUND: Backend video creation (Do NOT await here to speed up picker)
    // createVideo is idempotent per fileId, so this is a safety net in case
    // preAllocateUpload's own registration call failed.
    const syncBackend = async () => {
      try {
        const { sv_user } = (await chrome.storage.local.get("sv_user")) as { sv_user: BackendUser };
        if (!sv_user?.workspaceId) return;

        // Ensure we have a fresh primary token before calling the backend
        let activeToken = sv_user.accessToken;
        const primaryAccount = accounts.find(a => a.isPrimary);
        if (primaryAccount && (primaryAccount.invalid || primaryAccount.expiresAt < Date.now() + 60_000)) {
          try {
            const refreshed = await trySilentRefresh(primaryAccount);
            activeToken = refreshed.accessToken;
            // sv_user is updated inside trySilentRefresh for isPrimary accounts
          } catch (e) {
            svLog("SYNC_BACKEND_TOKEN_REFRESH_FAILED", { error: String(e) });
          }
        }

        const title = (target as any).userTitle || target.tabTitle || friendlyRecordingTitle();

        const postVideo = async (token: string) => {
          return fetch(`${BACKEND_URL}/videos`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              fileId: allocation.id,
              workspaceId: sv_user.workspaceId,
              title,
              accountEmail: allocation.account.email,
              sessionId,
            }),
          });
        };

        let res = await postVideo(activeToken);

        // If token was rejected, do one emergency refresh and retry
        if (res.status === 401 && primaryAccount) {
          try {
            const refreshed = await trySilentRefresh(primaryAccount);
            activeToken = refreshed.accessToken;
            res = await postVideo(activeToken);
          } catch (e) {
            svLog("SYNC_BACKEND_TOKEN_RETRY_FAILED", { error: String(e) });
          }
        }

        if (res.ok) {
          const data = await res.json();
          const backendVideoId = data.id;
          const playerUrl = data.playerUrl;
          const encryptedFileId = data.encryptedFileId;

          // Store references in metadata for later use
          await saveSessionMetadata(sessionId, {
            backendVideoId,
            playerUrl,
            encryptedFileId,
            fileId: allocation.id,
            uploadId: allocation.uploadId,
            accountEmail: allocation.account.email,
            backendSynced: true,
          });

          // Update volatile state if still recording
          if (state.sessionId === sessionId) {
            updateState({ backendVideoId });
          }
        } else {
          svLog("SYNC_BACKEND_VIDEO_POST_FAILED", { status: res.status, body: await res.text().catch(() => '') });
        }
      } catch (err) {
        console.warn("Deferred backend sync failed:", err);
      }
    };
    syncBackend(); // Kick off in background

    // 4. Critical UI State Update
    const startedAt = Date.now();
    const fileId = allocation.id;
    const uploadId = allocation.uploadId;
    const account = allocation.account;
    const title = (target as any).userTitle || target.tabTitle || friendlyRecordingTitle();

    // Metadata save can be concurrent with offscreen message
    const metaSaveProm = saveSessionMetadata(sessionId, {
      sessionId,
      fileId,
      uploadId,
      title,
      accountId: allocation.account.id,
      accountEmail: allocation.account.email,
      startedAt,
      status: "recording",
    } as any);

    updateState({
      status: "recording",
      sessionId,
      startedAt,
      preAllocatedFileId: fileId,
      uploadAccount: account.email,
      target,
    });

    // 5. Invoke Offscreen Capture (The goal is to reach this ASAP)
    let offscreenReadyTriggered = false;
    const readyListener = (msg: any) => {
      if (msg.type === "OFFSCREEN_READY") {
        offscreenReadyTriggered = true;
        chrome.runtime.onMessage.removeListener(readyListener);
        sendCaptureMessage();
      }
    };
    chrome.runtime.onMessage.addListener(readyListener);

    await offscreenProm; // Ensure offscreen is started (usually already done by pre-warm)

    const sendCaptureMessage = async () => {
      const storage = await chrome.storage.local.get(["sv_user", "sv_accounts"]);
      chrome.runtime.sendMessage({
        type: "START_SCREEN",
        fileId,
        uploadId,
        playerUrl: allocation.url,
        videoId: allocation.videoId,
        encryptedFileId: allocation.encryptedFileId,
        sessionId,
        includeMic: target.includeMic !== false,
        account,
        sv_user: storage.sv_user,
        sv_accounts: storage.sv_accounts,
        title,
        hasUserTitle: !!(target as any).userTitle,
      } as OffscreenMessage);

      // Add timeout fallback for CAPTURE_STARTED
      let captureStarted = false;
      const captureListener = (msg: any) => {
        if (msg.type === "CAPTURE_STARTED" && msg.sessionId === sessionId) {
          captureStarted = true;
          chrome.runtime.onMessage.removeListener(captureListener);
        }
      };
      chrome.runtime.onMessage.addListener(captureListener);

      // This window includes the time the user spends in Chrome's screen picker
      // (getDisplayMedia only resolves after they choose), so it must be generous.
      // A cancelled picker already reports RECORDING_ERROR on its own; this is
      // only a backstop for a capture that never answers.
      setTimeout(() => {
        chrome.runtime.onMessage.removeListener(captureListener);
        // Skip if capture started, or the user already moved on (error, stop, new session).
        if (captureStarted || state.sessionId !== sessionId || state.status !== "recording") return;
        updateState({
          status: "error",
          errorMessage: "Recording didn't start. Please try again.",
        });
      }, CAPTURE_START_TIMEOUT_MS);
    };

    if (await chrome.offscreen.hasDocument()) {
      if (!offscreenReadyTriggered) {
        chrome.runtime.onMessage.removeListener(readyListener);
        sendCaptureMessage();
      }
    }
  } catch (err: any) {
    preAllocationMap.delete(sessionId);
    console.error("Recording start failed:", err);
    updateState({
      status: "error",
      errorMessage: err.message || "Failed to start recording",
    });
  } finally {
    isStarting = false;
  }
}

function stopRecording() {
  const sessionId = state.sessionId;
  const fileId = state.preAllocatedFileId;
  const accountEmail = state.uploadAccount;
  const title = (state.target as any)?.userTitle || state.target?.tabTitle || "Screen Recording";

  svLog("STOP_RECORDING_TRIGGERED", {
    sessionId,
    fileId,
    accountEmail,
    timestamp: Date.now()
  });

  stopBadgeTimer();

  // Transition to processing state immediately
  updateState({ status: "uploading", uploadProgress: 0 });

  chrome.runtime.sendMessage({
    type: "STOP",
    account: accounts.find(a => a.email === accountEmail) || (accounts.length > 0 ? accounts[0] : null),
  });

  // FORCED EARLY LINK: Show link after 4.5 seconds regardless of actual upload state
  // This satisfies the "Fast UI" requirement.
  if (fileId && accountEmail) {
    svLog("EARLY_LINK_TIMER_STARTED", {
      sessionId,
      fileId,
      timestamp: Date.now()
    });

    // Poll until upload completes or 30s elapses, then force ready.
    // Progressive uploads finish in <4.5s; fallback (full blob) can take longer.
    const earlyLinkStart = Date.now();
    const MAX_WAIT_MS = 30_000;
    const POLL_INTERVAL_MS = 2_000;

    const checkAndForce = async () => {
      const stored = await chrome.storage.local.get(["sv_state", "sv_sessions"]);
      const currentState = stored.sv_state as AppState;

      // Abort if session changed, or the real upload handler already finished
      // (it goes enriching -> idle after auto-copying the good link, so "idle"
      // here means this timer is stale and must not overwrite it with an id-less link).
      if (!currentState || currentState.status === "ready" || currentState.status === "idle" || currentState.sessionId !== sessionId) return;

      const sv_sessions = (stored.sv_sessions || {}) as Record<string, any>;
      const sessionMeta = sv_sessions[sessionId] as SessionMetadata;

      // Wait for upload to complete unless we've exceeded the max wait
      const uploadDone = !!sessionMeta?.uploadCompleteAt;
      const timedOut = Date.now() - earlyLinkStart >= MAX_WAIT_MS;

      if (!uploadDone && !timedOut) {
        setTimeout(checkAndForce, POLL_INTERVAL_MS);
        return;
      }

      let url = sessionMeta?.playerUrl;
      if (!url) {
        let encryptedId = sessionMeta?.encryptedFileId;

        if (!encryptedId) {
          // Wait up to 3s for syncBackend to write encryptedFileId
          for (let i = 0; i < 6; i++) {
            await new Promise(resolve => setTimeout(resolve, 500));
            const refreshed = await chrome.storage.local.get("sv_sessions");
            encryptedId = (refreshed.sv_sessions || {})[sessionId]?.encryptedFileId;
            if (encryptedId) break;
          }
          if (!encryptedId) {
            svLog("SID_ONLY_LINK_GENERATED", { sessionId, reason: "encryptedId_timeout" }, sessionId);
          }
        }

        url = `${PLAYER_BASE_URL}/?title=${encodeURIComponent(title)}`;
        if (encryptedId) {
          url += `&id=${encryptedId}`;
        }
        if (sessionId) {
          url += `&sid=${sessionId}`;
        }
      }

      svLog("EARLY_LINK_FORCED_READY", { sessionId, fileId, url, uploadDone, timedOut, timestamp: Date.now() });
      updateState({ status: "ready", uploadUrl: url, uploadAccount: accountEmail });
    };

    setTimeout(checkAndForce, 4500);
  }
}

// Migration and Cleanup Logic
async function runIdentityMigration() {

  try {
    const res = await chrome.storage.local.get(["sv_sessions", "sv_accounts"]);
    const sv_sessions = (res.sv_sessions || {}) as Record<string, SessionMetadata>;
    const sv_accounts = (res.sv_accounts || []) as StorageAccount[];

    let cleanedCount = 0;
    let staleRemovedCount = 0;

    const updatedSessions: Record<string, SessionMetadata> = {};
    const accountEmails = new Set(sv_accounts.map(a => a.email));

    for (const [sessionId, session] of Object.entries(sv_sessions)) {
      // 1. Clean "Unknown Account" strings
      if (session.accountEmail === "Unknown Account") {
        delete session.accountEmail;
        cleanedCount++;
      }

      // 2. Identify stale/orphaned sessions
      // If it's ready and older than 7 days, we can remove the local optimistic record
      // as it should be in the backend now.
      const isOld = session.startedAt && (Date.now() - session.startedAt > 7 * 24 * 60 * 60 * 1000);
      const isSynced = session.backendSynced || session.status === 'ready';

      if (isOld && isSynced) {
        staleRemovedCount++;
        continue; // Don't add to updatedSessions
      }

      updatedSessions[sessionId] = session;
    }

    await chrome.storage.local.set({ sv_sessions: updatedSessions });

  } catch (err) {
    console.error("[SV][SESSION_MIGRATION] Failed:", err);
  }
}

// Global Event Listeners
chrome.runtime.onInstalled.addListener(() => {
  runIdentityMigration();
});

chrome.runtime.onStartup.addListener(() => {
  runIdentityMigration();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (state.status === "recording" && state.target?.tabId === tabId) {
    stopRecording();
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (state.status === "recording" && state.target?.tabId === tabId) {
    if (changeInfo.title) {
      updateState({ target: { ...state.target!, tabTitle: changeInfo.title } });
      // do not interrupt recording
    }
  }
});

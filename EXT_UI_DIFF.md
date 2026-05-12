# Extension UI Overhaul — Diffs and Logic

This document summarizes the changes made to the StudioBase extension to implement the injected popup, the recording toolbar, and the spotlight cursor effect.

## 1. Injected Popup Card
**Logic**: Replaced the standard browser popup (which closes when focus is lost) with a floating card injected directly into the active tab's DOM. This allows for a persistent UI during recording setup and better visual integration.

### Key Changes:
- **`manifest.json`**: Removed `default_popup`. Added `web_accessible_resources` for `injected-popup.js`.
- **`service-worker.ts`**:
    - Added `chrome.action.onClicked` listener to inject the script.
    - Moved Google OAuth logic (`SIGN_IN`) to the background script.
    - Updated `GET_STATE` to include user info.
- **`injected-popup.ts`**: New IIFE script that creates a fixed-position div and renders the app state using vanilla DOM manipulation.

---

## 2. Floating Recording Toolbar
**Logic**: A two-part toolbar that appears only during recording. It provides a timer and control buttons (Stop/Discard).

### Key Changes:
- **`toolbar.ts`**: New module that creates and manages two "pills":
    - **Left Pill**: Recording status and timer.
    - **Center Pill**: Cursor mode selector.
- **`content.ts`**: Updated to call `injectToolbar()` on `START_CAPTURE` and `removeToolbar()` on `STOP_CAPTURE`.

---

## 3. Spotlight Cursor Effect
**Logic**: A full-viewport overlay with a radial gradient mask that follows the cursor, creating a "spotlight" focus effect.

### Key Changes:
- **`toolbar.ts`**: Added `initSpotlight` which creates the overlay and tracks `mousemove` to update the CSS `-webkit-mask-image`.

---

## Technical Diffs (Key Highlights)

### `manifest.json`
```json
{
  "action": {
    "default_icon": { ... }
  },
  "web_accessible_resources": [
    {
      "resources": ["injected-popup.js"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

### `service-worker.ts`
```typescript
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['injected-popup.js']
  });
  chrome.tabs.sendMessage(tab.id, { type: 'SHOW_POPUP', state });
});
```

### `content.ts`
```typescript
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'START_CAPTURE') {
    startCapture();
    injectToolbar();
  }
  if (msg.type === 'STOP_CAPTURE') {
    stopCapture();
    removeToolbar();
  }
});
```

---

## Build Commands
```bash
cd extension
node build.mjs
```
The new entry point `src/capture/injected-popup.ts` is bundled into `dist/injected-popup.js`.
diff --git a/extension/build.mjs b/extension/build.mjs
index 073181d..2242e4b 100644
--- a/extension/build.mjs
+++ b/extension/build.mjs
@@ -22,6 +22,7 @@ await esbuild.build({ ...shared, entryPoints: ['src/offscreen.ts'] })
 await esbuild.build({ ...shared, entryPoints: ['src/setup.ts'] })
 await esbuild.build({ ...shared, entryPoints: ['src/popup.ts'] })
 await esbuild.build({ ...shared, entryPoints: ['src/playback.ts'] })
+await esbuild.build({ ...shared, entryPoints: ['src/capture/injected-popup.ts'] })
 await esbuild.build({ ...shared, entryPoints: ['src/dashboard/index.tsx'], outbase: 'src' })
 
 // Copy static files
diff --git a/extension/manifest.json b/extension/manifest.json
index 182eb1b..3fe3e3e 100644
--- a/extension/manifest.json
+++ b/extension/manifest.json
@@ -27,13 +27,18 @@
     }
   ],
   "action": {
-    "default_popup": "popup.html",
     "default_icon": {
       "16": "icons/icon16.png",
       "48": "icons/icon48.png",
       "128": "icons/icon128.png"
     }
   },
+  "web_accessible_resources": [
+    {
+      "resources": ["injected-popup.js", "toolbar.js"],
+      "matches": ["<all_urls>"]
+    }
+  ],
   "oauth2": {
     "client_id": "813435932187-l9vpdot4lsa51o4qa617o83111jgirot.apps.googleusercontent.com",
     "scopes": [
diff --git a/extension/src/content.ts b/extension/src/content.ts
index 2a0cfa6..f781f67 100644
--- a/extension/src/content.ts
+++ b/extension/src/content.ts
@@ -1,8 +1,13 @@
-// Content script entry point — injected into every page by Chrome.
-// Listens for messages from the service worker to start/stop capture.
 import { startCapture, stopCapture } from './capture/dom-observer';
+import { injectToolbar, removeToolbar } from './capture/toolbar';
 
 chrome.runtime.onMessage.addListener((msg) => {
-  if (msg.type === 'START_CAPTURE') startCapture();
-  if (msg.type === 'STOP_CAPTURE') stopCapture();
+  if (msg.type === 'START_CAPTURE') {
+    startCapture();
+    injectToolbar();
+  }
+  if (msg.type === 'STOP_CAPTURE') {
+    stopCapture();
+    removeToolbar();
+  }
 });
diff --git a/extension/src/service-worker.ts b/extension/src/service-worker.ts
index 00342a2..586796b 100644
--- a/extension/src/service-worker.ts
+++ b/extension/src/service-worker.ts
@@ -2,8 +2,10 @@ import {
   AppState,
   CaptureTarget,
   WorkerMessage,
+  BackendUser,
 } from "./types";
 import { sbLog } from "./logger";
+import { BACKEND_URL } from "../../shared/constants";
 import {
   startSession,
   stopSession,
@@ -22,7 +24,7 @@ let state: AppState = { status: "idle" };
 
 async function init() {
   try {
-    const stored = await chrome.storage.local.get(["sb_state"]);
+    const stored = await chrome.storage.local.get(["sb_state", "sb_user"]);
     if (stored.sb_state) state = stored.sb_state as AppState;
 
     sbLog("STATE_REHYDRATED", { status: state.status });
@@ -33,13 +35,34 @@ async function init() {
 
 void init();
 
+// ─── Injection Logic ──────────────────────────────────────────
+
+chrome.action.onClicked.addListener(async (tab) => {
+  if (!tab.id || !tab.url || tab.url.startsWith("chrome://")) return;
+  
+  try {
+    // inject the UI script into the active tab
+    await chrome.scripting.executeScript({
+      target: { tabId: tab.id },
+      files: ['injected-popup.js']
+    });
+    // the script handles SHOW_POPUP via its own listener once loaded, 
+    // but we send it anyway to be sure or for toggling.
+    chrome.tabs.sendMessage(tab.id, { type: 'SHOW_POPUP', state });
+  } catch (err) {
+    console.error("Failed to inject popup:", err);
+  }
+});
+
 // ─── Message Handling ────────────────────────────────────────
 
 chrome.runtime.onMessage.addListener((msg: WorkerMessage, _sender, sendResponse) => {
   // GET_STATE is the only synchronous response — handle it and return false
   if (msg.type === "GET_STATE") {
-    sendResponse(state);
-    return false;
+    chrome.storage.local.get(["sb_user"], (stored) => {
+      sendResponse({ ...state, sb_user: stored.sb_user });
+    });
+    return true; // Keep channel open for async response
   }
 
   // All other messages are fire-and-forget — dispatch async work but
@@ -61,6 +84,9 @@ chrome.runtime.onMessage.addListener((msg: WorkerMessage, _sender, sendResponse)
     case "RETRY_UPLOAD":
       retryUpload();
       break;
+    case "SIGN_IN":
+      handleSignIn();
+      break;
     case "CAPTURE_STEP":
       if (state.status === "recording" && state.sessionId) {
         const p = msg.payload;
@@ -202,3 +228,53 @@ async function retryUpload() {
     updateState({ status: "failed_enrichment", errorMessage: err.message });
   }
 }
+
+async function handleSignIn() {
+  try {
+    const token = await new Promise<string>((resolve, reject) => {
+      chrome.identity.getAuthToken({ interactive: true }, (res) => {
+        if (chrome.runtime.lastError) {
+          reject(chrome.runtime.lastError);
+        } else {
+          const t = typeof res === 'string' ? res : (res as any)?.token;
+          if (t) resolve(t);
+          else reject(new Error("No token returned"));
+        }
+      });
+    });
+
+    const res = await fetch(`${BACKEND_URL}/auth/google`, {
+      method: "POST",
+      headers: { "Content-Type": "application/json" },
+      body: JSON.stringify({ accessToken: token }),
+    });
+
+    if (!res.ok) {
+      const errBody = await res.json().catch(() => ({ error: res.statusText })) as any;
+      throw new Error(`Backend auth failed (${res.status}): ${errBody?.error || errBody?.message || 'unknown'}`);
+    }
+
+    const data = await res.json();
+    const { userId, workspaceId, email, picture } = data;
+
+    const sb_user: BackendUser = {
+      accessToken: token,
+      userId,
+      workspaceId,
+      email,
+      picture
+    };
+
+    await chrome.storage.local.set({
+      sb_user,
+      workspaceId,
+      email,
+      picture
+    });
+
+    // Notify all tabs of state update to refresh card
+    await updateState({ ...state });
+  } catch (err: any) {
+    console.error("Sign in failed:", err);
+  }
+}
diff --git a/extension/src/types.ts b/extension/src/types.ts
index b0439f6..2916376 100644
--- a/extension/src/types.ts
+++ b/extension/src/types.ts
@@ -100,6 +100,8 @@ export type WorkerMessage =
   | { type: 'STOP_RECORDING' }
   | { type: 'ABORT_RECORDING' }
   | { type: 'RETRY_UPLOAD' }
+  | { type: 'SIGN_IN' }
+  | { type: 'SHOW_POPUP'; state: AppState }
   | { type: 'STATE_UPDATE'; state: AppState }
   | { type: 'LOG'; logMessage: { tag: string; data: any } }
   | { type: 'CAPTURE_STEP'; payload: any };

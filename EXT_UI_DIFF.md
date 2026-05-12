# StudioBase Recording Toolbar & Cursor System Overhaul

## Overview
This update consolidates the recording toolbar UI and introduces a robust custom cursor management system. These changes ensure that the cursor is always visible in automated screen captures and correctly reflects the user's chosen mode during playback in the Studio.

## Key Changes

### 1. Toolbar UI Consolidation
- **File**: `extension/src/capture/toolbar.ts`
- **Change**: Replaced the dual-pill layout with a single, cohesive interface.
- **Logic**: Merged the timer, recording controls, and cursor mode selection into one pill. This reduces screen clutter and improves usability during recording.

### 2. Custom DOM-Based Cursor System
- **File**: `extension/src/capture/toolbar.ts`
- **Logic**: Implemented a `CustomCursor` management system. Since `captureVisibleTab` does not capture the OS cursor, we now hide the native cursor and render a custom DOM element (`sb-cursor`) that follows the mouse movement. This ensures the cursor is "baked into" every screenshot.

### 3. Five Distinct Cursor Modes
- **Default**: 32px white arrow with a black stroke.
- **Black Bold**: 40px solid black arrow for high visibility.
- **Click Ripple**: Standard cursor with an animated purple ripple on click.
- **Spotlight**: Darkens the entire screen except for a 90px circular area around the cursor.
- **Laser Pointer**: A glowing red dot with a pulse animation on click.

### 4. Data Pipeline Integration
- **Files**: `extension/src/capture/dom-observer.ts`, `extension/src/service-worker.ts`, `shared/types/session.ts`
- **Logic**:
    - Added a `data` field to the canonical `Step` interface to allow for flexible metadata.
    - Updated `dom-observer.ts` to capture the `activeCursorMode` at the moment of interaction.
    - Updated `service-worker.ts` to persist this `cursorMode` in the event payload.

### 5. Dynamic Studio Rendering
- **File**: `studio/src/components/ui/index.tsx`
- **Change**: Updated `ScreenshotPlaceholder` to dynamically render the recorded cursor.
- **Logic**: Instead of a hardcoded click overlay, the Studio now honors the `cursorMode` captured during recording, rendering the exact visual effect (e.g., Laser Pointer or Black Arrow) at the recorded coordinates.

## Implementation Details

### Cursor Mode Styles
```css
@keyframes sb-ripple {
  0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
}
@keyframes sb-laser-pulse {
  0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; border-width: 4px; }
  100% { transform: translate(-50%, -50%) scale(2); opacity: 0; border-width: 1px; }
}
```

### Capture Payload
```typescript
{
  action: 'click',
  // ... coordinates, etc.
  cursorMode: 'laser'
}
```

## Build & Deployment
- Extension: `node build.mjs`
- Studio: `npm run build`
- All TypeScript errors resolved and unused imports removed.
diff --git a/EXT_UI_DIFF.md b/EXT_UI_DIFF.md
new file mode 100644
index 0000000..e69de29
diff --git a/EXT_UI_OVERHAUL.md b/EXT_UI_OVERHAUL.md
new file mode 100644
index 0000000..1b701a4
--- /dev/null
+++ b/EXT_UI_OVERHAUL.md
@@ -0,0 +1,62 @@
+# StudioBase Recording Toolbar & Cursor System Overhaul
+
+## Overview
+This update consolidates the recording toolbar UI and introduces a robust custom cursor management system. These changes ensure that the cursor is always visible in automated screen captures and correctly reflects the user's chosen mode during playback in the Studio.
+
+## Key Changes
+
+### 1. Toolbar UI Consolidation
+- **File**: `extension/src/capture/toolbar.ts`
+- **Change**: Replaced the dual-pill layout with a single, cohesive interface.
+- **Logic**: Merged the timer, recording controls, and cursor mode selection into one pill. This reduces screen clutter and improves usability during recording.
+
+### 2. Custom DOM-Based Cursor System
+- **File**: `extension/src/capture/toolbar.ts`
+- **Logic**: Implemented a `CustomCursor` management system. Since `captureVisibleTab` does not capture the OS cursor, we now hide the native cursor and render a custom DOM element (`sb-cursor`) that follows the mouse movement. This ensures the cursor is "baked into" every screenshot.
+
+### 3. Five Distinct Cursor Modes
+- **Default**: 32px white arrow with a black stroke.
+- **Black Bold**: 40px solid black arrow for high visibility.
+- **Click Ripple**: Standard cursor with an animated purple ripple on click.
+- **Spotlight**: Darkens the entire screen except for a 90px circular area around the cursor.
+- **Laser Pointer**: A glowing red dot with a pulse animation on click.
+
+### 4. Data Pipeline Integration
+- **Files**: `extension/src/capture/dom-observer.ts`, `extension/src/service-worker.ts`, `shared/types/session.ts`
+- **Logic**:
+    - Added a `data` field to the canonical `Step` interface to allow for flexible metadata.
+    - Updated `dom-observer.ts` to capture the `activeCursorMode` at the moment of interaction.
+    - Updated `service-worker.ts` to persist this `cursorMode` in the event payload.
+
+### 5. Dynamic Studio Rendering
+- **File**: `studio/src/components/ui/index.tsx`
+- **Change**: Updated `ScreenshotPlaceholder` to dynamically render the recorded cursor.
+- **Logic**: Instead of a hardcoded click overlay, the Studio now honors the `cursorMode` captured during recording, rendering the exact visual effect (e.g., Laser Pointer or Black Arrow) at the recorded coordinates.
+
+## Implementation Details
+
+### Cursor Mode Styles
+```css
+@keyframes sb-ripple {
+  0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
+  100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
+}
+@keyframes sb-laser-pulse {
+  0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; border-width: 4px; }
+  100% { transform: translate(-50%, -50%) scale(2); opacity: 0; border-width: 1px; }
+}
+```
+
+### Capture Payload
+```typescript
+{
+  action: 'click',
+  // ... coordinates, etc.
+  cursorMode: 'laser'
+}
+```
+
+## Build & Deployment
+- Extension: `node build.mjs`
+- Studio: `npm run build`
+- All TypeScript errors resolved and unused imports removed.
diff --git a/extension/src/capture/dom-observer.ts b/extension/src/capture/dom-observer.ts
index 12e217d..2503d15 100644
--- a/extension/src/capture/dom-observer.ts
+++ b/extension/src/capture/dom-observer.ts
@@ -7,6 +7,7 @@
 // ============================================================
 
 import { generateSelector } from './selector-engine';
+import { getActiveCursorMode } from './toolbar';
 
 export type CaptureMessage =
   | { type: 'CAPTURE_STEP'; payload: RawStepPayload }
@@ -35,6 +36,7 @@ export interface RawStepPayload {
   };
   isIframeBlocked: boolean;
   frameUrl: string;
+  cursorMode?: string;
 }
 
 let isCapturing = false;
@@ -133,6 +135,7 @@ function handleInteraction(
     },
     isIframeBlocked: window !== window.top,
     frameUrl: location.href,
+    cursorMode: getActiveCursorMode(),
   };
 
   // Signal background worker to take screenshot after DOM settles
@@ -161,6 +164,7 @@ function scheduleNavigationCapture() {
       },
       isIframeBlocked: false,
       frameUrl: location.href,
+      cursorMode: getActiveCursorMode(),
     };
     chrome.runtime.sendMessage({ type: 'CAPTURE_STEP', payload });
   }, 300); // give SPA time to render the new route
diff --git a/extension/src/capture/toolbar.ts b/extension/src/capture/toolbar.ts
new file mode 100644
index 0000000..7ef9632
--- /dev/null
+++ b/extension/src/capture/toolbar.ts
@@ -0,0 +1,295 @@
+// toolbar.ts
+// This script handles the recording toolbar and cursor effects.
+
+export type CursorMode = 'default' | 'black' | 'ripple' | 'spotlight' | 'laser';
+
+let toolbarContainer: HTMLDivElement | null = null;
+let spotlightOverlay: HTMLDivElement | null = null;
+let timerInterval: any = null;
+let startTime: number = 0;
+let activeCursorMode: CursorMode = 'default';
+let cursorEl: HTMLDivElement | null = null;
+let mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
+let mouseClickHandler: ((e: MouseEvent) => void) | null = null;
+
+export function getActiveCursorMode() {
+  return activeCursorMode;
+}
+
+export function injectToolbar() {
+  if (document.getElementById('sb-toolbar-container')) return;
+
+  toolbarContainer = document.createElement('div');
+  toolbarContainer.id = 'sb-toolbar-container';
+  
+  // Style Container
+  Object.assign(toolbarContainer.style, {
+    position: 'fixed',
+    bottom: '24px',
+    left: '0',
+    right: '0',
+    display: 'flex',
+    justifyContent: 'center',
+    zIndex: '2147483647',
+    pointerEvents: 'none',
+    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
+  });
+
+  // Main Pill
+  const pill = document.createElement('div');
+  Object.assign(pill.style, {
+    background: '#ffffff',
+    borderRadius: '999px',
+    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
+    padding: '8px 16px',
+    display: 'flex',
+    alignItems: 'center',
+    gap: '12px',
+    pointerEvents: 'auto',
+    border: '1px solid #e0e0e0'
+  });
+
+  const modes = [
+    { id: 'default', icon: '↖️', label: 'Default' },
+    { id: 'black', icon: '↖️', label: 'Black Bold', color: 'black' },
+    { id: 'ripple', icon: '◎', label: 'Click Ripple' },
+    { id: 'spotlight', icon: '☀', label: 'Spotlight' },
+    { id: 'laser', icon: '🔴', label: 'Laser Pointer' }
+  ];
+
+  pill.innerHTML = `
+    <div style="display: flex; align-items: center; gap: 8px;">
+      <div style="width: 8px; height: 8px; background: #ff3b30; border-radius: 50%; animation: pulse 1s infinite;"></div>
+      <span id="sb-timer" style="font-variant-numeric: tabular-nums; font-weight: 600; font-size: 14px; min-width: 45px;">00:00</span>
+    </div>
+    <div style="width: 1px; height: 20px; background: #e0e0e0;"></div>
+    <div style="display: flex; gap: 8px;">
+      <button id="sb-stop-btn" title="Stop & Finish" style="background: #1a1a1a; color: white; border: none; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
+        <div style="width: 10px; height: 10px; background: white; border-radius: 2px;"></div>
+      </button>
+      <button id="sb-discard-btn" title="Discard" style="background: none; border: 1px solid #e0e0e0; color: #666; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
+        ×
+      </button>
+    </div>
+    <div style="width: 1px; height: 20px; background: #e0e0e0;"></div>
+    <div style="display: flex; gap: 4px;">
+      ${modes.map(m => `
+        <button id="sb-mode-${m.id}" title="${m.label}" style="background: none; border: none; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 16px; transition: background 0.2s; ${m.color === 'black' ? 'filter: grayscale(1) brightness(0);' : ''}">
+          ${m.icon}
+        </button>
+      `).join('')}
+    </div>
+  `;
+
+  toolbarContainer.appendChild(pill);
+  document.body.appendChild(toolbarContainer);
+
+  // Timer Logic
+  startTime = Date.now();
+  const timerEl = document.getElementById('sb-timer');
+  timerInterval = setInterval(() => {
+    const elapsed = Math.floor((Date.now() - startTime) / 1000);
+    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
+    const s = (elapsed % 60).toString().padStart(2, '0');
+    if (timerEl) timerEl.textContent = `${m}:${s}`;
+  }, 1000);
+
+  // Button Listeners
+  document.getElementById('sb-stop-btn')?.addEventListener('click', () => {
+    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
+  });
+
+  document.getElementById('sb-discard-btn')?.addEventListener('click', () => {
+    if (confirm('Are you sure you want to discard this recording?')) {
+      chrome.runtime.sendMessage({ type: 'ABORT_RECORDING' });
+    }
+  });
+
+  modes.forEach(m => {
+    document.getElementById(`sb-mode-${m.id}`)?.addEventListener('click', () => setCursorMode(m.id as any));
+  });
+
+  // Pulse animation style
+  const style = document.createElement('style');
+  style.id = 'sb-toolbar-styles';
+  style.textContent = `
+    @keyframes pulse {
+      0% { opacity: 1; }
+      50% { opacity: 0.4; }
+      100% { opacity: 1; }
+    }
+    @keyframes sb-ripple {
+      0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
+      100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
+    }
+    @keyframes sb-laser-pulse {
+      0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; border-width: 4px; }
+      100% { transform: translate(-50%, -50%) scale(2); opacity: 0; border-width: 1px; }
+    }
+  `;
+  document.head.appendChild(style);
+
+  // Initial cursor mode
+  applyCursorMode('default');
+}
+
+export function removeToolbar() {
+  if (toolbarContainer) {
+    toolbarContainer.remove();
+    toolbarContainer = null;
+  }
+  if (timerInterval) {
+    clearInterval(timerInterval);
+    timerInterval = null;
+  }
+  document.getElementById('sb-toolbar-styles')?.remove();
+  cleanupCursor();
+}
+
+function setCursorMode(mode: CursorMode) {
+  activeCursorMode = mode;
+  applyCursorMode(mode);
+}
+
+function applyCursorMode(mode: CursorMode) {
+  cleanupCursor();
+  activeCursorMode = mode;
+  document.body.style.cursor = 'none';
+
+  // Update UI state
+  const modes = ['default', 'black', 'ripple', 'spotlight', 'laser'];
+  modes.forEach(m => {
+    const btn = document.getElementById(`sb-mode-${m}`);
+    if (btn) {
+      btn.style.background = m === mode ? '#5e5ce6' : 'none';
+      btn.style.color = m === mode ? 'white' : '';
+      if (m === 'black' && m !== mode) btn.style.filter = 'grayscale(1) brightness(0)';
+      else if (m === 'black' && m === mode) btn.style.filter = 'brightness(0) invert(1)';
+      else btn.style.filter = '';
+    }
+  });
+
+  // Create cursor DOM element
+  cursorEl = document.createElement('div');
+  cursorEl.id = 'sb-cursor';
+  Object.assign(cursorEl.style, {
+    position: 'fixed',
+    pointerEvents: 'none',
+    zIndex: '2147483645',
+    transition: 'none',
+    transform: 'translate(0, 0)', // will be updated by mousemove
+    left: '0',
+    top: '0'
+  });
+
+  const arrowSvg = (color: string) => `
+    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
+      <path d="M7 2L25 20L15.5 21L11.5 30L7 2Z" fill="${color}" stroke="${color === 'white' ? 'black' : 'white'}" stroke-width="2" stroke-linejoin="round"/>
+    </svg>
+  `;
+
+  if (mode === 'default' || mode === 'ripple' || mode === 'spotlight') {
+    cursorEl.innerHTML = arrowSvg(mode === 'spotlight' || mode === 'default' ? 'white' : 'white');
+    if (mode === 'ripple') cursorEl.innerHTML = arrowSvg('black');
+  } else if (mode === 'black') {
+    cursorEl.innerHTML = arrowSvg('black');
+    cursorEl.style.width = '40px';
+    cursorEl.style.height = '40px';
+    cursorEl.querySelector('svg')?.setAttribute('width', '40');
+    cursorEl.querySelector('svg')?.setAttribute('height', '40');
+  } else if (mode === 'laser') {
+    Object.assign(cursorEl.style, {
+      width: '12px',
+      height: '12px',
+      background: 'red',
+      borderRadius: '50%',
+      boxShadow: '0 0 8px 4px rgba(255,0,0,0.6), 0 0 2px 1px red',
+      transform: 'translate(-50%, -50%)'
+    });
+  }
+
+  document.body.appendChild(cursorEl);
+
+  mouseMoveHandler = (e: MouseEvent) => {
+    if (cursorEl) {
+      if (mode === 'laser') {
+        cursorEl.style.left = e.clientX + 'px';
+        cursorEl.style.top = e.clientY + 'px';
+      } else {
+        cursorEl.style.left = e.clientX + 'px';
+        cursorEl.style.top = e.clientY + 'px';
+      }
+    }
+    if (mode === 'spotlight') updateSpotlight(e);
+  };
+
+  if (mode === 'ripple' || mode === 'laser') {
+    mouseClickHandler = (e: MouseEvent) => spawnRipple(e.clientX, e.clientY, mode);
+    document.addEventListener('mousedown', mouseClickHandler, true);
+  }
+
+  document.addEventListener('mousemove', mouseMoveHandler, true);
+  if (mode === 'spotlight') initSpotlight();
+}
+
+function cleanupCursor() {
+  document.body.style.cursor = '';
+  cursorEl?.remove();
+  cursorEl = null;
+  if (mouseMoveHandler) document.removeEventListener('mousemove', mouseMoveHandler, true);
+  if (mouseClickHandler) document.removeEventListener('mousedown', mouseClickHandler, true);
+  removeSpotlight();
+}
+
+function spawnRipple(x: number, y: number, mode: CursorMode) {
+  const ripple = document.createElement('div');
+  Object.assign(ripple.style, {
+    position: 'fixed',
+    left: x + 'px',
+    top: y + 'px',
+    width: '60px',
+    height: '60px',
+    borderRadius: '50%',
+    pointerEvents: 'none',
+    zIndex: '2147483644',
+    background: mode === 'laser' ? 'none' : 'rgba(94, 92, 230, 0.4)',
+    border: mode === 'laser' ? '2px solid red' : 'none',
+    animation: mode === 'laser' ? 'sb-laser-pulse 0.4s ease-out forwards' : 'sb-ripple 0.4s ease-out forwards'
+  });
+  document.body.appendChild(ripple);
+  setTimeout(() => ripple.remove(), 400);
+}
+
+// Spotlight Logic
+function initSpotlight() {
+  if (spotlightOverlay) return;
+
+  spotlightOverlay = document.createElement('div');
+  spotlightOverlay.id = 'sb-spotlight-overlay';
+  Object.assign(spotlightOverlay.style, {
+    position: 'fixed',
+    inset: '0',
+    pointerEvents: 'none',
+    zIndex: '2147483643',
+    background: 'rgba(0,0,0,0.45)',
+    transition: 'opacity 0.3s ease'
+  });
+
+  document.body.appendChild(spotlightOverlay);
+}
+
+function updateSpotlight(e: MouseEvent) {
+  if (!spotlightOverlay) return;
+  const x = e.clientX;
+  const y = e.clientY;
+  const mask = `radial-gradient(circle 90px at ${x}px ${y}px, transparent 88px, black 90px)`;
+  spotlightOverlay.style.webkitMaskImage = mask;
+  spotlightOverlay.style.maskImage = mask;
+}
+
+function removeSpotlight() {
+  if (spotlightOverlay) {
+    spotlightOverlay.remove();
+    spotlightOverlay = null;
+  }
+}
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
index 00342a2..63b8139 100644
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
@@ -24,7 +26,7 @@ async function init() {
   try {
     const stored = await chrome.storage.local.get(["sb_state"]);
     if (stored.sb_state) state = stored.sb_state as AppState;
-
+    
     sbLog("STATE_REHYDRATED", { status: state.status });
   } catch (err) {
     console.warn("Extension initialization warning:", err);
@@ -69,7 +71,7 @@ chrome.runtime.onMessage.addListener((msg: WorkerMessage, _sender, sendResponse)
           type: p.action,
           timestamp: p.timestamp,
           selector: p.selector || "",
-          data: p,
+          data: { ...p, cursorMode: p.cursorMode || 'default' },
         }).then(async () => {
           try {
             const session = await getSession(sessionId);
@@ -202,3 +204,4 @@ async function retryUpload() {
     updateState({ status: "failed_enrichment", errorMessage: err.message });
   }
 }
+
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
diff --git a/shared/types/session.ts b/shared/types/session.ts
index 15454b7..7e8522a 100644
--- a/shared/types/session.ts
+++ b/shared/types/session.ts
@@ -240,6 +240,9 @@ export interface Step {
   courseware?: CoursewareMeta;
   template?: TemplateMeta;
   overlay?: OverlayMeta;
+
+  // Metadata captured at interaction time
+  data?: Record<string, any>;
 }
 
 // ─── Session Envelope ───────────────────────────────────────
diff --git a/studio/src/components/ui/index.tsx b/studio/src/components/ui/index.tsx
index 1560d5e..0842d74 100644
--- a/studio/src/components/ui/index.tsx
+++ b/studio/src/components/ui/index.tsx
@@ -1,7 +1,6 @@
 import React from 'react';
 import type { LucideIcon } from 'lucide-react';
 import type { Step, SessionEnvelope } from '../../../../shared/types/session';
-import { I } from '../icons';
 
 export * from './DotGrid';
 export * from './AIShimmer';
@@ -351,6 +350,8 @@ export const ScreenshotPlaceholder: React.FC<{
   const cx = step?.coordinates?.x ? `${(step.coordinates.x / (step.coordinates.viewportWidth||1440)) * 100}%` : '62%';
   const cy = step?.coordinates?.y ? `${(step.coordinates.y / (step.coordinates.viewportHeight||900)) * 100}%` : '58%';
 
+  const cursorMode = step?.data?.cursorMode || 'default';
+
   // Try to get real screenshot URL
   const realUrl = step?.screenshotKey && session?.assets?.[step.screenshotKey] 
     ? session.assets[step.screenshotKey] 
@@ -377,15 +378,22 @@ export const ScreenshotPlaceholder: React.FC<{
       {realUrl ? (
         <div className="absolute inset-0 top-9">
           <img src={realUrl} className="w-full h-full object-cover" alt="Step screenshot" />
-          {action === 'click' && (
-            <div className="absolute pointer-events-none" style={{ left: cx, top: cy, transform: 'translate(-50%,-50%)' }}>
-              <span className="absolute -inset-6 rounded-full" style={{ background: 'radial-gradient(circle, rgba(94,92,230,0.4), transparent 70%)' }} />
+          
+          <div className="absolute pointer-events-none" style={{ left: cx, top: cy, transform: 'translate(-50%,-50%)' }}>
+            {(cursorMode === 'default' || cursorMode === 'black' || cursorMode === 'ripple' || cursorMode === 'spotlight') && (
               <div className="relative">
-                <span className="block w-4 h-4 rounded-full bg-primary ring-4 ring-primary/30 shadow-lg" />
-                <I.Cursor size={16} className="absolute top-full left-full -translate-x-1 -translate-y-1 text-white drop-shadow-md fill-primary" strokeWidth={2.5} />
+                {cursorMode === 'ripple' && (
+                  <span className="absolute inset-0 rounded-full animate-ping bg-primary/30" style={{ width: 48, height: 48, transform: 'translate(-33%, -33%)' }} />
+                )}
+                <svg width={cursorMode === 'black' ? "40" : "32"} height={cursorMode === 'black' ? "40" : "32"} viewBox="0 0 32 32" fill="none">
+                  <path d="M7 2L25 20L15.5 21L11.5 30L7 2Z" fill={cursorMode === 'black' ? "black" : "white"} stroke={cursorMode === 'black' ? "white" : "black"} strokeWidth="2" strokeLinejoin="round"/>
+                </svg>
               </div>
-            </div>
-          )}
+            )}
+            {cursorMode === 'laser' && (
+              <span className="block w-3.5 h-3.5 rounded-full bg-red-600 shadow-[0_0_8px_4px_rgba(255,0,0,0.5)]" />
+            )}
+          </div>
         </div>
       ) : (
         <div className="absolute inset-0 top-9 flex">

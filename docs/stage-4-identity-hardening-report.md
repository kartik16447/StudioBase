# Stage 4 — Identity Hardening & Early Link Safety Report

## 1. Original Problem & Root Cause Analysis

### Raw `fileId` Exposure Risk
During a recording, ScreenVault utilizes "Hybrid Finalization." The frontend prepares an early playback link so that users get "instant link" UX (the 4.5s forced-ready timer in `service-worker.ts`). 
However, the canonical, encrypted identity of the video (`encryptedFileId`) is generated asynchronously by the backend (`syncBackend()`).

If the 4.5s early-link timer fired *before* `syncBackend()` persisted the `encryptedFileId` to Chrome storage, the URL generation fallback kicked in:
```typescript
const idToUse = sessionMeta?.encryptedFileId || fileId;
```
This fell back to the local `fileId`, which is the actual raw Google Drive file ID. The raw Drive ID was then encoded into the `?id=` parameter of the shared link. 

### Why This Was Dangerous
1. **Security/Privacy Leak**: Exposing raw Google Drive file IDs allows anyone with the link to potentially query the Drive API directly. Even though permissions govern access, exposing internal storage coordinates is poor security posture.
2. **Architectural Coupling**: The player URL became tightly coupled to the underlying storage provider. ScreenVault's philosophy is "backend-mediated identity only".
3. **Migration Difficulties**: If the storage backend ever changes (e.g. from Google Drive to S3), old links containing raw Drive IDs would be harder to proxy or migrate seamlessly.

---

## 2. Exact Code Changes

**Target File**: `screenvault-extension/src/service-worker.ts`

### The Surgical Edit

**BEFORE:**
```typescript
      let url = sessionMeta?.playerUrl;
      if (!url) {
        const idToUse = sessionMeta?.encryptedFileId || fileId;
        const PLAYER_BASE_URL = 'https://screenvault-player.pages.dev';
        url = `${PLAYER_BASE_URL}/?id=${idToUse}&title=${encodeURIComponent(title)}`;
        if (sessionId) url += `&sid=${sessionId}`;
      }
```

**AFTER:**
```typescript
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
        }

        const PLAYER_BASE_URL = 'https://screenvault-player.pages.dev';
        url = `${PLAYER_BASE_URL}/?title=${encodeURIComponent(title)}`;
        if (encryptedId) {
          url += `&id=${encryptedId}`;
        }
        if (sessionId) {
          url += `&sid=${sessionId}`;
        }
      }
```

### Lifecycle Impact
*   **Wait Mechanism**: The `checkAndForce` timer now temporarily pauses URL generation for up to 3000ms, polling `chrome.storage` every 500ms to see if `syncBackend()` has finalized.
*   **Complete Removal of `fileId` Fallback**: If the 3-second window elapses and `encryptedId` is *still* missing (e.g. network failure), the generated URL is completely stripped of the `id` parameter. It relies entirely on `&sid=${sessionId}`.

---

## 3. Guarantees & Interaction with Upload Flow

### New Guarantees
1. **Zero Raw Leakage**: It is now mathematically impossible for `stopRecording()` to embed the raw `fileId` in the early-link URL.
2. **Canonical Exclusivity**: Playable/shareable links are generated exclusively with backend-mediated identity components (`encryptedFileId` or `sid`).

### Did Early Playability Timing Change?
*   **Best Case**: No. If `syncBackend()` is fast (the vast majority of cases), the early link is presented exactly at 4.5s.
*   **Worst Case**: The early link presentation is delayed by a maximum of 3 seconds (up to 7.5s total wait). This is an acceptable tradeoff for absolute security.

### Interaction with Stage 1 Retry Logic
Stage 1 introduced logic where `uploadWithFallback` will silently retry `POST /videos` if the backend sync fails during the upload phase. The new 3-second buffer in Stage 4 gives that Stage 1 background recovery extra time to succeed, significantly reducing the frequency of pure `sid`-only links. 

---

## 4. Remaining Risks

1. **Player `sid` Resolution**: If an early link only contains `&sid=...` (because the 3-second timeout was hit), the Player web app bears the full burden of resolving that session ID to a canonical video ID via the backend. If the backend fails to process the video entirely, that `sid` link will permanently dead-end.
2. **Storage Latency**: The 500ms storage poll relies on `chrome.storage.local`. In extremely stressed Chrome extensions, concurrent reads might queue up, though 500ms is a very safe buffer in modern Manifest V3.

---

## 5. Rollback Boundaries

The change made in `service-worker.ts` is 100% isolated. It does not touch:
* `uploadWithFallback`
* `syncBackend`
* `offscreen.ts` (upload execution)

Reverting this specific git hunk instantly restores the raw `fileId` fallback without breaking any other aspect of the recording pipeline.

---

## 6. Future Reviewer Notes (Claude Context)

*   **Do NOT Reintroduce `fileId`**: If debugging why early links occasionally lack an `id=` parameter, do NOT "fix" it by reintroducing the local Google Drive ID. 
*   **Instant-Link vs Canonical Identity**: ScreenVault prioritizes instant links, but the *identity* must always be canonical. The `sid`-only fallback is the intentional, architecturally correct mechanism to handle extreme latency while preserving the instant-link UX.
*   **Do NOT Increase Polling Duration**: Waiting longer than 3 seconds degrades the "Fast UX" philosophy. If 3 seconds is insufficient, the latency is a backend architecture problem, not an extension polling problem.

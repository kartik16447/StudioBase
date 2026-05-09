# Stage 6 — Token Ownership Hardening Report

## 1. Original Problems & Root Cause Analysis

### Silent Account Switching (Fallback Leaks)
The `offscreen.ts` uploader contained a loop that would iterate through all connected Google accounts if the primary one failed. While intended for high availability, this created a security and data integrity risk: a recording started under Account A could be silently uploaded to Account B's Google Drive if Account A's token expired or hit a quota limit mid-session.

### Recovery Ownership Drift
When recovering a session (e.g., after a browser crash), `recoverSessionHelper` would fall back to `accounts[0]` if the original recording account was not immediately found. This led to "ownership drift" where sessions were re-associated with the wrong identity during recovery.

### Indeterminate Recording Starts
`selectBestAccount` would sometimes pick an account that was already marked as `invalid` or whose token was expired. If a silent refresh failed, it would still return that account, leading to a recording start that would eventually fail during the upload phase, wasting user time.

---

## 2. Exact Code Changes

### `screenvault-extension/src/offscreen.ts`

#### Hard Account Pinning
Modified `uploadWithFallback` to remove the multi-account loop. The uploader now strictly adheres to the `targetAccount` provided at the start of the session.
*   **Before**: Looped through `sortedAccounts` until one succeeded, falling back to `accounts[0]`.
*   **After**: Pinned to the `isActive` account only. Any failure in that specific account now results in a loud error rather than a silent cross-account fallback.

#### Process Session Enforcement
Updated `processSession` to only pass the pinned account to the `uploadWithRetry` logic.

### `screenvault-extension/src/service-worker.ts`

#### Recovery Identity Lock
Modified `recoverSessionHelper` to remove the `accounts[0]` fallback.
*   **New Logic**: If `meta.accountId` is not found in the current account list, the recovery attempt is aborted, and the session status is set to `failed`. This prevents recordings from being "stolen" by other accounts during recovery.

#### Loud Selection Failures
Updated `selectBestAccount` to throw an explicit error if a chosen account is invalid and `trySilentRefresh` fails. This ensures that the UI surfaces a "Reconnection Required" error *before* the recording starts.

#### Deterministic Account Selection
Added a filter to `selectBestAccount` to prioritize non-invalid accounts when choosing the "best" storage target by quota.

---

## 3. Account Selection Lifecycle Impact

| Stage | Lifecycle (BEFORE) | Lifecycle (AFTER) | Security Impact |
|-----------|--------------------|-------------------|--------|
| **Start** | Picks best/active account | Picks best/active + validates token | Prevents "dead-on-arrival" recordings |
| **Upload** | Fallback to any account on failure | Fails session on pinned account error | Guarantees Drive ownership |
| **Recovery** | Fallback to `accounts[0]` | Fails session if original account missing | Guarantees original ownership |
| **Refresh** | Concurrent races possible | Deduplicated via `inFlightRefreshes` | Prevents token corruption |

---

## 4. Exact Git Diff Analysis

### `offscreen.ts` — Hard Pinning Hunk
```diff
-  const targetAccount = accounts.find(a => a.isActive) || accounts[0];
-  if (!targetAccount) {
-    throw new Error('No connected accounts. Please connect a Google Drive account.');
-  }
+  const targetAccount = accounts.find(a => a.isActive);
+  if (!targetAccount) throw new Error('No active account pinned to this session.');
```
*   **Change**: Removed the `accounts[0]` fallback and simplified the error handling.
*   **Rationale**: Ensures that a session started for Account A can NEVER land in Account B's Drive. It forces a loud failure which is safer than silent mis-attribution.

### `service-worker.ts` — Recovery Lock Hunk
```diff
-    const account =
-      accounts.find((a) => a.id === meta.accountId) ||
-      (accounts.length > 0 ? accounts[0] : null);
-    if (!account) throw new Error("No account available for upload");
+    const account = accounts.find((a) => a.id === meta.accountId);
+    if (!account) {
+      svLog("RECOVERY_ACCOUNT_MISSING", { sessionId, accountId: meta.accountId });
+      await saveSessionMetadata(sessionId, { status: "failed" });
+      throw new Error(`Account pinned to this session (${meta.accountId}) is no longer available.`);
+    }
```
*   **Change**: Removed fallback to first available account.
*   **Rationale**: Prevents accidental re-association of metadata during recovery.

---

## 5. Token Refresh & Race Handling

### Concurrent Refresh Deduplication
The implementation of `inFlightRefreshes` Map in `service-worker.ts` ensures that if multiple parts of the extension (e.g., the popup and multiple chunks in the offscreen uploader) trigger a refresh for the same account simultaneously, only one network request is made. All callers await the same promise, preventing the "stale-overwrites-fresh" storage race.

---

## 6. Interaction with Previous Stages

*   **Stage 1 Interaction**: Leverages `trySilentRefresh` and `getFreshToken` patterns established in Stage 1 but makes them stricter regarding account identity.
*   **Stage 4/5 Interaction**: Maintains compatibility with `sid`-only fallback links while ensuring the underlying Drive ownership is hardened.

---

## 7. Manual Verification Steps

1.  **Multi-Account Test**: Connect two Google accounts. Start a recording on Account A. While recording, manually invalidate Account A's token (e.g. by revoking it in Google Settings). Verify that the upload fails with an error rather than silently switching to Account B.
2.  **Recovery Test**: Start a recording, then force-close the extension. Remove the recording account from the extension settings. Re-open the extension. Verify that the recovery attempt logs a `RECOVERY_ACCOUNT_MISSING` error and marks the session as failed rather than uploading to a different account.
3.  **Refresh Test**: Trigger multiple `GET_TOKEN` calls in rapid succession for the same expired account. Verify in the network tab that only one `launchWebAuthFlow` or token request occurs.

---

## 8. Rollback Boundaries

*   **Rollback to Stage 5**: Reverting these changes would restore the opportunistic fallback behavior in `offscreen.ts`, which might be safer for "getting the video up no matter what" but less secure for multi-user/multi-account environments.

---

## 9. Future Reviewer Notes (Claude Context)

*   **Account ID Integrity**: The `accountId` is pinned to metadata at `startRecording`. Any logic that attempts to modify `accountId` after a session has started should be treated as a potential security risk.
*   **inFlightRefreshes**: This Map is volatile (memory-only in SW). This is correct as it only needs to dedup concurrent requests during a single SW lifecycle.

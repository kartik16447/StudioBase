# Admin Observability Improvements Report

## 1. Overview
This update introduces deep instrumentation across the backend and extension to monitor the stability and security behaviors established in Stages 1–8. These improvements are purely observational and do not alter the core recording or upload pipelines.

---

## 2. New Instrumentation (Logging)

| Tag | Location | Behavior Observed | Trigger |
|-----|----------|-------------------|---------|
| `KV_CACHE_HIT` | `index.ts` | Distributed Cache | Successfully retrieved user identity from Cloudflare KV. |
| `KV_CACHE_MISS` | `index.ts` | Distributed Cache | KV entry expired or missing; called Google API. |
| `SID_ONLY_LINK_GENERATED` | `service-worker.ts` | Stage 4 Hardening | `encryptedFileId` failed to resolve within 3s poll window. |
| `IDB_OPEN_FAILED` | `db.ts` | Stage 7 Stability | IndexedDB `open` request was rejected or timed out. |

*Note: All extension-side logging is fire-and-forget to ensure zero impact on user experience.*

---

## 3. New Admin Dashboard Metrics (GET /admin)

### Distributed Cache Health
*   **Metric**: `infrastructure.kvCache`
*   **Tracking**: Hit rate, raw hits, and raw misses over the last 24h.
*   **Interpretation**: Low hit rates (<80%) may indicate frequent token rotations or Worker isolate churn exceeding KV propagation.

### Identity & Pinning Integrity
*   **Metric**: `infrastructure.sidOnlyLinks`
*   **Interpretation**: High counts suggest the backend is slow to finalize metadata or the extension is forcing links too aggressively.
*   **Metric**: `infrastructure.accountPinningFailures`
*   **Interpretation**: Direct visibility into Stage 6 enforcement (failed recoveries due to missing original accounts).

### Infrastructure Stability
*   **Metric**: `infrastructure.idbErrors`
*   **Interpretation**: Surface-level visibility into Stage 7 connection reuse stability.
*   **Metric**: `upload.chunkFailures`
*   **Interpretation**: Monitors Stage 2 progressive upload reliability at the packet level.

### Processing Bottlenecks
*   **Metric**: `stuckVideos`
*   **Query**: Identifies videos in `processing` status for >10 minutes.
*   **Interpretation**: Helps identify failures in the finalization handshake or Drive API delays.

---

## 4. Reporting Window Changes
The primary health metrics for **Upload** and **Playback** have been shifted from a 7-day to a **30-day window**. This provides a more longitudinal view of system reliability and prevents short-term spikes from distorting the "Success Rate" averages.

---

## 5. Query Patterns & Implementation
All new metrics utilize the existing `debug_logs` and `videos` tables.
*   **Time-Series Filtering**: Uses `datetime(?, "unixepoch")` for SQLite-compatible timestamp filtering in the `debug_logs` table.
*   **Data Extraction**: Uses `json_extract(data, '$.error')` to aggregate error patterns from the semi-structured debug payloads.

---

## 6. Rollback Boundaries
*   **Instrumentation**: Remove `backendLog` and `svLog` calls from the respective functions.
*   **Queries**: Revert the `handleAdmin` function to the previous state. No DB schema migrations are required to undo these changes.

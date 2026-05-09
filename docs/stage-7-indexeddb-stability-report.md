# Stage 7 — IndexedDB Connection Reuse Report

## 1. Original Problems & Root Cause Analysis

### Connection Churn under Heavy Load
Prior to this stage, every IndexedDB operation (saving a chunk, retrieving chunks, deleting a session) followed a strict "open-operate-close" lifecycle. While safe for occasional use, this pattern created significant overhead during active recordings where `saveChunk` is called multiple times per second. 

### Database Lock Contention
The repeated opening and closing of connections increased the risk of `VersionError` or `AbortError` when multiple operations overlapped (e.g., a progressive upload reading chunks while the recorder was writing new ones).

### Resource Exhaustion
Frequent connection cycles in a long-running service worker can lead to browser-level resource leaks or "database connection is closing" errors if an operation attempts to start just as the previous connection's `oncomplete` hook is closing the database.

---

## 2. Exact Code Changes

### `screenvault-extension/src/db.ts`

#### Singleton Connection Management
Introduced a module-level `dbPromise` and a `getDB()` helper to ensure only one connection is opened per Service Worker lifecycle.

```typescript
let dbPromise: Promise<IDBDatabase> | null = null;

export function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = initDB();
  return dbPromise;
}
```

#### Operation Refactoring
All operations (`saveChunk`, `getChunks`, `deleteSession`, `getPendingSessions`) were updated to use `getDB()` instead of `initDB()`.

#### Removal of Explicit Closures
The `db.close()` calls within `transaction.oncomplete` hooks were removed. This allows the connection to remain warm and ready for the next operation, significantly reducing latency for progressive uploads.

---

## 3. Infrastructure Impact Analysis

| Operation | Before (Latency/Risk) | After (Latency/Risk) | Stability Impact |
|-----------|-----------------------|----------------------|------------------|
| **saveChunk** | High (Open/Close overhead) | Low (Reuses connection) | Prevents write-stalls during recording |
| **getChunks** | Medium (New connection) | Low (Shared connection) | Faster finalization and recovery |
| **Recovery** | Contention risk during sync | Deterministic concurrency | Safe overlap of read/write operations |

---

## 4. Exact Git Diff Analysis

### `db.ts` — Singleton Implementation
```diff
+let dbPromise: Promise<IDBDatabase> | null = null;
+
+export function getDB(): Promise<IDBDatabase> {
+  if (!dbPromise) dbPromise = initDB();
+  return dbPromise;
+}
```

### `db.ts` — Operation update (e.g., saveChunk)
```diff
-  const db = await initDB();
+  const db = await getDB();
...
-    transaction.oncomplete = () => db.close();
```

---

## 5. Rollback Boundaries

*   **Rollback to Stage 6**: Reverting these changes would return the system to the "safe but slow" per-operation connection model. There are no schema changes, making this infrastructure-only fix low risk and easy to undo.

---

## 6. Future Reviewer Notes (Claude Context)

*   **Connection Lifecycle**: The IndexedDB connection now stays open for the duration of the Service Worker's life. This is standard practice for extensions. Chrome will automatically close the connection if the Service Worker is terminated or the extension is disabled.
*   **Version Migrations**: Any future `DB_VERSION` updates will still work correctly via `initDB()` as it is called once through the singleton helper.

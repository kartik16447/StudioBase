# StudioBase Codebase Audit — Current State Report

---

## 1. Artifact & Data Model

### Does an artifact schema exist?

**Yes.** Defined in `backend/migrations/0002_enterprise_foundation.sql:26-34`.

```sql
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL REFERENCES sessions(id),
  type TEXT NOT NULL,         -- 'sop' | 'demo' | 'video' | 'interaction_map'
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,       -- 'draft' | 'published' | 'archived'
  metadata TEXT,              -- JSON blob
  createdAt INTEGER NOT NULL
);
```

There is no `workspaceId` on the `artifacts` table. Workspace scope is only inferrable by joining to `sessions`.

There is also an `exports` table (`migration 0002:37-47`):
```sql
CREATE TABLE IF NOT EXISTS exports (
  id TEXT PRIMARY KEY,
  artifactId TEXT NOT NULL REFERENCES artifacts(id),
  format TEXT NOT NULL,       -- 'mp4' | 'gif' | 'pdf' | 'html'
  status TEXT NOT NULL,       -- 'pending' | 'processing' | 'completed' | 'failed'
  startedAt INTEGER NOT NULL,
  completedAt INTEGER,
  errorReason TEXT,
  storageKey TEXT,            -- R2 key for the exported file
  createdAt INTEGER NOT NULL
);
```

### How are SOPs currently stored?

There is **no SOP-specific table**. SOPs are conceptually represented as sessions with `sessionType = 'steps'`. The SOP content (steps, AI-generated text, annotations) is stored as a JSON blob in R2, keyed by `sessions.r2JsonKey`. The in-memory type is `SessionEnvelope` (`shared/types/session.ts`).

### How are sessions currently stored?

`backend/migrations/0001_initial.sql:70-104`.

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL REFERENCES users(id),
  workspaceId TEXT NOT NULL REFERENCES workspaces(id),
  sessionType TEXT NOT NULL DEFAULT 'steps',   -- 'steps' | 'video'
  status TEXT NOT NULL DEFAULT 'uploading',    -- see status enum below
  title TEXT,
  capturedUrl TEXT,
  capturedTitle TEXT,
  durationMs INTEGER DEFAULT 0,
  stepCount INTEGER DEFAULT 0,
  r2JsonKey TEXT,       -- R2 key for the full JSON envelope
  r2VideoKey TEXT,      -- R2 key for raw .webm file
  storageBytes INTEGER DEFAULT 0,
  pipelinePath TEXT,    -- 'edge' | 'cloud' | null
  generatedOutputs TEXT, -- JSON: {"sop":true,"demo":true,"video":false}
  isPublic INTEGER NOT NULL DEFAULT 0,
  shareToken TEXT UNIQUE,
  deletedAt INTEGER,    -- soft delete
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
```

Added in `0002`: `metadata TEXT` column.

### Are steps stored as rows, JSON blobs, or something else?

**JSON blobs in R2.** Steps are **not** stored as DB rows. They live inside the `SessionEnvelope` JSON (`shared/types/session.ts:294`), uploaded to R2 under `sessions.r2JsonKey`. The D1 `sessions` table only stores scalar metadata and the R2 key.

### Is there any versioning on SOP or session records?

- `artifacts.version INTEGER DEFAULT 1` exists in the schema, but nothing in the application code currently increments it.
- `sessions` has no version column.
- `shared/types/session.ts` declares `SCHEMA_VERSION = "1.0"` and `SessionEnvelope.schemaVersion: string`, but no enforcement or migration logic exists for schema version bumps.

### Is there any relationship between sessions and SOPs in the schema?

No explicit FK. The relationship is: `artifacts.sessionId → sessions.id`. But since no SOP-specific table exists, there is no dedicated session↔SOP relationship beyond the `artifacts` table.

---

## 2. Rendering & Compositor

### Where is the compositor/rendering logic defined?

- `studio/src/modules/render-engine/CanvasRenderer.ts` — frame-level draw logic (background, camera, assets, overlays)
- `studio/src/modules/render-engine/CinematicMath.ts` — camera target math, spring calculations
- `studio/src/modules/render-engine/RenderConstants.ts` — numerical constants (dimensions, FPS, bitrate, springs)
- `studio/src/components/studio/canvases/VideoCanvas.tsx` — export orchestrator (`handleSOPVideoExport`)
- `studio/src/utils/WebMFrameExtractor.ts` — VideoDecoder-based frame extraction state machine
- `studio/src/utils/WebMIndexer.ts` — WebM binary parser / keyframe indexer
- `studio/src/workers/extractor.worker.ts` — off-thread worker bridge for frame extraction
- `studio/src/services/WorkerExtractor.ts` — main-thread bridge to the extractor worker

### Is the compositor behind an interface or abstract class?

No. `CanvasRenderer` is a concrete class with no interface. `handleSOPVideoExport` calls it directly via:
```ts
const renderer = new CanvasRenderer();
renderer.render(state);
```
There is no abstraction boundary between preview and export rendering at the `CanvasRenderer` level.

### What is the exact input shape the compositor accepts?

`RenderState` defined in `CanvasRenderer.ts:4-17`:
```ts
export interface RenderState {
  ctx: CanvasRenderingContext2D;
  dimensions: { width: number; height: number };
  masterFrame: ImageBitmap | HTMLImageElement | HTMLVideoElement | null;
  step: any;
  prevStep: any | null;
  progress: number; // 0 to 1
  theme: {
    primaryColor: string;
    logoUrl?: string;
    watermark?: string;
  };
  renderMode: 'hybrid' | 'slideshow';
}
```

`step` and `prevStep` are typed as `any`. The actual runtime shape is `Step` from `shared/types/session.ts`.

### Is preview rendering and export rendering calling the same compositor function?

**Partially.** Both ultimately call `CanvasRenderer.render(state)`. However:
- **Preview** rendering is in `VideoCanvas.tsx` component's `useEffect` loop (lines ~550-700), calling `CanvasRenderer.render()` directly within a `requestAnimationFrame` loop.
- **Export** rendering is in `handleSOPVideoExport()` (lines 17-950), which also calls `CanvasRenderer.render()` but drives it with a deterministic `for` loop at 60fps, drawing into a separate high-res canvas (2880×1444) rather than the preview canvas.

The `CanvasRenderer` class is the same object. The entry point and canvas context differ.

### Where does the export orchestrator live?

`studio/src/components/studio/canvases/VideoCanvas.tsx:17` — exported function `handleSOPVideoExport()`. Entry point:
```ts
export async function handleSOPVideoExport() {
  const store = useStudioStore.getState();
  ...
}
```

Called from `studio/src/components/studio/index.tsx` when the export button is triggered via `store.exportTrigger`.

### Is the render spec serializable?

**No.** `RenderState.ctx` is a live `CanvasRenderingContext2D` DOM reference. `RenderState.masterFrame` can be a live `HTMLVideoElement` or `ImageBitmap`. The spec carries DOM/GPU state and cannot be serialized to plain JSON.

---

## 3. Backend & API Layer

### All active Hono route files and domains

| File | Route Prefix | Domain |
|---|---|---|
| `routes/v1/auth.ts` | `POST /v1/auth/google` | Google token exchange → internal JWT |
| `routes/v1/workspaces.ts` | `GET/PATCH/POST/DELETE /v1/workspaces` | Workspace CRUD, invite, member management |
| `routes/v1/sessions.ts` | `GET/POST/PATCH/DELETE /v1/sessions` | Session lifecycle |
| `routes/v1/assets.ts` | `POST/PUT/GET /v1/assets` | R2 upload proxy, multipart, serve |
| `routes/v1/pipeline.ts` | `POST /v1/pipeline/trigger` | Queue job submission |
| `routes/v1/telemetry.ts` | `POST /v1/telemetry`, `POST /v1/telemetry/logs` | Event logging, debug logs |
| `routes/v1/usage.ts` | `GET /v1/usage/storage`, `GET /v1/usage/metrics` | Storage and workspace metrics |
| `routes/v1/admin.ts` | `GET /v1/admin/metrics` | Global admin metrics |

Additionally in `index.ts` directly:
- `GET /v1/maintenance/recovery` — inline handler (no separate route file)
- `GET /health` — inline handler

### Are all routes under `/v1`?

**No.** `GET /health` is at the root — not under `/v1`.

### Where is auth/session validation happening?

**Middleware applied per-route or per-router.** Not globally. Specifically:
- `sessions.ts:21` — `sessions.use('*', authMiddleware(), workspaceMiddleware())` — middleware applied to all session routes
- `usage.ts:9` — `usage.use('*', authMiddleware(), workspaceMiddleware())`
- `workspaces.ts:17,25,42` — `authMiddleware()` on `GET /`, `POST /join`; then `wsRoutes.use('*', authMiddleware(), workspaceMiddleware())` for all workspace-context routes
- `assets.ts:12,31,44,66,94` — `authMiddleware()` per route
- `pipeline.ts:11` — `authMiddleware(), workspaceMiddleware()` per route
- `telemetry.ts:9,26` — `authMiddleware()` per route
- `admin.ts:8` — `admin.use('*', authMiddleware(), ...)` — applied to all admin routes

`assets.get('/:key{.+}')` (line 111) has **no auth middleware**. Assets are publicly readable by anyone with the key.

### Where is workspace scoping enforced?

In `middlewares/workspace.ts` via `workspaceMiddleware()`. It:
1. Reads `workspaceId` from `c.req.query('workspaceId')` or `c.req.header('x-workspace-id')`
2. Queries `workspace_members` to validate membership
3. Injects `WorkspaceContext` via `c.set('workspace', wsContext)`

Applied at the router level (`sessions`, `usage`) or per-route (`pipeline`, some `workspaces` sub-routes). It is **not** applied to `assets`, `auth`, `telemetry`, or the inline `maintenance` route.

### Are there any routes that bypass Zod validation?

The following routes accept raw JSON from `c.req.json()` without Zod validation:
- `POST /v1/assets/presign` — `const { sessionId, files } = await c.req.json()`
- `POST /v1/assets/multipart/init` — `const { key } = await c.req.json()`
- `POST /v1/assets/multipart/complete` — `const { key, uploadId, parts } = await c.req.json()`
- `POST /v1/assets/refresh` — `const { keys } = await c.req.json()`
- `POST /v1/pipeline/trigger` — `const { sessionId, requestedOutputs } = await c.req.json()`
- `POST /v1/telemetry` — `const body = await c.req.json()`
- `POST /v1/telemetry/logs` — `const { tag, data, sessionId } = await c.req.json()`

---

## 4. Export Pipeline

### Full export flow from trigger to file output

1. **Browser UI** — user clicks export button → `store.triggerExport()` → increments `exportTrigger`
2. **`VideoCanvas.tsx`** — `useEffect` on `exportTrigger` → calls `handleSOPVideoExport()`
3. **`handleSOPVideoExport()`** (`VideoCanvas.tsx:17`):
   - Health check (memory, `VideoDecoder` presence, asset HEAD request)
   - Creates 2880×1444 canvas, attaches to DOM
   - Calls `canvas.captureStream(60)` for `MediaRecorder`
   - Initializes `WorkerExtractor` (spawns `extractor.worker.ts`)
   - Worker spawns `WebMFrameExtractor` with `WebMIndexer`
   - For each step: requests frame via `extractor.getFrame(timestampMs)` → worker returns `ImageBitmap`
   - `CanvasRenderer.render(state)` draws each frame
   - `MediaRecorder` captures canvas stream → accumulates `Blob` chunks
   - On completion: `MediaRecorder.stop()` → `ondataavailable` fires → assembles final `Blob`
4. **File output**: `URL.createObjectURL(blob)` → programmatic `<a download>` click — **saved to user's local disk**. There is **no write to R2 from the browser export**. 

### Where does the export job get enqueued?

For the **backend pipeline** (AI generation, not browser export): `PipelineService.trigger()` (`services/PipelineService.ts:46`):
```ts
await this.env.PIPELINE_QUEUE.send(job);
```
Where `job: PipelineJob = { sessionId, userId, r2JsonKey, requestedOutputs }`.

This is called from `POST /v1/pipeline/trigger`.

### Where does it get picked up?

`handlers/queue.ts:4-18`. `handleQueue` iterates `batch.messages`, calls `processor.process(message.body)` on each.

### What happens on export failure?

**Backend pipeline**: `PipelineProcessor.process()` catches errors, sets `sessions.status = 'failed'`, records `pipeline.failed` audit event, then re-`throw`s. The queue handler calls `message.retry()` on throw. Cloudflare Queue will retry based on its configured retry policy (no explicit max retry count in code; defer to Cloudflare defaults).

**Browser export**: `handleSOPVideoExport()` catches errors in the health check phase and sets `store.exportStatus('failed')` + `store.exportError(msg)`. During the frame loop, individual frame failures are counted in `failedFrames` and logged, but do not abort the export. If `MediaRecorder` or `captureStream` fails, there is no explicit recovery — the export stalls silently.

### Is the export result written to R2?

**Browser export**: No. The assembled `Blob` is downloaded directly to the user's disk via `URL.createObjectURL`.

**Backend pipeline**: `PipelineProcessor.process()` currently contains a placeholder comment (`// Placeholder for AI / Export logic (Phase 3)`). It **does not** write any file to R2. It only sets `sessions.status = 'ready'`.

---

## 5. Queue & Scheduled Jobs

### Active Queues

| Queue | Handler | What it processes |
|---|---|---|
| `studiobase-pipeline` (env binding: `PIPELINE_QUEUE`) | `handlers/queue.ts` → `PipelineProcessor.process()` | Pipeline jobs (`PipelineJob`: `{sessionId, userId, r2JsonKey, requestedOutputs}`) |

### Scheduled Tasks

| Cron | Handler | What it does |
|---|---|---|
| `0 0 * * *` (daily midnight) | `handlers/scheduled.ts` → `handleScheduled()` | 1. Deletes `debug_logs` older than 14 days. 2. Deletes expired and non-revoked `invites`. |

Defined in `wrangler.toml` as `schedule: 0 0 * * *` (confirmed in deployment output).

### Are queue and scheduled handlers isolated?

**Yes.** `handlers/queue.ts` and `handlers/scheduled.ts` are separate files. Both are imported in `index.ts` and passed to `Sentry.withSentry()`.

---

## 6. Auth & RBAC

### Auth provider currently integrated

**Google OAuth** only. Two paths:
1. **Modern path**: `POST /v1/auth/google` → `AuthService.verifyGoogleToken()` → Google userinfo API → `AuthService.signToken()` → HS256 JWT signed with `ENCRYPTION_KEY`
2. **Legacy fallback in middleware**: `authMiddleware()` falls back to calling Google's userinfo API directly if JWT verification fails

No SAML, OIDC, or any other federation. Zero references to SAML/OIDC in the codebase.

### SAML/OIDC implementation status

**Not implemented. Not stubbed.** Zero occurrences of "SAML", "OIDC", "SSO", "federation" in any `.ts`/`.tsx` file.

### RBAC roles

Defined in `middlewares/workspace.ts:6-13`:
```ts
export type WorkspaceRole = 'Owner' | 'Admin' | 'Member' | 'Viewer';

export const RoleLevels: Record<WorkspaceRole, number> = {
  'Owner': 4,
  'Admin': 3,
  'Member': 2,
  'Viewer': 1
};
```

**Note**: `workspace_members.role` in migration `0001` defaults to `'member'` (lowercase). Migration `0002` normalizes existing rows to `'Owner'`/`'Member'`. New rows written by `AuthService` use `'Owner'` (capitalized).

### Role enforcement location

- `requireRole(minRole)` middleware in `workspace.ts:79-90` — applied at **route level** in route files
- `requireExactRoles(allowedRoles)` middleware — defined but **not used** anywhere currently
- No role enforcement inside service methods themselves (services trust caller)
- `admin.ts:9-11` — email-based admin check (not role-based): `if (user.email !== c.env.ADMIN_EMAIL) throw 403`

Role checks are **route-level only**, not service-level.

### Is there workspace-level role differentiation or global?

**Workspace-level.** Roles are stored in `workspace_members(userId, workspaceId, role)` and resolved per-request by `workspaceMiddleware()` checking membership for the specific requested `workspaceId`.

---

## 7. Telemetry & Audit Logs

### Events currently logged to the audit log (AuditService.record)

Called from services with these `eventName` values:

| eventName | Source |
|---|---|
| `session.created` | `SessionService.create()` |
| `export.started` | `PipelineService.trigger()` |
| `pipeline.started` | `PipelineProcessor.process()` |
| `pipeline.completed` | `PipelineProcessor.process()` |
| `pipeline.failed` | `PipelineProcessor.process()` |
| `workspace.updated` | `WorkspaceService.update()` |
| `workspace.invite` | `WorkspaceService.createInvite()` |
| `workspace.member_joined` | `WorkspaceService.join()` |
| `workspace.member_removed` | `WorkspaceService.removeMember()` |
| `workspace.invite_revoked` | `WorkspaceService.revokeInvite()` |
| `asset.upload_completed` | `assets.ts` (multipart complete handler) |
| `user.login` | `AuthService.resolveUser()` |

Via `recordEvent()` (from `telemetry/events.ts`, takes Hono context):
| eventName | Source |
|---|---|
| `workspace.context_missing` | `workspaceMiddleware()` |
| `workspace.access_denied` | `workspaceMiddleware()` |

Via `AuditService` (no D1 write — writes to Cloudflare Analytics Engine only):
| eventName | Source |
|---|---|
| (all above `AuditService` events) | Written to `ANALYTICS` binding only, **not D1** |

**Critical distinction**: `AuditService.record()` writes to **Cloudflare Analytics Engine** only (via `writeDataPoint`). It does **not** write to the D1 `audit_logs` table.

`recordAuditLog()` in `telemetry/audit.ts` writes to D1 `audit_logs`, but it is currently **not called from any route or service**. It exists as dead code.

`recordEvent()` in `telemetry/events.ts` writes to **both** D1 `analytics_events` table and Cloudflare Analytics Engine.

### Is the audit log append-only or mutable?

D1 `audit_logs` table — INSERT only in `recordAuditLog()`. No UPDATE or DELETE calls anywhere. Effectively append-only by convention.

D1 `analytics_events` table — INSERT only in `recordEvent()`. Append-only.

### Where is telemetry being sent?

Two sinks:
1. **D1 `analytics_events` table** — via `recordEvent()` only
2. **Cloudflare Analytics Engine** (`env.ANALYTICS.writeDataPoint()`) — via both `AuditService.record()` and `recordEvent()`

### Are audit logs tied to workspace + user + timestamp on every entry?

**D1 `analytics_events`**: `userId`, `workspaceId`, `sessionId`, `timestamp` — all nullable. `userId` populated from `c.get('user')?.id` if not explicitly passed.

**D1 `audit_logs`**: `actorId NOT NULL`, `workspaceId` nullable, `timestamp NOT NULL`. But `recordAuditLog()` is never called.

**Cloudflare Analytics Engine** (AuditService): `workspaceId` goes to `indexes[0]`, `userId`/`sessionId`/`eventName` go to `blobs`. No D1 timestamp — timestamp implicit in CF AE.

---

## 8. Migrations

### How many migrations exist?

**3 migration files** in `backend/migrations/`:

| File | Contents |
|---|---|
| `0001_initial.sql` | Creates: `users`, `linked_accounts`, `workspaces`, `workspace_members`, `invites`, `sessions`, `credits_ledger`, `usage_stats`, `metrics_events`, `debug_logs` |
| `0002_enterprise_foundation.sql` | ALTERs `users`, `workspaces`, `workspace_members`, `sessions`; Creates: `artifacts`, `exports`, `audit_logs`, `analytics_events` |
| `0003_migration_governance.sql` | Creates `schema_migrations` table; seeds rows for 0001 and 0002 |

### Is there a migration runner?

**No automatic runner.** Migrations are applied manually via `wrangler d1 migrations apply`. The `schema_migrations` table (added in 0003) is a governance record — it is not used to drive migration execution.

### Are migrations versioned and sequential?

**Yes** — by filename convention: `0001_`, `0002_`, `0003_`. No out-of-order gaps.

### Any unmigrated schema changes sitting in code but not in a migration file?

**Yes — two discrepancies:**

1. `users` table in `0001_initial.sql` has column `picture TEXT`. Code in `AuthService.ts` and `auth.ts` middleware inserts into `avatarUrl` column. Migration `0002` adds `avatarUrl` via `ALTER TABLE users ADD COLUMN avatarUrl TEXT`, so it exists — but the original `picture` column remains unused by application code.

2. `sessions` — `UpdateSessionSchema` in `schemas/sessions.ts` includes `pipelinePath` field (`edge | cloud`). The `pipelinePath` column exists in `0001`. No issue here.

3. `workspace_members.invitedBy` — added in `0002`, but `WorkspaceService.createInvite()` does not populate this column. It remains `NULL` for all new invites.

---

## 9. Frontend / Rendering Client

### Where does the browser-side compositor live?

`studio/src/modules/render-engine/CanvasRenderer.ts`

### Entry point for preview rendering

`studio/src/components/studio/canvases/VideoCanvas.tsx` — `VideoCanvas` React component, specifically the `useEffect` that watches `currentStepIndex`, `isPlaying`, `session`. Inside this effect, `renderer.render(state)` is called within a `requestAnimationFrame` loop.

### Entry point for export rendering

`studio/src/components/studio/canvases/VideoCanvas.tsx:17` — exported async function `handleSOPVideoExport()`. Called from `studio/src/components/studio/index.tsx` via a `useEffect` on `store.exportTrigger`.

### Do they share rendering primitives?

**Yes.** Both preview and export use:
- `CanvasRenderer` (same class, same `render()` method)
- `CinematicMath.getTarget()` for camera targets
- `RenderConstants` for dimensions/constants

**Different**: Export uses `WorkerExtractor` → `WebMFrameExtractor` for deterministic frame extraction. Preview uses `HTMLVideoElement.currentTime` directly with `requestVideoFrameCallback` (or `requestAnimationFrame`). Export renders to a 2880×1444 canvas; preview renders to whatever the CSS-sized canvas element is.

### Is WebCodecs usage isolated to one module or spread?

**Spread across multiple files:**
- `studio/src/utils/WebMFrameExtractor.ts` — primary location: `VideoDecoder`, `EncodedVideoChunk`, `VideoFrame`, `VideoDecoderConfig`
- `studio/src/utils/WebMIndexer.ts:261` — `VideoDecoder.isConfigSupported()`
- `studio/src/workers/extractor.worker.ts:34,36` — `VideoFrame.close()`, `createImageBitmap(frame)`
- `studio/src/components/studio/canvases/VideoCanvas.tsx:56,262,275,276,505` — `VideoDecoder` presence check; `latestVideoFrame` lifecycle management (from `MediaStreamTrackProcessor`)

---

## 10. Open Loose Ends

### TODO / FIXME / HACK comments

| File | Line | Comment |
|---|---|---|
| `studio/src/components/studio/canvases/VideoCanvas.tsx` | 257 | `// --- WEBCODECS / TRACK PROCESSOR HACK ---` |

No `TODO`, `FIXME`, or `TEMP` comments found in any `.ts`/`.tsx` file across `backend/src` or `studio/src`.

### Stubbed or empty function bodies called from live code

| File | Function | Called From | State |
|---|---|---|---|
| `studio/src/modules/render-engine/CanvasRenderer.ts:175` | `drawAnnotation(_ctx, _anno, _progress)` | `drawOverlays()` (line 167) — called every rendered frame | Empty body. Comment: `// Placeholder for future phases` |
| `backend/src/services/pipeline/PipelineProcessor.ts:37-41` | `process()` — AI/Export logic block | `handleQueue()` on every queue message | Comment: `// Placeholder for AI / Export logic (Phase 3)`. Sets status to `ready` immediately with no actual work. |
| `backend/src/telemetry/audit.ts` — `recordAuditLog()` | Not called from anywhere | Dead code — exists but has zero callers |

### Feature flags / env vars gating incomplete features

**`shared/constants/index.ts`**:
```ts
export const DEV_MODE = false;
```
When `DEV_MODE = true`, `BACKEND_URL` points to `localhost:8787`. This is a hardcoded boolean — not a runtime env var. It must be changed in source to toggle.

**`backend/src/middlewares/auth.ts`**:
- `isDev` check (`c.env.ENVIRONMENT === 'development'`) gates:
  - Auto-provisioning of users (lines 76-99)
  - Relaxed dev bypass for invalid Google tokens (lines 52-61) with hardcoded user ID `'user_5329d8a0'` and email `'karthik.upadhyay98@gmail.com'`

**`backend/src/types/hono.ts`**:
- `SENTRY_DSN?: string` — optional, Sentry not initialized if absent

**No env-var-gated feature flags** exist for any incomplete feature beyond the above dev bypass.

---

## Summary Table — What Exists vs What Doesn't

| Capability | Status |
|---|---|
| Artifact schema (D1) | ✅ Exists — `artifacts`, `exports` tables |
| SOP-specific table | ❌ Does not exist — SOPs are sessions stored in R2 JSON |
| Step rows in D1 | ❌ Steps are JSON in R2 only |
| Session versioning | ❌ No version column on sessions |
| Artifact versioning | ⚠️ Column exists, never incremented |
| `recordAuditLog()` caller | ❌ Dead code — never called |
| SAML/OIDC | ❌ Not present |
| Pipeline AI processing | ❌ Stubbed — `PipelineProcessor.process()` is a placeholder |
| Annotation rendering | ❌ Stubbed — `drawAnnotation()` is empty |
| Export written to R2 | ❌ Browser export saves to local disk only |
| Migration runner | ❌ Manual `wrangler d1 migrations apply` only |
| `workspace_members.invitedBy` populated | ❌ Added in schema, never written |

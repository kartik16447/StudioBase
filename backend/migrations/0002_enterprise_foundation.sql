-- ============================================================
-- Phase 1: Governance & Enterprise Foundation
-- ============================================================

-- 1. Users Hardening
ALTER TABLE users ADD COLUMN avatarUrl TEXT;
ALTER TABLE users ADD COLUMN lastLogin INTEGER;
-- Sync existing data
UPDATE users SET avatarUrl = picture, lastLogin = lastLoginAt;

-- 2. Workspaces Hardening
ALTER TABLE workspaces ADD COLUMN planType TEXT DEFAULT 'free'; -- 'free' | 'pro' | 'enterprise'

-- 3. Workspace Members Hardening
ALTER TABLE workspace_members ADD COLUMN invitedBy TEXT;
-- Update roles to standard set: 'Owner', 'Admin', 'Member', 'Viewer'
UPDATE workspace_members SET role = 'Owner' WHERE role = 'owner';
UPDATE workspace_members SET role = 'Member' WHERE role = 'member';

-- 4. Sessions Hardening (createdBy already exists as ownerId, but let's align names in Phase 3 or just use ownerId for now to avoid breaking existing code)
-- For now, we'll keep ownerId to avoid massive refactor of existing functions, but we'll map it to createdBy in our Zod/Hono layer.
-- We'll add metadata column if not present (generatedOutputs can be considered part of metadata)
ALTER TABLE sessions ADD COLUMN metadata TEXT; -- JSON blob for extensibility

-- 5. Artifact System (Phase 3 Foundation)
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL REFERENCES sessions(id),
  type TEXT NOT NULL,         -- 'sop' | 'demo' | 'video' | 'interaction_map'
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,       -- 'draft' | 'published' | 'archived'
  metadata TEXT,              -- JSON blob
  createdAt INTEGER NOT NULL
);

-- 6. Exports Tracking
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

-- 7. Audit Logs (Enterprise Compliance)
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actorId TEXT NOT NULL REFERENCES users(id),
  workspaceId TEXT REFERENCES workspaces(id),
  action TEXT NOT NULL,       -- 'session.create', 'workspace.invite', 'member.remove', etc.
  targetId TEXT,              -- ID of the object being acted upon
  metadata TEXT,              -- JSON context
  timestamp INTEGER NOT NULL
);

-- 8. Analytics Events (Telemetry)
CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  eventName TEXT NOT NULL,
  userId TEXT,
  workspaceId TEXT,
  sessionId TEXT,
  platform TEXT,              -- 'web' | 'extension' | 'mobile'
  clientVersion TEXT,
  properties TEXT,            -- JSON blob
  timestamp INTEGER NOT NULL
);

-- ============================================================
-- Indexing Strategy
-- ============================================================

-- Why: Fast lookups for workspace-scoped data
CREATE INDEX IF NOT EXISTS idx_sessions_workspaceId_v2 ON sessions(workspaceId);
CREATE INDEX IF NOT EXISTS idx_artifacts_sessionId ON artifacts(sessionId);
CREATE INDEX IF NOT EXISTS idx_exports_artifactId ON exports(artifactId);
CREATE INDEX IF NOT EXISTS idx_audit_logs_workspaceId ON audit_logs(workspaceId);
CREATE INDEX IF NOT EXISTS idx_analytics_events_workspaceId ON analytics_events(workspaceId);

-- Why: Performance for user-centric dashboards and history
CREATE INDEX IF NOT EXISTS idx_audit_logs_actorId ON audit_logs(actorId);
CREATE INDEX IF NOT EXISTS idx_analytics_events_userId ON analytics_events(userId);

-- Why: Efficient event analysis
CREATE INDEX IF NOT EXISTS idx_analytics_events_eventName ON analytics_events(eventName);

-- Why: Chronological sorting for logs and feeds
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_events_timestamp ON analytics_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_artifacts_createdAt ON artifacts(createdAt);
CREATE INDEX IF NOT EXISTS idx_exports_createdAt ON exports(createdAt);

-- ============================================================
-- Migration 0005: Blob-to-Row Data Model Foundation
-- ============================================================

-- 1. Create SOPs table
CREATE TABLE IF NOT EXISTS sops (
  id TEXT PRIMARY KEY,
  workspaceId TEXT NOT NULL REFERENCES workspaces(id),
  sessionId TEXT NOT NULL REFERENCES sessions(id),
  title TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  schemaVersion TEXT NOT NULL DEFAULT '1.0',
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

-- 2. Create Steps table
CREATE TABLE IF NOT EXISTS steps (
  id TEXT PRIMARY KEY,
  sopId TEXT NOT NULL REFERENCES sops(id),
  workspaceId TEXT NOT NULL REFERENCES workspaces(id),
  stepIndex INTEGER NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL, -- JSONB payload
  version INTEGER NOT NULL DEFAULT 1,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

-- 3. Add workspaceId to artifacts table via temporary table rebuild
CREATE TABLE IF NOT EXISTS artifacts_new (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL REFERENCES sessions(id),
  workspaceId TEXT NOT NULL REFERENCES workspaces(id),
  type TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  metadata TEXT,
  createdAt INTEGER NOT NULL
);

-- Note: In a live database, we'd ensure artifacts actually have valid sessions
INSERT INTO artifacts_new (id, sessionId, workspaceId, type, version, status, metadata, createdAt)
SELECT 
  a.id, 
  a.sessionId, 
  s.workspaceId, 
  a.type, 
  a.version, 
  a.status, 
  a.metadata, 
  a.createdAt
FROM artifacts a
JOIN sessions s ON a.sessionId = s.id;

DROP TABLE artifacts;
ALTER TABLE artifacts_new RENAME TO artifacts;

-- 4. Create Performance Indexes
CREATE INDEX IF NOT EXISTS idx_sops_workspaceId ON sops(workspaceId);
CREATE INDEX IF NOT EXISTS idx_steps_workspaceId ON steps(workspaceId);
CREATE INDEX IF NOT EXISTS idx_steps_sopId ON steps(sopId);
CREATE INDEX IF NOT EXISTS idx_artifacts_workspaceId ON artifacts(workspaceId);

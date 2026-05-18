-- ============================================================
-- Migration 0010: Billing Primitives & Plan Gating
-- ============================================================

CREATE TABLE IF NOT EXISTS workspace_plans (
  workspaceId   TEXT    PRIMARY KEY REFERENCES workspaces(id),
  plan          TEXT    NOT NULL DEFAULT 'free',   -- 'free' | 'pro' | 'enterprise'
  seatLimit     INTEGER NOT NULL DEFAULT 3,
  exportLimit   INTEGER NOT NULL DEFAULT 10,        -- per calendar month
  retentionDays INTEGER NOT NULL DEFAULT 90,
  validUntil    INTEGER,                            -- NULL = perpetual
  updatedAt     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS export_usage (
  id          TEXT    PRIMARY KEY,
  workspaceId TEXT    NOT NULL REFERENCES workspaces(id),
  userId      TEXT    NOT NULL,
  month       TEXT    NOT NULL,                     -- 'YYYY-MM'
  count       INTEGER NOT NULL DEFAULT 0,
  UNIQUE(workspaceId, month)
);

CREATE INDEX IF NOT EXISTS idx_export_usage_workspace ON export_usage(workspaceId, month);

-- Seed free plan for every existing workspace
INSERT OR IGNORE INTO workspace_plans (workspaceId, plan, seatLimit, exportLimit, retentionDays, updatedAt)
SELECT id, 'free', 3, 10, 90, strftime('%s','now') * 1000
FROM workspaces;

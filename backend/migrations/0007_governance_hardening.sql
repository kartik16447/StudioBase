-- Migration 0007: Governance Hardening

CREATE TABLE IF NOT EXISTS workspace_settings (
  workspaceId TEXT PRIMARY KEY,
  ssoEnabled INTEGER DEFAULT 0,
  ssoProvider TEXT,
  samlConfig TEXT,
  allowedDomains TEXT,
  dataRegion TEXT DEFAULT 'global',
  retentionDays INTEGER DEFAULT 90,
  updatedAt INTEGER,
  FOREIGN KEY(workspaceId) REFERENCES workspaces(id)
);

-- Migration: 0010_cleanup_invites.sql
-- Description: Makes inviteKey nullable and clears old test data.

-- SQLite doesn't support ALTER COLUMN to make it NULL.
-- We have to create a new table and migrate or just drop and recreate since it's test data.
-- The user said "existing rows can be discarded/reset".

DROP TABLE IF EXISTS invites;

CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  workspaceId TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  inviteKey TEXT, -- Legacy column, now nullable
  role TEXT DEFAULT 'member',
  createdAt INTEGER NOT NULL,
  expiresAt INTEGER,
  revokedAt INTEGER
);

CREATE INDEX idx_invites_token ON invites(token);
CREATE INDEX idx_invites_workspace ON invites(workspaceId);

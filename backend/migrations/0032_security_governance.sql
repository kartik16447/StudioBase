-- Phase 3: Session TTL + MFA enforcement
ALTER TABLE workspace_settings ADD COLUMN sessionTtlHours INTEGER;
ALTER TABLE workspace_settings ADD COLUMN mfaRequired INTEGER NOT NULL DEFAULT 0;

-- Store per-user TOTP secrets (one active secret per user per workspace)
CREATE TABLE IF NOT EXISTS user_mfa_secrets (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  workspaceId TEXT NOT NULL,
  secret TEXT NOT NULL,              -- base32-encoded TOTP secret
  backupCodes TEXT,                  -- JSON array of bcrypt-hashed backup codes
  verifiedAt INTEGER,                -- null = setup started but not yet confirmed
  createdAt INTEGER NOT NULL,
  UNIQUE(userId, workspaceId)
);

CREATE INDEX IF NOT EXISTS idx_user_mfa_userId ON user_mfa_secrets(userId);

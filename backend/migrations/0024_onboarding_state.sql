-- Migration: onboarding_state table
CREATE TABLE IF NOT EXISTS onboarding_state (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  workspaceId TEXT NOT NULL,
  onboardingType TEXT NOT NULL DEFAULT 'creator', -- 'creator' | 'member'
  completedFirstRecording INTEGER NOT NULL DEFAULT 0,
  skippedOnboarding INTEGER NOT NULL DEFAULT 0,
  seededSessionId TEXT,
  createdAt INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_user_workspace ON onboarding_state (userId, workspaceId);

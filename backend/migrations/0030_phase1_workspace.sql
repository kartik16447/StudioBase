-- Phase 1: workspace quick wins
-- 1. revokedBefore: used by revoke-all-sessions to invalidate all JWTs older than this timestamp
-- 2. email on invites: used by bulk invite to track which address each token was sent to

ALTER TABLE workspace_settings ADD COLUMN revokedBefore INTEGER;
ALTER TABLE invites ADD COLUMN email TEXT;

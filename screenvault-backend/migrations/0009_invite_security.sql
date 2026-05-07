-- Migration: 0009_invite_security.sql
-- Description: Hardens workspace invites with tokens, expiry, revocation, and roles.

ALTER TABLE invites ADD COLUMN expiresAt INTEGER;
ALTER TABLE invites ADD COLUMN revokedAt INTEGER;
ALTER TABLE invites ADD COLUMN role TEXT DEFAULT 'member';

-- We will use inviteKey as the token for now to avoid breaking existing invites, 
-- but we'll add a 'token' column if explicitly requested.
-- The user said "ADD: token TEXT UNIQUE". 
-- Since inviteKey is already UNIQUE, I will add 'token' and migrate if needed, 
-- or just rename. D1 doesn't support RENAME COLUMN easily.
-- I will add the 'token' column as requested.

ALTER TABLE invites ADD COLUMN token TEXT;
CREATE UNIQUE INDEX idx_invites_token ON invites(token);

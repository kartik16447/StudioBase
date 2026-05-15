-- ============================================================
-- Migration 0004: Clean Up Ghost Columns & Schema
-- ============================================================

-- 1. Drop 'picture' column from 'users' table
-- Cloudflare D1 (SQLite 3.35+) supports native DROP COLUMN.
ALTER TABLE users DROP COLUMN picture;

-- 2. Add invitedBy to invites table so it can be passed to workspace_members
ALTER TABLE invites ADD COLUMN invitedBy TEXT;

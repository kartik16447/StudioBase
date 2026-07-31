-- Migration: 0018_add_users_migrated_column.sql
-- Description: Adds the `migrated` column on `users` that handleGoogleAuth's
-- one-time legacy ownerId-fixup relies on. This column existed on the
-- original production database via an untracked manual ALTER TABLE and was
-- never captured as a migration file until now — a fresh database built
-- only from schema.sql + migrations 0001-0017 was missing it entirely.
--
-- DEFAULT 1 (not 0): a brand-new database has no legacy rows where
-- workspaces.ownerId/videos.ownerId reference a Google sub instead of the
-- internal userId, so new users should never enter that migration branch.

ALTER TABLE users ADD COLUMN migrated INTEGER DEFAULT 1;

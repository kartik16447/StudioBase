-- Migration: 0013_add_authoritative_duration.sql
-- Description: Adds authoritative duration tracking to the videos table.

ALTER TABLE videos ADD COLUMN actualDurationMs INTEGER;
ALTER TABLE videos ADD COLUMN sessionId TEXT;

CREATE INDEX IF NOT EXISTS idx_videos_sessionId ON videos(sessionId);

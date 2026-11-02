-- Migration: 0020_add_short_id.sql
-- Description: Adds a short random slug per video so player links can be short
-- (e.g. /watch/?id=aB3xK9pQ) instead of embedding the full encrypted fileId.
-- Existing links using the encrypted fileId keep working — this is additive.

ALTER TABLE videos ADD COLUMN shortId TEXT;

CREATE UNIQUE INDEX idx_videos_shortId ON videos(shortId);

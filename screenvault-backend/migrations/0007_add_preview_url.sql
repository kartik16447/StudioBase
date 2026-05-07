-- Migration number: 0007 	 2026-05-05T14:20:05.046Z
-- Safe migration (idempotent)
ALTER TABLE videos ADD COLUMN previewUrl TEXT;

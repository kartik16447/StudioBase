-- Migration: 0014_storage_limit.sql
-- Description: Adds per-user storage tracking for the 500MB free-tier limit.

ALTER TABLE videos ADD COLUMN fileSizeBytes INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN storageUsedBytes INTEGER DEFAULT 0;

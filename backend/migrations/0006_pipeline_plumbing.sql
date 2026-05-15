-- ============================================================
-- Migration 0006: Pipeline & Export Plumbing
-- ============================================================

-- Add r2ExportKey to sessions to store the canonical video/SOP export
ALTER TABLE sessions ADD COLUMN r2ExportKey TEXT;

-- Add errorReason to sessions to store terminal export failure reasons
ALTER TABLE sessions ADD COLUMN errorReason TEXT;

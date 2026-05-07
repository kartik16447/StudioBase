-- Migration: 0012_telemetry_hardening.sql
-- Description: Hardens telemetry with sessionId and optimized indexes.

-- 1. Add sessionId to metrics_events
ALTER TABLE metrics_events ADD COLUMN sessionId TEXT;

-- 2. Add indexes for high-frequency queries
CREATE INDEX IF NOT EXISTS idx_metrics_events_type ON metrics_events(type);
CREATE INDEX IF NOT EXISTS idx_metrics_events_sessionId ON metrics_events(sessionId);
CREATE INDEX IF NOT EXISTS idx_metrics_events_createdAt ON metrics_events(createdAt);

-- 3. Add generated indexes for common metadata fields (if supported by D1/SQLite version)
-- D1 uses SQLite. Recent versions support -> and ->> operators.
-- For now, we will stick to basic indexes to ensure compatibility, 
-- but we can use json_extract in queries.

-- 4. Add sessionId to debug_logs for better trace linkage
ALTER TABLE debug_logs ADD COLUMN sessionId TEXT;
CREATE INDEX IF NOT EXISTS idx_debug_logs_sessionId ON debug_logs(sessionId);
CREATE INDEX IF NOT EXISTS idx_debug_logs_timestamp ON debug_logs(timestamp);

-- 5. Add expression indexes for common metadata fields in metrics_events
-- These help with filtering by error or title without full table scans.
CREATE INDEX IF NOT EXISTS idx_metrics_metadata_error ON metrics_events(json_extract(metadata, '$.error')) WHERE json_extract(metadata, '$.error') IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_metrics_metadata_title ON metrics_events(json_extract(metadata, '$.title')) WHERE json_extract(metadata, '$.title') IS NOT NULL;

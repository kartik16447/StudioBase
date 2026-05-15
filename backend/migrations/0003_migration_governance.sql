-- ============================================================
-- Migration Governance Tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  executedAt INTEGER NOT NULL
);

-- Seed initial migrations if table was just created
-- We assume 0001 and 0002 were already applied manually before this governance was added
INSERT OR IGNORE INTO schema_migrations (name, checksum, executedAt) VALUES ('0001_initial.sql', 'initial', 1715760000000);
INSERT OR IGNORE INTO schema_migrations (name, checksum, executedAt) VALUES ('0002_enterprise_foundation.sql', 'foundation', 1715760000000);

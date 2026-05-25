-- Migration 0017: Add sourceSopId to documents for SOP → Doc bridge
ALTER TABLE documents ADD COLUMN sourceSopId TEXT;
CREATE INDEX IF NOT EXISTS idx_documents_source_sop ON documents(sourceSopId) WHERE sourceSopId IS NOT NULL;

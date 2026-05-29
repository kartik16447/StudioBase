-- Add isTemplate flag to documents table
ALTER TABLE documents ADD COLUMN isTemplate INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_documents_is_template ON documents(workspaceId, isTemplate) WHERE isTemplate = 1;

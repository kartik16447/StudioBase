-- Add shareToken to documents for public read-only sharing
ALTER TABLE documents ADD COLUMN shareToken TEXT;
CREATE UNIQUE INDEX idx_documents_share_token ON documents(shareToken) WHERE shareToken IS NOT NULL;

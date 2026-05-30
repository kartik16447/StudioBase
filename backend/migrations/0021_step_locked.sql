-- Add locked flag to steps so pipeline can skip manually-edited steps
ALTER TABLE steps ADD COLUMN locked INTEGER DEFAULT 0;

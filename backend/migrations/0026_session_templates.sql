-- Session template gallery
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  workspaceId TEXT,
  createdBy TEXT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  isGlobal INTEGER NOT NULL DEFAULT 0,
  isFeatured INTEGER NOT NULL DEFAULT 0,
  usageCount INTEGER NOT NULL DEFAULT 0,
  thumbnailUrl TEXT,
  sessionJsonKey TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_templates_global ON templates(isGlobal, isFeatured, usageCount);
CREATE INDEX IF NOT EXISTS idx_templates_workspace ON templates(workspaceId, isGlobal);
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category, isGlobal);

-- Usage tracking for community gallery counts
CREATE TABLE IF NOT EXISTS template_uses (
  id TEXT PRIMARY KEY,
  templateId TEXT NOT NULL REFERENCES templates(id),
  workspaceId TEXT NOT NULL,
  userId TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_template_uses_template ON template_uses(templateId);

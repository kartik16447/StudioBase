-- Migration 0016: Documents (Notion-style editor)

CREATE TABLE IF NOT EXISTS documents (
  id          TEXT PRIMARY KEY,
  workspaceId TEXT NOT NULL,
  parentId    TEXT,                        -- NULL = root page
  title       TEXT NOT NULL DEFAULT '',
  emoji       TEXT,
  blocks      TEXT NOT NULL DEFAULT '[]',  -- JSON array of DocBlock
  sortOrder   REAL NOT NULL DEFAULT 0,
  createdBy   TEXT NOT NULL,
  updatedBy   TEXT NOT NULL,
  createdAt   INTEGER NOT NULL,
  updatedAt   INTEGER NOT NULL,
  FOREIGN KEY (workspaceId) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_documents_workspace   ON documents(workspaceId, sortOrder);
CREATE INDEX IF NOT EXISTS idx_documents_parent      ON documents(workspaceId, parentId, sortOrder);

-- FTS5 full-text search over title + block text content
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  id UNINDEXED,
  workspaceId UNINDEXED,
  title,
  body,
  content='documents',
  content_rowid='rowid'
);

-- Keep FTS in sync via triggers
CREATE TRIGGER IF NOT EXISTS documents_fts_insert AFTER INSERT ON documents BEGIN
  INSERT INTO documents_fts(rowid, id, workspaceId, title, body)
  VALUES (new.rowid, new.id, new.workspaceId, new.title, '');
END;

CREATE TRIGGER IF NOT EXISTS documents_fts_update AFTER UPDATE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, id, workspaceId, title, body)
  VALUES ('delete', old.rowid, old.id, old.workspaceId, old.title, '');
  INSERT INTO documents_fts(rowid, id, workspaceId, title, body)
  VALUES (new.rowid, new.id, new.workspaceId, new.title, '');
END;

CREATE TRIGGER IF NOT EXISTS documents_fts_delete AFTER DELETE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, id, workspaceId, title, body)
  VALUES ('delete', old.rowid, old.id, old.workspaceId, old.title, '');
END;

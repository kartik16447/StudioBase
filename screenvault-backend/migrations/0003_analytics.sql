-- metrics_events table for structured analytics
CREATE TABLE IF NOT EXISTS metrics_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  userId TEXT NOT NULL,
  workspaceId TEXT NOT NULL,
  videoId TEXT,
  metadata TEXT, -- JSON string
  createdAt INTEGER NOT NULL
);

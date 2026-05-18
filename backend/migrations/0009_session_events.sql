CREATE TABLE IF NOT EXISTS session_events (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL REFERENCES sessions(id),
  sopId TEXT REFERENCES sops(id),
  workspaceId TEXT NOT NULL REFERENCES workspaces(id),
  userId TEXT REFERENCES users(id),
  stepIndex INTEGER,
  eventType TEXT NOT NULL,
  durationMs INTEGER,
  metadata TEXT,
  timestamp INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_events_sessionId   ON session_events(sessionId);
CREATE INDEX IF NOT EXISTS idx_session_events_sopId       ON session_events(sopId);
CREATE INDEX IF NOT EXISTS idx_session_events_workspaceId ON session_events(workspaceId);
CREATE INDEX IF NOT EXISTS idx_session_events_eventType   ON session_events(eventType);
CREATE INDEX IF NOT EXISTS idx_session_events_timestamp   ON session_events(timestamp);

-- Track per-viewer identity on share page loads
CREATE TABLE IF NOT EXISTS share_views (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL,
  shareToken TEXT,
  viewerEmail TEXT,          -- set if logged in
  viewerFingerprint TEXT,    -- browser fingerprint hash if anonymous
  viewedAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_share_views_sessionId ON share_views(sessionId);

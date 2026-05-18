-- ============================================================
-- Migration 0008: Collaboration Layer
-- Comments + Notifications
-- ============================================================

-- Comments (SOP-level or anchored to a specific step)
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  workspaceId TEXT NOT NULL REFERENCES workspaces(id),
  sopId TEXT NOT NULL REFERENCES sops(id),
  stepId TEXT,                        -- null = whole-SOP thread
  authorId TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  resolvedAt INTEGER,
  resolvedBy TEXT REFERENCES users(id),
  deletedAt INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_sopId ON comments(sopId);
CREATE INDEX IF NOT EXISTS idx_comments_workspaceId ON comments(workspaceId);
CREATE INDEX IF NOT EXISTS idx_comments_authorId ON comments(authorId);

-- In-app notifications
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id),
  workspaceId TEXT NOT NULL,
  type TEXT NOT NULL,   -- 'comment.added' | 'sop.review_requested' | 'sop.published' | 'member.invited'
  actorId TEXT,         -- who triggered the event
  targetId TEXT,        -- sopId / sessionId / commentId
  metadata TEXT,        -- JSON: { sopTitle, stepId, commentBody, ... }
  readAt INTEGER,
  createdAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_userId ON notifications(userId);
CREATE INDEX IF NOT EXISTS idx_notifications_workspaceId ON notifications(workspaceId);

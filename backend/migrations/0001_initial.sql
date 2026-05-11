-- ============================================================
-- STUDIOBASE — Initial D1 Schema
-- ============================================================

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  picture TEXT,
  -- Storage quota
  r2StorageUsedBytes INTEGER NOT NULL DEFAULT 0,
  r2StorageQuotaBytes INTEGER NOT NULL DEFAULT 1073741824, -- 1GB default
  -- Credits
  creditsBalance INTEGER NOT NULL DEFAULT 10,  -- 10 free credits on signup
  -- Auth
  migrated INTEGER NOT NULL DEFAULT 1,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  lastLoginAt INTEGER
);

-- Linked Google accounts (one user can have multiple Google accounts)
CREATE TABLE IF NOT EXISTS linked_accounts (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id),
  email TEXT NOT NULL,
  googleSub TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_linked_accounts_userId ON linked_accounts(userId);
CREATE INDEX IF NOT EXISTS idx_linked_accounts_googleSub ON linked_accounts(googleSub);

-- Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  ownerId TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  -- Brand config (Trupeer-equivalent, JSON blob)
  brandConfig TEXT,  -- JSON: { logoUrl, primaryColor, fontFamily, watermarkText, introSlide, outroSlide }
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspaces_ownerId ON workspaces(ownerId);

-- Workspace members
CREATE TABLE IF NOT EXISTS workspace_members (
  userId TEXT NOT NULL REFERENCES users(id),
  workspaceId TEXT NOT NULL REFERENCES workspaces(id),
  role TEXT NOT NULL DEFAULT 'member',  -- 'owner' | 'member'
  joinedAt INTEGER NOT NULL,
  PRIMARY KEY (userId, workspaceId)
);

-- Invites
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  workspaceId TEXT NOT NULL REFERENCES workspaces(id),
  token TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'member',
  createdAt INTEGER NOT NULL,
  expiresAt INTEGER,
  revokedAt INTEGER
);

-- Sessions (replaces "videos" table — supports both raw video and step captures)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL REFERENCES users(id),
  workspaceId TEXT NOT NULL REFERENCES workspaces(id),

  -- Session type
  sessionType TEXT NOT NULL DEFAULT 'steps',   -- 'steps' | 'video'
  status TEXT NOT NULL DEFAULT 'uploading',    -- 'uploading' | 'processing' | 'ready' | 'failed' | 'credit_exhausted'

  -- Metadata
  title TEXT,
  capturedUrl TEXT,
  capturedTitle TEXT,
  durationMs INTEGER DEFAULT 0,
  stepCount INTEGER DEFAULT 0,

  -- R2 storage
  r2JsonKey TEXT,          -- key for the session JSON envelope in R2
  r2VideoKey TEXT,         -- key for raw video file (sessionType='video' only)
  storageBytes INTEGER DEFAULT 0,

  -- AI pipeline
  pipelinePath TEXT,       -- 'edge' | 'cloud' | null
  generatedOutputs TEXT,   -- JSON: which outputs were generated e.g. {"sop":true,"demo":true,"video":false}

  -- Sharing
  isPublic INTEGER NOT NULL DEFAULT 0,
  shareToken TEXT UNIQUE,  -- random token for public share links

  -- Soft delete
  deletedAt INTEGER,

  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_ownerId ON sessions(ownerId);
CREATE INDEX IF NOT EXISTS idx_sessions_workspaceId ON sessions(workspaceId);
CREATE INDEX IF NOT EXISTS idx_sessions_shareToken ON sessions(shareToken);

-- Credits ledger (every credit deduction/addition is logged)
CREATE TABLE IF NOT EXISTS credits_ledger (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id),
  delta INTEGER NOT NULL,        -- positive = added, negative = consumed
  reason TEXT NOT NULL,          -- 'signup_bonus' | 'topup' | 'sop_gen' | 'demo_gen' | 'video_gen'
  sessionId TEXT REFERENCES sessions(id),
  createdAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credits_ledger_userId ON credits_ledger(userId);

-- Usage stats (for rate limiting)
CREATE TABLE IF NOT EXISTS usage_stats (
  userId TEXT NOT NULL REFERENCES users(id),
  workspaceId TEXT NOT NULL REFERENCES workspaces(id),
  recordingsCount INTEGER NOT NULL DEFAULT 0,
  totalDurationMs INTEGER NOT NULL DEFAULT 0,
  lastRecordingAt INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY (userId, workspaceId)
);

-- Metrics events (analytics)
CREATE TABLE IF NOT EXISTS metrics_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  userId TEXT,
  workspaceId TEXT,
  sessionId TEXT,
  metadata TEXT,           -- JSON blob
  createdAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_metrics_events_userId ON metrics_events(userId);
CREATE INDEX IF NOT EXISTS idx_metrics_events_sessionId ON metrics_events(sessionId);

-- Debug logs
CREATE TABLE IF NOT EXISTS debug_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT,
  tag TEXT NOT NULL,
  data TEXT,
  source TEXT,
  sessionId TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_debug_logs_tag ON debug_logs(tag);
CREATE INDEX IF NOT EXISTS idx_debug_logs_sessionId ON debug_logs(sessionId);

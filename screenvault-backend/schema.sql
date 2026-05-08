-- USERS
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  picture TEXT,
  createdAt INTEGER,
  updatedAt INTEGER,
  lastLoginAt INTEGER
);

-- LINKED ACCOUNTS
CREATE TABLE IF NOT EXISTS linked_accounts (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  email TEXT NOT NULL,
  googleSub TEXT NOT NULL UNIQUE,
  driveRootFolderId TEXT,
  createdAt INTEGER DEFAULT (strftime('%s','now') * 1000)
);

-- WORKSPACES
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  ownerId TEXT,
  name TEXT,
  createdAt INTEGER,
  updatedAt INTEGER,

  plan TEXT DEFAULT 'free',
  billingProvider TEXT,
  billingCustomerId TEXT,
  billingSubscriptionId TEXT,
  region TEXT DEFAULT 'GLOBAL',
  planStatus TEXT DEFAULT 'active',
  driveFolderId TEXT
);

-- VIDEOS
CREATE TABLE videos (
  id TEXT PRIMARY KEY,
  fileId TEXT UNIQUE,
  title TEXT,
  ownerId TEXT,
  workspaceId TEXT,
  accountEmail TEXT,
  createdAt INTEGER,
  updatedAt INTEGER,

  duration INTEGER,
  actualDurationMs INTEGER,
  status TEXT DEFAULT 'uploading',
  thumbnailUrl TEXT,
  previewUrl TEXT,
  encryptedFileId TEXT,
  sessionId TEXT,
  deletedAt INTEGER
);

-- USAGE STATS
CREATE TABLE usage_stats (
  userId TEXT,
  workspaceId TEXT,
  recordingsCount INTEGER DEFAULT 0,
  totalDuration INTEGER DEFAULT 0,
  lastRecordingAt INTEGER,
  createdAt INTEGER,

  PRIMARY KEY (userId, workspaceId)
);

-- WORKSPACE MEMBERS
CREATE TABLE workspace_members (
  workspaceId TEXT,
  userId TEXT,
  role TEXT,
  joinedAt INTEGER,
  PRIMARY KEY (workspaceId, userId)
);

-- INDEXES
CREATE INDEX idx_videos_workspace ON videos(workspaceId);
CREATE INDEX idx_videos_created ON videos(createdAt);
CREATE INDEX idx_videos_owner ON videos(ownerId);
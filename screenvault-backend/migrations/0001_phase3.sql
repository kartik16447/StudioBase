-- invites table
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  workspaceId TEXT NOT NULL,
  inviteKey TEXT UNIQUE NOT NULL,
  createdAt INTEGER NOT NULL
);

-- workspace_members (if not already created)
CREATE TABLE IF NOT EXISTS workspace_members (
  workspaceId TEXT NOT NULL,
  userId TEXT NOT NULL,
  role TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  PRIMARY KEY (workspaceId, userId)
);
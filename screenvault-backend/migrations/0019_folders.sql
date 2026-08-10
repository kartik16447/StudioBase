-- Migration: 0019_folders.sql
-- Description: Adds folder organization within a workspace. Folders are
-- scoped to a single workspace (same as videos), but a video's folderId
-- and workspaceId can both be reassigned independently via PATCH /videos/:id
-- — moving a video to a different workspace clears folderId unless a
-- folder in the target workspace is given in the same request.

CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  workspaceId TEXT NOT NULL,
  name TEXT NOT NULL,
  createdAt INTEGER,
  updatedAt INTEGER
);

CREATE INDEX idx_folders_workspace ON folders(workspaceId);

ALTER TABLE videos ADD COLUMN folderId TEXT;
CREATE INDEX idx_videos_folder ON videos(folderId);

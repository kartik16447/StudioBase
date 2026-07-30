-- Migration: 0017_r2_storage.sql
-- Description: Move video storage from Google Drive to Cloudflare R2.
-- videos.fileId now holds an R2 object key instead of a Drive file ID
-- (encryptFileId/decryptFileId in src/index.ts are storage-agnostic, so no
-- column rename is needed). Existing rows are tagged 'drive' so old Drive
-- links can be told apart from new R2 ones; driveFolderId/driveRootFolderId
-- are left in place on workspaces/linked_accounts for now and can be
-- dropped in a later cleanup migration.

ALTER TABLE videos ADD COLUMN storageProvider TEXT DEFAULT 'r2';
UPDATE videos SET storageProvider = 'drive' WHERE storageProvider IS NULL OR storageProvider = 'r2';

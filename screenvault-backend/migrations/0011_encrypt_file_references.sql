-- Migration: 0011_encrypt_file_references.sql
-- Description: Adds encryptedFileId column to videos table for secure Drive references.

ALTER TABLE videos ADD COLUMN encryptedFileId TEXT;

-- We don't drop fileId yet to ensure a safe staged migration.

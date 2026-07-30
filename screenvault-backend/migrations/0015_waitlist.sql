-- Migration: 0015_waitlist.sql
-- Description: Waitlist table for collecting beta signup emails.

CREATE TABLE IF NOT EXISTS waitlist (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_waitlist_created ON waitlist(createdAt);

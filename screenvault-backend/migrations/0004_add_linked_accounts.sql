-- Migration number: 0004 	 2026-05-05T06:15:45.483Z
CREATE TABLE IF NOT EXISTS linked_accounts (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  email TEXT NOT NULL,
  googleSub TEXT NOT NULL UNIQUE,
  createdAt INTEGER DEFAULT (strftime('%s','now') * 1000)
);
-- Migration 0014: Waitlist table for landing page sign-ups
CREATE TABLE IF NOT EXISTS waitlist (
  id        TEXT    PRIMARY KEY,
  email     TEXT    NOT NULL UNIQUE,
  source    TEXT    NOT NULL DEFAULT 'landing',   -- 'landing' | 'footer' | etc.
  createdAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_waitlist_createdAt ON waitlist(createdAt);
CREATE INDEX IF NOT EXISTS idx_waitlist_email     ON waitlist(email);

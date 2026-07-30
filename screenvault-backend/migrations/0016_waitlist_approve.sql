-- Migration: 0016_waitlist_approve.sql
-- Description: Add approval tracking to waitlist.

ALTER TABLE waitlist ADD COLUMN approvedAt INTEGER;

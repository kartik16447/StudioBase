-- ============================================================
-- Migration 0013: Per-session share format toggles
-- ============================================================
-- sopEnabled:  1 = Step Guide tab visible on share page (default on)
-- rawEnabled:  1 = Raw Recording tab visible on share page (default on)
-- cinematicEnabled already exists from 0012 (tracks unlock + visibility)

ALTER TABLE sessions ADD COLUMN sopEnabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sessions ADD COLUMN rawEnabled INTEGER NOT NULL DEFAULT 1;

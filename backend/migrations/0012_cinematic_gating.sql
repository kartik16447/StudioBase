-- ============================================================
-- Migration 0012: Cinematic sharing gate per session
-- ============================================================
-- cinematicEnabled: set to 1 when the owner unlocks cinematic
-- sharing (costs 1 credit). Default 0 = only SOP + raw video
-- are available on the public share page.

ALTER TABLE sessions ADD COLUMN cinematicEnabled INTEGER NOT NULL DEFAULT 0;

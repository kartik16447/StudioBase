-- Track per-viewer step progress for analytics:viewer_detail
ALTER TABLE share_views ADD COLUMN lastStepIndex INTEGER;
ALTER TABLE share_views ADD COLUMN stepsCompleted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE share_views ADD COLUMN totalSteps INTEGER;
ALTER TABLE share_views ADD COLUMN completedAt INTEGER;

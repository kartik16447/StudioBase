-- Add demoEnabled column to sessions table (default 1 = on, matching sopEnabled/rawEnabled behaviour)
ALTER TABLE sessions ADD COLUMN demoEnabled INTEGER NOT NULL DEFAULT 1;

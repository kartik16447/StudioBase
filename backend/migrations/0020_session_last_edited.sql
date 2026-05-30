-- Track last editor on session rows
ALTER TABLE sessions ADD COLUMN lastEditedBy TEXT;
ALTER TABLE sessions ADD COLUMN lastEditedAt INTEGER;

-- 'video' (recordings and uploaded videos) or 'image' (uploaded images)
ALTER TABLE videos ADD COLUMN mediaType TEXT NOT NULL DEFAULT 'video';

-- Migration to add video_url to meetings table
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Recommended: Add index if we plan to query by video existence (dificultly needed but good practice)
-- CREATE INDEX IF NOT EXISTS idx_meetings_video_url ON meetings(video_url);

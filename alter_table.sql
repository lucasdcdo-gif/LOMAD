-- Add pinned_response column to meetings table
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS pinned_response TEXT;

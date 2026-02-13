-- Migration V3: Recall Robustness
-- 1. Add 'recall_id' to 'meetings' table to verify uniqueness and allow updates
ALTER TABLE meetings 
ADD COLUMN IF NOT EXISTS recall_id text;

-- 2. Add Unique Constraint to prevent duplicates
ALTER TABLE meetings
ADD CONSTRAINT meetings_recall_id_key UNIQUE (recall_id);

-- 3. Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_meetings_recall_id ON meetings(recall_id);
